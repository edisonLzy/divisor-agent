import { defineMainExtension } from "@divisor-agent/extension-core/main";
import { Type } from "@earendil-works/pi-ai";

import {
  BROWSER_ARTIFACT_ID,
  BROWSER_ARTIFACT_TYPE,
  BROWSER_EXTENSION,
  type BrowserExposeEvents,
  type BrowserGetProperty,
  type BrowserInvokeEvents,
  type BrowserNavigationAction,
} from "./common/types";
import { BrowserManager } from "./main/browser-manager";

const optionalTabId = Type.Optional(
  Type.String({ description: "Browser page id; defaults to the active tab" }),
);

export default defineMainExtension<BrowserInvokeEvents, BrowserExposeEvents>({
  ...BROWSER_EXTENSION,
  setup(ctx) {
    const manager = new BrowserManager(ctx.getBrowserWindow, (sessionId, state) => {
      ctx.ipc.emit("stateChanged", sessionId, state);
    });

    ctx.ipc.handle("createTab", ({ profileId, sessionId, url }) =>
      manager.createTab(sessionId, url, profileId),
    );
    ctx.ipc.handle("closeTab", ({ sessionId, tabId }) => manager.closeTab(sessionId, tabId));
    ctx.ipc.handle("setActiveTab", ({ sessionId, tabId }) =>
      manager.setActiveTab(sessionId, tabId),
    );
    ctx.ipc.handle("getState", (sessionId) => manager.getState(sessionId));
    ctx.ipc.handle("navigate", ({ action, sessionId, tabId, url }) =>
      manager.navigate(sessionId, tabId, action, url),
    );
    ctx.ipc.handle("setSurface", (input) => manager.setSurface(input));
    ctx.ipc.handle("createProfile", (label) => manager.createProfile(label));
    ctx.ipc.handle("renameProfile", ({ id, label }) => manager.renameProfile(id, label));
    ctx.ipc.handle("deleteProfile", (id) => manager.deleteProfile(id));
    ctx.ipc.handle("setTabProfile", ({ profileId, sessionId, tabId }) =>
      manager.setTabProfile(sessionId, tabId, profileId),
    );
    ctx.ipc.handle("detectChromiumProfiles", () => manager.detectChromiumProfiles());
    ctx.ipc.handle("importChromiumCookies", ({ profileId, sourceId }) =>
      manager.importChromiumCookies(profileId, sourceId),
    );
    ctx.ipc.handle("startElementSelection", ({ sessionId, tabId }) =>
      manager.startElementSelection(sessionId, tabId),
    );
    ctx.ipc.handle("cancelElementSelection", ({ sessionId, tabId }) =>
      manager.cancelElementSelection(sessionId, tabId),
    );
    ctx.ipc.handle("setAnnotationViewportBridge", ({ browserPageId, enabled, markers, token }) =>
      manager.setAnnotationViewportBridge(browserPageId, enabled, markers, token),
    );

    ctx.systemPrompt.register({
      id: "browser.read-only",
      content:
        "The browser tools are read-only except for opening pages and navigation. You may inspect tabs, page metadata, accessibility snapshots, element properties, and screenshots. You cannot click, type, submit, upload, execute JavaScript, read cookies, or mutate website data. Take a fresh browser/snapshot after navigation before using element refs.",
    });

    ctx.tools.register({
      name: "browser/open",
      label: "Open Browser Page",
      description: "Open a URL in a new in-app browser tab. This is navigation-only.",
      parameters: Type.Object({
        profileId: Type.Optional(Type.String({ description: "Browser profile id" })),
        url: Type.String({ description: "HTTP(S) URL to open" }),
      }),
      async execute(_toolCallId, args) {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const tab = manager.createTab(sessionId, args.url, args.profileId);
        return toolResult(`Opened ${tab.url}`, tab, sessionId);
      },
    });

    ctx.tools.register({
      name: "browser/navigate",
      label: "Navigate Browser",
      description: "Navigate an existing browser tab with goto, back, forward, or reload.",
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal("goto"),
          Type.Literal("back"),
          Type.Literal("forward"),
          Type.Literal("reload"),
        ]),
        tabId: optionalTabId,
        url: Type.Optional(Type.String({ description: "Required for goto" })),
      }),
      async execute(_toolCallId, args) {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const tab = manager.pageInfo(sessionId, args.tabId);
        await manager.navigate(sessionId, tab.id, args.action as BrowserNavigationAction, args.url);
        return toolResult(
          `Navigation requested: ${args.action}`,
          manager.pageInfo(sessionId, tab.id),
          sessionId,
        );
      },
    });

    ctx.tools.register({
      name: "browser/tabs",
      label: "List Browser Tabs",
      description: "List browser tabs in the current agent session.",
      parameters: Type.Object({}),
      async execute() {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const state = manager.getState(sessionId);
        return toolResult(JSON.stringify(state.tabs, null, 2), state, sessionId);
      },
    });

    ctx.tools.register({
      name: "browser/page-info",
      label: "Read Browser Page Info",
      description: "Read URL, title, loading state, history state, and profile for a browser tab.",
      parameters: Type.Object({ tabId: optionalTabId }),
      async execute(_toolCallId, args) {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const info = manager.pageInfo(sessionId, args.tabId);
        return toolResult(JSON.stringify(info, null, 2), info, sessionId);
      },
    });

    ctx.tools.register({
      name: "browser/snapshot",
      label: "Read Browser Snapshot",
      description: "Read the accessibility tree and generate short element refs for later reads.",
      parameters: Type.Object({ tabId: optionalTabId }),
      async execute(_toolCallId, args) {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const result = await manager.snapshot(sessionId, args.tabId);
        return toolResult(
          result.snapshot || "The page accessibility tree is empty.",
          result,
          sessionId,
        );
      },
    });

    ctx.tools.register({
      name: "browser/get",
      label: "Read Browser Element",
      description: "Read a property from an element ref produced by browser/snapshot.",
      parameters: Type.Object({
        property: Type.Union([
          Type.Literal("box"),
          Type.Literal("html"),
          Type.Literal("name"),
          Type.Literal("role"),
          Type.Literal("state"),
          Type.Literal("text"),
          Type.Literal("value"),
        ]),
        ref: Type.String({ description: "Element ref such as @e1" }),
        tabId: optionalTabId,
      }),
      async execute(_toolCallId, args) {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const result = await manager.get(
          sessionId,
          args.ref,
          args.property as BrowserGetProperty,
          args.tabId,
        );
        return toolResult(JSON.stringify(result, null, 2), result, sessionId);
      },
    });

    ctx.tools.register({
      name: "browser/screenshot",
      label: "Capture Browser Screenshot",
      description: "Capture a viewport or full-page screenshot without changing the page.",
      parameters: Type.Object({
        fullPage: Type.Optional(Type.Boolean({ description: "Capture the full document" })),
        tabId: optionalTabId,
      }),
      async execute(_toolCallId, args) {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const result = await manager.screenshot(sessionId, args.tabId, args.fullPage);
        return toolResult(`Screenshot saved to ${result.path}`, result, sessionId);
      },
    });

    return () => manager.destroy();
  },
});

function requireSessionId(sessionId: string | undefined) {
  if (!sessionId) throw new Error("Browser tools require an active agent session");
  return sessionId;
}

function toolResult(text: string, details: unknown, sessionId: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: {
      browser: details,
      artifacts: [
        {
          content: {},
          id: BROWSER_ARTIFACT_ID,
          name: "Browser",
          type: BROWSER_ARTIFACT_TYPE,
        },
      ],
      openArtifactId: BROWSER_ARTIFACT_ID,
      sessionId,
    },
  };
}
