import WebSocket from 'ws';

export interface AcpMessage {
  type: string;
  sessionId?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
}

interface Waiter {
  type: string;
  resolve: (msg: AcpMessage) => void;
  reject: (err: Error) => void;
}

/**
 * Simulates the Rust ACP client for integration testing.
 *
 * Connects to the real WebSocket server, sends ACP messages, and provides
 * helpers to wait for specific response types.
 */
export class AcpMockClient {
  /** All messages received from the server, in order. */
  readonly received: AcpMessage[] = [];

  /** Unmatched messages waiting for a consumer. */
  readonly messageQueue: AcpMessage[] = [];

  private ws: WebSocket | null = null;
  private waiters: Waiter[] = [];
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.once('open', () => resolve());
      this.ws.once('error', (err) => reject(err));

      this.ws.on('message', (data) => {
        let msg: AcpMessage;
        try {
          msg = JSON.parse(data.toString()) as AcpMessage;
        } catch {
          return;
        }
        this.dispatch(msg);
      });

      this.ws.on('close', () => {
        for (const waiter of this.waiters) {
          waiter.reject(new Error('WebSocket closed while waiting for message'));
        }
        this.waiters = [];
      });
    });
  }

  private dispatch(msg: AcpMessage): void {
    this.received.push(msg);

    const idx = this.waiters.findIndex(w => w.type === msg.type);
    if (idx !== -1) {
      const [waiter] = this.waiters.splice(idx, 1);
      waiter.resolve(msg);
    } else {
      this.messageQueue.push(msg);
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  send(msg: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected or not open');
    }
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Resolves with the next server message matching `type`.
   *
   * Checks the pending queue first; otherwise registers a waiter. Rejects
   * after `timeout` milliseconds (default 10 s).
   */
  waitForMessage(type: string, timeout = 10_000): Promise<AcpMessage> {
    const idx = this.messageQueue.findIndex(m => m.type === type);
    if (idx !== -1) {
      const [msg] = this.messageQueue.splice(idx, 1);
      return Promise.resolve(msg);
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          const waiterIdx = this.waiters.findIndex(w => w.resolve === resolve);
          if (waiterIdx !== -1) this.waiters.splice(waiterIdx, 1);
          reject(new Error(`Timeout (${timeout}ms) waiting for ACP message type: "${type}"`));
        }
      }, timeout);

      this.waiters.push({
        type,
        resolve: (msg) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(msg);
          }
        },
        reject: (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        },
      });
    });
  }

  /**
   * Waits for a tool-delegation message of `toolType`, then immediately sends
   * back a `tool/result` with the given `content`.
   *
   * Returns the original tool-call message.
   */
  async waitForToolCallAndRespond(
    toolType: string,
    sessionId: string,
    content: string,
    timeout?: number,
  ): Promise<AcpMessage> {
    const msg = await this.waitForMessage(toolType, timeout);
    const toolCallId = msg.messageId;

    this.send({
      type: 'tool/result',
      sessionId,
      messageId: toolCallId,
      payload: { toolCallId, content },
    });

    return msg;
  }

  /**
   * Waits for a `session/request_permission` message, then sends either
   * `permission/approve` or `permission/reject`.
   *
   * Returns the original permission-request message.
   */
  async waitForPermissionAndRespond(
    sessionId: string,
    approve: boolean,
    timeout?: number,
  ): Promise<AcpMessage> {
    const msg = await this.waitForMessage('session/request_permission', timeout);
    const requestId = msg.payload?.requestId as string;

    this.send({
      type: approve ? 'permission/approve' : 'permission/reject',
      sessionId,
      payload: { requestId },
    });

    return msg;
  }
}
