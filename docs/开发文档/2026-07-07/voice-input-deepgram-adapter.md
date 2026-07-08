# Voice Input:从 webkitSpeechRecognition 到 Deepgram + 适配器模式

> 日期:2026-07-07<br>
> 分支:`feature/voice-input`(base master `c75dc82`)<br>
> 关联:旧 PR #35 `codex/voice-input-mode`(2026-06-24 base,已关闭)

## 背景:为什么 webkitSpeechRecognition 不可用

旧 #35 使用浏览器的 `SpeechRecognition`/`webkitSpeechRecognition` API 做语音转写。但该 API 在 Electron 中**始终返回 `"network error"`**,原因是 Chromium 的 Web Speech API 把音频发往 Google 语音服务器,用的是烘焙进官方 Chrome 构建的 API key——这些 key 在 Electron/Chromium 构建中**不存在**。这是 Electron 官方已确认的长期 bug(electron/electron#46143,标记 34/35/36-x-y,`status/confirmed`),Electron 39(Chromium ~140)同样不可用,dev 和 packaged 模式都不行。

**决策:** 改用云端 STT(Deepgram),用适配器模式隔离供应商差异,未来换供应商只需改一行。

## 适配器模式设计

### 为什么需要适配器

不同 STT 供应商的 API 格式差异大:

| 维度 | Deepgram | OpenAI Whisper | AssemblyAI |
|------|----------|---------------|------------|
| 协议 | WebSocket 实时流 | REST 离线 | WebSocket |
| 认证 | Token 查询参数 | Bearer header | Authorization header |
| 结果格式 | `{type:"Results", channel:{alternatives:[{transcript}]}}` | `{text:"..."}` | `{text:"...", words:[...]}` |
| 实时/离线 | 实时流式 | 仅离线 | 实时流式 |

这些差异封装在 `SpeechToTextAdapter` 接口后面:

```ts
interface SpeechToTextAdapter {
  start(): Promise<void>           // 建立连接
  stop(): Promise<string>          // 结束,返回最终转写文本
  sendAudio(chunk: ArrayBuffer): void  // 发送音频分片
  onTranscript(cb: (text: string, isFinal: boolean) => void): void
  onError(cb: (error: Error) => void): void
  configure(config: Partial<STTConfig>): void  // 设置语言/模型等
  readonly isConnected: boolean
}
```

- `sendAudio` 不是 `start` 的参数——录音和转写是独立生命周期,避免空连接
- `onTranscript` 回调而非返回值——实时流式需要多次回调
- `configure` 独立于 `start`——切换语言/模型不需要重建连接
- 接口放在 `shared/`——主进程和渲染进程都能引用

### 当前实现:DeepgramAdapter

使用原生 `WebSocket`(不依赖 `@deepgram/sdk`,避免 electron-vite 的 externalizeDeps 问题):

1. 连接 `wss://api.deepgram.com/v1/listen?token=<key>&model=nova-3&language=zh-CN&interim_results=true&encoding=linear16&sample_rate=16000&channels=1`
2. 发送 PCM16 linear16 音频分片(二进制 WebSocket 消息)
3. 接收 JSON 文本消息,解析 `data.type === "Results"` → 提取 `channel.alternatives[0].transcript`
4. `data.is_final === true` 为最终结果,`false` 为中间结果
5. 结束后发送 `{"type": "CloseStream"}` 通知 Deepgram 流结束

### 工厂函数

```ts
function createSTTAdapter(provider: STTProvider, config: STTConfig): SpeechToTextAdapter
```

换供应商:`createSTTAdapter("deepgram", config)` → `createSTTAdapter("whisper", config)`,hook 和 UI 完全不用改。

## 音频管线

```
麦克风 getUserMedia({audio: true})
  → AudioContext (16kHz)
  → MediaStreamSource
  → AnalyserNode (FFT 256, 波形可视化)
  → ScriptProcessorNode (4096 samples, 提取 PCM)
  → Float32Array → Int16Array (float32ToPcm16)
  → adapter.sendAudio(pcm16)
  → Deepgram WebSocket
  → 服务器返回 JSON 结果
  → adapter.onTranscript(text, isFinal)
  → hook 更新 transcript 状态
  → React 更新 UI
```

## UI:raft 设计规范

录音态 UI 组件按规范重绘(旧实现用 `rounded-full`、无边框按钮):

- **Mic 按钮**:`variant="ghost" size="icon-sm" rounded-md`,Spinner 指示 starting 状态
- **波形**:Canvas 驱动,`AnalyserNode.getByteTimeDomainData`,requestAnimationFrame
- **计时器**:`font-mono text-xs tabular-nums text-muted-foreground`(规范 §4:机器状态用 Space Mono)
- **Stop 按钮**:`variant="secondary" size="icon-sm" rounded-md`,保留转写文字在编辑器
- **Send 按钮**:`size="icon-sm" rounded-md`,转写后自动提交
- 录音时编辑器 `setEditable(false)`,Enter 键被 suppress

## 验证

- `tsc` web + node 双侧 `--noEmit` 全绿
- oxlint `--fix` 0 warning/error、oxfmt `--write` 已格式化
- 待办:production Electron 视觉手测(需设置 `VITE_DEEPGRAM_API_KEY` + Deepgram 账号)

## 后续扩展

添加新供应商只需:
1. 实现 `SpeechToTextAdapter` 接口
2. 在 `createSTTAdapter` 的 switch 里加一条 case
3. Hook 和 UI 零改动