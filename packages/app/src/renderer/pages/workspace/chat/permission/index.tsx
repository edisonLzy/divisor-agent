import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/utils";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { useCurrentPermissionRequest } from "./use-current-permission-request";

interface PermissionApprovalPanelProps {
  sessionId: string;
}

function formatArgs(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function PermissionApprovalPanel({ sessionId }: PermissionApprovalPanelProps) {
  const { approve, deny, isSubmitting, request } = useCurrentPermissionRequest(sessionId);
  const [reason, setReason] = useState("");
  const [isToolCallOpen, setIsToolCallOpen] = useState(false);

  useEffect(() => {
    setIsToolCallOpen(false);
  }, [request?.requestId]);

  if (!request) {
    return null;
  }

  const formattedArgs = formatArgs(request.args) || "{}";

  return (
    <Card
      className="mx-auto w-full max-w-3xl rounded-[24px] border border-amber-500/20 bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]"
      size="sm"
    >
      <CardHeader className="gap-2 border-b border-border/70 pb-4">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <ShieldAlert className="size-4" />
          <span className="text-xs font-medium uppercase tracking-[0.18em]">Permission Check</span>
        </div>
        <CardTitle>执行高风险工具操作？</CardTitle>
        <CardDescription>
          当前工具调用会修改本地环境。确认后继续执行；拒绝时可以告诉 agent 需要如何调整。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <section className="rounded-2xl border border-border/70 bg-muted/35 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {request.toolLabel}
                </span>
                <span className="text-xs text-muted-foreground">{request.operation}</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                工具调用详情默认收起，避免大段参数挤占确认区域。
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={isToolCallOpen}
              className="shrink-0 self-start"
              onClick={() => {
                setIsToolCallOpen((open) => !open);
              }}
            >
              {isToolCallOpen ? "收起详情" : "展开详情"}
              {isToolCallOpen ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
          </div>

          <div
            className={cn(
              "grid transition-[grid-template-rows,margin] duration-200 ease-out",
              isToolCallOpen ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="rounded-xl border border-border/70 bg-background/80">
                <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Tool Call Payload
                  </span>
                  <span className="text-[11px] text-muted-foreground">最大高度 320px</span>
                </div>

                <pre className="max-h-80 overflow-auto px-3 py-3 whitespace-pre-wrap wrap-break-word text-xs leading-6 text-muted-foreground">
                  {formattedArgs}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-sm font-medium text-foreground">
            如果不执行，请告知 agent 如何调整
          </div>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSubmitting}
            placeholder="例如：先解释将修改哪些文件，再等待我确认；或者改成只读方案。"
            className="min-h-24 resize-none"
          />
        </section>
      </CardContent>

      <CardFooter className="justify-end gap-2 border-t border-border/70 bg-transparent">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => {
            void deny(reason);
            setReason("");
          }}
        >
          否，返回调整意见
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            void approve();
            setReason("");
          }}
        >
          是，继续执行
        </Button>
      </CardFooter>
    </Card>
  );
}
