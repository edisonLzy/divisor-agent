import {
  DIVISOR_BLOCK_LANGUAGE,
  parseAssistantBlockPayload,
} from "@divisor-agent/extension-core/common";
import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { MessageResponse } from "@renderer/components/ai-elements/message";
import { UnknownAssistantBlock } from "@renderer/extensions/fallback-renderers";
import { useMemo } from "react";
import type { CustomRenderer, CustomRendererProps, PluginConfig } from "streamdown";

interface AssistantResponseMessageProps {
  content: string;
  entryId: string;
  isStreaming: boolean;
  sessionId: string;
}

const assistantMessageClassName =
  "text-[15px] leading-7 text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-foreground [&_em]:text-foreground/80 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_pre]:text-foreground [&_span]:text-inherit [&_strong]:text-foreground [&_ul]:text-inherit";

export function AssistantResponseMessage({ content, isStreaming }: AssistantResponseMessageProps) {
  const plugins = useMemo<PluginConfig>(
    () => ({
      renderers: [
        {
          component: PluginBlockRenderer,
          language: DIVISOR_BLOCK_LANGUAGE,
        } satisfies CustomRenderer,
      ],
    }),
    [],
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
