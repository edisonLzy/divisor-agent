import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "@divisor-agent/extension-core/common";

export interface AskUserQuestionRequest extends AskUserQuestionInput {
  requestId: string;
  createdAt: number;
  kind: "ask_user_question";
}

export interface AskUserQuestionRequestedEvent extends AskUserQuestionRequest {
  type: "ask_user_question_requested";
}

export type AskUserQuestionResolution = AskUserQuestionResult;
