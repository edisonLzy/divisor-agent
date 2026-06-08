import { MessageAction } from "@renderer/components/ai-elements/message";
import { Pencil } from "lucide-react";

interface EditMessageButtonProps {
  isRunning: boolean;
  onEdit: () => void;
}

/**
 * Self-contained edit button for user messages.
 * Disabled while the session is running to avoid concurrent conflicts.
 * Fires the onEdit callback to let the parent switch into edit mode.
 */
export function EditMessageButton({ isRunning, onEdit }: EditMessageButtonProps) {
  return (
    <MessageAction tooltip="编辑" disabled={isRunning} onClick={onEdit}>
      <Pencil className="size-3.5" />
    </MessageAction>
  );
}
