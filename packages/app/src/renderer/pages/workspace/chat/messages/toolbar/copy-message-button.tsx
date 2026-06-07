import { MessageAction } from "@renderer/components/ai-elements/message";
import { copyTextToClipboard } from "@renderer/lib/clipboard";
import { Copy } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

interface CopyMessageButtonProps {
  text: string;
  tooltip?: string;
}

/**
 * Self-contained copy button for message content.
 * Copies the provided text to clipboard and shows a toast on success/error.
 */
export function CopyMessageButton({ text, tooltip = "复制" }: CopyMessageButtonProps) {
  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  }, [text]);

  return (
    <MessageAction tooltip={tooltip} onClick={handleCopy}>
      <Copy className="size-3.5" />
    </MessageAction>
  );
}
