import { randomUUID } from "node:crypto";

import type {
  ExtensionAgentModel,
  ExtensionAgentToolOptions,
} from "@divisor-agent/extension-core/main";
import { Agent } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import Emittery from "emittery";

import type { AgentSessionScope, AllowedMainExposeEvents } from "../shared/events-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { PermissionMode } from "../shared/permissions-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";
import type { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { ExtensionService } from "./extensions/extension-service.js";
import { ModelRegistry } from "./models/index.js";
import { PermissionService } from "./permissions/index.js";
import { SystemPromptService } from "./prompt/index.js";
import { SkillService } from "./skills/index.js";
import type { AppTool } from "./tools/index.js";
import {
  browserOpenTool,
  fsReadTextFileTool,
  fsWriteTextFileTool,
  terminalCreateTool,
} from "./tools/index.js";

// ── Derived runtime delegate type ──────────────────────────────────────────

/**
 * Strips the `sessionId` routing parameter from IPC method signatures.
 *
 * IPC:    setHistoryMessages(sessionId, messages) => Promise<void>
 * Runtime: setHistoryMessages(messages) => void
 *
 * Methods without leading `sessionId` param (registry-level config methods) pass through.
 */
type StripSessionId<T> = T extends (sessionId: string, ...args: infer A) => infer R
  ? (...args: A) => R
  : T;

type CombinedIPC = AgentSessionIPC & AgentModelsIPC & AgentSkillsIPC;

/**
 * Contract that AgentRuntime must satisfy, auto-derived from IPC interfaces.
 *
 * - Methods where sessionId is a routing parameter → sessionId is stripped.
 * - `setSessionId` and registry-level model config methods are excluded.
 *
 * Enforcement: AgentPool calls these methods by name — if a method is missing
 * on AgentRuntime, the delegation call in AgentPool errors at compile time.
 */
export type AgentRuntimeDelegate = {
  [K in keyof CombinedIPC as K extends
    | "getAvailableModels"
    | "getModelConfig"
    | "saveModelConfig"
    | "setSessionId"
    | "setSessionScope"
    | "destroySession"
    | "runOneTimeAgent"
    | "listSkills"
    | "setSkillEnabled"
    ? never
    : K]: StripSessionId<CombinedIPC[K]>;
} & {
  listSkills: AgentSkillsIPC["listSkills"];
  setSessionId(sessionId: string): void;
  setSessionScope(scope: AgentSessionScope): void;
  setSkillEnabled: AgentSkillsIPC["setSkillEnabled"];
};

export interface AgentRuntimeOptions {
  extensionTools?: ExtensionAgentToolOptions;
  systemPrompt?: string;
}

// ── Event type map ──────────────────────────────────────────────────────────

/** Derive base events from session-tagged events by stripping sessionId. */
type AgentRuntimeEvents = {
  [K in keyof AllowedMainExposeEvents]: Omit<AllowedMainExposeEvents[K], "scope" | "sessionId">;
};

/**
 * Per-session runtime that manages a single Agent instance.
 *
 * Satisfies AgentRuntimeDelegate (derived from IPC interfaces).
 * Emits raw AgentEvent-type events without sessionId — AgentPool handles tagging.
 */
export class AgentRuntime extends Emittery<AgentRuntimeEvents> implements AgentRuntimeDelegate {
  private agent!: Agent;
  private permissionMode: PermissionMode;
  private permissionService: PermissionService;
  private scope: AgentSessionScope = "main";
  private systemPromptService: SystemPromptService;
  private sessionId: string | undefined;

  constructor(
    private modelRegistry = new ModelRegistry(),
    private skillService: SkillService,
    private extensionService = new ExtensionService(),
    private options: AgentRuntimeOptions = {},
  ) {
    super();
    this.permissionMode = "default";
    this.permissionService = new PermissionService();
    this.systemPromptService = new SystemPromptService();
    this.systemPromptService.addBuilder(this.skillService);
    this.systemPromptService.addBuilder(this.extensionService);

    this.agent = this.createInternalAgent();
  }

  private createInternalAgent() {
    const excludedToolNames = new Set(this.options.extensionTools?.excludeToolNames ?? []);
    const builtinTools = [
      browserOpenTool,
      fsReadTextFileTool,
      fsWriteTextFileTool,
      terminalCreateTool,
    ].filter((tool) => !excludedToolNames.has(tool.name));

    this.permissionService.setRequestCallback((request) => {
      this.emit("permission_requested", {
        type: "permission_requested",
        ...request,
      });
    });

    const agent = new Agent({
      convertToLlm: (messages) => {
        return messages.flatMap((message): Message[] => {
          if (message.role === "user") {
            return [
              {
                role: "user",
                content: message.content,
                timestamp: message.timestamp,
              },
            ];
          }

          if (message.role === "assistant" || message.role === "toolResult") {
            return [message];
          }

          return [];
        });
      },
      beforeToolCall: async (context) => {
        if (this.permissionMode === "bypasspermission") {
          return undefined;
        }

        const tool = context.context.tools?.find(
          (candidate) => candidate.name === context.toolCall.name,
        ) as AppTool | undefined;
        const args = isRecord(context.args) ? context.args : {};
        if ((tool?.riskLevel ?? "safe") !== "high") {
          return undefined;
        }

        const permissionRequest = {
          requestId: randomUUID(),
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          toolLabel: tool?.label ?? context.toolCall.name,
          operation: context.toolCall.name,
          args,
          createdAt: Date.now(),
        };

        if (this.permissionService.shouldAutoApprove(permissionRequest)) {
          return undefined;
        }

        const resolution = await this.permissionService.requestPermission(permissionRequest);

        if (resolution.approved) {
          return undefined;
        }

        return {
          block: true,
          reason: resolution.reason?.trim() || "Permission request denied by user",
        };
      },
      getApiKey: (provider) => {
        return this.modelRegistry.resolveApiKey(provider);
      },
      initialState: {
        systemPrompt: this.systemPromptService.buildSystemPrompt(this.options.systemPrompt ?? ""),
        tools: [
          ...(this.options.extensionTools?.includeBuiltins === false ? [] : builtinTools),
          ...this.extensionService.getToolsForRuntime(
            {
              getModel: () => this.getCurrentModel(),
              getSessionId: () => this.sessionId,
            },
            this.options.extensionTools,
          ),
        ],
      },
    });

    agent.subscribe((event) => {
      this.emit(event.type, event);

      if (event.type === "agent_end" && this.agent.hasQueuedMessages()) {
        this.scheduleQueuedContinue();
      }
    });

    return agent;
  }

  // ── AgentRuntimeDelegate implementation ──────────────────────────────────

  public setSessionId: AgentRuntimeDelegate["setSessionId"] = (sessionId) => {
    this.sessionId = sessionId;
    this.agent.sessionId = sessionId;
  };

  public setSessionScope: AgentRuntimeDelegate["setSessionScope"] = (scope) => {
    this.scope = scope;
  };

  public getScope() {
    return this.scope;
  }

  public setHistoryMessages: AgentRuntimeDelegate["setHistoryMessages"] = async (messages) => {
    this.agent.state.messages = messages;
  };

  public setModel: AgentRuntimeDelegate["setModel"] = async (model) => {
    const modelInfo = this.modelRegistry.resolveModel(model.providerId, model.modelId);
    if (!modelInfo) {
      console.warn(`Model not found: ${model.providerId}/${model.modelId}`);
      return false;
    }
    this.agent.state.model = modelInfo;
    return true;
  };

  public prompt: AgentRuntimeDelegate["prompt"] = async (message) => {
    if (message.metadata?.model) {
      await this.setModel(message.metadata.model);
    }

    this.agent.state.systemPrompt = this.systemPromptService.buildSystemPrompt(
      this.options.systemPrompt ?? "",
    );

    const content =
      typeof message.content === "string"
        ? this.skillService.expandSkillReferences(message.content, message.metadata?.skillIds ?? [])
        : message.content;

    const routedMessage = { ...message, content };
    if (message.kind === "steering") {
      this.agent.steer(routedMessage);
    } else if (message.kind === "follow-up") {
      this.agent.followUp(routedMessage);
    } else {
      await this.agent.prompt(routedMessage);
    }
  };

  public clearAllQueues: AgentRuntimeDelegate["clearAllQueues"] = async () => {
    this.agent.clearAllQueues();
  };

  public abortPrompt: AgentRuntimeDelegate["abortPrompt"] = async () => {
    this.agent.abort();
  };

  public listSkills: AgentRuntimeDelegate["listSkills"] = async () => {
    return this.skillService.listSkills();
  };

  public setSkillEnabled: AgentRuntimeDelegate["setSkillEnabled"] = async (skillId, enabled) => {
    return this.skillService.setSkillEnabled(skillId, enabled);
  };

  public setPermissionMode: AgentRuntimeDelegate["setPermissionMode"] = async (mode) => {
    this.permissionMode = mode;
  };

  public resolvePermissionRequest: AgentRuntimeDelegate["resolvePermissionRequest"] = async (
    requestId,
    resolution,
  ) => {
    if (resolution.approved) {
      if (resolution.rememberCommandPrefix) {
        this.permissionService.rememberApproval(requestId, resolution.rememberCommandPrefix);
      }

      this.permissionService.approve(requestId);
      return;
    }

    this.permissionService.reject(requestId, resolution.reason);
  };

  public destroy() {
    this.clearListeners();
  }

  public waitForIdle() {
    return this.agent.waitForIdle();
  }

  private getCurrentModel(): ExtensionAgentModel | undefined {
    const model = this.agent?.state.model;
    if (!model) {
      return undefined;
    }

    return {
      modelId: model.id,
      providerId: model.provider,
    };
  }

  private scheduleQueuedContinue() {
    setTimeout(() => {
      if (this.agent.state.isStreaming || !this.agent.hasQueuedMessages()) {
        return;
      }

      this.agent.continue().catch((error) => {
        console.error("Failed to continue queued agent messages", error);
      });
    }, 0);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
