import { describe, expect, it, vi } from "vitest";

import { UserInteractionService } from "../../../src/main/user-interactions/user-interaction-service.js";
import type { UserInteractionRequest } from "../../../src/shared/user-interaction-ipc.js";

describe("UserInteractionService", () => {
  it("emits and resolves submitted interactions", async () => {
    const service = new UserInteractionService();
    const handleRequest = vi.fn();
    service.setRequestCallback(handleRequest);

    const outcomePromise = service.request(createRequest("request-1"));
    expect(handleRequest).toHaveBeenCalledOnce();
    expect(service.resolve("request-1", { status: "submitted", answers: [] })).toBe(true);

    await expect(outcomePromise).resolves.toEqual({ status: "submitted", answers: [] });
    expect(service.hasPending("request-1")).toBe(false);
  });

  it("resolves dismissals and rejects duplicate resolutions", async () => {
    const service = new UserInteractionService();
    const outcomePromise = service.request(createRequest("request-2"));

    expect(service.resolve("request-2", { status: "dismissed" })).toBe(true);
    expect(service.resolve("request-2", { status: "dismissed" })).toBe(false);
    await expect(outcomePromise).resolves.toEqual({ status: "dismissed" });
  });

  it("cancels every pending interaction during runtime teardown", async () => {
    const service = new UserInteractionService();
    const first = service.request(createRequest("request-3"));
    const second = service.request(createRequest("request-4"));

    service.cancelAll("runtime destroyed");

    await expect(first).resolves.toEqual({ status: "cancelled", reason: "runtime destroyed" });
    await expect(second).resolves.toEqual({ status: "cancelled", reason: "runtime destroyed" });
  });

  it("rejects duplicate pending request ids", async () => {
    const service = new UserInteractionService();
    void service.request(createRequest("request-5"));

    await expect(service.request(createRequest("request-5"))).rejects.toThrow(
      "User interaction already pending",
    );
    service.cancelAll("test cleanup");
  });
});

function createRequest(requestId: string): UserInteractionRequest {
  return {
    requestId,
    source: "ask_user",
    questions: [{ id: "question", question: "Choose", type: "text" }],
    createdAt: 1,
  };
}
