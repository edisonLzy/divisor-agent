import {
  getPermissionCommandPrefix,
  getPermissionCommandText,
  type PermissionRequest,
  type PermissionResolution,
} from "../../shared/permissions-ipc.js";
import type {
  UserInteractionOutcome,
  UserInteractionRequest,
  UserQuestionAnswer,
} from "../../shared/user-interaction-ipc.js";

const PERMISSION_QUESTION_ID = "permission_decision";
const APPROVE_ONCE_OPTION_ID = "approve_once";
const APPROVE_REMEMBER_OPTION_ID = "approve_remember";
const DENY_OPTION_ID = "deny";

function stringifyPermissionArgs(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export class PermissionService {
  private rememberedCommandPrefixes = new Map<string, Set<string>>();

  rememberApproval(toolName: string, commandPrefix: string): void {
    const normalizedPrefix = commandPrefix.trim();
    if (!normalizedPrefix) {
      return;
    }

    const existingPrefixes = this.rememberedCommandPrefixes.get(toolName) ?? new Set();
    existingPrefixes.add(normalizedPrefix);
    this.rememberedCommandPrefixes.set(toolName, existingPrefixes);
  }

  shouldAutoApprove(request: Pick<PermissionRequest, "toolName" | "operation" | "args">): boolean {
    const rememberedPrefixes = this.rememberedCommandPrefixes.get(request.toolName);
    if (!rememberedPrefixes?.size) {
      return false;
    }

    const commandText = getPermissionCommandText(request);
    if (!commandText) {
      return false;
    }

    for (const prefix of rememberedPrefixes) {
      if (commandText.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  createInteractionRequest(request: PermissionRequest): UserInteractionRequest {
    const commandText = getPermissionCommandText(request);
    const rememberCommandPrefix = getPermissionCommandPrefix(commandText);
    const canRememberPrefix =
      request.toolName === "terminal/create" && rememberCommandPrefix.length > 0;

    return {
      requestId: request.requestId,
      source: "permission",
      toolCallId: request.toolCallId,
      createdAt: request.createdAt,
      questions: [
        {
          id: PERMISSION_QUESTION_ID,
          header: "权限确认",
          question: `允许 Agent 执行 ${request.toolLabel || request.toolName} 吗？`,
          type: "single",
          options: [
            {
              id: APPROVE_ONCE_OPTION_ID,
              label: "允许一次",
              description: "仅批准本次操作。",
              recommended: true,
            },
            ...(canRememberPrefix
              ? [
                  {
                    id: APPROVE_REMEMBER_OPTION_ID,
                    label: "允许并记住",
                    description: `以后以 ${rememberCommandPrefix} 开头的命令不再询问。`,
                  },
                ]
              : []),
            {
              id: DENY_OPTION_ID,
              label: "拒绝",
              description: "停止执行，并让 Agent 调整方案。",
              followUp: {
                placeholder: "输入拒绝原因，可选",
              },
            },
          ],
        },
      ],
      details: {
        summary: commandText,
        sections: [
          {
            label: "Command",
            value: commandText,
            format: "code",
          },
          {
            label: "Payload",
            value: stringifyPermissionArgs(request.args),
            format: "code",
          },
        ],
      },
    };
  }

  resolveInteraction(
    request: PermissionRequest,
    outcome: UserInteractionOutcome,
  ): PermissionResolution {
    if (outcome.status === "cancelled") {
      return { approved: false, reason: outcome.reason };
    }

    if (outcome.status === "dismissed") {
      return { approved: false, reason: "Permission request dismissed by user" };
    }

    const answer = outcome.answers.find(
      (candidate) => candidate.questionId === PERMISSION_QUESTION_ID,
    );
    const selectedOptionId = answer?.selectedOptionIds?.[0];
    if (selectedOptionId === APPROVE_ONCE_OPTION_ID) {
      return { approved: true };
    }

    if (selectedOptionId === APPROVE_REMEMBER_OPTION_ID) {
      const rememberCommandPrefix = getPermissionCommandPrefix(getPermissionCommandText(request));
      if (request.toolName !== "terminal/create" || !rememberCommandPrefix) {
        return { approved: false, reason: "Invalid remembered permission response" };
      }
      return {
        approved: true,
        rememberCommandPrefix,
      };
    }

    return {
      approved: false,
      reason: getOptionInput(answer, DENY_OPTION_ID) || "Permission request denied by user",
    };
  }
}

function getOptionInput(answer: UserQuestionAnswer | undefined, optionId: string): string {
  return answer?.optionInputs?.[optionId]?.trim() ?? "";
}
