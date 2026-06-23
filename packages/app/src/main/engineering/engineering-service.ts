import { execFile } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { app } from "electron";

import type {
  EngineeringConfig,
  EngineeringEvent,
  EngineeringEventInput,
  EngineeringIssueResult,
  EngineeringRecordResult,
  EngineeringTask,
} from "../../shared/engineering-ipc.js";

const execFileAsync = promisify(execFile);

const DEFAULT_CONFIG: EngineeringConfig = {
  developmentModeEnabled: false,
};

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /password/i,
  /prompt/i,
  /secret/i,
  /token/i,
];

const ERROR_EVENT_TYPES = new Set<EngineeringEventInput["type"]>([
  "renderer_error",
  "main_error",
  "unhandled_rejection",
  "agent_failure",
  "tool_failure",
  "verification_failure",
]);

export class EngineeringService {
  private readonly configPath: string;
  private readonly eventsPath: string;
  private readonly tasksPath: string;

  constructor(dataDir = join(app.getPath("userData"), "engineering")) {
    this.configPath = join(dataDir, "config.json");
    this.eventsPath = join(dataDir, "events.json");
    this.tasksPath = join(dataDir, "tasks.json");
  }

  async getDevelopmentMode(): Promise<EngineeringConfig> {
    return this.readJson(this.configPath, DEFAULT_CONFIG);
  }

  async setDevelopmentMode(enabled: boolean): Promise<EngineeringConfig> {
    const config = { developmentModeEnabled: enabled };
    await this.writeJson(this.configPath, config);
    return config;
  }

  async recordEngineeringEvent(input: EngineeringEventInput): Promise<EngineeringRecordResult> {
    const config = await this.getDevelopmentMode();
    if (!config.developmentModeEnabled) {
      return { recorded: false, reason: "Development mode is disabled" };
    }

    const event = this.normalizeEvent(input);
    const events = await this.listEngineeringEvents(Number.POSITIVE_INFINITY);
    events.push(event);
    await this.writeJson(this.eventsPath, events);

    const task = ERROR_EVENT_TYPES.has(event.type)
      ? await this.upsertTaskForEvent(event)
      : undefined;

    return { recorded: true, event, task };
  }

