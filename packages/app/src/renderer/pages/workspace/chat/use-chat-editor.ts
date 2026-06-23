import { usePluginSlashCommands } from "@divisor-agent/extension-core/renderer";
import { promptGhostSuggestionExtension } from "@renderer/components/richtext/extensions/prompt-ghost-suggestion";
import {
  type SlashCommandSelection,
  useSlashCommandsExtension,
} from "@renderer/components/richtext/extensions/slash-commands";
import { insertSkillNode, skillNode } from "@renderer/components/richtext/inline/skill-node";
import type { CommandItem } from "@renderer/components/richtext/types";
import { useAgentSkills } from "@renderer/hooks/use-agent-skills";
import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useState } from "react";

interface VirtualElement {
  getBoundingClientRect: () => DOMRect;
}

interface UseChatEditorOptions {
  content?: JSONContent;
  disabled: boolean;
  getFloatingReference?: () => Element | VirtualElement | null;
}

export function useChatEditor({ content, disabled, getFloatingReference }: UseChatEditorOptions) {
  const [hasContent, setHasContent] = useState(false);

  const skillItems = useSkillsCommandItems();
  const pluginCommands = usePluginSlashCommands();
  const pluginItems = useMemo(
    () =>
      pluginCommands.map(
        (cmd): CommandItem => ({
          id: cmd.id,
          group: cmd.group,
          name: cmd.name,
          description: cmd.description,
          extra: cmd.extra,
        }),
      ),
    [pluginCommands],
  );
  const slashCommands = [...skillItems, ...pluginItems];

  const handleSelectCommand = ({ command, editor, range }: SlashCommandSelection) => {
    if (command.group === "Skills") {
      insertSkillNode({
        editor,
        range,
        skill: {
          id: command.id,
          label: command.name,
        },
      });
      return;
    }

    const pluginCommand = pluginCommands.find((item) => item.id === command.id);
    if (!pluginCommand) {
      return;
    }

    void pluginCommand.run({ editor, range });
  };

  const slashCommandsExtension = useSlashCommandsExtension({
    commands: slashCommands,
    getFloatingReference,
    onSelectCommand: handleSelectCommand,
  });
  const extensions = useMemo(
    () => [slashCommandsExtension, promptGhostSuggestionExtension],
    [slashCommandsExtension],
  );

  const editor = useEditor(
    {
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
        ...(extensions ?? []),
        skillNode,
      ],
      content,
      editorProps: {
        attributes: {
          class:
            "ProseMirror min-h-[48px] max-h-[160px] overflow-y-auto text-[14px] leading-6 text-foreground caret-foreground outline-none",
        },
      },
      editable: !disabled,
      onCreate: ({ editor: nextEditor }) => {
        setHasContent(nextEditor.getText().trim().length > 0);
      },
      onUpdate: ({ editor: nextEditor }) => {
        setHasContent(nextEditor.getText().trim().length > 0);
      },
    },
    [content],
  );

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return { editor, hasContent };
}

function useSkillsCommandItems() {
  const skills = useAgentSkills();

  return useMemo<CommandItem[]>(
    () =>
      skills
        .filter((skill) => skill.enabled)
        .map((skill) => ({
          id: skill.id,
          group: "Skills",
          name: skill.name,
          description: skill.description,
          extra: skill.scope === "user" ? "个人" : skill.scope === "project" ? "项目" : "系统",
        })),
    [skills],
  );
}
