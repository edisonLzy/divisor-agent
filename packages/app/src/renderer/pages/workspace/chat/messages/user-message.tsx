import type { UserMessage as UserMessageType } from "@mariozechner/pi-ai";

interface UserMessageProps {
  message: UserMessageType;
}

export function UserMessage({ message }: UserMessageProps) {
  const text =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join(" ");

  return (
    <div className="ml-auto flex max-w-2xl flex-col items-end gap-3">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
        You
      </div>
      <div className="rounded-[22px] bg-secondary px-5 py-4 text-[15px] leading-7 text-secondary-foreground shadow-[0_18px_48px_rgb(15_23_42_/_0.08)] dark:shadow-[0_18px_48px_rgb(0_0_0_/_0.2)]">
        <span>{text}</span>
      </div>
    </div>
  );
}
