export type EngineeringEventType =
  | "renderer_error"
  | "main_error"
  | "unhandled_rejection"
  | "agent_failure"
  | "tool_failure"
  | "permission_denial"
  | "ui_action"
  | "verification_failure";

export type EngineeringEventSeverity = "info" | "warning" | "error";

export interface EngineeringEventInput {
  type: EngineeringEventType;
  severity?: EngineeringEventSeverity;
  source: "main" | "renderer" | "agent" | "tool" | "verification";
  message: string;
  stack?: string;
  sessionId?: string;
  scope?: string;
  route?: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

export interface EngineeringEvent extends EngineeringEventInput {
  id: string;
  timestamp: number;
  fingerprint: string;
  appVersion: string;
  platform: string;
}

export type EngineeringTaskStatus =
  | "new"
  | "triaged"
  | "issue_created"
  | "fixing"
  | "needs_human"
  | "fixed"
  | "ignored";

export type EngineeringTaskType =
  | "bugfix"
  | "ux_insight"
  | "regression"
  | "test_gap"
  | "performance_issue";

export interface EngineeringTask {
  id: string;
  type: EngineeringTaskType;
  status: EngineeringTaskStatus;
  title: string;
  fingerprint: string;
  eventIds: string[];
  createdAt: number;
  updatedAt: number;
  issueUrl?: string;
  summary: string;
  suggestedVerification: string[];
}

export interface EngineeringConfig {
  developmentModeEnabled: boolean;
}

export interface EngineeringRecordResult {
  recorded: boolean;
  event?: EngineeringEvent;
  task?: EngineeringTask;
  reason?: string;
}

export interface EngineeringIssueResult {
  task: EngineeringTask;
  issueUrl: string;
  created: boolean;
}

export interface EngineeringIPC {
  getDevelopmentMode: () => Promise<EngineeringConfig>;
  setDevelopmentMode: (enabled: boolean) => Promise<EngineeringConfig>;
  recordEngineeringEvent: (event: EngineeringEventInput) => Promise<EngineeringRecordResult>;
  listEngineeringEvents: (limit?: number) => Promise<EngineeringEvent[]>;
  listEngineeringTasks: (limit?: number) => Promise<EngineeringTask[]>;
  createGitHubIssue: (taskId: string) => Promise<EngineeringIssueResult>;
}
