import { Eye, Globe2, MousePointerClick, Search, Type } from "lucide-react";

import { cn } from "@renderer/lib/utils";

import { BrowserScreenshotThumb } from "./browser-screenshot-thumb";

interface BrowserActionBlockProps {
  action?: string;
  a11yText?: string;
  ref?: string;
  screenshotDataUrl?: string;
  sessionId?: string;
  text?: string;
  title?: string;
  url?: string;
}

const ACTION_META: Record<string, { icon: typeof Globe2; label: string }> = {
  back: { icon: Globe2, label: "Navigated back" },
  click: { icon: MousePointerClick, label: "Clicked element" },
  extract: { icon: Search, label: "Extracted page content" },
  forward: { icon: Globe2, label: "Navigated forward" },
  goto: { icon: Globe2, label: "Opened page" },
  observe: { icon: Eye, label: "Captured page snapshot" },
  press: { icon: Type, label: "Pressed key" },
  scroll: { icon: Globe2, label: "Scrolled page" },
  type: { icon: Type, label: "Typed text" },
  wait: { icon: Search, label: "Waited for page" },
};

export function BrowserActionBlock({
  action,
  a11yText,
  ref,
  screenshotDataUrl,
  text,
  title,
  url,
}: BrowserActionBlockProps) {
  const meta = ACTION_META[action ?? ""] ?? ACTION_META.observe;
  const Icon = meta.icon;
  const detail = describe(action, ref, text, url, title);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/80 p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <div className="text-sm font-medium text-foreground">{meta.label}</div>
        {detail ? (
          <div className="truncate text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </div>

      <BrowserScreenshotThumb screenshotDataUrl={screenshotDataUrl} />

      {a11yText ? (
        <details className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Accessibility snapshot</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
            {a11yText}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function describe(
  action?: string,
  ref?: string,
  text?: string,
  url?: string,
  title?: string,
): string | undefined {
  if (!action) return undefined;
  if (action === "goto" || action === "observe") {
    if (title && url) return `${title} — ${url}`;
    return url;
  }
  if (action === "click" && ref) return ref;
  if (action === "type" && text) return `"${text}"`;
  return undefined;
}

// Re-export to make the props easier to consume from `assistant-tool-message.tsx`.
export type { BrowserActionBlockProps };

// Quiet the `cn` unused-import warning when bundlers tree-shake.
void cn;