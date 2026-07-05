import { randomUUID } from "node:crypto";

import Emittery from "emittery";

export interface HumanInTheLoopRequest<TKind extends string, TPayload> {
  requestId: string;
  kind: TKind;
  createdAt: number;
  payload: TPayload;
}

interface PendingRequest<TPayload, TResult> {
  payload: TPayload;
  reject: (error: Error) => void;
  resolve: (result: TResult) => void;
}

export class HumanInTheLoopCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanInTheLoopCancelledError";
  }
}

export abstract class AbstractHumanInTheLoop<
  TKind extends string,
  TPayload,
  TResult,
> extends Emittery<{
  "human-in-the-loop": HumanInTheLoopRequest<TKind, TPayload>;
}> {
  public abstract readonly kind: TKind;

  private pendingRequests = new Map<string, PendingRequest<TPayload, TResult>>();

  public request(payload: TPayload): Promise<TResult> {
    const parsedPayload = this.parsePayload(payload);
    const requestId = randomUUID();
    const request = {
      requestId,
      kind: this.kind,
      createdAt: Date.now(),
      payload: parsedPayload,
    };

    const result = new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, { payload: parsedPayload, reject, resolve });
    });

    void this.emit("human-in-the-loop", request);
    return result;
  }

  public resolve(requestId: string, value: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) throw new Error(`Unknown human-in-the-loop request: ${requestId}`);

    const result = this.parseResult(value, pending.payload);
    this.pendingRequests.delete(requestId);
    pending.resolve(result);
  }

  public cancelAll(reason: string): void {
    this.cancelWhere(() => true, reason);
  }

  protected cancelWhere(predicate: (payload: TPayload) => boolean, reason: string): void {
    for (const [requestId, pending] of this.pendingRequests) {
      if (!predicate(pending.payload)) continue;
      pending.reject(new HumanInTheLoopCancelledError(reason));
      this.pendingRequests.delete(requestId);
    }
  }

  protected getPendingPayload(requestId: string): TPayload | undefined {
    return this.pendingRequests.get(requestId)?.payload;
  }

  protected abstract parsePayload(value: unknown): TPayload;
  protected abstract parseResult(value: unknown, payload: TPayload): TResult;
}
