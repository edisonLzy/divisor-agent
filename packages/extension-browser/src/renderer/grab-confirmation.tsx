import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import { Copy, Image, MessageSquarePlus, X } from "lucide-react";

import type {
  BrowserAnnotationIntent,
  BrowserGrabPayload,
  BrowserGrabScreenshot,
} from "../common/types";

// ---------------------------------------------------------------------------
// Grab payload → human-readable prompt context
// ---------------------------------------------------------------------------

export function formatGrabPayloadAsText(payload: BrowserGrabPayload): string {
  const lines: string[] = [];

  lines.push(`Attached browser context from ${payload.page.sanitizedUrl}`);
  lines.push("");

  lines.push("Selected element:");
  lines.push(payload.target.tagName);
  if (payload.target.accessibility.accessibleName) {
    lines.push(`Accessible name: "${payload.target.accessibility.accessibleName}"`);
  }
  if (payload.target.accessibility.role) {
    lines.push(`Role: ${payload.target.accessibility.role}`);
  }
  lines.push(`Selector: ${payload.target.selector}`);
  if (payload.target.sourceFile) {
    lines.push(`Source: ${payload.target.sourceFile}`);
  }
  if (payload.target.reactComponents) {
    lines.push(`React: ${payload.target.reactComponents}`);
  }
  const { rectViewport } = payload.target;
  lines.push(`Dimensions: ${Math.round(rectViewport.width)}x${Math.round(rectViewport.height)}`);
  lines.push("");

  if (payload.target.textSnippet) {
    lines.push("Text content:");
    lines.push(payload.target.textSnippet);
    lines.push("");
  }

  if (payload.nearbyText.length > 0) {
    lines.push("Nearby context:");
    for (const text of payload.nearbyText) {
      lines.push(`- ${text}`);
    }
    lines.push("");
  }

  const styles = payload.target.computedStyles;
  const styleLines: string[] = [];
  if (styles.display && styles.display !== "inline") styleLines.push(`display: ${styles.display}`);
  if (styles.position && styles.position !== "static")
    styleLines.push(`position: ${styles.position}`);
  if (styles.fontSize) styleLines.push(`font-size: ${styles.fontSize}`);
  if (styles.color) styleLines.push(`color: ${styles.color}`);
  if (styles.backgroundColor && styles.backgroundColor !== "rgba(0, 0, 0, 0)") {
    styleLines.push(`background: ${styles.backgroundColor}`);
  }
  if (styleLines.length > 0) {
    lines.push("Computed styles:");
    for (const sl of styleLines) lines.push(`  ${sl}`);
    lines.push("");
  }

  if (payload.target.htmlSnippet) {
    lines.push("HTML:");
    lines.push(payload.target.htmlSnippet);
    lines.push("");
  }

  if (payload.ancestorPath.length > 0) {
    lines.push(`Ancestor path: ${payload.ancestorPath.join(" > ")}`);
  }
  if (payload.target.fullPath) {
    lines.push(`Full DOM path: ${payload.target.fullPath}`);
  }

  return lines.join("\n").trimEnd();
}

function EscapedText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{text}</span>;
}

const INTENT_OPTIONS: { value: BrowserAnnotationIntent; label: string; color: string }[] = [
  { value: "fix", label: "Fix", color: "bg-signal-yellow text-accent-foreground" },
  { value: "change", label: "Change", color: "bg-signal-cyan text-accent-foreground" },
  { value: "question", label: "Question", color: "bg-signal-purple text-accent-foreground" },
  { value: "approve", label: "Approve", color: "bg-signal-green text-accent-foreground" },
];

// ---------------------------------------------------------------------------
// Confirmation Sheet — bottom panel, browser stays visible in top portion
// ---------------------------------------------------------------------------

