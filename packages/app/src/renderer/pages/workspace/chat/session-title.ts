const DEFAULT_SESSION_NAMES = new Set(["", "新对话", "untitled"]);
const MAX_SESSION_TITLE_LENGTH = 32;

export function shouldAutoRenameSession(name: string | undefined) {
  return DEFAULT_SESSION_NAMES.has((name ?? "").trim());
}

export function createSessionTitleFromPrompt(prompt: string) {
  const normalized = prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "新对话";
  }

  const firstLine = normalized.split(/[。！？.!?\n]/)[0]?.trim() || normalized;
  if (firstLine.length <= MAX_SESSION_TITLE_LENGTH) {
    return firstLine;
  }

  return `${firstLine.slice(0, MAX_SESSION_TITLE_LENGTH).trim()}...`;
}
