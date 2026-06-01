import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type { DiscoveredSkill } from "@shared/skills-ipc";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { PromptSubmission } from "../prompt-types";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";
import { PromptEditor, type PromptEditorHandle, type SkillItem } from "./prompt-editor";

interface PromptInputProps {
  disabled?: boolean;
  isRunning?: boolean;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
}

export function PromptInput({
  disabled = false,
  isRunning = false,
  onSubmit,
  onStop,
  sessionId,
}: PromptInputProps) {
  const { invoke } = useElectronIPC();

  const modelSelectorProps = useModalSelector();
  const permissionSelectorProps = usePermissionSelector(sessionId);
  const editorRef = useRef<PromptEditorHandle>(null);
  const skillsCacheRef = useRef<DiscoveredSkill[] | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const canSubmit = !disabled && !isRunning && hasContent && modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const handleSearchSkills = useCallback(
    async (query: string): Promise<SkillItem[]> => {
      if (!skillsCacheRef.current) {
        skillsCacheRef.current = await invoke("listSkills");
      }

      return filterSkills(skillsCacheRef.current, query).map(toSkillItem);
    },
    [invoke],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !modelSelectorProps.value || !editorRef.current) {
      return;
    }

    const text = editorRef.current.getText().trim();
    if (!text) {
      return;
    }

    await onSubmit({
      text,
      model: modelSelectorProps.value,
      skillIds: editorRef.current.getSelectedSkillIds(),
    });

    editorRef.current.clear();
    setHasContent(false);
  }, [canSubmit, modelSelectorProps.value, onSubmit]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
        disabled && !isRunning && "opacity-80",
      )}
    >
      <PromptEditor
        ref={editorRef}
        disabled={disabled || isRunning}
        onSubmit={handleSubmit}
        onContentChange={setHasContent}
        onSearchSkills={handleSearchSkills}
        className="min-h-14"
      />

      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <PermissionSelector {...permissionSelectorProps} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <ModalSelector {...modelSelectorProps} />

          <Button
            type="button"
            onClick={() => {
              if (isRunning) {
                void onStop?.();
                return;
              }

              void handleSubmit();
            }}
            disabled={isRunning ? !isStopEnabled : !canSubmit}
            size="icon-sm"
            className={cn(
              "size-7 rounded-full transition-colors disabled:bg-muted disabled:text-muted-foreground/50",
              isRunning
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30",
            )}
            aria-label={isRunning ? "Stop response" : "Send prompt"}
          >
            {isRunning ? (
              <Square className="size-3" fill="currentColor" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

const MAX_SKILL_SEARCH_RESULTS = 20;

function filterSkills(skills: DiscoveredSkill[], query: string) {
  const enabledSkills = skills.filter((skill) => skill.enabled);
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return enabledSkills.slice(0, MAX_SKILL_SEARCH_RESULTS);
  }

  return enabledSkills
    .map((skill) => {
      const lowerName = skill.name.toLowerCase();
      const lowerDescription = skill.description.toLowerCase();
      const lowerPath = skill.filePath.toLowerCase();
      let score = Number.POSITIVE_INFINITY;

      if (lowerName === normalizedQuery) score = 0;
      else if (lowerName.startsWith(normalizedQuery)) score = 1;
      else if (lowerName.includes(normalizedQuery)) score = 2;
      else if (lowerDescription.includes(normalizedQuery)) score = 3;
      else if (lowerPath.includes(normalizedQuery)) score = 4;

      return { skill, score };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort(
      (left, right) => left.score - right.score || left.skill.name.localeCompare(right.skill.name),
    )
    .slice(0, MAX_SKILL_SEARCH_RESULTS)
    .map((entry) => entry.skill);
}

function toSkillItem(skill: DiscoveredSkill): SkillItem {
  return {
    id: skill.id,
    label: skill.name,
    name: skill.name,
    description: skill.description,
    scope: skill.scope,
  };
}
