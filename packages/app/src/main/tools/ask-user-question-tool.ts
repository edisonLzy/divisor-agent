import { randomUUID } from "node:crypto";

import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import type { UserQuestion, UserQuestionOption } from "../../shared/user-interaction-ipc.js";
import type { UserInteractionService } from "../user-interactions/index.js";
import type { AppTool } from "./types.js";

const FollowUpParams = Type.Object({
  placeholder: Type.String({ description: "Placeholder shown for the option follow-up input" }),
  required: Type.Optional(Type.Boolean({ description: "Whether the follow-up input is required" })),
});

const OptionParams = Type.Object({
  id: Type.String({ description: "Stable option identifier returned in the answer" }),
  label: Type.String({ description: "Short option label" }),
  description: Type.Optional(Type.String({ description: "Concise option explanation" })),
  recommended: Type.Optional(
    Type.Boolean({ description: "Whether this is the recommended option" }),
  ),
  followUp: Type.Optional(FollowUpParams),
});

const QuestionParams = Type.Object({
  id: Type.String({ description: "Unique question identifier within this request" }),
  header: Type.Optional(Type.String({ description: "Short category label" })),
  question: Type.String({ description: "The question shown to the user" }),
  type: Type.Union([Type.Literal("single"), Type.Literal("multiple"), Type.Literal("text")]),
  required: Type.Optional(Type.Boolean({ description: "Defaults to true" })),
  placeholder: Type.Optional(Type.String({ description: "Placeholder for a text question" })),
  options: Type.Optional(
    Type.Array(OptionParams, {
      description: "Required for single and multiple questions",
      minItems: 2,
      maxItems: 6,
    }),
  ),
});

const AskUserQuestionParams = Type.Object({
  questions: Type.Array(QuestionParams, {
    description: "One to three related questions to ask together",
    minItems: 1,
    maxItems: 3,
  }),
});

type AskUserQuestionInput = Static<typeof AskUserQuestionParams>;

export function createAskUserQuestionTool(
  interactionService: UserInteractionService,
): AppTool<typeof AskUserQuestionParams> {
  return {
    name: "ask_user",
    label: "Ask User Question",
    description:
      "Ask the user one to three questions when their decision or missing information is required. Combine related questions into one request. Do not use this tool for permission checks; permissions are handled automatically.",
    riskLevel: "safe",
    parameters: AskUserQuestionParams,
    async execute(toolCallId, params) {
      const normalized = normalizeQuestions((params as AskUserQuestionInput).questions);
      if ("error" in normalized) {
        return {
          content: [{ type: "text", text: `Invalid ask_user request: ${normalized.error}` }],
          details: { toolCallId, status: "invalid" },
        };
      }

      const outcome = await interactionService.request({
        requestId: randomUUID(),
        source: "ask_user",
        toolCallId,
        questions: normalized.questions,
        createdAt: Date.now(),
      });

      if (outcome.status === "submitted") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: outcome.status, answers: outcome.answers }, null, 2),
            },
          ],
          details: { toolCallId, ...outcome },
        };
      }

      const text =
        outcome.status === "dismissed"
          ? "User dismissed the questions without answering."
          : `The question request was cancelled: ${outcome.reason}`;

      return {
        content: [{ type: "text", text }],
        details: { toolCallId, ...outcome },
      };
    },
  };
}

function normalizeQuestions(
  input: AskUserQuestionInput["questions"],
): { questions: UserQuestion[] } | { error: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) {
    return { error: "questions must contain between 1 and 3 items" };
  }

  const questionIds = new Set<string>();
  const questions: UserQuestion[] = [];

  for (const candidate of input) {
    const id = candidate.id.trim();
    const question = candidate.question.trim();
    if (!id || !question) {
      return { error: "question id and question text are required" };
    }
    if (questionIds.has(id)) {
      return { error: `duplicate question id: ${id}` };
    }
    questionIds.add(id);

    const base = {
      id,
      header: candidate.header?.trim() || undefined,
      question,
      required: candidate.required ?? true,
    };

    if (candidate.type === "text") {
      questions.push({
        ...base,
        type: "text",
        placeholder: candidate.placeholder?.trim() || undefined,
      });
      continue;
    }

    const normalizedOptions = normalizeOptions(candidate.options);
    if ("error" in normalizedOptions) {
      return { error: `${id}: ${normalizedOptions.error}` };
    }

    questions.push({
      ...base,
      type: candidate.type,
      options: normalizedOptions.options,
    });
  }

  return { questions };
}

function normalizeOptions(
  input: AskUserQuestionInput["questions"][number]["options"],
): { options: UserQuestionOption[] } | { error: string } {
  if (!Array.isArray(input) || input.length < 2 || input.length > 6) {
    return { error: "single and multiple questions require between 2 and 6 options" };
  }

  const optionIds = new Set<string>();
  let recommendedCount = 0;
  const options: UserQuestionOption[] = [];

  for (const candidate of input) {
    const id = candidate.id.trim();
    const label = candidate.label.trim();
    if (!id || !label) {
      return { error: "option id and label are required" };
    }
    if (optionIds.has(id)) {
      return { error: `duplicate option id: ${id}` };
    }
    optionIds.add(id);

    if (candidate.recommended) {
      recommendedCount += 1;
      if (recommendedCount > 1) {
        return { error: "only one option may be recommended" };
      }
    }

    options.push({
      id,
      label,
      description: candidate.description?.trim() || undefined,
      recommended: candidate.recommended || undefined,
      followUp: candidate.followUp
        ? {
            placeholder: candidate.followUp.placeholder.trim(),
            required: candidate.followUp.required || undefined,
          }
        : undefined,
    });
  }

  return { options };
}
