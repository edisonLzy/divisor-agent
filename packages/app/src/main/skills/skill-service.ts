import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

import type { DiscoveredSkill, SkillScope } from "../../shared/skills-ipc.js";
import type { SystemPromptBuilder } from "../prompt/index.js";

const CONFIG_FILE_PATH = join(homedir(), ".divisor-agent", "skills-settings.json");

type SkillDiscoveryMode = "pi" | "agents";

interface SkillSettings {
  disabledSkillIds?: string[];
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
}

interface SkillLocation {
  dir: string;
  mode: SkillDiscoveryMode;
  scope: SkillScope;
  source: string;
}

export class SkillService implements SystemPromptBuilder {
  private skillsCache: DiscoveredSkill[] | null = null;
  private disabledSkillIds = new Set<string>();

  constructor(private cwd = process.cwd()) {
    this.loadSettings();
  }

  listSkills(): DiscoveredSkill[] {
    const skills = this.getSkills();
    return skills.map((skill) => ({ ...skill }));
  }

  setSkillEnabled(skillId: string, enabled: boolean): DiscoveredSkill[] {
    if (enabled) {
      this.disabledSkillIds.delete(skillId);
    } else {
      this.disabledSkillIds.add(skillId);
    }

    this.saveSettings();
    this.skillsCache =
      this.skillsCache?.map((skill) => {
        if (skill.id !== skillId) {
          return skill;
        }

        return {
          ...skill,
          enabled,
        };
      }) ?? null;

    return this.listSkills();
  }

  buildSystemPrompt(raw: string): string {
    const skills = this.getSkills().filter(
      (skill) => skill.enabled && !skill.disableModelInvocation,
    );

    if (skills.length === 0) {
      return raw;
    }

    const lines = [
      "The following skills provide specialized instructions for specific tasks.",
      "Use the fs read tool to load a skill's file when the task matches its description.",
      "When a skill file references a relative path, resolve it against the skill directory and use that absolute path in tool commands.",
      "",
      "<available_skills>",
    ];

    for (const skill of skills) {
      lines.push("  <skill>");
      lines.push(`    <name>${escapeXml(skill.name)}</name>`);
      lines.push(`    <description>${escapeXml(skill.description)}</description>`);
      lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
      lines.push("  </skill>");
    }

    lines.push("</available_skills>");

    return joinPromptSections(raw, lines.join("\n"));
  }

  expandSkillReferences(content: string, skillIds: string[]): string {
    if (skillIds.length === 0) {
      return content;
    }

    const skillsById = new Map(this.getSkills().map((skill) => [skill.id, skill]));
    const blocks: string[] = [];

    for (const skillId of skillIds) {
      const skill = skillsById.get(skillId);
      if (!skill?.enabled) {
        continue;
      }

      try {
        const rawContent = readFileSync(skill.filePath, "utf-8");
        const body = stripFrontmatter(rawContent).trim();
        blocks.push(
          `<skill name="${escapeXmlAttribute(skill.name)}" location="${escapeXmlAttribute(skill.filePath)}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`,
        );
      } catch (error) {
        console.error(`Failed to expand skill ${skill.name}:`, error);
      }
    }

    if (blocks.length === 0) {
      return content;
    }

    return `${blocks.join("\n\n")}\n\n${content}`.trim();
  }

  private getSkills(): DiscoveredSkill[] {
    if (this.skillsCache) {
      return this.skillsCache;
    }

    const skillsByName = new Map<string, DiscoveredSkill>();
    const seenPaths = new Set<string>();

    for (const location of this.getSkillLocations()) {
      for (const filePath of collectSkillFiles(location.dir, location.mode)) {
        const resolvedPath = resolve(filePath);
        if (seenPaths.has(resolvedPath)) {
          continue;
        }

        const skill = loadSkillFromFile(resolvedPath, location);
        if (!skill || skillsByName.has(skill.name)) {
          continue;
        }

        skill.enabled = !this.disabledSkillIds.has(skill.id);
        skillsByName.set(skill.name, skill);
        seenPaths.add(resolvedPath);
      }
    }

    this.skillsCache = Array.from(skillsByName.values()).sort((left, right) => {
      return (
        scopeWeight(left.scope) - scopeWeight(right.scope) || left.name.localeCompare(right.name)
      );
    });

    return this.skillsCache;
  }

  private getSkillLocations(): SkillLocation[] {
    const homeDir = homedir();
    const cwd = resolve(this.cwd);
    const projectDirs = collectProjectSkillLocations(cwd);

    return [
      ...projectDirs,
      { dir: join(homeDir, ".pi", "agent", "skills"), mode: "pi", scope: "user", source: "pi" },
      { dir: join(homeDir, ".agents", "skills"), mode: "agents", scope: "user", source: "agents" },
      { dir: join(homeDir, ".codex", "skills"), mode: "agents", scope: "user", source: "codex" },
    ];
  }

  private loadSettings() {
    try {
      const settings = JSON.parse(readFileSync(CONFIG_FILE_PATH, "utf-8")) as SkillSettings;
      this.disabledSkillIds = new Set(settings.disabledSkillIds ?? []);
    } catch {
      this.disabledSkillIds = new Set();
    }
  }

