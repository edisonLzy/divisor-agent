import {
  Message,
  MessageContent,
} from "@/mainview/components/ai-elements/message";

export function Messages() {
  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <div className="max-w-3xl mx-auto w-full flex flex-col gap-4">
        {/* Placeholder for messages (Thinking process, LLM response, Tool calls) */}
        <Message from="assistant">
          <MessageContent>
            <p className="text-sm text-[#D4D4D4]">Hello! How can I help you today?</p>
            <div className="mt-2 text-[11px] text-[#666666] flex items-center gap-2">
              <span>Thinking process...</span>
              <span>Tool calls...</span>
            </div>
          </MessageContent>
        </Message>
      </div>
    </div>
  );
}
