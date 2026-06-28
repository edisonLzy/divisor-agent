export * from "./ipc/index.js";

export const DIVISOR_BLOCK_LANGUAGE = "divisor-block";
export const DIVISOR_ARTIFACT_LANGUAGE = "divisor-artifact";

export interface AssistantBlockPayload {
  props: Record<string, unknown>;
  raw: string;
  type: string;
}

export interface ArtifactPayload {
  id?: string;
  props: Record<string, unknown>;
  raw: string;
  type: string;
}

export type AssistantBlockPayloadParseResult =
  | { payload: AssistantBlockPayload; status: "ready" }
  | { raw: string; status: "invalid" }
  | { raw: string; status: "pending" };

export type ArtifactPayloadParseResult =
  | { payload: ArtifactPayload; status: "ready" }
  | { raw: string; status: "invalid" }
  | { raw: string; status: "pending" };

export interface FormatAssistantBlockFenceOptions {
  props?: Record<string, unknown>;
  type: string;
}

export interface FormatArtifactFenceOptions {
  id?: string;
  props?: Record<string, unknown>;
  type: string;
}

export function formatAssistantBlockFence({
  props = {},
  type,
}: FormatAssistantBlockFenceOptions): string {
  return `\`\`\`${DIVISOR_BLOCK_LANGUAGE}
${JSON.stringify({ type, props })}
\`\`\``;
}

export function formatArtifactFence({ id, props = {}, type }: FormatArtifactFenceOptions): string {
  return `\`\`\`${DIVISOR_ARTIFACT_LANGUAGE}
${JSON.stringify({ ...(id ? { id } : {}), type, props })}
\`\`\``;
}

export function parseAssistantBlockPayload(
  raw: string,
  isIncomplete: boolean,
): AssistantBlockPayloadParseResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return isIncomplete ? { raw, status: "pending" } : { raw, status: "invalid" };
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      props?: unknown;
      type?: unknown;
    };

    if (typeof parsed.type !== "string") {
      return { raw: trimmed, status: "invalid" };
    }

    return {
      payload: {
        props: isRecord(parsed.props) ? parsed.props : {},
        raw: trimmed,
        type: parsed.type,
      },
      status: "ready",
    };
  } catch {
    return isIncomplete ? { raw, status: "pending" } : { raw: trimmed, status: "invalid" };
  }
}

export function parseArtifactPayload(
  raw: string,
  isIncomplete: boolean,
): ArtifactPayloadParseResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return isIncomplete ? { raw, status: "pending" } : { raw, status: "invalid" };
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      id?: unknown;
      props?: unknown;
      type?: unknown;
    };

    if (typeof parsed.type !== "string") {
      return { raw: trimmed, status: "invalid" };
    }

    return {
      payload: {
        id: typeof parsed.id === "string" ? parsed.id : undefined,
        props: isRecord(parsed.props) ? parsed.props : {},
        raw: trimmed,
        type: parsed.type,
      },
      status: "ready",
    };
  } catch {
    return isIncomplete ? { raw, status: "pending" } : { raw: trimmed, status: "invalid" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
