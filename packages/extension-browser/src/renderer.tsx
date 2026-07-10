import {
  createExtensionIPC,
  defineRendererExtension,
  useExtensionsContextAPI,
  type ArtifactRenderProps,
} from "@divisor-agent/extension-core/renderer";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Separator } from "@renderer/components/ui/separator";
import { cn } from "@renderer/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Globe2,
  LoaderCircle,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  BROWSER_ARTIFACT_TYPE,
  BROWSER_EXTENSION,
  type BrowserAnnotationIntent,
  type BrowserAnnotationViewportBridgeEvent,
  type BrowserAnnotationViewportBridgeMarker,
  type BrowserAnnotationViewportBridgeOpenPayload,
  type BrowserElementSelection,
  type BrowserExposeEvents,
  type BrowserGrabScreenshot,
  type BrowserInvokeEvents,
  type BrowserPageAnnotation,
  type BrowserProfile,
  type BrowserState,
  type BrowserTab,
  type DetectedChromiumProfile,
} from "./common/types";
import AnnotationEditor from "./renderer/annotation-editor";
import AnnotationTooltip from "./renderer/annotation-tooltip";
import { browserCommentExtension } from "./renderer/browser-comment";
import {
  ensureBrowserPageWebview,
  getBrowserPageWebview,
  removeBrowserPageWebview,
} from "./renderer/browser-page-webview";
import GrabConfirmationSheet, { formatGrabPayloadAsText } from "./renderer/grab-confirmation";

const useBrowserIPC = createExtensionIPC<BrowserInvokeEvents, BrowserExposeEvents>(
  BROWSER_EXTENSION.id,
);

export default defineRendererExtension({
  ...BROWSER_EXTENSION,
  setup(ctx) {
    ctx.promptInput.registerExtension(browserCommentExtension);
    ctx.artifacts.register({ type: BROWSER_ARTIFACT_TYPE, render: BrowserArtifact });
  },
});

