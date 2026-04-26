import { cn } from "@renderer/lib/utils";
import type { HTMLAttributes } from "react";

type MessageFrom = "assistant" | "user";

interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  from: MessageFrom;
}

export function Message({ from, className, ...props }: MessageProps) {
  return (
    <div
      data-role={from}
      className={cn(
        "group/message flex w-full flex-col gap-3",
        from === "assistant" ? "is-assistant max-w-3xl" : "is-user ml-auto max-w-2xl items-end",
        className,
      )}
      {...props}
    />
  );
}

interface MessageContentProps extends HTMLAttributes<HTMLDivElement> {}

export function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[22px] px-5 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)]",
        "group-[.is-user]/message:bg-[#262626] group-[.is-user]/message:text-[#F0F0F0]",
        "group-[.is-assistant]/message:bg-[#191919] group-[.is-assistant]/message:text-[#E8E8E8]",
        className,
      )}
      {...props}
    />
  );
}

interface MessageResponseProps extends HTMLAttributes<HTMLDivElement> {}

export function MessageResponse({ className, ...props }: MessageResponseProps) {
  return (
    <div
      className={cn("whitespace-pre-wrap wrap-break-word text-[15px] leading-7", className)}
      {...props}
    />
  );
}
