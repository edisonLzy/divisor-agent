import type { JSONContent } from "@tiptap/core";
import Emittery from "emittery";

import { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AgentRuntime } from "./agent-runtime.js";
import { ModelRegistry } from "./models/index.js";
import { SkillService } from "./skills/index.js";

/**
 * Manages multiple AgentRuntime instances, keyed by sessionId.
 * Shares ModelRegistry across all runtimes.
 * All methods accept an explicit sessionId — no internal "current session" state.
 */
export class AgentPool
  extends Emittery<AllowedMainExposeEvents>
  implements AgentSessionIPC, AgentModelsIPC, AgentSkillsIPC
{
  private modelRegistry: ModelRegistry;
  private runtimes: Map<string, AgentRuntime>;
  private skillService: SkillService;
  private pendingPromptMetadata: Map<string, Array<PromptPresentationMetadata>>;

  constructor() {
    super();
    this.modelRegistry = new ModelRegistry();
    this.runtimes = new Map();
    this.skillService = new SkillService();
    this.pendingPromptMetadata = new Map();
  }

  // ── Runtime lifecycle ────────────────────────────────────────────────────

  private getOrCreateRuntime(sessionId: string): AgentRuntime {
    let runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      runtime = this.createRuntime(sessionId);
      this.runtimes.set(sessionId, runtime);
    }
    return runtime;
  }

  private createRuntime(sessionId: string): AgentRuntime {
    const runtime = new AgentRuntime(this.modelRegistry, this.skillService);

    // Re-emit all events tagged with sessionId
    runtime.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      if (name === "message_start" && isUserMessageEvent(data)) {
        const metadata = this.consumePendingPromptMetadata(sessionId);
        if (metadata?.jsonContent) {
          (this.emit as (...args: unknown[]) => Promise<void>)(name, {
            sessionId,
            ...data,
            message: {
              ...data.message,
              metadata: {
                ...(isRecord(data.message.metadata) ? data.message.metadata : {}),
                jsonContent: metadata.jsonContent,
              },
            },
          });
          return;
        }
      }

      (this.emit as (...args: unknown[]) => Promise<void>)(name, {
        sessionId,
        ...(data as object),
      });
    });

    return runtime;
  }

  destroyAgent(sessionId: string) {
    const runtime = this.runtimes.get(sessionId);
    if (runtime) {
      runtime.destroy();
      this.runtimes.delete(sessionId);
    }
  }

  destroyAll() {
    for (const runtime of this.runtimes.values()) {
      runtime.destroy();
    }
    this.runtimes.clear();
    this.clearListeners();
  }

  activeCount(): number {
    return this.runtimes.size;
  }

  // ── Implements AgentSessionIPC ───────────────────────────────────────────

  public setSessionId: AgentSessionIPC["setSessionId"] = async (sessionId: string) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    runtime.setSessionId(sessionId);
  };

  public setHistoryMessages: AgentSessionIPC["setHistoryMessages"] = async (
    sessionId,
    messages,
  ) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    runtime.setHistoryMessages(messages);
  };

  public setPermissionMode: AgentSessionIPC["setPermissionMode"] = async (sessionId, mode) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    await runtime.setPermissionMode(mode);
  };

  public resolvePermissionRequest: AgentSessionIPC["resolvePermissionRequest"] = async (
    sessionId,
    requestId,
    resolution,
  ) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    await runtime.resolvePermissionRequest(requestId, resolution);
  };

  public prompt: AgentSessionIPC["prompt"] = async (sessionId, content, metadata) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    this.enqueuePromptMetadata(sessionId, metadata);
    runtime.prompt(content, metadata);
  };

  public abortPrompt: AgentSessionIPC["abortPrompt"] = async (sessionId) => {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      return;
    }

    await runtime.abortPrompt();
  };

  // ── Implements AgentModelsIPC ────────────────────────────────────────────

  public setModel: AgentModelsIPC["setModel"] = async (sessionId, model) => {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return false;
    return runtime.setModel(model);
  };

  public getAvailableModels: AgentModelsIPC["getAvailableModels"] = async () => {
    return this.modelRegistry.getAvailableModels().map((m) => {
      return {
        modelId: m.id,
        providerId: m.provider,
        providerName: m.provider,
        modelName: m.name ?? m.id,
      };
    });
  };

  // ── Implements AgentSkillsIPC ────────────────────────────────────────────

  public listSkills: AgentSkillsIPC["listSkills"] = async () => {
    return this.skillService.listSkills();
  };

  public setSkillEnabled: AgentSkillsIPC["setSkillEnabled"] = async (skillId, enabled) => {
    return this.skillService.setSkillEnabled(skillId, enabled);
  };

  private enqueuePromptMetadata(sessionId: string, metadata?: PromptPresentationMetadata) {
    if (!metadata?.jsonContent) {
      return;
    }

    const queue = this.pendingPromptMetadata.get(sessionId) ?? [];
    queue.push({ jsonContent: metadata.jsonContent });
    this.pendingPromptMetadata.set(sessionId, queue);
  }

  private consumePendingPromptMetadata(sessionId: string) {
    const queue = this.pendingPromptMetadata.get(sessionId);
    if (!queue?.length) {
      return undefined;
    }

    const nextMetadata = queue.shift();
    if (queue.length === 0) {
      this.pendingPromptMetadata.delete(sessionId);
    } else {
      this.pendingPromptMetadata.set(sessionId, queue);
    }

    return nextMetadata;
  }
}

interface PromptPresentationMetadata {
  jsonContent?: JSONContent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUserMessageEvent(value: unknown): value is {
  message: {
    role: "user";
    metadata?: unknown;
  };
} {
  return (
    isRecord(value) &&
    "message" in value &&
    isRecord(value.message) &&
    value.message.role === "user"
  );
}
