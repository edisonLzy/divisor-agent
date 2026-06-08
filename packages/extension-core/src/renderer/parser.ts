export interface ParsedExtensionPart {
  kind: "text" | "block" | "artifact";
  text?: string;
  payload?: {
    id?: string;
    type: string;
    props: Record<string, unknown>;
    raw: string;
  };
}

const EXTENSION_FENCE_PATTERN = /```(divisor-block|divisor-artifact)\s*([\s\S]*?)```/g;

export function parseExtensionParts(content: string): ParsedExtensionPart[] {
  const parts: ParsedExtensionPart[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(EXTENSION_FENCE_PATTERN)) {
    const matchStart = match.index ?? 0;
    const fullMatch = match[0];
    const fenceType = match[1];
    const raw = (match[2] ?? "").trim();

    if (matchStart > lastIndex) {
      parts.push({ kind: "text", text: content.slice(lastIndex, matchStart) });
    }

    const parsedPart = parsePayload(fenceType, raw);
    if (parsedPart) {
      parts.push(parsedPart);
    } else {
      parts.push({ kind: "text", text: fullMatch });
    }

    lastIndex = matchStart + fullMatch.length;
  }

  if (lastIndex < content.length) {
    parts.push({ kind: "text", text: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: "text", text: content }];
}

function parsePayload(fenceType: string, raw: string): ParsedExtensionPart | null {
  try {
    const parsed = JSON.parse(raw) as {
      id?: unknown;
      type?: unknown;
      props?: unknown;
    };

    if (typeof parsed.type !== "string") {
      return null;
    }

    return {
      kind: fenceType === "divisor-artifact" ? "artifact" : "block",
      payload: {
        id: typeof parsed.id === "string" ? parsed.id : undefined,
        type: parsed.type,
        props: isRecord(parsed.props) ? parsed.props : {},
        raw,
      },
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
