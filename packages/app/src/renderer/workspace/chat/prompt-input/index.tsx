import type { RichTextDocument } from "@renderer/components/richtext";
import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/utils";
import { ArrowUp } from "lucide-react";
import { useState } from "react";

import type { PromptSubmission } from "../chat-types";
import { ModalSelector, useModalSelector } from "./ModalSelector";

function createPromptDocument(text: string): RichTextDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text
          .split("\n")
          .filter((line) => line.length > 0)
          .flatMap((line, index, lines) => {
            const nodes: Array<Record<string, unknown>> = [{ type: "text", text: line }];
            if (index < lines.length - 1) {
              nodes.push({ type: "hard_break" });
            }
            return nodes;
          }),
      },
    ],
  };
}

interface PromptInputProps {
  disabled?: boolean;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
}

export function PromptInput({ disabled = false, onSubmit }: PromptInputProps) {
  const modelSelectorProps = useModalSelector();
  const [value, setValue] = useState("");
  const trimmedValue = value.trim();
  const canSubmit = !disabled && trimmedValue.length > 0 && modelSelectorProps.value !== null;

  const handleSubmit = async () => {
    if (!canSubmit || !modelSelectorProps.value) {
      return;
    }

    await onSubmit({
      text: trimmedValue,
      document: createPromptDocument(trimmedValue),
      model: modelSelectorProps.value,
    });
    setValue("");
  };

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-[30px] border border-[#3A3A3A] bg-[#1C1C1C] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.32)] transition-all duration-300 focus-within:border-[#5A5A5A] focus-within:ring-2 focus-within:ring-[#4D4D4D]/60",
        disabled && "opacity-80",
      )}
      onKeyDownCapture={(event) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.nativeEvent.isComposing
        ) {
          return;
        }

        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="relative">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask anything, or describe the change you want to make..."
          className="min-h-28 max-h-56 overflow-y-auto rounded-[22px] border-transparent bg-[#262626] px-5 py-4 text-[15px] leading-7 text-[#E6E6E6] placeholder:text-[#7B7B7B] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none focus-visible:border-transparent focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center justify-between border-t border-[#303030] px-2 pt-3">
        <ModalSelector {...modelSelectorProps} />

        <Button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!canSubmit}
          size="icon"
          className="rounded-full bg-[#E8E8E8] text-[#151515] hover:bg-[#FFFFFF] disabled:bg-[#333333] disabled:text-[#7D7D7D]"
          aria-label="Send prompt"
        >
          <ArrowUp className="size-5" />
        </Button>
      </div>
    </div>
  );
}
