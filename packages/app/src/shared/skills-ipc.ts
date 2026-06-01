export type SkillScope = "system" | "user" | "project";

export interface DiscoveredSkill {
  id: string;
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  scope: SkillScope;
  source: string;
  enabled: boolean;
  disableModelInvocation: boolean;
}

export interface AgentSkillsIPC {
  listSkills: () => Promise<DiscoveredSkill[]>;
  setSkillEnabled: (skillId: string, enabled: boolean) => Promise<DiscoveredSkill[]>;
}
