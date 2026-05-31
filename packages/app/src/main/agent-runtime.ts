import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { Agent } from "@mariozechner/pi-agent-core";
import Emittery from "emittery";

import type { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { PermissionMode } from "../shared/permissions-ipc.js";
import type { AgentSessionIPC, WorkspaceFileItem } from "../shared/session-ipc.js";
import { ModelRegistry } from "./models/index.js";
import { PermissionService } from "./permissions/index.js";
import type { AppTool } from "./tools/index.js";
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from "./tools/index.js";

// ── Derived runtime delegate type ──────────────────────────────────────────

/**
 * Strips the `sessionId` routing parameter from IPC method signatures.
 *
 * IPC:    setHistoryMessages(sessionId, messages) => Promise<void>
 * Runtime: setHistoryMessages(messages) => void
 *
 * Methods without leading `sessionId` param (getAvailableModels) pass through.
 */
type StripSessionId<T> = T extends (sessionId: string, ...args: infer A) => infer R
  ? (...args: A) => R
  : T;

type CombinedIPC = AgentSessionIPC & AgentModelsIPC;

/**
 * Contract that AgentRuntime must satisfy, auto-derived from IPC interfaces.
 *
 * - Methods where sessionId is a routing parameter → sessionId is stripped.
 * - `setSessionId` / `getAvailableModels` are excluded (sessionId IS the data
 *   for setSessionId; getAvailableModels is registry-level).
 *
 * Enforcement: AgentPool calls these methods by name — if a method is missing
 * on AgentRuntime, the delegation call in AgentPool errors at compile time.
 */
export type AgentRuntimeDelegate = {
  [K in keyof CombinedIPC as K extends "getAvailableModels" | "setSessionId"
    ? never
    : K]: StripSessionId<CombinedIPC[K]>;
} & {
  setSessionId(sessionId: string): void;
};

// ── Event type map ──────────────────────────────────────────────────────────

/** Derive base events from session-tagged events by stripping sessionId. */
type AgentRuntimeEvents = {
  [K in keyof AllowedMainExposeEvents]: Omit<AllowedMainExposeEvents[K], "sessionId">;
};

// ── Workspace helpers ──────────────────────────────────────────────────────

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
  private workspaceRoot: string;
  private workspaceFilesCache: WorkspaceFileItem[] | null;

  constructor(private modelRegistry: ModelRegistry) {
    super();
    this.permissionMode = "default";
    this.permissionService = new PermissionService();
    this.workspaceRoot = resolveWorkspaceRoot();
    this.workspaceFilesCache = null;
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
        tools: [fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool],
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

  public prompt: AgentRuntimeDelegate["prompt"] = async (content, model) => {
    if (model) {
      await this.setModel(model);
    }
    this.agent.prompt(content);
  };

  public searchWorkspaceFiles: AgentRuntimeDelegate["searchWorkspaceFiles"] = (query) => {
    return this.searchFiles(query);
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

  // ── Workspace file scanner ───────────────────────────────────────────────

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

  private async searchFiles(query: string): Promise<WorkspaceFileItem[]> {
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
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
