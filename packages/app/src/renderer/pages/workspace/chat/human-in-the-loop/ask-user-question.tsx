import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import type {
  AskUserQuestionRequest,
  AskUserQuestionResolution,
} from "@shared/ask-user-question-ipc";
import { CornerDownLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

interface AskUserQuestionPanelProps {
  sessionId: string;
}

interface DraftAnswer {
  customAnswer: string;
  customSelected: boolean;
  selectedOptions: string[];
}

export function AskUserQuestionInteractionPanel({ sessionId }: AskUserQuestionPanelProps) {
  const { isSubmitting, request, submit } = useCurrentAskUserQuestionRequest(sessionId);
  if (!request) return null;

  return (
    <AskUserQuestionContent
      key={request.requestId}
      isSubmitting={isSubmitting}
      request={request}
      submit={submit}
    />
  );
}

interface AskUserQuestionContentProps {
  isSubmitting: boolean;
  request: AskUserQuestionRequest;
  submit: (resolution: AskUserQuestionResolution) => Promise<void>;
}

function AskUserQuestionContent({ isSubmitting, request, submit }: AskUserQuestionContentProps) {
  const [answers, setAnswers] = useState<Record<number, DraftAnswer>>({});
  const [additionalNote, setAdditionalNote] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    setAnswers({});
    setAdditionalNote("");
    setQuestionIndex(0);
    setIsReviewing(false);
  }, [request?.requestId]);

  const question = request.questions[questionIndex];
  const answer = answers[questionIndex] ?? createEmptyAnswer();
  const isAnswerValid =
    answer.selectedOptions.length > 0 ||
    (answer.customSelected && Boolean(answer.customAnswer.trim()));
  const allAnswersValid = request.questions.every((_, index) => {
    const candidate = answers[index] ?? createEmptyAnswer();
    return (
      candidate.selectedOptions.length > 0 ||
      (candidate.customSelected && Boolean(candidate.customAnswer.trim()))
    );
  });

  function updateAnswer(next: DraftAnswer) {
    setAnswers((current) => ({ ...current, [questionIndex]: next }));
  }

  function toggleOption(label: string) {
    if (question.multiSelect) {
      updateAnswer({
        ...answer,
        selectedOptions: answer.selectedOptions.includes(label)
          ? answer.selectedOptions.filter((option) => option !== label)
          : [...answer.selectedOptions, label],
      });
      return;
    }
    updateAnswer({ ...answer, customSelected: false, selectedOptions: [label] });
  }

  function toggleCustom() {
    updateAnswer({
      ...answer,
      customSelected: !answer.customSelected,
      selectedOptions: question.multiSelect ? answer.selectedOptions : [],
    });
  }

  function continueToNext() {
    if (!isAnswerValid) return;
    if (questionIndex < request.questions.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    setIsReviewing(true);
  }

  async function submitAnswers() {
    if (!allAnswersValid || isSubmitting) return;
    await submit({
      answers: request.questions.map((item, index) => {
        const draft = answers[index] ?? createEmptyAnswer();
        return {
          question: item.question,
          selectedOptions: draft.selectedOptions,
          customAnswer: draft.customSelected ? draft.customAnswer.trim() : undefined,
        };
      }),
      additionalNote: additionalNote.trim() || undefined,
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isSubmitting || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Enter") {
        event.preventDefault();
        if (isReviewing) void submitAnswers();
        else continueToNext();
      }
      if (event.key === "ArrowLeft" && !isReviewing && questionIndex > 0) {
        event.preventDefault();
        setQuestionIndex((current) => current - 1);
      }
      const optionIndex = Number(event.key) - 1;
      if (!isReviewing && optionIndex >= 0 && optionIndex < question.options.length) {
        toggleOption(question.options[optionIndex].label);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (isReviewing) {
    return (
      <section className="overflow-hidden rounded-md border-2 border-border bg-card text-card-foreground shadow-[var(--hard-shadow)]">
        <div className="h-2 border-b-2 border-border bg-signal-cyan" />
        <header className="flex items-start justify-between gap-4 px-4 py-3">
          <div>
            <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              Ask User Question · 回答汇总
            </div>
            <h2 className="mt-1 text-[16px] font-bold">请确认你的回答</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">确认前可以返回修改任意问题。</p>
          </div>
          <span className="rounded-sm border-2 border-border bg-muted px-2 py-1 font-mono text-[10px] font-bold">
            {request.questions.length} / {request.questions.length}
          </span>
        </header>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="overflow-hidden rounded-sm border-2 border-border">
            {request.questions.map((item, index) => {
              const draft = answers[index] ?? createEmptyAnswer();
              const values = [
                ...draft.selectedOptions,
                ...(draft.customSelected && draft.customAnswer.trim()
                  ? [draft.customAnswer.trim()]
                  : []),
              ];
              return (
                <button
                  key={item.question}
                  type="button"
                  className="grid w-full grid-cols-[132px_minmax(0,1fr)] border-b-2 border-border text-left text-[12px] last:border-b-0"
                  onClick={() => {
                    setQuestionIndex(index);
                    setIsReviewing(false);
                  }}
                >
                  <span className="border-r-2 border-border bg-muted px-3 py-2 font-bold">
                    {String(index + 1).padStart(2, "0")} · {item.header}
                  </span>
                  <span className="px-3 py-2">{values.join("、")}</span>
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="ask-additional-note" className="mb-1.5 block text-[12px] font-bold">
              还有什么想补充给 Agent？（可选）
            </label>
            <Textarea
              id="ask-additional-note"
              value={additionalNote}
              maxLength={500}
              placeholder="补充跨问题的约束、背景或期望结果…"
              onChange={(event) => setAdditionalNote(event.target.value)}
            />
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t-2 border-border bg-muted p-3">
          <span className="font-mono text-[10px] text-muted-foreground">Enter 确认提交</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsReviewing(false)} disabled={isSubmitting}>
              返回修改
            </Button>
            <Button
              onClick={() => void submitAnswers()}
              disabled={!allAnswersValid || isSubmitting}
            >
              确认并继续
              <CornerDownLeft data-icon="inline-end" />
            </Button>
          </div>
        </footer>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border-2 border-border bg-card text-card-foreground shadow-[var(--hard-shadow)]">
      <div className="h-2 border-b-2 border-border bg-signal-cyan" />
      <header className="flex items-start justify-between gap-4 px-4 py-3">
        <div>
          <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Ask User Question · {question.header}
          </div>
          <h2 className="mt-1 text-[16px] font-bold">{question.question}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {question.multiSelect
              ? "可选择多项，也可以补充自己的答案。"
              : "选择一项，或输入自己的答案。"}
          </p>
        </div>
        <span className="rounded-sm border-2 border-border bg-muted px-2 py-1 font-mono text-[10px] font-bold">
          {questionIndex + 1} / {request.questions.length}
        </span>
      </header>

      <div className="flex flex-col gap-2 px-4 pb-4">
        {question.options.map((option, index) => {
          const selected = answer.selectedOptions.includes(option.label);
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={selected}
              className={cn(
                "grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-sm border-2 border-border p-2.5 text-left",
                selected
                  ? "-translate-x-px -translate-y-px bg-accent text-accent-foreground shadow-[var(--hard-shadow-sm)]"
                  : "bg-background hover:bg-muted",
              )}
              onClick={() => toggleOption(option.label)}
            >
              <span className="flex size-6 items-center justify-center rounded-sm border-2 border-border bg-card font-mono text-[11px] font-bold">
                {question.multiSelect && selected ? "✓" : index + 1}
              </span>
              <span>
                <span className="block text-[13px] font-bold">{option.label}</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}

        <button
          type="button"
          aria-pressed={answer.customSelected}
          className={cn(
            "grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-sm border-2 border-border p-2.5 text-left",
            answer.customSelected
              ? "-translate-x-px -translate-y-px bg-accent text-accent-foreground shadow-[var(--hard-shadow-sm)]"
              : "bg-background hover:bg-muted",
          )}
          onClick={toggleCustom}
        >
          <span className="flex size-6 items-center justify-center rounded-sm border-2 border-border bg-card font-mono text-[11px] font-bold">
            {question.options.length + 1}
          </span>
          <span>
            <span className="block text-[13px] font-bold">其他，请说明</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
              输入未被以上选项覆盖的答案。
            </span>
          </span>
        </button>

        {answer.customSelected ? (
          <Textarea
            autoFocus
            value={answer.customAnswer}
            maxLength={300}
            placeholder="请输入你的答案…"
            onChange={(event) => updateAnswer({ ...answer, customAnswer: event.target.value })}
          />
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t-2 border-border bg-muted p-3">
        <span className="font-mono text-[10px] text-muted-foreground">数字键选择 · Enter 继续</span>
        <div className="flex gap-2">
          {questionIndex > 0 ? (
            <Button variant="outline" onClick={() => setQuestionIndex((current) => current - 1)}>
              上一步
            </Button>
          ) : null}
          <Button onClick={continueToNext} disabled={!isAnswerValid}>
            {questionIndex === request.questions.length - 1 ? "查看汇总" : "继续"}
            <CornerDownLeft data-icon="inline-end" />
          </Button>
        </div>
      </footer>
    </section>
  );
}

function createEmptyAnswer(): DraftAnswer {
  return { customAnswer: "", customSelected: false, selectedOptions: [] };
}

function useCurrentAskUserQuestionRequest(sessionId: string) {
  const { invoke } = useElectronIPC();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const request = useStore(mainStore, (state) => {
    const current = state.getHumanInTheLoopState(sessionId).requests[0];
    return current?.kind === "ask_user_question" ? current : null;
  });

  async function submit(resolution: AskUserQuestionResolution) {
    if (!request || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await invoke("resolveAskUserQuestion", sessionId, request.requestId, resolution);
      mainStore.getState().resolveHumanInTheLoopRequest(sessionId, request.requestId, resolution);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交回答失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return { isSubmitting, request, submit };
}
