import type {
  UserInteractionOutcome,
  UserInteractionRequest,
  UserInteractionSubmission,
} from "../../shared/user-interaction-ipc.js";

export type UserInteractionCallback = (request: UserInteractionRequest) => void;

export class UserInteractionService {
  private pendingInteractions = new Map<
    string,
    {
      request: UserInteractionRequest;
      resolve: (outcome: UserInteractionOutcome) => void;
    }
  >();
  private onRequestCallback: UserInteractionCallback | null = null;

  setRequestCallback(callback: UserInteractionCallback) {
    this.onRequestCallback = callback;
  }

  async request(request: UserInteractionRequest): Promise<UserInteractionOutcome> {
    if (this.pendingInteractions.has(request.requestId)) {
      throw new Error(`User interaction already pending: ${request.requestId}`);
    }

    return new Promise((resolve) => {
      this.pendingInteractions.set(request.requestId, { request, resolve });
      this.onRequestCallback?.(request);
    });
  }

  resolve(requestId: string, submission: UserInteractionSubmission): boolean {
    const pending = this.pendingInteractions.get(requestId);
    if (!pending) {
      return false;
    }

    pending.resolve(submission);
    this.pendingInteractions.delete(requestId);
    return true;
  }

  cancelAll(reason: string): void {
    for (const pending of this.pendingInteractions.values()) {
      pending.resolve({ status: "cancelled", reason });
    }
    this.pendingInteractions.clear();
  }

  hasPending(requestId: string): boolean {
    return this.pendingInteractions.has(requestId);
  }
}
