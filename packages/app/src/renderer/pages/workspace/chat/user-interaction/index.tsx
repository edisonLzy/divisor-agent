import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@renderer/components/ui/input-group";
import { Spinner } from "@renderer/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@renderer/components/ui/toggle-group";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type {
  UserInteractionRequest,
  UserInteractionSubmission,
  UserQuestion,
  UserQuestionAnswer,
  UserQuestionOption,
} from "@shared/user-interaction-ipc";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Command,
  CornerDownLeft,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

interface UserInteractionPanelProps {
  request: UserInteractionRequest;
  sessionId: string;
  onResolved: (submission: UserInteractionSubmission) => void;
}

interface AnswerDraft {
  optionInputs: Record<string, string>;
  selectedOptionIds: string[];
  text: string;
}

export function UserInteractionPanel({
  request,
  sessionId,
  onResolved,
}: UserInteractionPanelProps) {
  const { invoke } = useElectronIPC();
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, AnswerDraft>>(() =>
    createInitialDrafts(request.questions),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestion = request.questions[currentIndex];
  const currentDraft = answerDrafts[currentQuestion.id] ?? createEmptyDraft();
  const isLastQuestion = currentIndex === request.questions.length - 1;
  const canContinue = isQuestionAnswered(currentQuestion, currentDraft);
  const canSubmit = request.questions.every((question) =>
    isQuestionAnswered(question, answerDrafts[question.id] ?? createEmptyDraft()),
  );

  useEffect(() => {
    setAnswerDrafts(createInitialDrafts(request.questions));
    setCurrentIndex(0);
    setIsSubmitting(false);
  }, [request.requestId, request.questions]);

  async function resolve(submission: UserInteractionSubmission) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await invoke("resolveUserInteraction", sessionId, request.requestId, submission);
      onResolved(submission);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交回答失败");
      setIsSubmitting(false);
    }
  }

  function updateDraft(questionId: string, update: Partial<AnswerDraft>) {
    setAnswerDrafts((previous) => ({
      ...previous,
      [questionId]: {
        ...(previous[questionId] ?? createEmptyDraft()),
        ...update,
      },
    }));
  }

  function continueOrSubmit() {
    if (isLastQuestion) {
      if (!canSubmit) return;
      void resolve({
        status: "submitted",
        answers: createAnswers(request.questions, answerDrafts),
      });
      return;
    }

    if (canContinue) {
      setCurrentIndex((index) => index + 1);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isSubmitting) return;
      const isTextInput =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";
      const focusedOption = (document.activeElement as HTMLElement | null)?.dataset.optionId;

      if (event.key === "Escape") {
        event.preventDefault();
        void resolve({ status: "dismissed" });
        return;
      }

      if (event.key === "Enter" && (!isTextInput || event.metaKey || event.ctrlKey)) {
        if (focusedOption) return;
        event.preventDefault();
        continueOrSubmit();
        return;
      }

      if (isTextInput || currentQuestion.type === "text") return;
      if (event.defaultPrevented) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const options = currentQuestion.options;
        const focusedIndex = options.findIndex((option) => option.id === focusedOption);
        const selectedIndex = Math.max(
          0,
          focusedIndex >= 0
            ? focusedIndex
            : options.findIndex((option) => option.id === currentDraft.selectedOptionIds[0]),
        );
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextOption = options[(selectedIndex + direction + options.length) % options.length];
        const nextElement = document.querySelector<HTMLElement>(
          `[data-question-id="${CSS.escape(currentQuestion.id)}"][data-option-id="${CSS.escape(nextOption.id)}"]`,
        );
        nextElement?.focus();
        if (currentQuestion.type === "single") {
          updateDraft(currentQuestion.id, { selectedOptionIds: [nextOption.id] });
        }
        return;
      }

      const shortcutIndex = Number(event.key) - 1;
      if (
        Number.isInteger(shortcutIndex) &&
        shortcutIndex >= 0 &&
        shortcutIndex < currentQuestion.options.length
      ) {
        const optionId = currentQuestion.options[shortcutIndex].id;
        const selectedOptionIds =
          currentQuestion.type === "multiple"
            ? toggleOption(currentDraft.selectedOptionIds, optionId)
            : [optionId];
        updateDraft(currentQuestion.id, { selectedOptionIds });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <Card className="gap-0 rounded-[20px] py-0 shadow-[0_24px_80px_rgb(0_0_0/0.32)]">
      <CardHeader className="gap-1 px-5 py-4">
        <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {currentQuestion.header ||
            (request.source === "permission" ? "权限确认" : "需要你的回答")}
        </div>
        <CardTitle className="text-[15px]">{currentQuestion.question}</CardTitle>
        <CardDescription className="text-xs">
          {currentQuestion.required === false ? "可选问题" : "回答后 Agent 才会继续执行。"}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={currentIndex === 0 || isSubmitting}
            aria-label="上一题"
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          >
            <ArrowLeft />
          </Button>
          <span className="min-w-10 text-center text-xs text-muted-foreground">
            {currentIndex + 1} / {request.questions.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isLastQuestion || isSubmitting}
            aria-label="下一题"
            onClick={() =>
              setCurrentIndex((index) => Math.min(request.questions.length - 1, index + 1))
            }
          >
            <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-3 pb-4">
        {request.details ? <InteractionDetails details={request.details} /> : null}
        {currentQuestion.type === "text" ? (
          <TextQuestionInput
            question={currentQuestion}
            value={currentDraft.text}
            disabled={isSubmitting}
            onChange={(text) => updateDraft(currentQuestion.id, { text })}
          />
        ) : (
          <QuestionOptions
            question={currentQuestion}
            draft={currentDraft}
            disabled={isSubmitting}
            onChange={(selectedOptionIds) => updateDraft(currentQuestion.id, { selectedOptionIds })}
            onOptionInputChange={(optionId, value) =>
              updateDraft(currentQuestion.id, {
                optionInputs: { ...currentDraft.optionInputs, [optionId]: value },
              })
            }
          />
        )}
      </CardContent>

      <CardFooter className="justify-between gap-3 rounded-b-[20px] px-4 py-3">
        <div className="hidden items-center gap-3 text-[10px] text-muted-foreground sm:flex">
          {currentQuestion.type !== "text" ? (
            <span className="flex items-center gap-1">
              <KeyboardKey>
                <ArrowUp />
              </KeyboardKey>
              <KeyboardKey>
                <ArrowDown />
              </KeyboardKey>
              选择
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <KeyboardKey>Esc</KeyboardKey>
            {request.source === "permission" ? "拒绝" : "忽略"}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant={request.source === "permission" ? "destructive" : "ghost"}
            size="sm"
            disabled={isSubmitting}
            onClick={() => void resolve({ status: "dismissed" })}
          >
            {request.source === "permission" ? "拒绝" : "忽略"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSubmitting || (isLastQuestion ? !canSubmit : !canContinue)}
            onClick={continueOrSubmit}
          >
            {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            {isLastQuestion ? (request.source === "permission" ? "确认" : "提交回答") : "继续"}
            {!isSubmitting ? <CornerDownLeft data-icon="inline-end" /> : null}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

interface QuestionOptionsProps {
  disabled: boolean;
  draft: AnswerDraft;
  onChange: (selectedOptionIds: string[]) => void;
  onOptionInputChange: (optionId: string, value: string) => void;
  question: Extract<UserQuestion, { type: "single" | "multiple" }>;
}

function QuestionOptions({
  disabled,
  draft,
  onChange,
  onOptionInputChange,
  question,
}: QuestionOptionsProps) {
  const selectedFollowUps = question.options.filter(
    (option) => draft.selectedOptionIds.includes(option.id) && option.followUp,
  );

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        value={draft.selectedOptionIds}
        multiple={question.type === "multiple"}
        orientation="vertical"
        spacing={1}
        disabled={disabled}
        className="w-full items-stretch"
        onValueChange={onChange}
      >
        {question.options.map((option, index) => {
          const isSelected = draft.selectedOptionIds.includes(option.id);
          return (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              data-question-id={question.id}
              data-option-id={option.id}
              aria-label={option.label}
              className={cn(
                "h-auto min-h-11 w-full justify-start gap-3 rounded-xl border px-3 py-2 text-left whitespace-normal",
                isSelected
                  ? "border-foreground/20 bg-muted text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center border text-xs",
                  question.type === "multiple" ? "rounded-md" : "rounded-full",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {isSelected && question.type === "multiple" ? <Check /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {option.label}
                  {option.recommended ? (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                      推荐
                    </Badge>
                  ) : null}
                </span>
                {option.description ? (
                  <span className="text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {isSelected ? <Check className="text-muted-foreground" /> : null}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {selectedFollowUps.map((option) => (
        <OptionFollowUpInput
          key={option.id}
          option={option}
          value={draft.optionInputs[option.id] ?? ""}
          disabled={disabled}
          onChange={(value) => onOptionInputChange(option.id, value)}
        />
      ))}
    </div>
  );
}

function OptionFollowUpInput({
  disabled,
  onChange,
  option,
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  option: UserQuestionOption;
  value: string;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        value={value}
        disabled={disabled}
        required={option.followUp?.required}
        placeholder={option.followUp?.placeholder}
        aria-label={`${option.label}补充说明`}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  );
}

function TextQuestionInput({
  disabled,
  onChange,
  question,
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  question: Extract<UserQuestion, { type: "text" }>;
  value: string;
}) {
  return (
    <InputGroup>
      <InputGroupTextarea
        autoFocus
        value={value}
        disabled={disabled}
        maxLength={500}
        placeholder={question.placeholder || "输入你的回答…"}
        aria-label={question.question}
        onChange={(event) => onChange(event.target.value)}
      />
      <InputGroupAddon align="block-end" className="justify-end text-[10px]">
        {value.length} / 500
      </InputGroupAddon>
    </InputGroup>
  );
}

function InteractionDetails({
  details,
}: {
  details: NonNullable<UserInteractionRequest["details"]>;
}) {
  return (
    <Collapsible className="overflow-hidden rounded-xl border bg-background/40">
      <CollapsibleTrigger className="group/details flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Command />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            操作详情
          </span>
          <code className="truncate text-xs text-foreground">{details.summary}</code>
        </span>
        <ChevronDown className="text-muted-foreground transition-transform group-data-panel-open/details:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-px border-t bg-border sm:grid-cols-2">
          {details.sections.map((section) => (
            <section key={section.label} className="min-w-0 bg-card p-3">
              <div className="mb-1 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                {section.label}
              </div>
              {section.format === "code" ? (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs leading-5">
                  {section.value}
                </pre>
              ) : (
                <p className="m-0 text-xs leading-5">{section.value}</p>
              )}
            </section>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function KeyboardKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="flex h-5 min-w-5 items-center justify-center rounded border bg-background px-1 font-sans text-[9px] shadow-xs [&>svg]:size-2.5">
      {children}
    </kbd>
  );
}

function createEmptyDraft(): AnswerDraft {
  return { selectedOptionIds: [], text: "", optionInputs: {} };
}

function createInitialDrafts(questions: UserQuestion[]): Record<string, AnswerDraft> {
  return Object.fromEntries(
    questions.map((question) => {
      const recommendedOptionId =
        question.type === "text"
          ? undefined
          : question.options.find((option) => option.recommended)?.id;
      return [
        question.id,
        {
          ...createEmptyDraft(),
          selectedOptionIds: recommendedOptionId ? [recommendedOptionId] : [],
        },
      ];
    }),
  );
}

function isQuestionAnswered(question: UserQuestion, draft: AnswerDraft): boolean {
  if (question.required === false) return true;
  if (question.type === "text") return draft.text.trim().length > 0;
  if (draft.selectedOptionIds.length === 0) return false;

  return question.options.every((option) => {
    if (!draft.selectedOptionIds.includes(option.id) || !option.followUp?.required) return true;
    return (draft.optionInputs[option.id] ?? "").trim().length > 0;
  });
}

function createAnswers(
  questions: UserQuestion[],
  drafts: Record<string, AnswerDraft>,
): UserQuestionAnswer[] {
  return questions.map((question) => {
    const draft = drafts[question.id] ?? createEmptyDraft();
    return {
      questionId: question.id,
      selectedOptionIds: question.type === "text" ? undefined : draft.selectedOptionIds,
      text: question.type === "text" ? draft.text.trim() : undefined,
      optionInputs:
        Object.keys(draft.optionInputs).length > 0
          ? normalizeOptionInputs(draft.optionInputs)
          : undefined,
    };
  });
}

function normalizeOptionInputs(inputs: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(inputs)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value.length > 0),
  );
}

function toggleOption(selectedOptionIds: string[], optionId: string) {
  return selectedOptionIds.includes(optionId)
    ? selectedOptionIds.filter((candidate) => candidate !== optionId)
    : [...selectedOptionIds, optionId];
}
