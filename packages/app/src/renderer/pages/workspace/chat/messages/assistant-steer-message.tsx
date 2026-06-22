import type { SteerMessage } from "@renderer/store/entries-slice";

interface AssistantSteerMessageProps {
  message: SteerMessage;
}

export function AssistantSteerMessage({ message }: AssistantSteerMessageProps) {
  return (
    <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-[13px] leading-6 text-foreground">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-blue-300">
        <span>User steer applied</span>
        <span>{formatEventTime(message.appliedAt)}</span>
      </div>
      <div className="text-muted-foreground">{message.content}</div>
    </div>
  );
}

function formatEventTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}
