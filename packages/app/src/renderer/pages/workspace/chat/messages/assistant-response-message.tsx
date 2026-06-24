import {
  DIVISOR_BLOCK_LANGUAGE,
  parseAssistantBlockPayload,
} from "@divisor-agent/extension-core/common";
import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { MessageResponse } from "@renderer/components/ai-elements/message";
import { UnknownAssistantBlock } from "@renderer/extensions/fallback-renderers";
import { useMemo } from "react";
import type {
  Components as StreamdownComponents,
  CustomRenderer,
  CustomRendererProps,
  PluginConfig,
} from "streamdown";
import { defaultRehypePlugins } from "streamdown";

interface AssistantResponseMessageProps {
  content: string;
  entryId: string;
  isStreaming: boolean;
  sessionId: string;
}

const assistantMessageClassName =
  "min-w-0 max-w-full overflow-x-hidden text-[15px] leading-7 text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-foreground [&_em]:text-foreground/80 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-foreground [&_span]:text-inherit [&_strong]:text-foreground [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:text-inherit";

export function AssistantResponseMessage({ content, isStreaming }: AssistantResponseMessageProps) {
  const registry = useExtensionRegistry();
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

  // Pull composed Streamdown component overrides from all installed extensions
  // (e.g. `extension-files` registers a custom `a` to intercept `file://`
  // links). The registry is the single source of truth — this component does
  // not need to know which extensions contribute which keys.
  const components = useMemo<Partial<StreamdownComponents>>(
    () => registry.getStreamdownComponents(),
    [registry],
  );
  const rehypePlugins = useMemo(
    () => registry.getStreamdownRehypePlugins(Object.values(defaultRehypePlugins)),
    [registry],
  );

  return (
    <MessageResponse
      className={assistantMessageClassName}
      components={components}
      isAnimating={isStreaming}
      plugins={plugins}
      rehypePlugins={rehypePlugins}
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
