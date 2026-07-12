import {
  createExtensionIPC,
  defineRendererExtension,
  useExtensionsContextAPI,
  type ArtifactRenderProps,
} from "@divisor-agent/extension-core/renderer";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
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
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  BROWSER_ARTIFACT_ID,
  BROWSER_ARTIFACT_TYPE,
  BROWSER_EXTENSION,
  DEFAULT_READING_TAGS,
  type BrowserExposeEvents,
  type BrowserInvokeEvents,
  type BrowserProfile,
  type BrowserReadingAnnotation,
  type BrowserReadingTag,
  type BrowserState,
  type BrowserTextSelection,
  type BrowserTab,
  type DetectedChromiumProfile,
} from "./common/types";
import {
  ensureBrowserPageWebview,
  getBrowserPageWebview,
  removeBrowserPageWebview,
} from "./renderer/browser-page-webview";
import {
  browserReadingAnnotationExtension,
  insertBrowserReadingAnnotation,
} from "./renderer/browser-reading-annotation";
import { ReadingAnnotationActions } from "./renderer/reading-annotation-command";
import { ReadingAnnotationEditor } from "./renderer/reading-annotation-editor";
import { ReadingAnnotationToolbar } from "./renderer/reading-annotation-toolbar";

const useBrowserIPC = createExtensionIPC<BrowserInvokeEvents, BrowserExposeEvents>(
  BROWSER_EXTENSION.id,
);

export default defineRendererExtension({
  ...BROWSER_EXTENSION,
  setup(ctx) {
    ctx.streamdown.registerComponents({
      a:
        (Base) =>
        ({ href, children, ...rest }: BrowserMessageAnchorProps) => {
          if (!isBrowserPageUrl(href)) {
            const Component = Base;
            return (
              <Component href={href} {...rest}>
                {children}
              </Component>
            );
          }
          return (
            <BrowserMessageLink href={href} {...rest}>
              {children}
            </BrowserMessageLink>
          );
        },
    });
    ctx.promptInput.registerExtension(browserReadingAnnotationExtension);
    ctx.artifacts.register({ type: BROWSER_ARTIFACT_TYPE, render: BrowserArtifact });
  },
});

