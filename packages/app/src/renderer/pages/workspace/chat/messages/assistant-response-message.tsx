import { parseExtensionParts, useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { MessageResponse } from "@renderer/components/ai-elements/message";
import { UnknownArtifact, UnknownAssistantBlock } from "@renderer/extensions/fallback-renderers";
import { useMemo } from "react";

interface AssistantResponseMessageProps {
  content: string;
}

export function AssistantResponseMessage({ content }: AssistantResponseMessageProps) {
  const registry = useExtensionRegistry();
  const parts = useMemo(() => parseExtensionParts(content), [content]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return (
            <MessageResponse
              key={`text-${index}`}
              className="text-[15px] leading-7 text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-foreground [&_em]:text-foreground/80 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_pre]:text-foreground [&_span]:text-inherit [&_strong]:text-foreground [&_ul]:text-inherit"
            >
              {part.text}
            </MessageResponse>
          );
        }

        if (!part.payload) {
          return null;
        }

        if (part.kind === "artifact") {
          const artifact = registry.getArtifact(part.payload.type);
          if (!artifact) {
            return (
              <UnknownArtifact
                key={`artifact-${index}`}
                raw={part.payload.raw}
                type={part.payload.type}
              />
            );
          }

          const Artifact = artifact.render;
          return (
            <Artifact
              key={`artifact-${index}`}
              artifactId={part.payload.id ?? `${part.payload.type}-${index}`}
              props={part.payload.props}
              raw={part.payload.raw}
            />
          );
        }

        const block = registry.getAssistantBlock(part.payload.type);
        if (!block) {
          return (
            <UnknownAssistantBlock
              key={`block-${index}`}
              raw={part.payload.raw}
              type={part.payload.type}
            />
          );
        }

        const Block = block.render;
        return <Block key={`block-${index}`} props={part.payload.props} raw={part.payload.raw} />;
      })}
    </>
  );
}
