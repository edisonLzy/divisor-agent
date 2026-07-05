import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "@divisor-agent/extension-core/common";

import type { AgentSessionScope } from "../../shared/events-ipc.js";
import { AbstractHumanInTheLoop } from "./abstract-human-in-the-loop.js";

export interface AskUserQuestionServicePayload {
  input: AskUserQuestionInput;
  scope: AgentSessionScope;
  sessionId: string;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export class AskUserQuestionService extends AbstractHumanInTheLoop<
  "ask_user_question",
  AskUserQuestionServicePayload,
  AskUserQuestionResult
> {
  public readonly kind = "ask_user_question" as const;

  public requestForSession(
    sessionId: string,
    scope: AgentSessionScope,
    input: AskUserQuestionInput,
  ): Promise<AskUserQuestionResult> {
    return this.request({ input, scope, sessionId });
  }

  public resolveForSession(
    sessionId: string,
    requestId: string,
    result: AskUserQuestionResult,
  ): void {
    const pending = this.getPendingPayload(requestId);
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error(`Unknown ask user question request: ${requestId}`);
    }
    this.resolve(requestId, result);
  }

  public cancelForSession(sessionId: string, reason: string): void {
    this.cancelWhere((payload) => payload.sessionId === sessionId, reason);
  }

  protected parsePayload(value: unknown): AskUserQuestionServicePayload {
    if (!value || typeof value !== "object") {
      throw new Error("Ask user question input must contain questions");
    }
    const payload = value as AskUserQuestionServicePayload;
    const sessionId = requireText(payload.sessionId, "sessionId");
    if (payload.scope !== "main" && payload.scope !== "side-chat") {
      throw new Error("Ask user question scope is invalid");
    }
    const questions = payload.input?.questions;
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 3) {
      throw new Error("Ask user question requires between 1 and 3 questions");
    }

    const normalizedQuestions = questions.map((question, questionIndex) => {
      const header = requireText(question.header, `questions[${questionIndex}].header`);
      if (header.length > 12) {
        throw new Error(`questions[${questionIndex}].header must not exceed 12 characters`);
      }
      if (
        !Array.isArray(question.options) ||
        question.options.length < 2 ||
        question.options.length > 3
      ) {
        throw new Error(`questions[${questionIndex}] requires between 2 and 3 options`);
      }
      const options = question.options.map((option, optionIndex) => ({
        label: requireText(
          option.label,
          `questions[${questionIndex}].options[${optionIndex}].label`,
        ),
        description: requireText(
          option.description,
          `questions[${questionIndex}].options[${optionIndex}].description`,
        ),
      }));
      if (new Set(options.map((option) => option.label)).size !== options.length) {
        throw new Error(`questions[${questionIndex}] option labels must be unique`);
      }
      return {
        header,
        question: requireText(question.question, `questions[${questionIndex}].question`),
        multiSelect: question.multiSelect === true,
        options,
      };
    });
    if (
      new Set(normalizedQuestions.map((question) => question.question)).size !==
      normalizedQuestions.length
    ) {
      throw new Error("Ask user question text must be unique within a request");
    }

    return { sessionId, scope: payload.scope, input: { questions: normalizedQuestions } };
  }

  protected parseResult(
    value: unknown,
    payload: AskUserQuestionServicePayload,
  ): AskUserQuestionResult {
    if (!value || typeof value !== "object" || !("answers" in value)) {
      throw new Error("Ask user question result must contain answers");
    }
    const result = value as AskUserQuestionResult;
    if (
      !Array.isArray(result.answers) ||
      result.answers.length !== payload.input.questions.length
    ) {
      throw new Error("Ask user question result must answer every question");
    }

    const answers = payload.input.questions.map((question) => {
      const answer = result.answers.find((candidate) => candidate.question === question.question);
      if (!answer) throw new Error(`Missing answer for question: ${question.question}`);
      const selectedOptions = Array.isArray(answer.selectedOptions) ? answer.selectedOptions : [];
      const knownLabels = new Set(question.options.map((option) => option.label));
      if (selectedOptions.some((label) => !knownLabels.has(label))) {
        throw new Error(`Unknown option selected for question: ${question.question}`);
      }
      if (!question.multiSelect && selectedOptions.length > 1) {
        throw new Error(`Question only allows one option: ${question.question}`);
      }
      const customAnswer = answer.customAnswer?.trim() || undefined;
      if (!question.multiSelect && selectedOptions.length && customAnswer) {
        throw new Error(
          `Question does not allow an option and custom answer together: ${question.question}`,
        );
      }
      if (!selectedOptions.length && !customAnswer) {
        throw new Error(`Question requires an answer: ${question.question}`);
      }
      return { question: question.question, selectedOptions, customAnswer };
    });

    return { answers, additionalNote: result.additionalNote?.trim() || undefined };
  }
}
