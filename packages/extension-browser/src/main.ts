import { createRequire } from "module";

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
import { ReadingAnnotationStore } from "./main/reading-annotation-store";

const optionalTabId = Type.Optional(
  Type.String({ description: "Browser page id; defaults to the current page" }),
);

export default defineMainExtension<BrowserInvokeEvents, BrowserExposeEvents>({
  ...BROWSER_EXTENSION,
  setup(ctx) {
    const _require = createRequire(import.meta.url);
    const PRELOAD_PATH = _require.resolve("@divisor-agent/extension-browser/preload");

    const manager = new BrowserManager(
      ctx.getBrowserWindow,
      (sessionId, state) => {
        ctx.ipc.emit("stateChanged", sessionId, state);
      },
      PRELOAD_PATH,
    );
    const readingAnnotations = new ReadingAnnotationStore();

    ctx.ipc.handle("ensurePage", ({ profileId, sessionId, url }) =>
      manager.ensurePage(sessionId, url, profileId),
    );
    ctx.ipc.handle("openPage", ({ profileId, sessionId, url }) =>
      manager.openPage(sessionId, url, profileId),
    );
    ctx.ipc.handle("getState", (sessionId) => manager.getState(sessionId));
    ctx.ipc.handle("navigate", ({ action, sessionId, tabId, url }) =>
      manager.navigate(sessionId, tabId, action, url),
    );
    ctx.ipc.handle("setSurface", (input) => manager.setSurface(input));
    ctx.ipc.handle("registerGuest", ({ browserPageId, sessionId, profileId, webContentsId }) =>
      manager.registerGuest({ browserPageId, sessionId, profileId, webContentsId }),
    );
    ctx.ipc.handle("unregisterGuest", ({ browserPageId }) =>
      manager.unregisterGuest({ browserPageId }),
    );
    ctx.ipc.handle("openInSystemBrowser", ({ sessionId, tabId }) =>
      manager.openInSystemBrowser(sessionId, tabId),
    );
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
    ctx.ipc.handle("createReadingAnnotation", (annotation) =>
      readingAnnotations.create(annotation),
    );
    ctx.ipc.handle("deleteReadingAnnotation", (id) => readingAnnotations.delete(id));
    ctx.ipc.handle("listReadingAnnotations", ({ url }) => readingAnnotations.list(url));
    ctx.ipc.handle("updateReadingAnnotation", (input) => readingAnnotations.update(input));

    ctx.systemPrompt.register({
      id: "browser.read-only",
      content:
        "The Browser Artifact shows one page at a time. The browser tools are read-only except for opening pages and navigation. You may inspect the current page, page metadata, accessibility snapshots, element properties, and screenshots. You cannot click, type, submit, upload, execute JavaScript, read cookies, or mutate website data. Take a fresh browser/snapshot after navigation before using element refs.",
    });

    ctx.tools.register({
      name: "browser/open",
      label: "Open Browser Page",
      description: "Navigate the current Browser Artifact page to a URL. This is navigation-only.",
      parameters: Type.Object({
        profileId: Type.Optional(Type.String({ description: "Browser profile id" })),
        url: Type.String({ description: "HTTP(S) URL to open" }),
      }),
      async execute(_toolCallId, args) {
        const sessionId = requireSessionId(
          ctx.extensionRuntime.getCurrentAgentContext()?.sessionId,
        );
        const page = manager.openPage(sessionId, args.url, args.profileId);
        return toolResult(`Opened ${page.url}`, page, sessionId);
      },
    });

    ctx.tools.register({
      name: "browser/navigate",
      label: "Navigate Browser",
      description:
        "Navigate the current Browser Artifact page with goto, back, forward, or reload.",
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
      name: "browser/page-info",
      label: "Read Browser Page Info",
      description:
        "Read URL, title, loading state, history state, and profile for the current page.",
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
