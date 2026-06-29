export type UserQuestionType = "single" | "multiple" | "text";

export interface UserQuestionOptionFollowUp {
  placeholder: string;
  required?: boolean;
}

export interface UserQuestionOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  followUp?: UserQuestionOptionFollowUp;
}

interface BaseUserQuestion {
  id: string;
  header?: string;
  question: string;
  required?: boolean;
}

export interface UserSingleQuestion extends BaseUserQuestion {
  type: "single";
  options: UserQuestionOption[];
}

export interface UserMultipleQuestion extends BaseUserQuestion {
  type: "multiple";
  options: UserQuestionOption[];
}

export interface UserTextQuestion extends BaseUserQuestion {
  type: "text";
  placeholder?: string;
}

export type UserQuestion = UserSingleQuestion | UserMultipleQuestion | UserTextQuestion;

export interface UserInteractionDetailSection {
  label: string;
  value: string;
  format: "text" | "code";
}

export interface UserInteractionRequest {
  requestId: string;
  source: "ask_user" | "permission";
  toolCallId?: string;
  questions: UserQuestion[];
  details?: {
    summary: string;
    sections: UserInteractionDetailSection[];
  };
  createdAt: number;
}

export interface UserQuestionAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string;
  optionInputs?: Record<string, string>;
}

export type UserInteractionSubmission =
  | {
      status: "submitted";
      answers: UserQuestionAnswer[];
    }
  | {
      status: "dismissed";
    };

export type UserInteractionOutcome =
  | UserInteractionSubmission
  | {
      status: "cancelled";
      reason: string;
    };

export interface UserInteractionRequestedEvent extends UserInteractionRequest {
  type: "user_interaction_requested";
}
