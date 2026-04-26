import { Message, MessageContent } from "@renderer/components/ai-elements/message";

import type { AssistantTimelineMessage } from "../chat-types";

type ToolMessage = Extract<AssistantTimelineMessage, { kind: "tool" }>;

interface AssistantToolMessageProps {
  message: ToolMessage;
}

function toolStateLabel(state: ToolMessage["state"]) {
  switch (state) {
    case "done":
      return "Done";
    case "error":
      return "Error";
    case "input-streaming":
      return "Preparing";
    default:
      return "Running";
  }
}

export function AssistantToolMessage({ message }: AssistantToolMessageProps) {
  return (
    <Message from="assistant">
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-[#7C7C7C]">
        <span>Tool</span>
        <span className="rounded-full border border-[#343434] px-2 py-1 text-[10px] tracking-[0.16em] text-[#B8B8B8]">
          {toolStateLabel(message.state)}
        </span>
      </div>

      <MessageContent className="border border-[#2A2A2A] bg-[#161616] p-4 shadow-none">
        <div className="text-sm font-medium text-[#E2E2E2]">{message.toolName}</div>

        <div className="mt-4 flex flex-col gap-3">
          <section className="rounded-2xl bg-[#1E1E1E] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#7C7C7C]">Input</div>
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs leading-6 text-[#B8B8B8]">
              {message.input || "{}"}
            </pre>
          </section>

          <section className="rounded-2xl bg-[#1E1E1E] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#7C7C7C]">
              Output
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs leading-6 text-[#D4D4D4]">
              {message.output || "(waiting for tool output)"}
            </pre>
          </section>
        </div>
      </MessageContent>
    </Message>
  );
}
