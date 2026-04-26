import {
  createEmptyRichTextDocument,
  readRichText,
  RichTextEditor,
  type RichTextDocument,
} from "@renderer/components/richtext";
import { cn } from "@renderer/lib/utils";
import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PromptSubmission } from "../chat-types";

interface PromptInputProps {
  disabled?: boolean;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
}

export function PromptInput({ disabled = false, onSubmit }: PromptInputProps) {
  const submitRef = useRef(onSubmit);
  const [content, setContent] = useState<RichTextDocument>(() => createEmptyRichTextDocument());

  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);

  const text = useMemo(() => readRichText(content), [content]);
  const canSubmit = text.length > 0 && !disabled;

  const handleSubmit = useCallback(async () => {
    const nextText = readRichText(content);
    if (!nextText || disabled) {
      return;
    }

    await submitRef.current({
      text: nextText,
      document: content,
    });

    setContent(createEmptyRichTextDocument());
  }, [content, disabled]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-[28px] border border-[#343434] bg-[#242424] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.24)] transition-all duration-300 focus-within:ring-2 focus-within:ring-[#5A5A5A]",
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
        {text.length === 0 ? (
          <div className="pointer-events-none absolute left-5 top-4 text-[15px] text-[#707070]">
            要求后续变更
          </div>
        ) : null}

        <RichTextEditor
          document={content}
          onChange={setContent}
          editable={!disabled}
          onModEnter={() => {
            void handleSubmit();
          }}
          className="min-h-28 max-h-56 overflow-y-auto px-5 py-4 text-[15px] leading-7 text-[#D4D4D4] outline-none"
        />
      </div>

      <div className="flex items-center justify-end border-t border-[#343434] px-2 pt-3">
        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!canSubmit}
          className="flex size-10 items-center justify-center rounded-full bg-[#D4D4D4] text-[#161616] transition hover:bg-[#FFFFFF] disabled:cursor-not-allowed disabled:bg-[#454545] disabled:text-[#8B8B8B]"
          aria-label="Send prompt"
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
    </div>
  );
}