function BrowserArtifact({ sessionId }: ArtifactRenderProps) {
  const ipc = useBrowserIPC();
  const api = useExtensionsContextAPI();
  const viewportRef = useRef<HTMLDivElement>(null);
  const createdInitialPage = useRef(false);
  const [state, setState] = useState<BrowserState>({
    activeTabId: null,
    profiles: [],
    tabs: [],
  });
  const [address, setAddress] = useState("");
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [readingSelection, setReadingSelection] = useState<BrowserTextSelection | null>(null);
  const [readingAnnotations, setReadingAnnotations] = useState<BrowserReadingAnnotation[]>([]);
  const [loadedReadingUrl, setLoadedReadingUrl] = useState<string | null>(null);
  const [readingAnnotationsEnabled, setReadingAnnotationsEnabled] = useState(true);
  const [readingActionsOpen, setReadingActionsOpen] = useState(false);
  const [readingTagFilter, setReadingTagFilter] = useState<string | null>(null);
  const [openReadingAnnotationId, setOpenReadingAnnotationId] = useState<string | null>(null);
  const [readingEditorAnchor, setReadingEditorAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [webviewGen, setWebviewGen] = useState(0);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const activeTabId = state.activeTabId;
  const activeTabUrl = activeTab?.url;
  const readingUrl = normalizeReadingUrl(activeTabUrl);
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
      if (!next.tabs.length && !createdInitialPage.current) {
        createdInitialPage.current = true;
        void ipc.invoke("ensurePage", { sessionId });
      }
    });
    const off = ipc.on("stateChanged", (changedSessionId, next) => {
      if (alive && changedSessionId === sessionId) setState(next);
    });
    return () => {
      alive = false;
      off();
      // Unmount the artifact's guest webview and tell main to drop
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
    if (!container || !tab) return;
    const profile = stateRef.current.profiles.find((p) => p.id === tab.profileId);
    const partition = profile?.partition ?? "persist:divisor-browser-default";
    const result = ensureBrowserPageWebview(container, {
      browserPageId: tab.id,
      // Guest always receives pointer input. The page-local annotation bridge
      // observes native text selection inside the guest and reports it to the
      // React floating toolbar, so page reading remains a normal browser
      // interaction.
      inputLocked: false,
      partition,
      url: tab.url,
    });
    if (!result) return;
    const { webview, created } = result;
    if (created) {
      setWebviewGen((g) => g + 1);
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
      // Detach the webview only on a real identity/profile change, not
      // on every navigation state update. Reparenting recreates the guest.
      if (webview.parentElement === container) container.removeChild(webview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, sessionId, partitionForActiveTab]);

  // Sync the active tab's url into the mounted <webview> without remounting.
  useEffect(() => {
    if (!activeTabId) return;
    const webview = getBrowserPageWebview(activeTabId);
    if (!webview || !activeTabUrl) return;
    // Only navigate when the url actually differs to avoid reloading the page
    // on every state update that happens to carry the same url.
    if (webview.src !== activeTabUrl) webview.src = activeTabUrl;
  }, [activeTabId, activeTabUrl]);

  useEffect(() => {
    if (!readingUrl) {
      setReadingAnnotations([]);
      setLoadedReadingUrl(null);
      setReadingSelection(null);
      setOpenReadingAnnotationId(null);
      setReadingEditorAnchor(null);
      return;
    }
    let alive = true;
    setLoadedReadingUrl(null);
    setReadingSelection(null);
    setOpenReadingAnnotationId(null);
    setReadingEditorAnchor(null);
    void ipc.invoke("listReadingAnnotations", { url: readingUrl }).then((annotations) => {
      if (!alive) return;
      setReadingAnnotations(annotations);
      setLoadedReadingUrl(readingUrl);
    });
    return () => {
      alive = false;
    };
  }, [ipc, readingUrl]);

  useEffect(() => {
    if (!activeTabId) return;
    const webview = getBrowserPageWebview(activeTabId);
    if (!webview) return;
    const onMessage = (event: unknown) => {
      const message = event as { channel: string; args: unknown[] };
      if (message.channel !== "__divisor-reading-annotation__") return;
      const payload = message.args[0] as
        | (BrowserTextSelection & { type: "selection" })
        | {
            annotationId: string;
            rectViewport: { height: number; width: number; x: number; y: number };
            type:
              | "annotation-clicked"
              | "annotation-focused"
              | "annotation-out-of-view"
              | "annotation-position";
          };
      if (payload.type === "selection") {
        if (payload.page.sanitizedUrl !== readingUrl) return;
        setOpenReadingAnnotationId(null);
        setReadingSelection(payload);
        return;
      }
      const annotation = readingAnnotations.find(
        (candidate) => candidate.id === payload.annotationId,
      );
      if (!annotation) return;
      if (payload.type === "annotation-out-of-view") {
        if (payload.annotationId !== openReadingAnnotationId) return;
        setOpenReadingAnnotationId(null);
        setReadingEditorAnchor(null);
        return;
      }
      if (payload.type === "annotation-position") {
        if (payload.annotationId !== openReadingAnnotationId) return;
        setReadingEditorAnchor(anchorFromViewportRect(payload.rectViewport, viewportRef.current));
        return;
      }
      setReadingSelection(null);
      setOpenReadingAnnotationId(annotation.id);
      setReadingEditorAnchor(anchorFromViewportRect(payload.rectViewport, viewportRef.current));
    };
    webview.addEventListener("ipc-message", onMessage);
    return () => webview.removeEventListener("ipc-message", onMessage);
  }, [
    activeTabId,
    loadedReadingUrl,
    openReadingAnnotationId,
    readingAnnotations,
    readingUrl,
    webviewGen,
  ]);

  useEffect(() => {
    if (!activeTabId || loadedReadingUrl !== readingUrl) return;
    const webview = getBrowserPageWebview(activeTabId);
    if (!webview) return;
    try {
      webview.send("__divisor-reading-annotation-command__", {
        annotations: readingAnnotations,
        type: "restore",
      });
      webview.send("__divisor-reading-annotation-command__", {
        enabled: readingAnnotationsEnabled,
        type: "set-enabled",
      });
      webview.send("__divisor-reading-annotation-command__", {
        tagId: readingTagFilter,
        type: "set-filter",
      });
    } catch {
      // The guest can be recreated during navigation; the next webview generation restores it.
    }
  }, [
    activeTabId,
    loadedReadingUrl,
    readingAnnotations,
    readingAnnotationsEnabled,
    readingTagFilter,
    readingUrl,
    webviewGen,
  ]);

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

  const openInSystemBrowser = () => {
    if (!activeTab) return;
    setError(null);
    void ipc
      .invoke("openInSystemBrowser", { sessionId, tabId: activeTab.id })
      .catch((cause) => setError(messageFrom(cause)));
  };

  const createReadingAnnotation = async (tag: BrowserReadingTag, instruction?: string) => {
    if (!readingSelection || !readingUrl) return;
    const now = new Date().toISOString();
    const annotation: BrowserReadingAnnotation = {
      createdAt: now,
      id: crypto.randomUUID(),
      note: { content: "", createdAt: now, id: crypto.randomUUID(), updatedAt: now },
      range: readingSelection.range,
      sentence: readingSelection.sentence,
      tag,
      text: readingSelection.text,
      updatedAt: now,
      url: readingUrl,
    };
    try {
      const saved = await ipc.invoke("createReadingAnnotation", annotation);
      setReadingAnnotations((annotations) => [...annotations, saved]);
      const webview = getBrowserPageWebview(activeTabId ?? "");
      webview?.send("__divisor-reading-annotation-command__", { annotation: saved, type: "apply" });
      setReadingSelection(null);
      setOpenReadingAnnotationId(saved.id);
      setReadingEditorAnchor(
        anchorFromViewportRect(readingSelection.rectViewport, viewportRef.current),
      );
      if (instruction) insertReadingContext(saved, instruction);
    } catch (cause) {
      setError(messageFrom(cause));
    }
  };

  const insertReadingContext = (annotation: BrowserReadingAnnotation, instruction: string) => {
    const editor = api.sharedPromptEditor.editor;
    if (!editor) {
      setError("The prompt editor is not available");
      return;
    }
    insertBrowserReadingAnnotation(editor, annotation, instruction);
  };

  const updateReadingAnnotation = async (
    id: string,
    update: { note?: { content: string }; tag?: BrowserReadingTag },
  ) => {
    try {
      const saved = await ipc.invoke("updateReadingAnnotation", { id, ...update });
      setReadingAnnotations((annotations) =>
        annotations.map((annotation) => (annotation.id === saved.id ? saved : annotation)),
      );
    } catch (cause) {
      setError(messageFrom(cause));
    }
  };

  const deleteReadingAnnotation = async (id: string) => {
    try {
      await ipc.invoke("deleteReadingAnnotation", id);
      getBrowserPageWebview(activeTabId ?? "")?.send("__divisor-reading-annotation-command__", {
        annotationId: id,
        type: "delete",
      });
      setReadingAnnotations((annotations) =>
        annotations.filter((annotation) => annotation.id !== id),
      );
      setOpenReadingAnnotationId(null);
    } catch (cause) {
      setError(messageFrom(cause));
    }
  };

  const applyReadingTagFilter = (tagId: string | null) => {
    setReadingTagFilter(tagId);
    getBrowserPageWebview(activeTabId ?? "")?.send("__divisor-reading-annotation-command__", {
      tagId,
      type: "set-filter",
    });
  };

  const toggleReadingAnnotations = () => {
    const next = !readingAnnotationsEnabled;
    setReadingAnnotationsEnabled(next);
    setReadingSelection(null);
    getBrowserPageWebview(activeTabId ?? "")?.send("__divisor-reading-annotation-command__", {
      enabled: next,
      type: "set-enabled",
    });
  };

  const navigateReadingAnnotations = (direction: -1 | 1) => {
    const visible = readingTagFilter
      ? readingAnnotations.filter((annotation) => annotation.tag.id === readingTagFilter)
      : readingAnnotations;
    if (!visible.length) return;
    const index = openReadingAnnotationId
      ? visible.findIndex((annotation) => annotation.id === openReadingAnnotationId)
      : -1;
    const nextIndex = (index + direction + visible.length) % visible.length;
    const next = visible[nextIndex];
    setOpenReadingAnnotationId(next.id);
    getBrowserPageWebview(activeTabId ?? "")?.send("__divisor-reading-annotation-command__", {
      annotationId: next.id,
      type: "scroll-to",
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable=true]");
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        toggleReadingAnnotations();
        return;
      }
      if (editing) return;
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        navigateReadingAnnotations(-1);
      }
      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        navigateReadingAnnotations(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTabId,
    openReadingAnnotationId,
    readingAnnotations,
    readingAnnotationsEnabled,
    readingTagFilter,
  ]);

  const openReadingAnnotation = openReadingAnnotationId
    ? (readingAnnotations.find((annotation) => annotation.id === openReadingAnnotationId) ?? null)
    : null;
  const visibleReadingAnnotations = readingTagFilter
    ? readingAnnotations.filter((annotation) => annotation.tag.id === readingTagFilter)
    : readingAnnotations;
  const visibleReadingAnnotationIndex = openReadingAnnotationId
    ? visibleReadingAnnotations.findIndex((annotation) => annotation.id === openReadingAnnotationId)
    : -1;
  const visibleReadingAnnotationPosition =
    visibleReadingAnnotationIndex >= 0 ? visibleReadingAnnotationIndex + 1 : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border-2 border-border bg-background">
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
          disabled={!activeTab}
          label="使用系统浏览器打开"
          onClick={openInSystemBrowser}
        >
          <ExternalLink />
        </ToolbarButton>
        <ToolbarButton
          label="Browser profiles"
          onClick={() => {
            setProfilesOpen(!profilesOpen);
            setReadingActionsOpen(false);
          }}
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
        <div ref={viewportRef} className="absolute inset-0" />
        {!activeTab ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            No browser page
          </div>
        ) : null}
        {profilesOpen ? (
          <ProfilePanel
            activeTab={activeTab}
            ipc={ipc}
            onClose={() => setProfilesOpen(false)}
            profiles={state.profiles}
            sessionId={sessionId}
          />
        ) : null}
        {readingSelection ? (
          <ReadingAnnotationToolbar
            anchor={anchorFromViewportRect(readingSelection.rectViewport, viewportRef.current)}
            boundary={viewportRef.current}
            onAsk={(instruction) =>
              void createReadingAnnotation(
                DEFAULT_READING_TAGS.find((tag) => tag.id === "question") ??
                  DEFAULT_READING_TAGS[0],
                instruction,
              )
            }
            onCancel={() => setReadingSelection(null)}
            onHighlight={(tag) => void createReadingAnnotation(tag)}
            selection={readingSelection}
            tags={DEFAULT_READING_TAGS}
          />
        ) : null}
        {openReadingAnnotation && readingEditorAnchor ? (
          <ReadingAnnotationEditor
            activeTagId={readingTagFilter}
            anchor={readingEditorAnchor}
            annotation={openReadingAnnotation}
            boundary={viewportRef.current}
            onAsk={(instruction) => insertReadingContext(openReadingAnnotation, instruction)}
            onClose={() => setOpenReadingAnnotationId(null)}
            onDelete={() => void deleteReadingAnnotation(openReadingAnnotation.id)}
            onNavigate={navigateReadingAnnotations}
            onNoteChange={(content) =>
              void updateReadingAnnotation(openReadingAnnotation.id, { note: { content } })
            }
            onTagChange={(tag) => void updateReadingAnnotation(openReadingAnnotation.id, { tag })}
            onToggleTagFilter={() =>
              applyReadingTagFilter(
                readingTagFilter === openReadingAnnotation.tag.id
                  ? null
                  : openReadingAnnotation.tag.id,
              )
            }
            tags={DEFAULT_READING_TAGS}
          />
        ) : null}
        <ReadingAnnotationActions
          activeTagId={readingTagFilter}
          enabled={readingAnnotationsEnabled}
          onFilter={applyReadingTagFilter}
          onNavigate={navigateReadingAnnotations}
          onOpenChange={setReadingActionsOpen}
          onToggle={toggleReadingAnnotations}
          open={readingActionsOpen}
          tags={DEFAULT_READING_TAGS}
          visibleAnnotationCount={visibleReadingAnnotations.length}
          visibleAnnotationPosition={
            visibleReadingAnnotationPosition && visibleReadingAnnotationPosition > 0
              ? visibleReadingAnnotationPosition
              : null
          }
        />
      </div>
    </div>
  );
}