export default function GrabConfirmationSheet({
  comment,
  intent,
  onCommentChange,
  onIntentChange,
  onCopy,
  onCopyScreenshot,
  onAttach,
  onCancel,
  payload,
  screenshot,
}: {
  comment: string;
  intent: BrowserAnnotationIntent;
  onCommentChange(value: string): void;
  onIntentChange(value: BrowserAnnotationIntent): void;
  onCopy(): void;
  onCopyScreenshot: (() => void) | null;
  onAttach(): void;
  onCancel(): void;
  payload: BrowserGrabPayload;
  screenshot: BrowserGrabScreenshot | null;
}) {
  const { target, page, nearbyText } = payload;

  return (
    <div className="absolute right-0 bottom-0 left-0 top-[62%] z-20 flex flex-col border-t-2 border-border bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b-2 border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="rounded-sm border-2 border-border bg-signal-cyan px-2 py-0.5 font-mono text-[10px] font-bold text-accent-foreground shadow-[var(--hard-shadow-sm)]">
            Grab
          </div>
          <span className="text-xs text-muted-foreground">Review captured element context</span>
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onCancel}>
          <X />
        </Button>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-auto p-3">
        <div className="flex flex-col gap-2.5">
          {/* Screenshot preview */}
          {screenshot?.dataUrl?.startsWith("data:image/png;base64,") ? (
            <div className="overflow-hidden rounded-md border-2 border-border bg-card shadow-[var(--hard-shadow-sm)]">
              <img
                src={screenshot.dataUrl}
                alt="Selected element screenshot"
                className="max-h-28 w-full object-contain bg-muted/30"
              />
            </div>
          ) : null}

          {/* Element summary */}
          <div className="flex flex-col gap-1.5">
            <h3 className="font-mono text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              Selected Element
            </h3>
            <div className="rounded-md border-2 border-border bg-card p-2 text-xs shadow-[var(--hard-shadow-sm)]">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-semibold text-foreground">
                  <EscapedText text={`<${target.tagName}>`} />
                </span>
                {target.accessibility.role ? (
                  <span className="text-xs text-muted-foreground">
                    role=
                    <EscapedText text={target.accessibility.role} />
                  </span>
                ) : null}
              </div>
              {target.accessibility.accessibleName ? (
                <div className="mt-1 text-muted-foreground">
                  &quot;
                  <EscapedText text={target.accessibility.accessibleName} />
                  &quot;
                </div>
              ) : null}
              <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                <EscapedText text={target.selector} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {Math.round(target.rectViewport.width)}x{Math.round(target.rectViewport.height)}
              </div>
            </div>
          </div>

          {/* Page info */}
          <div className="flex flex-col gap-1.5">
            <h3 className="font-mono text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              Page
            </h3>
            <div className="rounded-md border-2 border-border bg-card p-2 text-xs shadow-[var(--hard-shadow-sm)]">
              <div className="font-medium text-foreground">
                <EscapedText text={page.title || "Untitled"} />
              </div>
              <div className="mt-0.5 break-all text-[11px] text-muted-foreground">
                <EscapedText text={page.sanitizedUrl} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="font-mono text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              Comment
            </h3>
            <Textarea
              className="min-h-14 resize-none text-xs"
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder="添加评论..."
              value={comment}
            />
          </div>

          {/* Annotation intent */}
          <div className="flex flex-col gap-1.5">
            <h3 className="font-mono text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              Intent
            </h3>
            <div className="flex gap-1.5">
              {INTENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`rounded-sm border-2 border-border px-2 py-1 text-[11px] font-bold transition-colors ${
                    intent === option.value
                      ? option.color
                      : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => onIntentChange(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* HTML snippet */}
          {target.htmlSnippet ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="font-mono text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                HTML
              </h3>
              <pre className="max-h-20 overflow-auto rounded-md border-2 border-border bg-[var(--code-surface)] p-2 font-mono text-[11px] text-[var(--code-foreground)]">
                <EscapedText text={target.htmlSnippet} />
              </pre>
            </div>
          ) : null}

          {/* Nearby text */}
          {nearbyText.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="font-mono text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                Nearby Context
              </h3>
              <div className="rounded-md border-2 border-border bg-card p-2 shadow-[var(--hard-shadow-sm)]">
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {nearbyText.map((text, i) => (
                    <li key={i}>
                      <EscapedText text={text} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t-2 border-border bg-card px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onCopy}>
          <Copy className="size-3.5" />
          Copy
        </Button>
        {onCopyScreenshot ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onCopyScreenshot}>
            <Image className="size-3.5" />
            Copy Screenshot
          </Button>
        ) : null}
        <Button size="sm" className="gap-1.5" onClick={onAttach}>
          <MessageSquarePlus className="size-3.5" />
          Attach to AI
        </Button>
      </div>
    </div>
  );
}
