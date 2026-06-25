import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createTextDocument } from "@renderer/lib/rich-text";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import type {
  BrowserAnnotationTarget,
  BrowserArtifactContent,
  BrowserState,
  BrowserStateChangedEvent,
} from "@shared/browser-artifact-ipc";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ExternalLink,
  GripVertical,
  Mic,
  MousePointerSquareDashed,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStore } from "zustand";

interface BrowserArtifactProps {
  artifactId: string;
  content: BrowserArtifactContent;
  sessionId: string;
}

type BrowserMode = "browse" | "commenting" | "selecting";

const DEFAULT_BROWSER_STATE: BrowserState = {
  canGoBack: false,
  canGoForward: false,
  status: "loading",
  title: "Browser",
  url: "about:blank",
};

export function BrowserArtifact({ artifactId, content, sessionId }: BrowserArtifactProps) {
  const { invoke, on } = useElectronIPC();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [browserState, setBrowserState] = useState<BrowserState>({
    ...DEFAULT_BROWSER_STATE,
    title: content.title ?? DEFAULT_BROWSER_STATE.title,
    url: content.url,
  });
  const [address, setAddress] = useState(content.url);
  const [mode, setMode] = useState<BrowserMode>("browse");
  const [captureDataUrl, setCaptureDataUrl] = useState<string | null>(null);
  const [targets, setTargets] = useState<BrowserAnnotationTarget[]>([]);
  const [hoveredTargetIndex, setHoveredTargetIndex] = useState(0);
  const [selectedTargetIndex, setSelectedTargetIndex] = useState<number | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [isSent, setIsSent] = useState(false);
  const activeSession = useStore(mainStore, (state) => state.getSession(sessionId));
  const selectedTarget = selectedTargetIndex !== null ? targets[selectedTargetIndex] : null;
  const hoveredTarget = targets[hoveredTargetIndex] ?? targets[0] ?? null;
  const isNativeBrowserVisible = mode === "browse";

  useEffect(() => {
    let cancelled = false;
    invoke("browserCreate", sessionId, artifactId, content).then((result) => {
      if (cancelled || "error" in result) return;
      setBrowserState(result);
      setAddress(result.url);
    });

    return () => {
      cancelled = true;
      void invoke("browserDestroy", sessionId, artifactId);
    };
  }, [artifactId, content, invoke, sessionId]);

  // Subscribe to browser state changes pushed from the main process. The
  // invoke() calls above only return the state snapshot *before* the new
  // navigation/reload actually finishes — `did-stop-loading` /
  // `did-navigate` / `did-fail-load` happen later and the only path for
  // those to reach the renderer is via this event. Without it, the local
  // `browserState.status` would stay "loading" forever after refresh.
  useEffect(() => {
    const off = on("browser_state_changed", (event: BrowserStateChangedEvent) => {
      if (event.sessionId !== sessionId || event.artifactId !== artifactId) return;
      setBrowserState({
        canGoBack: event.canGoBack,
        canGoForward: event.canGoForward,
        status: event.status,
        title: event.title,
        url: event.url,
      });
      setAddress((current) => (current === event.url ? current : event.url));
    });
    return off;
  }, [artifactId, on, sessionId]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let frame = 0;
    const updateBounds = () => {
      frame = 0;
      const rect = stage.getBoundingClientRect();
      void invoke("browserSetBounds", sessionId, artifactId, {
        height: rect.height,
        width: rect.width,
        x: rect.left,
        y: rect.top,
      });
    };
    const scheduleUpdateBounds = () => {
      // Coalesce multiple layout signals (ResizeObserver fires in a burst,
      // window resize + scroll can fire in the same tick) into one IPC round
      // trip per animation frame. Without this, the bounds reported to the
      // native WebContentsView can lag behind sibling panel resizes, leaving
      // the view drawn at the previous position after a layout change.
      if (frame !== 0) return;
      frame = requestAnimationFrame(updateBounds);
    };

    updateBounds();
    const resizeObserver = new ResizeObserver(scheduleUpdateBounds);
    resizeObserver.observe(stage);
    // Observe the offsetParent (and ancestors up to the layout root) so that
    // sibling-driven layout shifts — toggling the artifact panel, resizing
    // the sidebar, opening a different artifact tab — also trigger a bounds
    // recompute. ResizeObserver only fires on the observed element's own
    // box; when only its position changes, we need explicit ancestor
    // observers to catch that.
    const observedElements: Element[] = [stage];
    let parent: HTMLElement | null = stage.offsetParent as HTMLElement | null;
    while (parent && parent !== document.body) {
      observedElements.push(parent);
      parent = parent.offsetParent as HTMLElement | null;
    }
    for (const el of observedElements) {
      resizeObserver.observe(el);
    }
    window.addEventListener("resize", scheduleUpdateBounds);
    window.addEventListener("scroll", scheduleUpdateBounds, { passive: true });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdateBounds);
      window.removeEventListener("scroll", scheduleUpdateBounds);
    };
  }, [artifactId, invoke, sessionId]);

  useEffect(() => {
    void invoke("browserSetVisible", sessionId, artifactId, isNativeBrowserVisible);
  }, [artifactId, invoke, isNativeBrowserVisible, sessionId]);

  async function navigate(nextUrl: string) {
    setBrowserState((state) => ({ ...state, status: "loading", url: nextUrl }));
    const result = await invoke("browserNavigate", sessionId, artifactId, nextUrl);
    if ("error" in result) {
      setBrowserState((state) => ({ ...state, status: "error" }));
      return;
    }
    setBrowserState(result);
    setAddress(result.url);
  }

  async function runNavigationAction(
    action: "browserGoBack" | "browserGoForward" | "browserReload",
  ) {
    setBrowserState((state) => ({ ...state, status: "loading" }));
    const result = await invoke(action, sessionId, artifactId);
    if ("error" in result) {
      setBrowserState((state) => ({ ...state, status: "error" }));
      return;
    }
    setBrowserState(result);
    setAddress(result.url);
  }

  async function startAnnotationSelection() {
    const result = await invoke("browserCaptureForAnnotation", sessionId, artifactId);
    if ("error" in result) return;
    setCaptureDataUrl(result.dataUrl);
    setTargets(result.targets);
    setHoveredTargetIndex(0);
    setSelectedTargetIndex(null);
    setComment("");
    setIsSent(false);
    setComposerExpanded(false);
    setMode("selecting");
  }

  function selectTarget(index: number) {
    setSelectedTargetIndex(index);
    setHoveredTargetIndex(index);
    setComment("");
    setIsSent(false);
    setComposerExpanded(false);
    setMode("commenting");
  }

  function cancelAnnotation() {
    setMode("browse");
    setComposerExpanded(false);
    setSelectedTargetIndex(null);
    setComment("");
    setCaptureDataUrl(null);
    setTargets([]);
  }

  async function submitAnnotation() {
    if (!selectedTarget) return;
    const prompt = buildAnnotationPrompt(browserState.url, selectedTarget, comment);
    const appUserMessage: AppUserMessage = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      kind: "prompt",
      jsonContent: createTextDocument(prompt),
      metadata: activeSession?.model
        ? {
            model: {
              modelId: activeSession.model.modelId,
              providerId: activeSession.model.providerId,
            },
          }
        : undefined,
    };
    mainStore.getState().setStatus(sessionId, "running");
    await invoke("prompt", sessionId, appUserMessage);
    setIsSent(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="grid min-h-11 shrink-0 grid-cols-[auto_minmax(160px,1fr)_auto] items-center gap-2 border-b border-border/70 bg-card/80 px-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!browserState.canGoBack}
            onClick={() => void runNavigationAction("browserGoBack")}
            aria-label="后退"
          >
            <ArrowLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!browserState.canGoForward}
            onClick={() => void runNavigationAction("browserGoForward")}
            aria-label="前进"
          >
            <ArrowRight />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void runNavigationAction("browserReload")}
            aria-label="刷新"
          >
            <RefreshCw />
          </Button>
        </div>

        <form
          className="flex h-8 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2 text-xs"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate(address);
          }}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              browserState.status === "ready" && "bg-emerald-400",
              browserState.status === "loading" && "bg-yellow-400",
              (browserState.status === "error" || browserState.status === "blocked") &&
                "bg-destructive",
            )}
          />
          <input
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-label="URL"
          />
          <span className="shrink-0 text-muted-foreground">
            {getStatusLabel(browserState.status)}
          </span>
        </form>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={mode === "selecting" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              if (mode === "browse") {
                void startAnnotationSelection();
                return;
              }
              cancelAnnotation();
            }}
          >
            <MousePointerSquareDashed data-icon="inline-start" />
            添加批注
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="外部打开">
            <ExternalLink />
          </Button>
        </div>
      </div>

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#0d0d0d]">
        {mode !== "browse" && captureDataUrl ? (
          <img
            src={captureDataUrl}
            alt=""
            className="absolute inset-0 size-full object-contain"
            draggable={false}
          />
        ) : null}

        {mode === "selecting" && hoveredTarget ? <SelectionOverlay target={hoveredTarget} /> : null}

        {mode === "selecting"
          ? targets.map((target, index) => (
              <button
                key={`${target.kind}-${index}`}
                type="button"
                className="absolute rounded-lg border border-sky-300/70 bg-sky-300/10 transition-shadow hover:shadow-[0_0_0_4px_rgb(147_197_253/0.16)]"
                style={targetToStyle(target)}
                onPointerEnter={() => setHoveredTargetIndex(index)}
                onClick={() => selectTarget(index)}
                aria-label={`选择 ${target.label}`}
              />
            ))
          : null}

        {mode === "commenting" && selectedTarget ? (
          <>
            <div
              className="absolute rounded-lg border border-sky-300 bg-sky-300/10 shadow-[0_0_0_4px_rgb(147_197_253/0.16)]"
              style={targetToStyle(selectedTarget)}
            />
            <div
              className="absolute grid size-5 place-items-center rounded-full border border-sky-200 bg-sky-200 text-[11px] font-bold text-slate-950"
              style={{
                left: selectedTarget.rect.x + selectedTarget.rect.width - 8,
                top: selectedTarget.rect.y - 8,
              }}
            >
              1
            </div>
          </>
        ) : null}

        {mode === "commenting" && selectedTarget ? (
          <AnnotationComposer
            comment={comment}
            expanded={composerExpanded}
            isSent={isSent}
            onCancel={cancelAnnotation}
            onChangeComment={setComment}
            onSubmit={() => void submitAnnotation()}
            onToggleExpanded={() => setComposerExpanded((value) => !value)}
            target={selectedTarget}
          />
        ) : null}

        {mode === "selecting" ? (
          <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-lg border border-sky-300/30 bg-background/90 px-3 py-2 text-xs text-sky-100 shadow-lg">
            <MousePointerSquareDashed className="size-3.5" />
            在页面上点击需要添加 comment 的元素
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SelectionOverlay({ target }: { target: BrowserAnnotationTarget }) {
  return (
    <div className="pointer-events-none absolute inset-0 bg-background/20">
      <div
        className="absolute rounded-lg border border-dashed border-sky-300 bg-sky-300/10 shadow-[0_0_0_999px_rgb(8_8_8/0.18),0_0_0_4px_rgb(147_197_253/0.14)]"
        style={targetToStyle(target)}
      />
    </div>
  );
}

function AnnotationComposer({
  comment,
  expanded,
  isSent,
  onCancel,
  onChangeComment,
  onSubmit,
  onToggleExpanded,
  target,
}: {
  comment: string;
  expanded: boolean;
  isSent: boolean;
  onCancel: () => void;
  onChangeComment: (value: string) => void;
  onSubmit: () => void;
  onToggleExpanded: () => void;
  target: BrowserAnnotationTarget;
}) {
  return (
    <div
      className={cn(
        "absolute bottom-5 left-1/2 z-10 w-[min(590px,calc(100%-52px))] -translate-x-1/2 transition-[width,transform,opacity]",
        expanded && "w-[min(690px,calc(100%-52px))]",
      )}
    >
      <div
        className={cn(
          "overflow-hidden rounded-[30px] border border-white/10 bg-[#2d2d2d]/95 shadow-[0_24px_70px_rgb(0_0_0/0.45)] backdrop-blur-xl",
          expanded && "rounded-[34px]",
        )}
      >
        <div className="grid min-h-14 grid-cols-[52px_minmax(0,1fr)_46px] items-center px-3.5">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full bg-white/10 text-foreground/80 transition-colors hover:bg-white/15"
            onClick={onToggleExpanded}
            aria-label={expanded ? "折叠样式编辑" : "展开样式编辑"}
          >
            <SlidersHorizontal className="size-4" />
          </button>
          <textarea
            value={comment}
            onChange={(event) => onChangeComment(event.target.value)}
            placeholder={expanded ? "描述这些更改..." : "添加评论..."}
            rows={1}
            className="max-h-16 min-h-7 w-full resize-none bg-transparent px-0 py-2 text-lg leading-snug text-foreground outline-none placeholder:text-foreground/35"
          />
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-foreground/65 transition-colors hover:bg-white/10 hover:text-foreground"
            aria-label="语音输入"
          >
            <Mic className="size-4" />
          </button>
        </div>

        {expanded ? (
          <>
            <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_34px] items-center border-y border-white/[0.055] bg-white/[0.045] px-8">
              <div className="truncate text-xl font-semibold text-foreground">{target.kind}</div>
              <button type="button" className="grid place-items-center text-foreground/50">
                <GripVertical className="size-4" />
              </button>
            </div>
            <div className="px-8 py-4">
              <ComposerField label="目标">
                <p className="text-xs leading-5 text-foreground/65">{target.label}</p>
              </ComposerField>
              <ComposerValue label="文本颜色" value="rgb(212, 212, 212)" swatch="#d4d4d4" />
              <ComposerValue label="背景" value="rgba(255, 255, 255, 0.86)" swatch="#ffffff" />
              <ComposerField label="Opacity">
                <input
                  className="h-12 w-full rounded-[17px] border border-black/20 bg-[#232323]/80 px-4 text-lg text-foreground/70 outline-none"
                  value="1"
                  readOnly
                />
              </ComposerField>
              <ComposerValue label="字体" value='"Geist Variable", sans-serif' />
              <ComposerField label="字号">
                <input
                  className="h-12 w-full rounded-[17px] border border-black/20 bg-[#232323]/80 px-4 text-lg text-foreground/70 outline-none"
                  value="13 px"
                  readOnly
                />
              </ComposerField>
              <ComposerValue label="字重" value="400" />
            </div>
            <div className="flex min-h-18 items-center gap-3 border-t border-white/[0.055] px-4 py-3">
              <button
                type="button"
                className="h-10 rounded-full border border-white/15 bg-white/5 px-4 text-lg font-bold text-foreground"
                onClick={onCancel}
              >
                取消
              </button>
              <div className="flex-1" />
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full text-foreground/65 transition-colors hover:bg-white/10 hover:text-foreground"
                aria-label="语音输入"
              >
                <Mic className="size-4" />
              </button>
              <button
                type="button"
                className={cn(
                  "grid size-14 place-items-center rounded-full bg-foreground/70 text-background transition-colors",
                  isSent && "bg-emerald-300 text-emerald-950",
                )}
                onClick={onSubmit}
                aria-label="发送批注"
              >
                {isSent ? <CheckCheck className="size-5" /> : <Check className="size-5" />}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ComposerField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid min-h-16 grid-cols-[190px_minmax(0,1fr)] items-center gap-4 border-t border-white/[0.055] first:border-t-0">
      <label className="text-xl font-medium text-foreground/80">{label}</label>
      {children}
    </div>
  );
}

function ComposerValue({
  label,
  swatch,
  value,
}: {
  label: string;
  swatch?: string;
  value: string;
}) {
  return (
    <ComposerField label={label}>
      <div className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[17px] border border-black/20 bg-[#232323]/80 px-3 text-lg text-foreground/70">
        {swatch ? (
          <span
            className="size-9 rounded-[13px] border border-white/20"
            style={{ background: swatch }}
          />
        ) : null}
        <span className="truncate">{value}</span>
        <ChevronDown className="size-4" />
      </div>
    </ComposerField>
  );
}

function targetToStyle(target: BrowserAnnotationTarget): CSSProperties {
  return {
    height: target.rect.height,
    left: target.rect.x,
    top: target.rect.y,
    width: target.rect.width,
  };
}

function getStatusLabel(status: BrowserState["status"]) {
  if (status === "loading") return "加载中";
  if (status === "error") return "URL 错误";
  if (status === "blocked") return "已阻止";
  return "页面就绪";
}

function buildAnnotationPrompt(url: string, target: BrowserAnnotationTarget, comment: string) {
  return [
    "请根据浏览器 artifact 中的页面批注修改当前实现。",
    "",
    `URL: ${url}`,
    `目标元素: ${target.kind}`,
    target.text ? `元素文本: ${target.text}` : null,
    `元素位置: x=${Math.round(target.rect.x)}, y=${Math.round(target.rect.y)}, width=${Math.round(target.rect.width)}, height=${Math.round(target.rect.height)}`,
    "",
    "批注意见:",
    comment.trim() || "请按所选元素进行视觉和交互调整。",
  ]
    .filter(Boolean)
    .join("\n");
}
