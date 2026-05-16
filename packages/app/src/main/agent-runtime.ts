import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { Agent, AgentState } from "@mariozechner/pi-agent-core";
import Emittery from "emittery";

import { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC, type WorkspaceFileItem } from "../shared/session-ipc.js";
import { ModelRegistry } from "./models/index.js";
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from "./tools/index.js";

const WORKSPACE_MARKERS = ["pnpm-workspace.yaml", ".git"];
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".idea",
  ".turbo",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const MAX_FILE_SEARCH_RESULTS = 12;

function resolveWorkspaceRoot(startDir = process.cwd()) {
  let currentDir = resolve(startDir);

  while (true) {
    if (WORKSPACE_MARKERS.some((marker) => existsSync(join(currentDir, marker)))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return resolve(startDir);
    }

    currentDir = parentDir;
  }
}

export class AgentRuntime
  extends Emittery<AllowedMainExposeEvents>
  implements AgentSessionIPC, AgentModelsIPC
{
  private modelRegistry: ModelRegistry;
  private agent: Agent;
  private workspaceRoot: string;
  private workspaceFilesCache: WorkspaceFileItem[] | null;

  constructor() {
    super();
    this.modelRegistry = new ModelRegistry();
    this.agent = this.createInternalAgent();
    this.workspaceRoot = resolveWorkspaceRoot();
    this.workspaceFilesCache = null;
  }

  private createInternalAgent() {
    const agent = new Agent({
      getApiKey: (provider) => {
        return this.modelRegistry.resolveApiKey(provider);
      },
      initialState: {
        tools: [fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool],
      },
    });

    agent.subscribe((event) => {
      this.emit(event.type, event);
    });

    return agent;
  }

  private updateState<T extends keyof AgentState>(key: T, value: AgentState[T]) {
    this.agent.state[key] = value;
  }

  public setModel: AgentModelsIPC["setModel"] = async (model) => {
    const { modelId, providerId } = model;
    const modelInfo = this.modelRegistry.resolveModel(providerId, modelId);
    if (!modelInfo) {
      console.warn(`Model not found: ${providerId}/${modelId}`);
      return false;
    }
    this.updateState("model", modelInfo);
    return true;
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

  public setSessionId: AgentSessionIPC["setSessionId"] = async (sessionId: string) => {
    this.agent.sessionId = sessionId;
  };

  public setHistoryMessages: AgentSessionIPC["setHistoryMessages"] = async (messages) => {
    this.updateState("messages", messages);
  };

  public searchWorkspaceFiles: AgentSessionIPC["searchWorkspaceFiles"] = async (query) => {
    const files = await this.getWorkspaceFiles();
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return files.slice(0, MAX_FILE_SEARCH_RESULTS);
    }

    return files
      .map((file) => {
        const lowerName = file.name.toLowerCase();
        const lowerPath = file.path.toLowerCase();

        let score = Number.POSITIVE_INFINITY;

        if (lowerName === normalizedQuery || lowerPath === normalizedQuery) {
          score = 0;
        } else if (lowerName.startsWith(normalizedQuery)) {
          score = 1;
        } else if (lowerPath.startsWith(normalizedQuery)) {
          score = 2;
        } else if (lowerName.includes(normalizedQuery)) {
          score = 3;
        } else if (lowerPath.includes(normalizedQuery)) {
          score = 4;
        }

        return { file, score };
      })
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => {
        return left.score - right.score || left.file.path.localeCompare(right.file.path);
      })
      .slice(0, MAX_FILE_SEARCH_RESULTS)
      .map((entry) => entry.file);
  };

  public prompt: AgentSessionIPC["prompt"] = async (params) => {
    const { content, model, sessionId } = params;

    this.agent.sessionId = sessionId;

    if (model) {
      this.setModel(model);
    }

    this.agent.prompt(content);
  };

  public destroy() {
    this.clearListeners();
  }

  private async getWorkspaceFiles() {
    if (this.workspaceFilesCache) {
      return this.workspaceFilesCache;
    }

    const files = await this.scanWorkspaceFiles(this.workspaceRoot);
    files.sort((left, right) => left.path.localeCompare(right.path));
    this.workspaceFilesCache = files;

    return files;
  }

  private async scanWorkspaceFiles(directory: string): Promise<WorkspaceFileItem[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: WorkspaceFileItem[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          continue;
        }

        files.push(...(await this.scanWorkspaceFiles(join(directory, entry.name))));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = join(directory, entry.name);
      files.push({
        name: entry.name,
        path: relative(this.workspaceRoot, absolutePath).split(sep).join("/"),
      });
    }

    return files;
  }
}
