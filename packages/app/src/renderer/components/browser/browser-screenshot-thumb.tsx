import { cn } from "@renderer/lib/utils";

interface BrowserScreenshotThumbProps {
  alt?: string;
  className?: string;
  screenshotDataUrl?: string;
}

/**
 * Tiny thumbnail of the current page screenshot. Used inside the tool card
 * and the in-artifact preview slot.
 */
export function BrowserScreenshotThumb({
  alt = "browser screenshot",
  className,
  screenshotDataUrl,
}: BrowserScreenshotThumbProps) {
  if (!screenshotDataUrl) return null;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-[#0d0d0d]",
        className,
      )}
    >
      <img
        alt={alt}
        className="block size-full max-h-72 w-full object-contain object-top"
        draggable={false}
        src={screenshotDataUrl}
      />
    </div>
  );
}