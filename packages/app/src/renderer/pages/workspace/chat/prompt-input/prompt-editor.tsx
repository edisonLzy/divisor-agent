import { cn } from "@renderer/lib/utils";
import { useSlashCommands } from "@renderer/pages/workspace/chat/commands/slash-commands";
import Placeholder from "@tiptap/extension-placeholder";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(function PromptEditor(
  { disabled = false, onSubmit, onContentChange, className },
  ref,
) {
  const editorRef = useRef<Editor | null>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const suggestionOpenRef = useRef(false);
  const skipNextSubmitRef = useRef(false);

  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const slashCommands = useSlashCommands({
    onOpenChange: (isOpen) => {
      suggestionOpenRef.current = isOpen;
    },
    onSelect: () => {
      skipNextSubmitRef.current = true;
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        orderedList: false,
        bulletList: false,
      }),
      Placeholder.configure({
        placeholder: "Ask anything...",
      }),
      slashCommands.extension,
    ],
    editorProps: {
      attributes: {
        class:
          "ProseMirror min-h-[48px] max-h-[160px] overflow-y-auto text-[14px] leading-6 text-foreground caret-foreground outline-none",
      },
    },
    editable: !disabled,
    onUpdate: ({ editor: nextEditor }) => {
      onContentChangeRef.current?.(nextEditor.getText().trim().length > 0);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing
      ) {
        if (skipNextSubmitRef.current) {
          skipNextSubmitRef.current = false;
          event.preventDefault();
          return;
        }

        if (suggestionOpenRef.current) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        onSubmitRef.current();
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener("keydown", handleKeyDown);

    return () => {
      dom.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      editorRef.current?.commands.clearContent();
    },
    getText: () => {
      return editorRef.current?.getText() ?? "";
    },
    getEditor: () => editorRef.current,
    getSelectedSkillIds: () => {
      return slashCommands.getSelectedSkillIds(editorRef.current);
    },
  }));

  return (
    <div className={cn("relative px-3.5 py-2.5", className)}>
      <EditorContent editor={editor} className="prompt-editor max-w-none" />
    </div>
  );
});

export interface PromptEditorHandle {
  clear: () => void;
  getText: () => string;
  getEditor: () => Editor | null;
  getSelectedSkillIds: () => string[];
}

interface PromptEditorProps {
  disabled?: boolean;
  onSubmit: () => void;
  onContentChange?: (hasContent: boolean) => void;
  className?: string;
}
