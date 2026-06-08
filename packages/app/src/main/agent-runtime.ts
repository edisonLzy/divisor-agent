import { randomUUID } from "node:crypto";

import { Agent } from "@mariozechner/pi-agent-core";
import Emittery from "emittery";

import type { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { PermissionMode } from "../shared/permissions-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";
import type { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { ModelRegistry } from "./models/index.js";
import { PermissionService } from "./permissions/index.js";
import { SystemPromptService } from "./prompt/index.js";
import { SkillService } from "./skills/index.js";
import type { AppTool } from "./tools/index.js";
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from "./tools/index.js";

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
    | "listSkills"
    | "setSkillEnabled"
    ? never
    : K]: StripSessionId<CombinedIPC[K]>;
} & {
  listSkills: AgentSkillsIPC["listSkills"];
  setSessionId(sessionId: string): void;
  setSkillEnabled: AgentSkillsIPC["setSkillEnabled"];
};

// ── Event type map ──────────────────────────────────────────────────────────

/** Derive base events from session-tagged events by stripping sessionId. */
type AgentRuntimeEvents = {
  [K in keyof AllowedMainExposeEvents]: Omit<AllowedMainExposeEvents[K], "sessionId">;
};

interface ExtensionRuntimeService {
  getSystemPrompts(): string[];
  getTools(): AppTool<any>[];
}

/**
 * Per-session runtime that manages a single Agent instance.
 *
 * Satisfies AgentRuntimeDelegate (derived from IPC interfaces).
 * Emits raw AgentEvent-type events without sessionId — AgentPool handles tagging.
 */
export class AgentRuntime extends Emittery<AgentRuntimeEvents> implements AgentRuntimeDelegate {
  private agent: Agent;
  private permissionMode: PermissionMode;
  private permissionService: PermissionService;
  private systemPromptService: SystemPromptService;

  constructor(
    private modelRegistry = new ModelRegistry(),
    private skillService: SkillService,
    private extensionService: ExtensionRuntimeService = createEmptyExtensionService(),
  ) {
    super();
    this.permissionMode = "default";
    this.permissionService = new PermissionService();
    this.systemPromptService = new SystemPromptService();
    this.systemPromptService.addBuilder(this.skillService);
    this.agent = this.createInternalAgent();
  }

  private createInternalAgent() {
    this.permissionService.setRequestCallback((request) => {
      this.emit("permission_requested", {
        type: "permission_requested",
        ...request,
      });
    });

    const agent = new Agent({
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
        systemPrompt: this.buildSystemPrompt(),
        tools: [
          fsReadTextFileTool,
          fsWriteTextFileTool,
          terminalCreateTool,
          ...this.extensionService.getTools(),
        ],
      },
    });

    agent.subscribe((event) => {
      this.emit(event.type, event);
    });

    return agent;
  }

  // ── AgentRuntimeDelegate implementation ──────────────────────────────────

  public setSessionId: AgentRuntimeDelegate["setSessionId"] = (sessionId) => {
    this.agent.sessionId = sessionId;
  };

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

  public prompt: AgentRuntimeDelegate["prompt"] = async (content, metadata = {}) => {
    if (metadata.model) {
      await this.setModel(metadata.model);
    }

    this.agent.state.systemPrompt = this.buildSystemPrompt();
    this.agent.prompt(this.skillService.expandSkillReferences(content, metadata.skillIds ?? []));
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

  private buildSystemPrompt() {
    return this.systemPromptService.buildSystemPrompt(
      this.extensionService.getSystemPrompts().join("\n\n"),
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createEmptyExtensionService(): ExtensionRuntimeService {
  return {
    getSystemPrompts: () => [],
    getTools: () => [],
  };
}
