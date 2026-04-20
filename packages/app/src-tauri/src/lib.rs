use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const ACP_URL: &str = "ws://127.0.0.1:3000/acp";

// ── ACP Message types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcpMessage {
    #[serde(rename = "type")]
    msg_type: String,
    session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message_id: Option<String>,
    payload: Value,
}

// ── Tauri managed state ───────────────────────────────────────────────────

type WsSender = mpsc::UnboundedSender<String>;

#[derive(Default)]
struct AcpState {
    /// Shared sender to the single WebSocket write loop
    sender: Option<WsSender>,
}

type SharedAcpState = Arc<Mutex<AcpState>>;

// ── WebSocket lifecycle ───────────────────────────────────────────────────

/// Ensure the ACP WebSocket is connected, spawn read/write loops if needed.
/// The Mutex lock is never held across an `.await`, keeping this future `Send`.
async fn ensure_connected(
    app: AppHandle,
    acp: SharedAcpState,
) -> Result<WsSender, String> {
    // Fast path: already connected (lock, check, drop immediately)
    {
        let st = acp.lock().await;
        if let Some(ref tx) = st.sender {
            if !tx.is_closed() {
                return Ok(tx.clone());
            }
        }
    } // ← lock dropped before any .await below

    // Connect without holding the lock
    let (ws_stream, _) = connect_async(ACP_URL)
        .await
        .map_err(|e| format!("WebSocket connect failed: {e}"))?;

    let (ws_write, ws_read) = ws_stream.split();
    let (tx, rx) = mpsc::unbounded_channel::<String>();

    // Store sender (brief lock, no .await inside the block)
    {
        let mut st = acp.lock().await;
        // Double-check: another task may have connected while we awaited
        if let Some(ref existing) = st.sender {
            if !existing.is_closed() {
                return Ok(existing.clone());
            }
        }
        st.sender = Some(tx.clone());
    } // ← lock dropped

    spawn_write_loop(ws_write, rx);
    spawn_read_loop(app, acp, ws_read, tx.clone());

    Ok(tx)
}

fn spawn_write_loop<S>(
    mut sink: futures_util::stream::SplitSink<tokio_tungstenite::WebSocketStream<S>, Message>,
    mut rx: mpsc::UnboundedReceiver<String>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });
}

fn spawn_read_loop<S>(
    app: AppHandle,
    acp: SharedAcpState,
    mut stream: futures_util::stream::SplitStream<tokio_tungstenite::WebSocketStream<S>>,
    tx: WsSender,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        while let Some(Ok(msg)) = stream.next().await {
            if let Message::Text(text) = msg {
                if let Ok(acp_msg) = serde_json::from_str::<AcpMessage>(&text) {
                    dispatch_server_message(app.clone(), tx.clone(), acp_msg);
                }
            }
        }
        // Disconnected – clear sender
        let mut st = acp.lock().await;
        st.sender = None;
        let _ = app.emit(
            "acp_error",
            json!({"code": "DISCONNECTED", "message": "ACP connection lost"}),
        );
    });
}

/// Dispatch a server ACP message. Sync fn so it never needs to be `Send`.
/// Tool calls are spawned with the existing `tx`; they never call `ensure_connected`.
fn dispatch_server_message(app: AppHandle, tx: WsSender, msg: AcpMessage) {
    match msg.msg_type.as_str() {
        "agent_message_chunk" => {
            let mut payload = msg.payload;
            payload["sessionId"] = Value::String(msg.session_id);
            let _ = app.emit("agent_message_chunk", payload);
        }
        "agent_message_done" => {
            let _ = app.emit("agent_message_done", json!({"sessionId": msg.session_id}));
        }
        "session/request_permission" => {
            let _ = app.emit("session_request_permission", msg.payload);
        }
        "session/forked" => {
            let _ = app.emit("session_forked", msg.payload);
        }
        "acp/error" => {
            let _ = app.emit("acp_error", msg.payload);
        }
        "fs/read_text_file" => {
            tokio::spawn(handle_fs_read(tx, msg));
        }
        "fs/write_text_file" => {
            tokio::spawn(handle_fs_write(tx, msg));
        }
        "terminal/create" => {
            tokio::spawn(handle_terminal_exec(tx, msg));
        }
        _ => {}
    }
}

/// Helper to send an outbound ACP message
fn send_acp(tx: &WsSender, msg: AcpMessage) {
    if let Ok(json) = serde_json::to_string(&msg) {
        let _ = tx.send(json);
    }
}

// ── Local tool execution ──────────────────────────────────────────────────

