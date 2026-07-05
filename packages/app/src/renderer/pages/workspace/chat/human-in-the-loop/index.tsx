import type { HumanInTheLoopRequest } from "@renderer/store/main/human-in-the-loop-slice";

import { AskUserQuestionInteractionPanel } from "./ask-user-question";
import { PermissionApprovalPanel } from "./permission";

interface HumanInTheLoopPanelProps {
  request: HumanInTheLoopRequest;
  sessionId: string;
}

export function HumanInTheLoopPanel({ request, sessionId }: HumanInTheLoopPanelProps) {
  if (request.kind === "permission") {
    return <PermissionApprovalPanel request={request} sessionId={sessionId} />;
  }

  return <AskUserQuestionInteractionPanel request={request} sessionId={sessionId} />;
}
