import { Button } from "@renderer/components/ui/button";
import { Progress } from "@renderer/components/ui/progress";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import type { AppUpdateState } from "@shared/app-update-ipc";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

export function AppUpdate() {
  const { invoke } = useElectronIPC();
  const [state, setState] = useState<AppUpdateState>({
    status: "idle",
    currentVersion: "",
  });
  const [isDeferred, setIsDeferred] = useState(false);
  const [hasAvailableUpdate, setHasAvailableUpdate] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useSubscribeAgentEvents({
    app_update: (event) => {
      setState(event);
      updateAvailability(event, setHasAvailableUpdate);
      if (event.status !== "downloaded") setIsDeferred(false);
    },
  });

  useEffect(() => {
    void invoke("getUpdateState").then((nextState) => {
      setState(nextState);
      updateAvailability(nextState, setHasAvailableUpdate);
    });
  }, [invoke]);

  async function startUpdate() {
    try {
      await invoke("startUpdate");
    } catch (error) {
      setState(toErrorState(state, error));
    }
  }

  async function retryUpdate() {
    try {
      await invoke("checkForUpdates");
    } catch (error) {
      setState(toErrorState(state, error));
    }
  }

  async function installUpdate() {
    try {
      await invoke("installUpdate");
    } catch (error) {
      setState(toErrorState(state, error));
    }
  }

  function dismissUpdate() {
    setHasAvailableUpdate(false);
    setState(toIdleState(state));
  }

  const content = getAppUpdateContent(state, isDeferred);

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {hasAvailableUpdate && (
        <motion.div
          key="app-update"
          layout
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: "easeOut" }}
          className="relative flex min-h-10 w-full min-w-0 items-center gap-1.5 rounded-md border-2 border-sidebar-border bg-card px-2 py-1.5 text-sidebar-foreground shadow-[var(--hard-shadow-sm)]"
        >
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <strong className="shrink-0 text-[11px] leading-none">{content.title}</strong>
            <span className="truncate text-[10px] leading-none text-muted-foreground">
              {content.description}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {state.status === "available" && (
              <>
                <Button size="xs" variant="ghost" onClick={dismissUpdate}>
                  稍后
                </Button>
                <Button size="xs" onClick={() => void startUpdate()}>
                  下载
                </Button>
              </>
            )}

            {state.status === "downloaded" && !isDeferred && (
              <>
                <Button size="xs" variant="ghost" onClick={() => setIsDeferred(true)}>
                  稍后
                </Button>
                <Button size="xs" onClick={() => void installUpdate()}>
                  重启
                </Button>
              </>
            )}

            {state.status === "downloaded" && isDeferred && (
              <Button size="xs" onClick={() => void installUpdate()}>
                立即重启
              </Button>
            )}

            {state.status === "error" && (
              <>
                <Button size="xs" variant="ghost" onClick={dismissUpdate}>
                  关闭
                </Button>
                <Button size="xs" onClick={() => void retryUpdate()}>
                  重试
                </Button>
              </>
            )}
          </div>

          {state.status === "downloading" && (
            <Progress
              value={state.percent}
              aria-label={`更新下载进度 ${Math.round(state.percent)}%`}
              className="absolute inset-x-1 bottom-0 block gap-0 [&_[data-slot=progress-indicator]]:bg-signal-cyan [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:border-0"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getAppUpdateContent(state: AppUpdateState, isDeferred: boolean) {
  switch (state.status) {
    case "checking":
      return { title: "正在检查更新", description: "正在连接更新服务" };
    case "available":
      return { title: `新版本 ${state.version}`, description: "可在后台下载" };
    case "downloading":
      return {
        title: "正在下载更新",
        description: `${Math.round(state.percent)}% · 后台进行中`,
      };
    case "downloaded":
      return isDeferred
        ? { title: "将在退出时安装", description: "当前工作不会中断" }
        : { title: "更新已准备好", description: "现在重启或退出时安装" };
    case "error":
      return { title: "更新下载失败", description: "请检查网络后重试" };
    default:
      return { title: "应用更新", description: "" };
  }
}

function toErrorState(state: AppUpdateState, error: unknown): AppUpdateState {
  return {
    status: "error",
    currentVersion: state.currentVersion,
    ...(state.status === "available" ||
    state.status === "downloading" ||
    state.status === "downloaded"
      ? { version: state.version }
      : {}),
    message: error instanceof Error ? error.message : String(error),
  };
}

function toIdleState(state: AppUpdateState): AppUpdateState {
  return { status: "idle", currentVersion: state.currentVersion };
}

function updateAvailability(
  state: AppUpdateState,
  setHasAvailableUpdate: (isAvailable: boolean) => void,
) {
  if (
    state.status === "available" ||
    state.status === "downloading" ||
    state.status === "downloaded" ||
    (state.status === "error" && Boolean(state.version))
  ) {
    setHasAvailableUpdate(true);
  } else if (state.status === "idle" || state.status === "not-available") {
    setHasAvailableUpdate(false);
  }
}
