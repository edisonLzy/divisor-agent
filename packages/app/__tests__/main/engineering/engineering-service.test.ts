import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => tmpdir()),
    getVersion: vi.fn(() => "1.0.0-test"),
  },
}));

import { EngineeringService } from "../../../src/main/engineering/index.js";

describe("EngineeringService", () => {
  let dataDir: string;
  let service: EngineeringService;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "divisor-engineering-"));
    service = new EngineeringService(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
  });

  it("does not record events while development mode is disabled", async () => {
    const result = await service.recordEngineeringEvent({
      type: "renderer_error",
      source: "renderer",
      message: "Boom",
    });

    expect(result.recorded).toBe(false);
    expect(await service.listEngineeringEvents()).toEqual([]);
    expect(await service.listEngineeringTasks()).toEqual([]);
  });

  it("records error events and creates a deduplicated task", async () => {
    await service.setDevelopmentMode(true);

    const first = await service.recordEngineeringEvent({
      type: "renderer_error",
      source: "renderer",
      message: "Cannot render settings",
      stack: `Error: Cannot render settings
    at SettingsPage (/Users/example/project/src/settings.tsx:10:1)`,
      metadata: {
        route: "/settings",
        apiKey: "sk-secret",
        prompt: "private prompt",
      },
    });
    const second = await service.recordEngineeringEvent({
      type: "renderer_error",
      source: "renderer",
      message: "Cannot render settings",
      stack: `Error: Cannot render settings
    at SettingsPage (/Users/example/project/src/settings.tsx:10:1)`,
    });

    const events = await service.listEngineeringEvents();
    const tasks = await service.listEngineeringTasks();

    expect(first.recorded).toBe(true);
    expect(first.task?.id).toBe(second.task?.id);
    expect(events).toHaveLength(2);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].eventIds).toHaveLength(2);
    const eventWithMetadata = events.find((event) => event.metadata?.route === "/settings");
    expect(eventWithMetadata?.metadata?.apiKey).toBe("[redacted]");
    expect(eventWithMetadata?.metadata?.prompt).toBe("[redacted]");
  });

  it("does not create tasks for non-error behavioral events", async () => {
    await service.setDevelopmentMode(true);

    await service.recordEngineeringEvent({
      type: "ui_action",
      source: "renderer",
      message: "Opened engineering settings",
      metadata: { route: "/settings/engineering" },
    });

    expect(await service.listEngineeringEvents()).toHaveLength(1);
    expect(await service.listEngineeringTasks()).toEqual([]);
  });
});
