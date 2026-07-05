export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestion {
  header: string;
  question: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface AskUserQuestionInput {
  questions: AskUserQuestion[];
}

export interface AskUserQuestionAnswer {
  question: string;
  selectedOptions: string[];
  customAnswer?: string;
}

export interface AskUserQuestionResult {
  answers: AskUserQuestionAnswer[];
  additionalNote?: string;
}
