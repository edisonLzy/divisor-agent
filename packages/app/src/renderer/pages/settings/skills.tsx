import { Badge } from "@renderer/components/ui/badge";
import { Input } from "@renderer/components/ui/input";
import { Switch } from "@renderer/components/ui/switch";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useAgentSkills } from "@renderer/hooks/use-agent-skills";
import type { SkillScope } from "@shared/skills-ipc";
import Fuse from "fuse.js";
import { BoxIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const SKILL_SCOPE_LABEL: Record<SkillScope, string> = {
  system: "系统",
  project: "项目",
  user: "个人",
};

export function SettingsSkillsPage() {
  const { invoke } = useElectronIPC();
  const skills = useAgentSkills();
  const [skillsQuery, setSkillsQuery] = useState("");
  const [skillEnabledOverrides, setSkillEnabledOverrides] = useState<Record<string, boolean>>({});

  const resolvedSkills = useMemo(() => {
    return skills.map((skill) => ({
      ...skill,
      enabled: skillEnabledOverrides[skill.id] ?? skill.enabled,
    }));
  }, [skillEnabledOverrides, skills]);

  const filteredSkills = useMemo(() => {
    const query = skillsQuery.trim();
    if (!query) {
      return resolvedSkills;
    }

    return new Fuse(resolvedSkills, {
      threshold: 0.35,
      ignoreLocation: true,
      keys: ["name", "description", "filePath"],
    })
      .search(query)
      .map((result) => result.item);
  }, [resolvedSkills, skillsQuery]);

  const enabledSkillCount = useMemo(() => {
    return resolvedSkills.filter((skill) => skill.enabled).length;
  }, [resolvedSkills]);

  const handleSkillEnabledChange = async (skillId: string, enabled: boolean) => {
    const currentSkill = resolvedSkills.find((skill) => skill.id === skillId);
    if (!currentSkill) {
      return;
    }

    setSkillEnabledOverrides((currentOverrides) => ({
      ...currentOverrides,
      [skillId]: enabled,
    }));

    try {
      await invoke("setSkillEnabled", skillId, enabled);
    } catch (error) {
      console.error("Failed to update skill", error);
      setSkillEnabledOverrides((currentOverrides) => ({
        ...currentOverrides,
        [skillId]: currentSkill.enabled,
      }));
    }
  };

  useEffect(() => {
    setSkillEnabledOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      let hasChanges = false;

      for (const skill of skills) {
        if (nextOverrides[skill.id] === skill.enabled) {
          delete nextOverrides[skill.id];
          hasChanges = true;
        }
      }

      return hasChanges ? nextOverrides : currentOverrides;
    });
  }, [skills]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-160 flex-col px-10 py-12">
      <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-foreground">Skills</h1>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex max-h-[min(680px,calc(100vh-9rem))] flex-col overflow-hidden rounded-md border-2 border-border bg-card shadow-[var(--hard-shadow)]">
          <div className="flex shrink-0 flex-col gap-4 border-b-2 border-border px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[13px] font-medium text-foreground">Skills Discovery</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                已发现 {skills.length} 个技能，当前启用 {enabledSkillCount}
                个。禁用后不会出现在 prompt 和 `/` 建议中。
              </div>
            </div>
            <div className="relative w-full md:w-64">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={skillsQuery}
                onChange={(event) => setSkillsQuery(event.target.value)}
                placeholder="搜索技能"
                className="h-8 pl-8 text-[12px]"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
            {filteredSkills.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                没有匹配的技能
              </div>
            ) : (
              filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/35"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border-2 border-border bg-signal-purple text-accent-foreground shadow-[var(--hard-shadow-sm)]">
                    <BoxIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {skill.name}
                      </div>
                      <Badge variant="outline">{SKILL_SCOPE_LABEL[skill.scope]}</Badge>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                      {skill.description}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground/70">
                      {skill.filePath}
                    </div>
                  </div>
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={(enabled) => {
                      void handleSkillEnabledChange(skill.id, enabled);
                    }}
                    aria-label={`Toggle ${skill.name}`}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