interface BrowserMessageAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
}

function BrowserMessageLink({ href, children, onClick, ...rest }: BrowserMessageAnchorProps) {
  const api = useExtensionsContextAPI();
  const ipc = useBrowserIPC();

  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || !href) return;
    event.preventDefault();

    const sessionId = api.getActiveSessionId();
    if (!sessionId) return;
    api.upsertArtifact(sessionId, {
      content: {},
      id: BROWSER_ARTIFACT_ID,
      name: BROWSER_EXTENSION.name,
      type: BROWSER_ARTIFACT_TYPE,
    });
    api.openArtifact(sessionId, BROWSER_ARTIFACT_ID);
    void ipc.invoke("openPage", { sessionId, url: href }).catch((cause) => {
      console.error("Unable to open assistant link in Browser Artifact", cause);
    });
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
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
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null);
  const [renamingLabel, setRenamingLabel] = useState("");
  const profilePanelRef = useRef<HTMLDivElement>(null);
  const activeProfileId = activeTab?.profileId ?? "default";

  useEffect(() => {
    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (!profilePanelRef.current?.contains(event.target as Node)) onClose();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", dismissOnOutsidePress, true);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePress, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [onClose]);

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

  const selectProfile = (profileId: string) => {
    if (!activeTab) return;
    void ipc
      .invoke("setTabProfile", { profileId, sessionId, tabId: activeTab.id })
      .catch((cause) => setMessage(messageFrom(cause)));
  };

  const beginRename = (profile: BrowserProfile) => {
    setRenamingProfileId(profile.id);
    setRenamingLabel(profile.label);
  };

  const renameProfile = async (event: FormEvent, profileId: string) => {
    event.preventDefault();
    if (!renamingLabel.trim()) return;
    try {
      await ipc.invoke("renameProfile", { id: profileId, label: renamingLabel.trim() });
      setRenamingProfileId(null);
      setRenamingLabel("");
    } catch (cause) {
      setMessage(messageFrom(cause));
    }
  };

  return (
    <div
      ref={profilePanelRef}
      className="z-20"
      style={{
        maxHeight: "calc(100% - 1.5rem)",
        position: "absolute",
        right: 12,
        top: 12,
        width: "min(26rem, calc(100% - 1.5rem))",
      }}
    >
      <Card className="w-full overflow-y-auto" size="sm" style={{ maxHeight: "inherit" }}>
        <CardHeader>
          <CardTitle>浏览器身份</CardTitle>
          <CardDescription>每个 Profile 使用独立的 Cookie 与本地存储。</CardDescription>
          <CardAction>
            <Button
              aria-label="关闭浏览器身份"
              onClick={onClose}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {profiles.map((profile) => {
              const selected = profile.id === activeProfileId;
              const renaming = renamingProfileId === profile.id;
              return (
                <div
                  className="flex flex-col gap-1.5 rounded-sm border border-border bg-background p-1.5"
                  key={profile.id}
                >
                  <div className="flex items-center gap-1.5">
                    <Button
                      className="min-w-0 flex-1 justify-start"
                      disabled={!activeTab}
                      onClick={() => selectProfile(profile.id)}
                      size="sm"
                      type="button"
                      variant={selected ? "secondary" : "outline-flat"}
                    >
                      <ShieldCheck data-icon="inline-start" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate">{profile.label}</span>
                        <span className="block truncate text-[10px] font-normal text-muted-foreground">
                          {profile.partition}
                        </span>
                      </span>
                      {selected ? <span className="text-[10px]">当前</span> : null}
                    </Button>
                    {profile.id !== "default" ? (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          aria-label={`重命名 ${profile.label}`}
                          onClick={() => beginRename(profile)}
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          aria-label={`删除 ${profile.label}`}
                          onClick={() =>
                            void ipc
                              .invoke("deleteProfile", profile.id)
                              .catch((cause) => setMessage(messageFrom(cause)))
                          }
                          size="icon-xs"
                          type="button"
                          variant="destructive-outline"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {renaming ? (
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(event) => void renameProfile(event, profile.id)}
                    >
                      <Input
                        aria-label="Profile 名称"
                        autoFocus
                        className="h-7 min-w-0 flex-1 text-xs"
                        onChange={(event) => setRenamingLabel(event.target.value)}
                        value={renamingLabel}
                      />
                      <Button aria-label="保存 Profile 名称" size="icon-xs" type="submit">
                        <Check />
                      </Button>
                      <Button
                        aria-label="取消重命名"
                        onClick={() => setRenamingProfileId(null)}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <X />
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>

          <form className="flex items-center gap-2" onSubmit={createProfile}>
            <Input
              className="h-7 min-w-0 flex-1 text-xs"
              onChange={(event) => setLabel(event.target.value)}
              placeholder="新建 Profile"
              value={label}
            />
            <Button size="sm" type="submit" variant="outline">
              <Plus data-icon="inline-start" />
              新建
            </Button>
          </form>

          <Separator />

          <section className="flex flex-col gap-2" aria-label="导入浏览器 Cookie">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold">导入 Chromium Cookie</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  支持 Chrome、Edge、Brave 与 Arc。
                </p>
              </div>
              <Button onClick={() => void detect()} size="sm" type="button" variant="outline">
                <Search data-icon="inline-start" />
                检测
              </Button>
            </div>
            {sources.length ? (
              <div className="flex items-center gap-2">
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
                <Button
                  onClick={() => void importCookies()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  导入
                </Button>
              </div>
            ) : null}
            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function messageFrom(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}

function normalizeReadingUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function isBrowserPageUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function anchorFromViewportRect(
  rect: { height: number; width: number; x: number; y: number },
  viewport: HTMLDivElement | null,
) {
  const viewportRect = viewport?.getBoundingClientRect();
  return {
    x: (viewportRect?.left ?? 0) + rect.x + rect.width / 2,
    y: (viewportRect?.top ?? 0) + rect.y + rect.height,
  };
}
