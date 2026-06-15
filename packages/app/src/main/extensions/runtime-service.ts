import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import type {
  CreateExtensionAgentInput,
  ExtensionCurrentAgentContext,
  ExtensionAgentEvent,
  ExtensionAgentHandle,
  ExtensionAgentModel,
  MainExtensionRuntimeAPI,
} from "@divisor-agent/extension-core/main";
import Emittery from "emittery";

import type { AllowedMainExposeEvents } from "../../shared/events-ipc.js";
import { AgentRuntime } from "../agent-runtime.js";
import { ModelRegistry } from "../models/index.js";
import { SkillService } from "../skills/index.js";
import type { ExtensionService, ExtensionToolRuntimeContext } from "./extension-service.js";

export class ExtensionRuntimeService
  extends Emittery<AllowedMainExposeEvents>
  implements MainExtensionRuntimeAPI
{
  private extensionService: ExtensionService | undefined;
  private runtimeContextStorage = new AsyncLocalStorage<ExtensionToolRuntimeContext>();
  private runtimes = new Map<string, AgentRuntime>();

  constructor(
    private modelRegistry: ModelRegistry,
    private skillService: SkillService,
  ) {
    super();
  }

  setExtensionService(extensionService: ExtensionService) {
    this.extensionService = extensionService;
  }

  runWithContext<T>(context: ExtensionToolRuntimeContext, callback: () => T): T {
    return this.runtimeContextStorage.run(context, callback);
  }

  getCurrentAgentContext(): ExtensionCurrentAgentContext | undefined {
    const context = this.runtimeContextStorage.getStore();
    if (!context) return undefined;

    return {
      model: context.getModel(),
      sessionId: context.getSessionId(),
    };
  }

  async createAgent(input: CreateExtensionAgentInput = {}): Promise<ExtensionAgentHandle> {
    if (!this.extensionService) {
      throw new Error("Extension runtime service has not been attached to ExtensionService");
    }

    const agentId = input.id ?? randomUUID();
    const inheritedModel = input.mode === "inherit-model" ? this.getCurrentModel() : undefined;
    const model = input.model ?? inheritedModel;
    const runtime = new AgentRuntime(this.modelRegistry, this.skillService, this.extensionService, {
      extensionTools: input.tools,
      systemPrompt: input.systemPrompt,
    });

    runtime.setSessionId(agentId);
    if (model) {
      await runtime.setModel(model);
    }

    runtime.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      (this.emit as (...args: unknown[]) => Promise<void>)(name, {
        sessionId: agentId,
        ...(data as object),
      });
    });

    this.runtimes.set(agentId, runtime);

    return {
      id: agentId,
      sessionId: agentId,
    };
  }

  async promptAgent(agentId: string, content: string, metadata?: { model?: ExtensionAgentModel }) {
    const runtime = this.getRuntime(agentId);
    await runtime.prompt(content, metadata);
    await runtime.waitForIdle();
  }

  async abortAgent(agentId: string) {
    const runtime = this.runtimes.get(agentId);
    if (!runtime) return;
    await runtime.abortPrompt();
  }

  async destroyAgent(agentId: string) {
    const runtime = this.runtimes.get(agentId);
    if (!runtime) return;
    runtime.destroy();
    this.runtimes.delete(agentId);
  }

  subscribeAgentEvents(
    agentId: string,
    listener: (event: ExtensionAgentEvent) => void | Promise<void>,
  ) {
    const runtime = this.getRuntime(agentId);
    return runtime.onAny(({ data }) => listener(data as ExtensionAgentEvent));
  }

  destroyAll() {
    for (const runtime of this.runtimes.values()) {
      runtime.destroy();
    }
    this.runtimes.clear();
    this.clearListeners();
  }

  private getRuntime(agentId: string) {
    const runtime = this.runtimes.get(agentId);
    if (!runtime) {
      throw new Error(`Extension agent not found: ${agentId}`);
    }
    return runtime;
  }

  private getCurrentModel(): ExtensionAgentModel | undefined {
    return this.runtimeContextStorage.getStore()?.getModel();
  }
}