function BrowserArtifact({ sessionId }: ArtifactRenderProps) {
  const ipc = useBrowserIPC();
  const api = useExtensionsContextAPI();
  const viewportRef = useRef<HTMLDivElement>(null);
  const createdInitialTab = useRef(false);
  const [state, setState] = useState<BrowserState>({
    activeTabId: null,
    profiles: [],
    tabs: [],
  });
  const [address, setAddress] = useState("");
  const [panel, setPanel] = useState<"profiles" | null>(null);
  const [selection, setSelection] = useState<BrowserElementSelection | null>(null);
  const [selectingTabId, setSelectingTabId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [intent, setIntent] = useState<BrowserAnnotationIntent>("change");
  const [annotations, setAnnotations] = useState<BrowserPageAnnotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingMarker, setEditingMarker] = useState<{
    anchor: { x: number; y: number };
    markerId: string;
    payload: BrowserAnnotationViewportBridgeOpenPayload;
  } | null>(null);
  const [hoverMarker, setHoverMarker] = useState<{
    anchor: { x: number; y: number };
    comment: string;
  } | null>(null);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const activeTabId = state.activeTabId;
  const activeTabUrl = activeTab?.url;
  // Partition string for the active tab. Stable by value across state updates
  // (profiles are re-mapped each emit, but the partition string is identical),
  // so depending on this only re-mounts the <webview> on a real profile swap.
  const partitionForActiveTab =
    state.profiles.find((p) => p.id === activeTab?.profileId)?.partition ??
    "persist:divisor-browser-default";
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let alive = true;
    void ipc.invoke("getState", sessionId).then((next) => {
      if (!alive) return;
      setState(next);
      if (!next.tabs.length && !createdInitialTab.current) {
        createdInitialTab.current = true;
        void ipc.invoke("createTab", { sessionId });
      }
    });
    const off = ipc.on("stateChanged", (changedSessionId, next) => {
      if (alive && changedSessionId === sessionId) setState(next);
    });
    return () => {
      alive = false;
      off();
      // Unmount every guest webview for this artifact and tell main to drop
      // its handles. Main-side guests are destroyed when the <webview> leaves
      // the DOM, but unregisterGuest clears stale listeners promptly.
      for (const tab of stateRef.current.tabs) {
        removeBrowserPageWebview(tab.id);
        void ipc.invoke("unregisterGuest", { browserPageId: tab.id });
      }
    };
  }, [ipc, sessionId]);

  useEffect(() => {
    if (activeTabUrl) setAddress(activeTabUrl);
  }, [activeTabUrl]);

  // Mount the renderer-owned <webview> for the active tab. The webview lives in
  // the renderer DOM (so React overlays can paint above it), and main adopts
  // the guest via registerGuest once dom-ready fires. This replaces the old
  // WebContentsView + setSurface coordinate-pushing path.
  //
  // Deps are intentionally the stable tab *id* + partition, NOT the `activeTab`
  // object: main emits a fresh state object on every navigation event
  // (loading/title/url), so depending on `activeTab` would re-run this effect,
  // removeChild + remount the <webview>, and reload the guest in a loop. We
  // only (re)mount when the tab identity or profile changes; url changes are
  // synced by the separate navigation effect below.
  useEffect(() => {
    const container = viewportRef.current;
    const tab = stateRef.current.tabs.find((t) => t.id === activeTabId) ?? null;
    if (!container || !tab || panel) return;
    const profile = stateRef.current.profiles.find((p) => p.id === tab.profileId);
    const partition = profile?.partition ?? "persist:divisor-browser-default";
    const result = ensureBrowserPageWebview(container, {
      browserPageId: tab.id,
      // Guest always receives pointer input. Element selection works by
      // injecting a picker into the guest (it needs the clicks); the
      // confirmation sheet sits in the area below the viewport, not on top of
      // the webview, so there is nothing to lock.
      inputLocked: false,
      partition,
      url: tab.url,
    });
    if (!result) return;
    const { webview, created } = result;
    if (created) {
      const onDomReady = () => {
        const webContentsId = webview.getWebContentsId();
        if (typeof webContentsId !== "number") return;
        void ipc.invoke("registerGuest", {
          browserPageId: tab.id,
          sessionId,
          profileId: tab.profileId,
          webContentsId,
        });
      };
      webview.addEventListener("dom-ready", onDomReady);
    }
    return () => {
      // Detach the webview only on a real identity/profile/panel change, not
      // on every navigation state update. Reparenting recreates the guest.
      if (webview.parentElement === container) container.removeChild(webview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, panel, sessionId, partitionForActiveTab]);

  // Sync the active tab's url into the mounted <webview> without remounting.
  useEffect(() => {
    if (!activeTabId || panel) return;
    const webview = getBrowserPageWebview(activeTabId);
    if (!webview || !activeTabUrl) return;
    // Only navigate when the url actually differs to avoid reloading the page
    // on every state update that happens to carry the same url.
    if (webview.src !== activeTabUrl) webview.src = activeTabUrl;
  }, [activeTabId, activeTabUrl, panel]);

  useEffect(() => {
    if (!selectingTabId) return;
    return () => {
      void ipc.invoke("cancelElementSelection", { sessionId, tabId: selectingTabId });
    };
  }, [ipc, selectingTabId, sessionId]);

  useEffect(() => {
    return ipc.on("annotationViewportEvent", (event) => {
      if (!activeTab || event.browserPageId !== activeTab.id) return;
      handleAnnotationViewportEvent(event);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, annotations, ipc]);

  // Sync annotation markers when active tab changes
  useEffect(() => {
    if (!activeTab) return;
    const tabAnnotations = annotations.filter((a) => a.browserPageId === activeTab.id);
    updateViewportMarkers(activeTab.id, tabAnnotations);
    return () => {
      // Remove markers when tab changes
      if (activeTab) {
        void ipc.invoke("setAnnotationViewportBridge", {
          browserPageId: activeTab.id,
          enabled: false,
          markers: [],
          token: "",
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id]);

  const navigate = (action: "back" | "forward" | "goto" | "reload", url?: string) => {
    if (!activeTab) return;
    setError(null);
    void ipc
      .invoke("navigate", { action, sessionId, tabId: activeTab.id, url })
      .catch((cause) => setError(messageFrom(cause)));
  };

  const submitAddress = (event: FormEvent) => {
    event.preventDefault();
    navigate("goto", address);
  };

  const startSelection = async () => {
    if (!activeTab) return;
    setError(null);
    setIntent("change");
    setSelectingTabId(activeTab.id);
    try {
      const result = await ipc.invoke("startElementSelection", {
        sessionId,
        tabId: activeTab.id,
      });
      attachSelectionResult(result, "change");
    } catch (cause) {
      if (!/cancel/i.test(messageFrom(cause))) setError(messageFrom(cause));
    } finally {
      setSelectingTabId(null);
    }
  };

  const attachComment = () => {
    if (!selection || !activeTab) return;
    attachSelectionResult(
      {
        ...selection,
        comment: comment.trim() || "Selected element",
      },
      intent,
    );
    setSelection(null);
    setComment("");
  };

  const attachSelectionResult = (
    result: BrowserElementSelection,
    annotationIntent: BrowserAnnotationIntent,
  ) => {
    if (!activeTab) return;
    const annotationComment = result.comment.trim() || "Selected element";
    const editor = api.sharedPromptEditor.editor;
    if (!editor) {
      setSelection(result);
      setComment(annotationComment);
      setIntent(annotationIntent);
      setError("The prompt editor is not available");
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({
        type: "browserComment",
        attrs: {
          comment: annotationComment,
          context: result.payload,
          intent: annotationIntent,
        },
      })
      .insertContent(" ")
      .run();
    // Add to annotations and update viewport bridge markers
    const newAnnotation: BrowserPageAnnotation = {
      id: crypto.randomUUID(),
      browserPageId: activeTab.id,
      comment: annotationComment,
      intent: annotationIntent,
      priority: "suggestion",
      createdAt: new Date().toISOString(),
      payload: { ...result.payload, screenshot: null },
    };
    const updatedAnnotations = [...annotations, newAnnotation];
    setAnnotations(updatedAnnotations);
    updateViewportMarkers(activeTab.id, updatedAnnotations);
  };

  // Convert a guest-viewport anchor (from the bridge event) to renderer-screen
  // coords by adding the <webview> element's origin. The React overlays float
  // against this screen point.
  const screenAnchor = (guestX: number, guestY: number) => {
    const webview = getBrowserPageWebview(activeTab?.id ?? "");
    const rect = webview?.getBoundingClientRect();
    return { x: (rect?.left ?? 0) + guestX, y: (rect?.top ?? 0) + guestY };
  };

  const handleAnnotationViewportEvent = (event: BrowserAnnotationViewportBridgeEvent) => {
    if (!activeTab || event.browserPageId !== activeTab.id) return;
    if (event.type === "hover") {
      // hover-leave carries null markerId; hide the tooltip.
      if (!event.markerId || !event.open) {
        setHoverMarker(null);
        return;
      }
      setHoverMarker({
        anchor: screenAnchor(event.open.anchorX, event.open.anchorY),
        comment: event.open.comment,
      });
      return;
    }
    if (event.type === "open") {
      if (!event.open || !event.markerId) return;
      setHoverMarker(null);
      setEditingMarker({
        anchor: screenAnchor(event.open.anchorX, event.open.anchorY),
        markerId: event.markerId,
        payload: event.open,
      });
      return;
    }
    if (event.type === "delete") {
      if (!event.markerId) return;
      setEditingMarker(null);
      const updatedAnnotations = annotations.filter(
        (annotation) => annotation.id !== event.markerId,
      );
      setAnnotations(updatedAnnotations);
      updateViewportMarkers(activeTab.id, updatedAnnotations);
      return;
    }
    if (event.type === "save") {
      if (!event.markerId) return;
      setEditingMarker(null);
      const updatedAnnotations = annotations.map((annotation) =>
        annotation.id === event.markerId
          ? { ...annotation, comment: (event.comment ?? "").trim() || "Selected element" }
          : annotation,
      );
      setAnnotations(updatedAnnotations);
      updateViewportMarkers(activeTab.id, updatedAnnotations);
    }
  };

  const updateViewportMarkers = (tabId: string, pageAnnotations: BrowserPageAnnotation[]) => {
    const markers: BrowserAnnotationViewportBridgeMarker[] = pageAnnotations
      .filter((a) => a.browserPageId === tabId)
      .map((a, index) => ({
        id: a.id,
        index,
        comment: a.comment,
        computedStyles: a.payload.target.computedStyles,
        intent: a.intent,
        tagName: a.payload.target.tagName,
        rectPage: a.payload.target.rectPage,
        rectViewport: a.payload.target.rectViewport,
        isFixed: a.payload.target.isFixed ?? false,
      }));
    const token = crypto.randomUUID().replaceAll("-", "").slice(0, 40);
    void ipc.invoke("setAnnotationViewportBridge", {
      browserPageId: tabId,
      enabled: markers.length > 0,
      markers,
      token,
    });
  };

  const handleCopy = () => {
    if (!selection) return;
    const text = formatGrabPayloadAsText(selection.payload);
    void navigator.clipboard.writeText(text);
    // Re-arm for another pick
    setSelection(null);
    setComment("");
    setError(null);
  };

  const handleCopyScreenshot = () => {
    if (!selection) return;
    const img = new Image();
    img.src = selection.screenshotDataUrl;
    void (async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
      } catch {
        // Clipboard write may fail — not critical
      }
    })();
  };

  const screenshot: BrowserGrabScreenshot | null = selection
    ? {
        mimeType: "image/png" as const,
        dataUrl: selection.screenshotDataUrl,
        width: Math.round(selection.payload.target.rectViewport.width),
        height: Math.round(selection.payload.target.rectViewport.height),
      }
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border-2 border-border bg-background">
      <BrowserTabs
        activeTabId={state.activeTabId}
        onActivate={(tabId) => void ipc.invoke("setActiveTab", { sessionId, tabId })}
        onClose={(tabId) => {
          removeBrowserPageWebview(tabId);
          void ipc.invoke("unregisterGuest", { browserPageId: tabId });
          void ipc.invoke("closeTab", { sessionId, tabId });
        }}
        onCreate={() => void ipc.invoke("createTab", { sessionId })}
        tabs={state.tabs}
      />
      <div className="flex h-10 shrink-0 items-center gap-1 border-b-2 border-border bg-card px-1.5">
        <ToolbarButton
          disabled={!activeTab?.canGoBack}
          label="Back"
          onClick={() => navigate("back")}
        >
          <ArrowLeft />
        </ToolbarButton>
        <ToolbarButton
          disabled={!activeTab?.canGoForward}
          label="Forward"
          onClick={() => navigate("forward")}
        >
          <ArrowRight />
        </ToolbarButton>
        <ToolbarButton label="Reload" onClick={() => navigate("reload")}>
          {activeTab?.isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        </ToolbarButton>
        <form className="min-w-0 flex-1" onSubmit={submitAddress}>
          <Input
            aria-label="Browser address"
            className="h-7 w-full text-xs"
            onChange={(event) => setAddress(event.target.value)}
            spellCheck={false}
            value={address}
          />
        </form>
        <ToolbarButton
          disabled={Boolean(selectingTabId)}
          label="Select element and comment"
          onClick={() => void startSelection()}
        >
          <MessageSquarePlus />
        </ToolbarButton>
        <ToolbarButton
          label="Browser profiles"
          onClick={() => setPanel(panel === "profiles" ? null : "profiles")}
        >
          <Settings2 />
        </ToolbarButton>
      </div>
      {error ? (
        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 bg-muted/20">
        <div
          ref={viewportRef}
          className={selection ? "absolute inset-0 bottom-[42%]" : "absolute inset-0"}
        />
        {!activeTab ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            No browser tab
          </div>
        ) : null}
        {panel === "profiles" ? (
          <ProfilePanel
            activeTab={activeTab}
            ipc={ipc}
            onClose={() => setPanel(null)}
            profiles={state.profiles}
            sessionId={sessionId}
          />
        ) : null}
        {selection ? (
          <GrabConfirmationSheet
            comment={comment}
            intent={intent}
            onCommentChange={setComment}
            onIntentChange={setIntent}
            onCopy={handleCopy}
            onCopyScreenshot={handleCopyScreenshot}
            onAttach={attachComment}
            onCancel={() => {
              setSelection(null);
              setComment("");
            }}
            payload={selection.payload}
            screenshot={screenshot}
          />
        ) : null}
        {hoverMarker && !editingMarker ? (
          <AnnotationTooltip anchor={hoverMarker.anchor} comment={hoverMarker.comment} />
        ) : null}
        {editingMarker && activeTab ? (
          <AnnotationEditor
            anchor={editingMarker.anchor}
            initialComment={editingMarker.payload.comment}
            initialIntent={editingMarker.payload.intent}
            payload={editingMarker.payload}
            onCancel={() => setEditingMarker(null)}
            onDelete={() => {
              const markerId = editingMarker.markerId;
              setEditingMarker(null);
              const updatedAnnotations = annotations.filter((a) => a.id !== markerId);
              setAnnotations(updatedAnnotations);
              updateViewportMarkers(activeTab.id, updatedAnnotations);
            }}
            onSave={(nextComment, nextIntent) => {
              const markerId = editingMarker.markerId;
              setEditingMarker(null);
              const updatedAnnotations = annotations.map((a) =>
                a.id === markerId
                  ? { ...a, comment: nextComment || "Selected element", intent: nextIntent }
                  : a,
              );
              setAnnotations(updatedAnnotations);
              updateViewportMarkers(activeTab.id, updatedAnnotations);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function BrowserTabs({
  activeTabId,
  onActivate,
  onClose,
  onCreate,
  tabs,
}: {
  activeTabId: string | null;
  onActivate(tabId: string): void;
  onClose(tabId: string): void;
  onCreate(): void;
  tabs: BrowserTab[];
}) {
  return (
    <div className="flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b-2 border-border bg-muted px-1 pt-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={cn(
            "group flex h-7 max-w-40 shrink-0 items-center gap-1 rounded-t-md border-2 border-b-0 border-border px-2 text-xs",
            tab.id === activeTabId ? "bg-background" : "bg-card text-muted-foreground",
          )}
          onClick={() => onActivate(tab.id)}
          type="button"
        >
          <Globe2 className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{tab.title || "New Tab"}</span>
          <span
            aria-label={`Close ${tab.title}`}
            className="rounded-sm p-0.5 hover:bg-muted"
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.id);
            }}
            role="button"
          >
            <X className="size-3" />
          </span>
        </button>
      ))}
      <Button
        aria-label="New browser tab"
        className="mb-0.5 shrink-0"
        onClick={onCreate}
        size="icon-xs"
        variant="ghost"
      >
        <Plus />
      </Button>
    </div>
  );
}

function ToolbarButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <Button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      size="icon-sm"
      title={label}
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function ProfilePanel({
  activeTab,
  ipc,
  onClose,
  profiles,
  sessionId,
}: {
  activeTab: BrowserTab | null;
  ipc: ReturnType<typeof useBrowserIPC>;
  onClose(): void;
  profiles: BrowserProfile[];
  sessionId: string;
}) {
  const [label, setLabel] = useState("");
  const [sources, setSources] = useState<DetectedChromiumProfile[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [message, setMessage] = useState("");
  const activeProfileId = activeTab?.profileId ?? "default";

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;
    await ipc.invoke("createProfile", label);
    setLabel("");
  };

  const detect = async () => {
    const detected = await ipc.invoke("detectChromiumProfiles");
    setSources(detected);
    setSourceId(detected[0]?.id ?? "");
    setMessage(detected.length ? "" : "No supported Chromium profiles found");
  };

  const importCookies = async () => {
    if (!sourceId) return;
    const result = await ipc.invoke("importChromiumCookies", {
      profileId: activeProfileId,
      sourceId,
    });
    setMessage(
      `Imported ${result.imported} of ${result.total} cookies (${result.skipped} skipped) from ${result.domains.length} domains`,
    );
  };

  return (
    <div className="absolute inset-0 z-10 overflow-auto bg-background p-4">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold">Browser profiles</h3>
            <p className="text-xs text-muted-foreground">
              Each profile has isolated cookies and storage.
            </p>
          </div>
          <ToolbarButton label="Close profiles" onClick={onClose}>
            <X />
          </ToolbarButton>
        </div>
        <div className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center gap-2 rounded-md border-2 border-border p-2"
            >
              <button
                className={`min-w-0 flex-1 text-left text-xs ${profile.id === activeProfileId ? "font-bold" : ""}`}
                disabled={!activeTab}
                onClick={() => {
                  if (!activeTab) return;
                  void ipc.invoke("setTabProfile", {
                    profileId: profile.id,
                    sessionId,
                    tabId: activeTab.id,
                  });
                }}
                type="button"
              >
                <span className="block truncate">{profile.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {profile.partition}
                </span>
              </button>
              {profile.id !== "default" ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    className="rounded p-1 text-xs hover:bg-muted"
                    onClick={() => {
                      const nextLabel = window.prompt("Profile name", profile.label);
                      if (nextLabel?.trim()) {
                        void ipc
                          .invoke("renameProfile", { id: profile.id, label: nextLabel })
                          .catch((cause) => setMessage(messageFrom(cause)));
                      }
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className="rounded p-1 text-xs text-destructive hover:bg-muted"
                    onClick={() =>
                      void ipc
                        .invoke("deleteProfile", profile.id)
                        .catch((cause) => setMessage(messageFrom(cause)))
                    }
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={createProfile}>
          <Input
            className="min-w-0 flex-1 text-xs"
            onChange={(event) => setLabel(event.target.value)}
            placeholder="New profile name"
            value={label}
          />
          <Button size="sm" type="submit" variant="outline">
            Create
          </Button>
        </form>
        <Separator />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold">Import Chromium cookies</h4>
              <p className="text-[11px] text-muted-foreground">
                Chrome, Edge, Brave and Arc are supported.
              </p>
            </div>
            <Button onClick={() => void detect()} size="sm" variant="outline">
              Detect
            </Button>
          </div>
          {sources.length ? (
            <div className="flex gap-2">
              <Select onValueChange={(value) => setSourceId(value ?? "")} value={sourceId}>
                <SelectTrigger className="min-w-0 flex-1" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button onClick={() => void importCookies()} size="sm" variant="outline">
                Import
              </Button>
            </div>
          ) : null}
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}

function messageFrom(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}
