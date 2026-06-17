import Emittery from "emittery";

import { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AgentRuntime } from "./agent-runtime.js";
import { ExtensionService } from "./extensions/index.js";
import { ExtensionRuntimeService } from "./extensions/runtime-service.js";
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
  private extensionService: ExtensionService;
  private extensionRuntimeService: ExtensionRuntimeService;

  constructor() {
    super();
    this.modelRegistry = new ModelRegistry();
    this.runtimes = new Map();
    this.skillService = new SkillService();
    this.extensionRuntimeService = new ExtensionRuntimeService(
      this.modelRegistry,
      this.skillService,
    );
    this.extensionRuntimeService.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      (this.emit as (...args: unknown[]) => Promise<void>)(name, data);
    });
    this.extensionService = new ExtensionService(this.extensionRuntimeService);
    this.extensionRuntimeService.setExtensionService(this.extensionService);
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
    const runtime = new AgentRuntime(this.modelRegistry, this.skillService, this.extensionService);

    // Re-emit all events tagged with sessionId
    runtime.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      (this.emit as (...args: unknown[]) => Promise<void>)(name, {
        scope: runtime.getScope(),
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
    this.extensionRuntimeService.destroyAll();
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

  public setSessionScope: AgentSessionIPC["setSessionScope"] = async (sessionId, scope) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    runtime.setSessionScope(scope);
  };

  public destroySession: AgentSessionIPC["destroySession"] = async (sessionId) => {
    this.destroyAgent(sessionId);
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
    runtime.prompt(content, metadata);
  };

  public abortPrompt: AgentSessionIPC["abortPrompt"] = async (sessionId) => {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      await this.extensionRuntimeService.abortAgent(sessionId);
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
    const models = await this.modelRegistry.getAvailableModels();

    return models.map((m) => {
      return {
        modelId: m.id,
        providerId: m.provider,
        providerName: m.provider,
        modelName: m.name ?? m.id,
      };
    });
  };

  public getModelConfig: AgentModelsIPC["getModelConfig"] = async () => {
    return this.modelRegistry.getConfig();
  };

  public saveModelConfig: AgentModelsIPC["saveModelConfig"] = async (config) => {
    await this.modelRegistry.saveConfig(config);
  };

  // ── Implements AgentSkillsIPC ────────────────────────────────────────────

  public listSkills: AgentSkillsIPC["listSkills"] = async () => {
    return this.skillService.listSkills();
  };

  public setSkillEnabled: AgentSkillsIPC["setSkillEnabled"] = async (skillId, enabled) => {
    return this.skillService.setSkillEnabled(skillId, enabled);
  };
}
