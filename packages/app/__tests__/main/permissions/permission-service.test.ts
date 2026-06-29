import { describe, expect, it } from "vitest";

import { PermissionService } from "../../../src/main/permissions/permission-service.js";
import type { PermissionRequest } from "../../../src/shared/permissions-ipc.js";

describe("PermissionService", () => {
  it("adapts terminal permissions to a generic user interaction", () => {
    const service = new PermissionService();
    const request = createPermissionRequest();

    const interaction = service.createInteractionRequest(request);

    expect(interaction).toMatchObject({
      requestId: request.requestId,
      source: "permission",
      toolCallId: request.toolCallId,
      questions: [
        {
          id: "permission_decision",
          type: "single",
          options: [{ id: "approve_once" }, { id: "approve_remember" }, { id: "deny" }],
        },
      ],
    });
    expect(interaction.details?.summary).toBe("pnpm lint packages/app");
  });

  it("maps approve, remember, deny, and dismiss outcomes", () => {
    const service = new PermissionService();
    const request = createPermissionRequest();

    expect(service.resolveInteraction(request, submitted("approve_once"))).toEqual({
      approved: true,
    });
    expect(service.resolveInteraction(request, submitted("approve_remember"))).toEqual({
      approved: true,
      rememberCommandPrefix: "pnpm lint packages/app",
    });
    expect(
      service.resolveInteraction(request, submitted("deny", "Please use a read-only command.")),
    ).toEqual({
      approved: false,
      reason: "Please use a read-only command.",
    });
    expect(service.resolveInteraction(request, { status: "dismissed" })).toEqual({
      approved: false,
      reason: "Permission request dismissed by user",
    });
  });

  it("auto-approves future commands after remembering a command prefix", () => {
    const service = new PermissionService();
    service.rememberApproval("terminal/create", "pnpm lint");

    expect(
      service.shouldAutoApprove({
        toolName: "terminal/create",
        operation: "terminal/create",
        args: { command: "pnpm lint packages/app/src" },
      }),
    ).toBe(true);
    expect(
      service.shouldAutoApprove({
        toolName: "terminal/create",
        operation: "terminal/create",
        args: { command: "pnpm test" },
      }),
    ).toBe(false);
  });
});

function createPermissionRequest(): PermissionRequest {
  return {
    requestId: "request-1",
    toolCallId: "tool-call-1",
    toolName: "terminal/create",
    toolLabel: "Run Terminal Command",
    operation: "terminal/create",
    args: { command: "pnpm lint packages/app" },
    createdAt: 1,
  };
}

function submitted(optionId: string, followUp?: string) {
  return {
    status: "submitted" as const,
    answers: [
      {
        questionId: "permission_decision",
        selectedOptionIds: [optionId],
        optionInputs: followUp ? { [optionId]: followUp } : undefined,
      },
    ],
  };
}
