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
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-[#8B8B8B]">You</div>
      <div className="rounded-[22px] bg-[#262626] px-5 py-4 text-[15px] leading-7 text-[#F0F0F0] shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
        <span>{text}</span>
      </div>
    </div>
  );
}