async fn handle_fs_read(tx: WsSender, msg: AcpMessage) {
    let tool_call_id = msg.payload["toolCallId"].as_str().unwrap_or("").to_string();
    let path = msg.payload["path"].as_str().unwrap_or("").to_string();
    let session_id = msg.session_id;

    let (mt, payload) = match tokio::fs::read_to_string(&path).await {
        Ok(content) => ("tool/result", json!({"content": content})),
        Err(e) => ("tool/error", json!({"message": e.to_string()})),
    };
    send_acp(&tx, AcpMessage {
        msg_type: mt.to_string(),
        session_id,
        message_id: Some(tool_call_id),
        payload,
    });
}

async fn handle_fs_write(tx: WsSender, msg: AcpMessage) {
    let tool_call_id = msg.payload["toolCallId"].as_str().unwrap_or("").to_string();
    let path = msg.payload["path"].as_str().unwrap_or("").to_string();
    let content = msg.payload["content"].as_str().unwrap_or("").to_string();
    let session_id = msg.session_id;

    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let (mt, payload) = match tokio::fs::write(&path, content).await {
        Ok(_) => ("tool/result", json!({"content": format!("Written to {path}")})),
        Err(e) => ("tool/error", json!({"message": e.to_string()})),
    };
    send_acp(&tx, AcpMessage {
        msg_type: mt.to_string(),
        session_id,
        message_id: Some(tool_call_id),
        payload,
    });
}

async fn handle_terminal_exec(tx: WsSender, msg: AcpMessage) {
    let tool_call_id = msg.payload["toolCallId"].as_str().unwrap_or("").to_string();
    let command = msg.payload["command"].as_str().unwrap_or("").to_string();
    let session_id = msg.session_id;

    let (mt, payload) = match tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&command)
        .output()
        .await
    {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            let combined = if stderr.is_empty() {
                stdout
            } else {
                format!("{stdout}\n[stderr]: {stderr}")
            };
            ("tool/result", json!({"content": combined}))
        }
        Err(e) => ("tool/error", json!({"message": e.to_string()})),
    };
    send_acp(&tx, AcpMessage {
        msg_type: mt.to_string(),
        session_id,
        message_id: Some(tool_call_id),
        payload,
    });
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelPayload {
    provider_id: String,
    model_id: String,
}

// ── Tauri commands ────────────────────────────────────────────

#[tauri::command]
async fn session_start(
    session_id: String,
    model: Option<ModelPayload>,
    app: AppHandle,
    acp: State<'_, SharedAcpState>,
) -> Result<(), String> {
    let tx = ensure_connected(app, Arc::clone(&acp)).await?;
    let model_value = match model {
        Some(m) => json!({ "providerId": m.provider_id, "modelId": m.model_id }),
        None => Value::Null,
    };
    send_acp(&tx, AcpMessage {
        msg_type: "session/start".to_string(),
        session_id,
        message_id: None,
        payload: json!({ "model": model_value }),
    });
    Ok(())
}

#[tauri::command]
async fn session_prompt(
    session_id: String,
    content: String,
    app: AppHandle,
    acp: State<'_, SharedAcpState>,
) -> Result<(), String> {
    let tx = ensure_connected(app, Arc::clone(&acp)).await?;
    send_acp(&tx, AcpMessage {
        msg_type: "session/prompt".to_string(),
        session_id,
        message_id: None,
        payload: json!({ "content": content }),
    });
    Ok(())
}

#[tauri::command]
async fn session_fork(
    session_id: String,
    message_id: Option<String>,
    app: AppHandle,
    acp: State<'_, SharedAcpState>,
) -> Result<(), String> {
    let tx = ensure_connected(app, Arc::clone(&acp)).await?;
    send_acp(&tx, AcpMessage {
        msg_type: "session/fork".to_string(),
        session_id,
        message_id: None,
        payload: json!({ "messageId": message_id }),
    });
    Ok(())
}

#[tauri::command]
async fn permission_approve(
    request_id: String,
    session_id: Option<String>,
    app: AppHandle,
    acp: State<'_, SharedAcpState>,
) -> Result<(), String> {
    let tx = ensure_connected(app, Arc::clone(&acp)).await?;
    send_acp(&tx, AcpMessage {
        msg_type: "permission/approve".to_string(),
        session_id: session_id.unwrap_or_default(),
        message_id: None,
        payload: json!({ "requestId": request_id }),
    });
    Ok(())
}

#[tauri::command]
async fn permission_reject(
    request_id: String,
    session_id: Option<String>,
    app: AppHandle,
    acp: State<'_, SharedAcpState>,
) -> Result<(), String> {
    let tx = ensure_connected(app, Arc::clone(&acp)).await?;
    send_acp(&tx, AcpMessage {
        msg_type: "permission/reject".to_string(),
        session_id: session_id.unwrap_or_default(),
        message_id: None,
        payload: json!({ "requestId": request_id }),
    });
    Ok(())
}

// ── App entry ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let acp_state: SharedAcpState = Arc::new(Mutex::new(AcpState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(acp_state)
        .invoke_handler(tauri::generate_handler![
            session_start,
            session_prompt,
            session_fork,
            permission_approve,
            permission_reject,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
