import {
  createExtensionIPC,
  defineRendererExtension,
  useSharedPromptEditor,
} from "@divisor-agent/extension-core/renderer";
import { useEffect, useState } from "react";

import {
  type AllowedRenderInvokeEvents,
  type AllowedMainExposeEvents,
  type ExampleState,
} from "./common/example-ipc";
import { EXAMPLE_EXTENSION } from "./common/example-meta";
import {
  EXAMPLE_TAG_NODE_NAME,
  exampleTagNode,
  insertExampleTagNode,
} from "./common/example-tag-node";

const useExampleIPC = createExtensionIPC<AllowedRenderInvokeEvents, AllowedMainExposeEvents>(
  EXAMPLE_EXTENSION.id,
);

function ExampleCard({ props }: { props: Record<string, unknown> }) {
  const ipc = useExampleIPC();
  const sharedEditor = useSharedPromptEditor().editor;
  const [state, setState] = useState<ExampleState>();

  useEffect(() => {
    void ipc.invoke("getState").then(setState);
    return ipc.on("stateChanged", setState);
  }, [ipc]);

  const insertMarkerIntoPrompt = () => {
    if (!sharedEditor) {
      // Editor not mounted yet (e.g. permission panel open, or session not active).
      console.warn("[extension-example] prompt editor unavailable; nothing inserted");
      return;
    }

    const title = String(props.title ?? "Example");
    // Demonstrates: a plain-text marker the agent can recognize, plus a
    // structured tipTap node would go here if the schema registered it.
    const marker = `\n[example-card:${JSON.stringify({ title })}]\n`;

    sharedEditor.chain().focus().insertContentAt(sharedEditor.state.doc.content.size, marker).run();
  };

  const insertTagIntoPrompt = () => {
    if (!sharedEditor) {
      console.warn("[extension-example] prompt editor unavailable; nothing inserted");
      return;
    }

    insertExampleTagNode({ editor: sharedEditor, label: String(props.title ?? "demo") });
  };

  return (
    <div className="rounded-md border bg-card p-3 text-sm text-card-foreground">
      <div>{String(props.title ?? "")}</div>
      <div className="text-muted-foreground">Greetings: {state?.greetingCount ?? 0}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            void ipc.invoke("incrementGreeting");
          }}
        >
          +1 Greeting
        </button>
        <button
          type="button"
          className="rounded border bg-background px-3 py-1 text-xs text-foreground hover:bg-accent"
          onClick={insertMarkerIntoPrompt}
          title={
            sharedEditor
              ? "Insert this card's marker into the active prompt"
              : "Prompt editor not available"
          }
        >
          Insert marker into prompt
        </button>
        <button
          type="button"
          className="rounded border bg-background px-3 py-1 text-xs text-foreground hover:bg-accent"
          onClick={insertTagIntoPrompt}
          title={
            sharedEditor
              ? `Insert a <${EXAMPLE_TAG_NODE_NAME}> node into the active prompt`
              : "Prompt editor not available"
          }
        >
          Insert example tag node
        </button>
      </div>
    </div>
  );
}

function ExampleArtifact({
  artifactId,
  content,
  sessionId,
}: {
  artifactId: string;
  content: Record<string, unknown>;
  sessionId: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3 text-sm text-card-foreground">
      <div className="font-medium">{String(content.title ?? "Example artifact")}</div>
      <div className="mt-1 text-muted-foreground">
        {artifactId} · {sessionId}
      </div>
    </div>
  );
}

export default defineRendererExtension({
  ...EXAMPLE_EXTENSION,
  setup(ctx) {
    ctx.slashCommands.register({
      id: "example.insert-card",
      group: "Example",
      name: "Insert example card",
      description: "Insert a prompt asking for an example card",
      run({ editor, range }) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent("Create an example.card divisor-block with title Hello.")
          .run();
      },
    });

    // Demo: register a custom TipTap node via the promptInput extension point.
    // The host merges registered extensions into the prompt editor's
    // `extensions` array, so this node is recognized wherever the prompt
    // editor is mounted.
    ctx.promptInput.registerExtension(exampleTagNode);

    ctx.assistantBlocks.register({
      type: "example.card",
      render: ExampleCard,
    });

    ctx.artifacts.register({
      type: "example.artifact",
      render: ExampleArtifact,
    });
  },
});