  async listEngineeringEvents(limit = 100): Promise<EngineeringEvent[]> {
    const events = await this.readJson<EngineeringEvent[]>(this.eventsPath, []);
    return events
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, normalizeLimit(limit));
  }

  async listEngineeringTasks(limit = 100): Promise<EngineeringTask[]> {
    const tasks = await this.readJson<EngineeringTask[]>(this.tasksPath, []);
    return tasks
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, normalizeLimit(limit));
  }

  async createGitHubIssue(taskId: string): Promise<EngineeringIssueResult> {
    const tasks = await this.readJson<EngineeringTask[]>(this.tasksPath, []);
    const taskIndex = tasks.findIndex((task) => task.id === taskId);
    if (taskIndex < 0) {
      throw new Error(`Engineering task not found: ${taskId}`);
    }

    const task = tasks[taskIndex];
    if (task.issueUrl) {
      return { task, issueUrl: task.issueUrl, created: false };
    }

    const existingIssueUrl = await this.findExistingIssueUrl(task.fingerprint);
    const issueUrl = existingIssueUrl ?? (await this.createIssue(task));
    const updatedTask = {
      ...task,
      status: "issue_created" as const,
      issueUrl,
      updatedAt: Date.now(),
    };
    tasks[taskIndex] = updatedTask;
    await this.writeJson(this.tasksPath, tasks);

    return { task: updatedTask, issueUrl, created: !existingIssueUrl };
  }

  private normalizeEvent(input: EngineeringEventInput): EngineeringEvent {
    const sanitizedMetadata = sanitizeMetadata(input.metadata ?? {});
    const stack = sanitizeStack(input.stack);
    const fingerprint = createFingerprint(input, stack);

    return {
      ...input,
      id: randomUUID(),
      timestamp: Date.now(),
      severity: input.severity ?? inferSeverity(input.type),
      message: truncate(input.message, 500),
      stack,
      metadata: sanitizedMetadata,
      fingerprint,
      appVersion: app.getVersion(),
      platform: process.platform,
    };
  }

  private async upsertTaskForEvent(event: EngineeringEvent): Promise<EngineeringTask> {
    const tasks = await this.readJson<EngineeringTask[]>(this.tasksPath, []);
    const existingIndex = tasks.findIndex((task) => task.fingerprint === event.fingerprint);
    const now = Date.now();

    if (existingIndex >= 0) {
      const existing = tasks[existingIndex];
      const updatedTask = {
        ...existing,
        eventIds: Array.from(new Set([...existing.eventIds, event.id])),
        updatedAt: now,
      };
      tasks[existingIndex] = updatedTask;
      await this.writeJson(this.tasksPath, tasks);
      return updatedTask;
    }

    const task: EngineeringTask = {
      id: randomUUID(),
      type: "bugfix",
      status: "new",
      title: `[auto] ${event.message}`,
      fingerprint: event.fingerprint,
      eventIds: [event.id],
      createdAt: now,
      updatedAt: now,
      summary: buildTaskSummary(event),
      suggestedVerification: ["pnpm type-check", "pnpm test"],
    };
    tasks.push(task);
    await this.writeJson(this.tasksPath, tasks);
    return task;
  }

  private async findExistingIssueUrl(fingerprint: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync("gh", [
        "issue",
        "list",
        "--state",
        "open",
        "--search",
        `engineering-fingerprint:${fingerprint}`,
        "--json",
        "url",
        "--limit",
        "1",
      ]);
      const issues = JSON.parse(stdout) as Array<{ url?: string }>;
      return issues[0]?.url;
    } catch {
      return undefined;
    }
  }

  private async createIssue(task: EngineeringTask): Promise<string> {
    const body = await this.buildIssueBody(task);
    const args = ["issue", "create", "--title", task.title, "--body", body];
    const { stdout } = await execFileAsync("gh", [
      ...args,
      "--label",
      "bug",
      "--label",
      "auto-captured",
    ]).catch(() => execFileAsync("gh", args));
    return stdout.trim();
  }

  private async buildIssueBody(task: EngineeringTask): Promise<string> {
    const events = await this.readJson<EngineeringEvent[]>(this.eventsPath, []);
    const relatedEvents = events.filter((event) => task.eventIds.includes(event.id)).slice(-5);
    const eventSections = relatedEvents
      .map((event) => {
        const stack = event.stack ? `\n\n\`\`\`\n${event.stack}\n\`\`\`` : "";
        return `### ${new Date(event.timestamp).toISOString()}\n\n${event.message}${stack}`;
      })
      .join("\n\n");

    return [
      "## Summary",
      task.summary,
      "",
      "## Fingerprint",
      `engineering-fingerprint:${task.fingerprint}`,
      "",
      "## Suggested verification",
      task.suggestedVerification.map((command) => `- \`${command}\``).join("\n"),
      "",
      "## Recent events",
      eventSections || "No event details available.",
      "",
      "_Created from Divisor Agent development mode. Sensitive fields are redacted locally before issue creation._",
    ].join("\n");
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(path, "utf-8")) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(path: string, value: unknown) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }
}

function inferSeverity(type: EngineeringEventInput["type"]) {
  return ERROR_EVENT_TYPES.has(type) ? "error" : "info";
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return 100;
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

function sanitizeMetadata(value: Record<string, unknown>) {
  return sanitizeValue(value) as Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        result[key] = "[redacted]";
      } else {
        result[key] = sanitizeValue(child);
      }
    }
    return result;
  }

  if (typeof value === "string") {
    return truncate(value, 300);
  }

  return value;
}

function sanitizeStack(stack: string | undefined) {
  if (!stack) return undefined;
  const home = process.env.HOME;
  return stack
    .split("\n")
    .slice(0, 12)
    .map((line) => (home ? line.replaceAll(home, "~") : line))
    .join("\n");
}

function createFingerprint(input: EngineeringEventInput, stack: string | undefined) {
  const topStackFrame = stack?.split("\n").find((line) => line.trim().startsWith("at ")) ?? "";
  const raw = [
    input.type,
    input.source,
    input.toolName ?? "",
    input.route ?? "",
    input.message,
    topStackFrame,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function buildTaskSummary(event: EngineeringEvent) {
  const context = [
    `Type: ${event.type}`,
    `Source: ${event.source}`,
    event.route ? `Route: ${event.route}` : undefined,
    event.toolName ? `Tool: ${event.toolName}` : undefined,
    event.sessionId ? `Session: ${event.sessionId}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  return `${event.message}\n\n${context}`;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
