export type PromptAreaContent = "permission" | "ask-user-question" | "prompt-input";

export function selectPromptAreaContent(
  hasPermissionRequest: boolean,
  hasAskUserQuestionRequest: boolean,
): PromptAreaContent {
  if (hasPermissionRequest) return "permission";
  if (hasAskUserQuestionRequest) return "ask-user-question";
  return "prompt-input";
}