  private saveSettings() {
    mkdirSync(dirname(CONFIG_FILE_PATH), { recursive: true });
    const settings: SkillSettings = {
      disabledSkillIds: Array.from(this.disabledSkillIds).sort(),
    };
    writeFileSync(CONFIG_FILE_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  }
}

function collectProjectSkillLocations(cwd: string): SkillLocation[] {
  const locations: SkillLocation[] = [
    { dir: join(cwd, ".pi", "skills"), mode: "pi", scope: "project", source: "pi" },
    { dir: join(cwd, ".codex", "skills"), mode: "agents", scope: "project", source: "codex" },
  ];

  // Limit parent traversal to the current repository so we do not accidentally
  // inherit sibling or parent-project skills outside the active workspace.
  const gitRoot = findGitRepoRoot(cwd);
  let currentDir = cwd;
  while (true) {
    locations.push({
      dir: join(currentDir, ".agents", "skills"),
      mode: "agents",
      scope: "project",
      source: "agents",
    });

    if ((gitRoot && currentDir === gitRoot) || dirname(currentDir) === currentDir) {
      break;
    }

    currentDir = dirname(currentDir);
  }

  return locations;
}

function collectSkillFiles(dir: string, mode: SkillDiscoveryMode): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name !== "SKILL.md") {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (isFile(fullPath, entry)) {
        files.push(fullPath);
        return files;
      }
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".system") {
        continue;
      }

      if (entry.name === "node_modules") {
        continue;
      }

      const fullPath = join(dir, entry.name);

      if (mode === "pi" && isFile(fullPath, entry) && entry.name.endsWith(".md")) {
        files.push(fullPath);
        continue;
      }

      if (isDirectory(fullPath, entry)) {
        files.push(...collectSkillFiles(fullPath, mode));
      }
    }
  } catch {
    return files;
  }

  return files;
}

function loadSkillFromFile(filePath: string, location: SkillLocation): DiscoveredSkill | null {
  try {
    const rawContent = readFileSync(filePath, "utf-8");
    const frontmatter = parseFrontmatter(rawContent);
    const description = frontmatter.description?.trim();

    if (!description) {
      return null;
    }

    const baseDir = dirname(filePath);
    const isSystemSkill = filePath.split(sep).includes(".system");
    const scope = isSystemSkill ? "system" : location.scope;
    const name = frontmatter.name?.trim() || basename(baseDir);

    return {
      id: filePath,
      name,
      description,
      filePath,
      baseDir,
      scope,
      source: location.source,
      enabled: true,
      disableModelInvocation: frontmatter["disable-model-invocation"] === true,
    };
  } catch {
    return null;
  }
}

function parseFrontmatter(content: string): SkillFrontmatter {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return {};
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return {};
  }

  const frontmatter: SkillFrontmatter = {};
  const lines = match[1].split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    let value = rawValue.replace(/^["']|["']$/g, "");

    if (rawValue === ">" || rawValue === "|") {
      const blockLines: string[] = [];

      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1];
        if (nextLine.trim().length === 0) {
          blockLines.push("");
          index += 1;
          continue;
        }

        if (!/^\s+/.test(nextLine)) {
          break;
        }

        blockLines.push(nextLine);
        index += 1;
      }

      value = parseBlockScalar(blockLines, rawValue);
    }

    if (key === "name") frontmatter.name = value;
    if (key === "description") frontmatter.description = value;
    if (key === "disable-model-invocation") {
      frontmatter["disable-model-invocation"] = value === "true";
    }
  }

  return frontmatter;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function findGitRepoRoot(startDir: string): string | null {
  let currentDir = resolve(startDir);

  while (true) {
    if (existsSync(join(currentDir, ".git"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function parseBlockScalar(lines: string[], style: ">" | "|"): string {
  const normalizedLines = dedentBlockLines(lines);
  if (style === "|") {
    return normalizedLines.join("\n").trim();
  }

  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of normalizedLines) {
    if (line.trim().length === 0) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      continue;
    }

    currentParagraph.push(line.trim());
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  return paragraphs.join("\n\n").trim();
}

function dedentBlockLines(lines: string[]): string[] {
  let minIndent = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    minIndent = Math.min(minIndent, indent);
  }

  if (!Number.isFinite(minIndent)) {
    return [];
  }

  return lines.map((line) => {
    if (line.trim().length === 0) {
      return "";
    }

    return line.slice(minIndent);
  });
}

function joinPromptSections(...sections: string[]): string {
  return sections
    .filter((section) => section.trim().length > 0)
    .join("\n\n")
    .trim();
}

// Dirent does not follow symlinks, but skills are often symlinked during local development.
function isFile(fullPath: string, entry: { isFile(): boolean; isSymbolicLink(): boolean }) {
  if (entry.isFile()) {
    return true;
  }

  if (!entry.isSymbolicLink()) {
    return false;
  }

  try {
    return statSync(fullPath).isFile();
  } catch {
    return false;
  }
}

// Mirror `isFile` behavior so recursive discovery works for symlinked skill directories too.
function isDirectory(
  fullPath: string,
  entry: { isDirectory(): boolean; isSymbolicLink(): boolean },
) {
  if (entry.isDirectory()) {
    return true;
  }

  if (!entry.isSymbolicLink()) {
    return false;
  }

  try {
    return statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function scopeWeight(scope: SkillScope) {
  if (scope === "system") return 0;
  if (scope === "project") return 1;
  return 2;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlAttribute(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
