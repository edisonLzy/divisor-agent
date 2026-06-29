import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { BrowserWindow } from "electron";
import Emittery from "emittery";

import { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AbstractAgentIPCHandler } from "./agent-ipc.js";
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
  extends AbstractAgentIPCHandler<AgentSessionIPC & AgentModelsIPC & AgentSkillsIPC>
  implements AgentSessionIPC, AgentModelsIPC, AgentSkillsIPC
{
  // Internal Emittery (composition, since we already extend AbstractAgentIPCHandler
  // and TS class can only single-inherit). All event traffic goes through `this.events`.
  private events = new Emittery<AllowedMainExposeEvents>();

  private modelRegistry: ModelRegistry;
  private runtimes: Map<string, AgentRuntime>;
  private skillService: SkillService;
  private extensionService: ExtensionService;
  private extensionRuntimeService: ExtensionRuntimeService;

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);

    this.modelRegistry = new ModelRegistry();
    this.runtimes = new Map();
    this.skillService = new SkillService();
    this.extensionRuntimeService = new ExtensionRuntimeService(
      this.modelRegistry,
      this.skillService,
    );
    this.extensionRuntimeService.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      (this.events.emit as (...args: unknown[]) => Promise<void>)(name, data);
    });
    this.extensionService = new ExtensionService(
      this.extensionRuntimeService,
      () => this.currentBrowserWindow,
    );

    // Bind IPC channels + Emittery forwarding last, after all internal state is ready.
    this.unbind = this.bind();
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

      (this.events.emit as (...args: unknown[]) => Promise<void>)(name, {
        scope: runtime.getScope(),
        sessionId,
        ...(data as object),
      });
    });

    return runtime;
  }

  async destroyAgent(sessionId: string) {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;

    const notifyExtensions = runtime.getScope() === "main";
    runtime.destroy();
    this.runtimes.delete(sessionId);

    if (notifyExtensions) {
      await this.extensionService.emitSessionDestroyed(sessionId);
    }
  }

  async destroyAll() {
    for (const sessionId of [...this.runtimes.keys()]) {
      await this.destroyAgent(sessionId);
    }
    this.extensionRuntimeService.destroyAll();
    this.extensionService.dispose();
    this.events.clearListeners();
    this.unbind?.();
  }

  invokeExtensionIPC(extensionId: string, method: string, args: unknown[]) {
    return this.extensionService.invokeIPC(extensionId, method, args);
  }

  activeCount(): number {
    return this.runtimes.size;
  }

  // ── IPC binding (template method) ────────────────────────────────────────

  protected override bind(): VoidFunction {
    const channels = [
      "setModel",
      "getAvailableModels",
      "getModelConfig",
      "saveModelConfig",
      "prompt",
      "runOneTimeAgent",
      "abortPrompt",
      "setHistoryMessages",
      "setSessionId",
      "setSessionScope",
      "destroySession",
      "setPermissionMode",
      "resolvePermissionRequest",
      "listSkills",
      "setSkillEnabled",
    ] as const;

    for (const channel of channels) {
      this.typedIpcMain.handle(
        channel,
        (this as unknown as Record<string, unknown>)[channel] as never,
      );
    }

    // Forward Emittery events to the renderer.
    const offAny = this.events.onAny(({ name, data }) => {
      this.sendMessageToRenderer(name, data);
    });

    return () => {
      for (const channel of channels) {
        this.typedIpcMain.removeHandler(channel);
      }
      offAny();
    };
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
    await this.destroyAgent(sessionId);
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

  public prompt: AgentSessionIPC["prompt"] = async (sessionId, message) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    await runtime.prompt(message);
  };

  public clearAllQueues: AgentSessionIPC["clearAllQueues"] = async (sessionId) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    await runtime.clearAllQueues();
  };

  public runOneTimeAgent: AgentSessionIPC["runOneTimeAgent"] = async (messages, options) => {
    const timeout = options.timeout ?? 30_000;

    await this.modelRegistry.getAvailableModels();

    const model = this.modelRegistry.resolveModel(options.model.providerId, options.model.modelId);
    if (!model) {
      throw new Error(`Model not found: ${options.model.providerId}/${options.model.modelId}`);
    }

    let output = "";

    const agent = new Agent({
      getApiKey: (provider) => this.modelRegistry.resolveApiKey(provider),
      convertToLlm: convertAgentMessagesToLlmMessages,
      initialState: {
        systemPrompt: options.systemPrompt,
        model,
        tools: [],
        messages,
      },
    });

    agent.subscribe((event) => {
      if (event.type !== "message_update") return;
      if (event.assistantMessageEvent.type !== "text_delta") return;

      output += event.assistantMessageEvent.delta;
    });

    const runPromise = (async () => {
      await agent.continue();
      await agent.waitForIdle();
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timerPromise = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        agent.abort();
        resolve("timeout");
      }, timeout);
    });

    try {
      const result = await Promise.race([runPromise.then(() => "done" as const), timerPromise]);
      if (result === "timeout") {
        void runPromise.catch(() => undefined);
      }

      return cleanOneTimeAgentOutput(output);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
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

function convertAgentMessagesToLlmMessages(messages: AgentMessage[]): Message[] {
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
}

function cleanOneTimeAgentOutput(output: string) {
  return output
    .replace(/^```(?:\w+)?\s*/, "")
    .replace(/\s*```$/, "")
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .trim();
}
