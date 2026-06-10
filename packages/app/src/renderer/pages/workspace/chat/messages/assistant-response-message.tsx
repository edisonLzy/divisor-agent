import {
  DIVISOR_ARTIFACT_LANGUAGE,
  DIVISOR_BLOCK_LANGUAGE,
  parseArtifactPayload,
  parseAssistantBlockPayload,
} from "@divisor-agent/extension-core/common";
import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { MessageResponse } from "@renderer/components/ai-elements/message";
import { Button } from "@renderer/components/ui/button";
import { UnknownAssistantBlock } from "@renderer/extensions/fallback-renderers";
import { mainStore } from "@renderer/store/main";
import { PanelRightOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { CustomRenderer, CustomRendererProps, PluginConfig } from "streamdown";
import { useStore } from "zustand";

interface AssistantResponseMessageProps {
  content: string;
  entryId: string;
  isStreaming: boolean;
  sessionId: string;
}

const assistantMessageClassName =
  "text-[15px] leading-7 text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-foreground [&_em]:text-foreground/80 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_pre]:text-foreground [&_span]:text-inherit [&_strong]:text-foreground [&_ul]:text-inherit";

export function AssistantResponseMessage({
  content,
  entryId,
  isStreaming,
  sessionId,
}: AssistantResponseMessageProps) {
  const plugins = useMemo<PluginConfig>(
    () => ({
      renderers: [
        {
          component: PluginBlockRenderer,
          language: DIVISOR_BLOCK_LANGUAGE,
        } satisfies CustomRenderer,
        {
          component: (props) => (
            <PluginArtifactRenderer {...props} entryId={entryId} sessionId={sessionId} />
          ),
          language: DIVISOR_ARTIFACT_LANGUAGE,
        } satisfies CustomRenderer,
      ],
    }),
    [entryId, sessionId],
  );

  return (
    <MessageResponse
      className={assistantMessageClassName}
      isAnimating={isStreaming}
      plugins={plugins}
    >
      {content}
    </MessageResponse>
  );
}

function PluginBlockRenderer({ code, isIncomplete }: CustomRendererProps) {
  const registry = useExtensionRegistry();
  const result = parseAssistantBlockPayload(code, isIncomplete);

  if (result.status === "pending") {
    return (
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Rendering assistant block...
      </div>
    );
  }

  if (result.status === "invalid") {
    return <UnknownAssistantBlock raw={result.raw} type="invalid divisor-block" />;
  }

  const block = registry.getAssistantBlock(result.payload.type);
  if (!block) {
    return <UnknownAssistantBlock raw={result.payload.raw} type={result.payload.type} />;
  }

  const Block = block.render;
  return <Block props={result.payload.props} raw={result.payload.raw} />;
}

function PluginArtifactRenderer({
  code,
  entryId,
  isIncomplete,
  sessionId,
}: CustomRendererProps & {
  entryId: string;
  sessionId: string;
}) {
  const result = useMemo(() => parseArtifactPayload(code, isIncomplete), [code, isIncomplete]);
  const setActiveArtifactId = useStore(mainStore, (state) => state.setActiveArtifactId);
  const upsertArtifact = useStore(mainStore, (state) => state.upsertArtifact);
  const artifact = useMemo(
    () =>
      result.status === "ready"
        ? {
            ...result.payload,
            id: result.payload.id ?? createFallbackArtifactId(entryId, result.payload.raw),
          }
        : null,
    [entryId, result],
  );

  useEffect(() => {
    if (!artifact) {
      return;
    }

    upsertArtifact(sessionId, artifact);
  }, [artifact, sessionId, upsertArtifact]);

  if (result.status === "pending") {
    return (
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Preparing artifact...
      </div>
    );
  }

  if (result.status === "invalid" || !artifact) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Invalid artifact payload
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="my-2"
      onClick={() => setActiveArtifactId(sessionId, artifact.id)}
    >
      <PanelRightOpen />
      Open artifact
      <span className="max-w-64 truncate text-muted-foreground">{artifact.type}</span>
    </Button>
  );
}

function createFallbackArtifactId(entryId: string, raw: string) {
  let hash = 0;

  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }

  return `${entryId}:${Math.abs(hash).toString(36)}`;
}
