import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { cn } from "@renderer/lib/utils";
import { getPermissionCommandPrefix, getPermissionCommandText } from "@shared/permissions-ipc";
import { ChevronDown, ChevronUp, CornerDownLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCurrentPermissionRequest } from "./use-current-permission-request";

interface PermissionApprovalPanelProps {
  sessionId: string;
}

const DEFAULT_DENY_REASON =
  "User declined the operation. Please ask for further instructions or adjust your approach.";

type PermissionChoice = "approve" | "approve-prefix" | "deny";

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
  const { approve, approveWithRememberedPrefix, deny, isSubmitting, request } =
    useCurrentPermissionRequest(sessionId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [denyReason, setDenyReason] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useEffect(() => {
    setSelectedIndex(0);
    setDenyReason("");
    setIsDetailsOpen(false);
  }, [request?.requestId]);

  if (!request) {
    return null;
  }

  const formattedArgs = formatArgs(request.args);

  const commandSnippet = getPermissionCommandText(request);
  const rememberCommandPrefix = getPermissionCommandPrefix(commandSnippet);
  const canRememberPrefix =
    request.toolName === "terminal/create" && rememberCommandPrefix.trim().length > 0;
  const options = useMemo(
    () =>
      [
        { key: "approve" as const, label: "是" },
        ...(canRememberPrefix
          ? [
              {
                key: "approve-prefix" as const,
                label: "是，且对于以后续内容开头的命令不再询问",
              },
            ]
          : []),
        { key: "deny" as const, label: "否" },
      ] satisfies Array<{ key: PermissionChoice; label: string }>,
    [canRememberPrefix],
  );
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, options.length - 1));
  }, [options.length]);

  const handleReject = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    void deny(denyReason.trim() || DEFAULT_DENY_REASON);
  }, [deny, denyReason, isSubmitting]);

  const handleSubmit = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    if (selectedOption?.key === "approve-prefix" && canRememberPrefix) {
      void approveWithRememberedPrefix(rememberCommandPrefix);
      return;
    }

    if (selectedOption?.key === "deny") {
      handleReject();
      return;
    }

    void approve();
  }, [
    approve,
    approveWithRememberedPrefix,
    canRememberPrefix,
    handleReject,
    isSubmitting,
    rememberCommandPrefix,
    selectedOption?.key,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleReject();
        return;
      }

      const isTextFieldFocused =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";
      if (isTextFieldFocused) {
        if (event.key === "Enter") {
          event.preventDefault();
          handleSubmit();
        }

        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % options.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => (current - 1 + options.length) % options.length);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
        return;
      }

      const shortcutIndex = Number(event.key) - 1;
      if (!Number.isNaN(shortcutIndex) && shortcutIndex >= 0 && shortcutIndex < options.length) {
        setSelectedIndex(shortcutIndex);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleReject, handleSubmit, options.length]);

  return (
    <div className="mx-auto w-full max-w-180 overflow-hidden rounded-[18px] bg-[#262626] p-4 font-sans shadow-lg">
      <div className="mb-3 text-[14px] font-medium leading-6 text-[#f2f2f2]">
        Do you want to perform {request.toolLabel || request.toolName} ?
      </div>

      <section className="mb-3 overflow-hidden rounded-xl border border-[#343434] bg-[#202020]">
        <button
          type="button"
          aria-expanded={isDetailsOpen}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          onClick={() => {
            setIsDetailsOpen((open) => !open);
          }}
        >
          <div className="min-w-0">
            <div className="text-[10px] font-medium tracking-[0.16em] text-[#737373] uppercase">
              Tool Info
            </div>
            <div className="truncate text-[12px] text-[#cfcfcf]">{commandSnippet}</div>
          </div>

          <span className="shrink-0 text-[#777777]">
            {isDetailsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </span>
        </button>

        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            isDetailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden border-t border-[#343434]">
            <div className="space-y-2 p-3">
              <div className="rounded-lg border border-[#303030] bg-[#171717] p-2.5">
                <div className="mb-1 text-[10px] font-medium tracking-[0.14em] text-[#6f6f6f] uppercase">
                  Command
                </div>
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-[#d6d6d6]">
                  {commandSnippet}
                </pre>
              </div>

              <div className="rounded-lg border border-[#303030] bg-[#171717] p-2.5">
                <div className="mb-1 text-[10px] font-medium tracking-[0.14em] text-[#6f6f6f] uppercase">
                  Payload
                </div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-[#b8b8b8]">
                  {formattedArgs}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {options.map((option, idx) => {
          const isSelected = selectedIndex === idx;

          return (
            <div
              key={option.key}
              onClick={() => setSelectedIndex(idx)}
              className={cn(
                "cursor-pointer rounded-xl border px-3 py-2.5 transition-colors",
                isSelected
                  ? "border-[#4a4a4a] bg-[#313131]"
                  : "border-[#343434] bg-[#2a2a2a] hover:border-[#454545] hover:bg-[#2f2f2f]",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "pt-0.5 font-mono text-[12px]",
                    isSelected ? "text-[#a7a7a7]" : "text-[#707070]",
                  )}
                >
                  {idx + 1}.
                </span>

                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-[13px] leading-5",
                      isSelected ? "font-medium text-[#ececec]" : "text-[#9d9d9d]",
                    )}
                  >
                    {option.key === "approve-prefix" ? (
                      <>
                        {option.label}{" "}
                        <code className="rounded-md border border-[#2e2e2e] bg-[#1b1b1b] px-1.5 py-0.5 font-mono text-[12px] text-[#d1d1d1]">
                          {rememberCommandPrefix}
                        </code>
                      </>
                    ) : (
                      option.label
                    )}
                  </div>

                  {option.key === "deny" && isSelected ? (
                    <Input
                      value={denyReason}
                      disabled={isSubmitting}
                      placeholder="输入 reject reason，可选"
                      className="mt-2 h-8 border-[#454545] bg-[#1b1b1b] px-2.5 text-[12px] text-[#e5e5e5] placeholder:text-[#6d6d6d] focus-visible:border-[#676767] focus-visible:ring-0"
                      onChange={(event) => {
                        setDenyReason(event.target.value);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isSubmitting}
          className="rounded-full px-3 text-[12px]"
          onClick={handleReject}
        >
          Reject
          <span className="ml-1 rounded-full border border-current/30 px-1.5 py-0 text-[10px] leading-4">
            Esc
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSubmitting}
          onClick={handleSubmit}
          className="rounded-full bg-[#f3f4f6] px-4 text-[12px] font-semibold text-[#111827] hover:bg-[#e5e7eb] shadow-sm"
        >
          提交 <CornerDownLeft className="h-4 w-4 stroke-[2.5]" />
        </Button>
      </div>
    </div>
  );
}
