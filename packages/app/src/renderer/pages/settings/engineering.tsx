import { Alert, AlertDescription, AlertTitle } from "@renderer/components/ui/alert";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Switch } from "@renderer/components/ui/switch";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type { EngineeringEvent, EngineeringTask } from "@shared/engineering-ipc";
import { Bug, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function SettingsEngineeringPage() {
  const { invoke } = useElectronIPC();
  const [developmentModeEnabled, setDevelopmentModeEnabled] = useState(false);
  const [events, setEvents] = useState<EngineeringEvent[]>([]);
  const [tasks, setTasks] = useState<EngineeringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIssueTaskId, setPendingIssueTaskId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [config, nextEvents, nextTasks] = await Promise.all([
        invoke("getDevelopmentMode"),
        invoke("listEngineeringEvents", 20),
        invoke("listEngineeringTasks", 20),
      ]);
      setDevelopmentModeEnabled(config.developmentModeEnabled);
      setEvents(nextEvents);
      setTasks(nextTasks);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载工程闭环状态失败");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggleDevelopmentMode(enabled: boolean) {
    setDevelopmentModeEnabled(enabled);
    try {
      const config = await invoke("setDevelopmentMode", enabled);
      setDevelopmentModeEnabled(config.developmentModeEnabled);
      toast.success(enabled ? "开发模式已开启" : "开发模式已关闭");
    } catch (error) {
      setDevelopmentModeEnabled(!enabled);
      toast.error(error instanceof Error ? error.message : "切换开发模式失败");
    }
  }

  async function createIssue(taskId: string) {
    setPendingIssueTaskId(taskId);
    try {
      const result = await invoke("createGitHubIssue", taskId);
      toast.success(result.created ? "GitHub Issue 已创建" : "已关联已有 GitHub Issue");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建 GitHub Issue 失败");
    } finally {
      setPendingIssueTaskId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-180 flex-col gap-6 px-10 py-12">
      <header className="text-center">
        <h1 className="text-[20px] font-medium text-foreground">Engineering Loop</h1>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
          开发模式下采集异常、agent/tool 失败和关键工程信号，并把问题沉淀成可追踪任务。
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <div className="text-[13px] font-medium text-foreground">开发模式</div>
              <Badge variant={developmentModeEnabled ? "default" : "secondary"}>
                {developmentModeEnabled ? "开启" : "关闭"}
              </Badge>
            </div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
              关闭时不会记录行为事件，也不会自动从异常生成工程任务。
            </div>
          </div>
          <Switch
            checked={developmentModeEnabled}
            onCheckedChange={(checked) => {
              void toggleDevelopmentMode(checked);
            }}
          />
        </div>

        <div className="grid gap-3 bg-background/30 px-4 py-4 md:grid-cols-3">
          <MetricBlock label="事件" value={events.length} />
          <MetricBlock label="任务" value={tasks.length} />
          <MetricBlock
            label="待处理"
            value={
              tasks.filter((task) => task.status !== "fixed" && task.status !== "ignored").length
            }
          />
        </div>
      </div>

      <Alert>
        <Bug className="size-4" />
        <AlertTitle>GitHub Issue 集成</AlertTitle>
        <AlertDescription>
          创建 Issue 前会按 fingerprint 查找已有 open issue；命中时只关联，不重复创建。Issue body
          只包含脱敏摘要、截断 stack 和建议验证命令。
        </AlertDescription>
      </Alert>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="text-[13px] font-medium text-foreground">工程任务</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              异常和失败信号会自动归并成任务。
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
        </div>
        <div className="divide-y divide-border">
          {tasks.length === 0 ? (
            <EmptyState text={loading ? "正在加载工程任务…" : "暂无工程任务"} />
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                pending={pendingIssueTaskId === task.id}
                onCreateIssue={() => void createIssue(task.id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[13px] font-medium text-foreground">最近事件</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            仅展示本地开发模式采集到的最近 20 条。
          </div>
        </div>
        <div className="divide-y divide-border">
          {events.length === 0 ? (
            <EmptyState text={loading ? "正在加载事件…" : "暂无事件"} />
          ) : (
            events.map((event) => <EventRow key={event.id} event={event} />)
          )}
        </div>
      </section>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[18px] font-medium text-foreground">{value}</div>
    </div>
  );
}

function TaskRow({
  onCreateIssue,
  pending,
  task,
}: {
  onCreateIssue: () => void;
  pending: boolean;
  task: EngineeringTask;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={task.status === "new" ? "secondary" : "outline"}>{task.status}</Badge>
          <div className="truncate text-[13px] font-medium text-foreground">{task.title}</div>
        </div>
        <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {task.summary}
        </div>
        <div className="mt-2 font-mono text-[11px] text-muted-foreground">{task.fingerprint}</div>
      </div>
      {task.issueUrl ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          render={<a href={task.issueUrl} target="_blank" />}
        >
          <ExternalLink data-icon="inline-start" />
          打开 Issue
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={onCreateIssue} disabled={pending}>
          <ExternalLink data-icon="inline-start" />
          {pending ? "创建中" : "创建 Issue"}
        </Button>
      )}
    </div>
  );
}

function EventRow({ event }: { event: EngineeringEvent }) {
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={event.severity === "error" ? "destructive" : "secondary"}
          className={cn(event.severity === "warning" && "border-border")}
        >
          {event.severity}
        </Badge>
        <div className="text-[12px] font-medium text-foreground">{event.type}</div>
        <div className="text-[11px] text-muted-foreground">
          {new Date(event.timestamp).toLocaleString()}
        </div>
      </div>
      <div className="mt-2 text-[12px] leading-5 text-muted-foreground">{event.message}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">{text}</div>;
}
