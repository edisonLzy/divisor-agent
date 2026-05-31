import { describe, expect, it, vi } from "vitest";

import { PermissionService } from "../../../src/main/permissions/permission-service.js";

describe("PermissionService", () => {
  it("forwards requests to the callback and resolves approved permissions", async () => {
    const service = new PermissionService();
    const handleRequest = vi.fn();
    const request = {
      requestId: "request-1",
      toolCallId: "tool-call-1",
      toolName: "fs/write_text_file",
      toolLabel: "Write File",
      operation: "fs/write_text_file",
      args: { path: "/tmp/demo.txt", content: "hello" },
      createdAt: Date.now(),
    };

    service.setRequestCallback(handleRequest);

    const permissionPromise = service.requestPermission(request);
    service.approve(request.requestId);

    await expect(permissionPromise).resolves.toEqual({ approved: true });
    expect(handleRequest).toHaveBeenCalledWith(request);
  });

  it("returns the denial reason when a request is rejected", async () => {
    const service = new PermissionService();
    const request = {
      requestId: "request-2",
      toolCallId: "tool-call-2",
      toolName: "terminal/create",
      toolLabel: "Run Terminal Command",
      operation: "terminal/create",
      args: { command: "touch /tmp/demo.txt" },
      createdAt: Date.now(),
    };

    const permissionPromise = service.requestPermission(request);
    service.reject(request.requestId, "Please explain the change first.");

    await expect(permissionPromise).resolves.toEqual({
      approved: false,
      reason: "Please explain the change first.",
    });
  });

  it("identifies the current high-risk operations", () => {
    const service = new PermissionService();

    expect(service.isHighRisk("fs/write_text_file")).toBe(true);
    expect(service.isHighRisk("terminal/create")).toBe(true);
    expect(service.isHighRisk("fs/read_text_file")).toBe(false);
  });
});
