import { describe, expect, it, vi } from "vitest";

import { PermissionService } from "../../../src/main/human-in-the-loop/permission-service.js";

describe("PermissionService", () => {
  it("emits a request and resolves an approval", async () => {
    const service = new PermissionService();
    const handleRequest = vi.fn();
    service.setRequestCallback(handleRequest);

    const permissionPromise = service.requestPermission(createPayload());
    await vi.waitFor(() => expect(handleRequest).toHaveBeenCalledOnce());
    const request = handleRequest.mock.calls[0][0];
    service.approve(request.requestId);

    await expect(permissionPromise).resolves.toEqual({
      approved: true,
      reason: undefined,
      rememberCommandPrefix: undefined,
    });
    expect(request).toMatchObject({ kind: "permission", toolCallId: "tool-call-1" });
  });

  it("returns the denial reason", async () => {
    const service = new PermissionService();
    const handleRequest = vi.fn();
    service.setRequestCallback(handleRequest);
    const permissionPromise = service.requestPermission(createPayload());
    await vi.waitFor(() => expect(handleRequest).toHaveBeenCalledOnce());

    service.reject(handleRequest.mock.calls[0][0].requestId, "Please explain first.");

    await expect(permissionPromise).resolves.toEqual({
      approved: false,
      reason: "Please explain first.",
      rememberCommandPrefix: undefined,
    });
  });

  it("auto-approves commands after remembering a prefix", async () => {
    const service = new PermissionService();
    const handleRequest = vi.fn();
    service.setRequestCallback(handleRequest);
    const permissionPromise = service.requestPermission(createPayload());
    await vi.waitFor(() => expect(handleRequest).toHaveBeenCalledOnce());
    const requestId = handleRequest.mock.calls[0][0].requestId;

    service.rememberApproval(requestId, "pnpm lint");
    service.approve(requestId);
    await permissionPromise;

    expect(
      service.shouldAutoApprove({
        toolName: "terminal/create",
        operation: "terminal/create",
        args: { command: "pnpm lint packages/app/src" },
      }),
    ).toBe(true);
  });
});

function createPayload() {
  return {
    toolCallId: "tool-call-1",
    toolName: "terminal/create",
    toolLabel: "Run Terminal Command",
    operation: "terminal/create",
    args: { command: "pnpm lint packages/app" },
  };
}
