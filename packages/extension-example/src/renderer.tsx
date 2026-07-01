import {
  createExtensionIPC,
  defineRendererExtension,
} from "@divisor-agent/extension-core/renderer";
import { useEffect, useState } from "react";

import {
  type AllowedRenderInvokeEvents,
  type AllowedMainExposeEvents,
  type ExampleState,
} from "./common/example-ipc";
import { EXAMPLE_EXTENSION } from "./common/example-meta";

const useExampleIPC = createExtensionIPC<AllowedRenderInvokeEvents, AllowedMainExposeEvents>(
  EXAMPLE_EXTENSION.id,
);

function ExampleCard({ props }: { props: Record<string, unknown> }) {
  const ipc = useExampleIPC();
  const [state, setState] = useState<ExampleState>();

  useEffect(() => {
    void ipc.invoke("getState").then(setState);
    return ipc.on("stateChanged", setState);
  }, [ipc]);

  return (
    <div className="rounded-md border bg-card p-3 text-sm text-card-foreground">
      <div>{String(props.title ?? "")}</div>
      <div className="text-muted-foreground">Greetings: {state?.greetingCount ?? 0}</div>
      <button
        type="button"
        className="mt-2 rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
        onClick={() => {
          void ipc.invoke("incrementGreeting");
        }}
      >
        +1 Greeting
      </button>
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
