import { defineRendererExtension } from "@divisor-agent/extension-core/renderer";

function ExampleCard({ props }: { props: Record<string, unknown> }) {
  return (
    <div className="rounded-md border bg-card p-3 text-sm text-card-foreground">
      {String(props.title ?? "")}
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

export default defineRendererExtension((ctx) => {
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
});
