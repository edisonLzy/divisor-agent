import {
  defineRendererExtension,
  useExtensionsContextAPI,
} from "@divisor-agent/extension-core/renderer";
import type { AnchorHTMLAttributes } from "react";

import { FILES_ARTIFACT_TYPE, parseFileHref } from "./file-href";
import { addOrActivateFile, FilesArtifact } from "./files-artifact";

interface FileAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
}

export default defineRendererExtension((ctx) => {
  // Intercept `file://` links in assistant messages. The renderer is
  // responsible for two things only:
  //   1. Mark the anchor with `data-file-href` so the click is identifiable.
  //   2. On click, call `addOrActivateFile` against the active session.
  // Everything else (parsing, state mutation, opening the panel) is handled
  // by the helpers next to `FilesArtifact`.
  ctx.streamdown.registerComponents({
    a:
      (Base) =>
      ({ href, children, ...rest }: FileAnchorProps) => {
        if (typeof href !== "string" || !href.startsWith("file://")) {
          const Component = Base;
          return (
            <Component href={href} {...rest}>
              {children}
            </Component>
          );
        }
        return <FileLink href={href}>{children}</FileLink>;
      },
  });

  ctx.artifacts.register({
    type: FILES_ARTIFACT_TYPE,
    render: FilesArtifact,
  });
});

function FileLink({ href, children }: { children: React.ReactNode; href: string }) {
  const api = useExtensionsContextAPI();
  const parsed = parseFileHref(href);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!parsed) return;
    // Allow modifier-clicks to open in a new tab as a fallback.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const sessionId = api.getActiveSessionId();
    if (!sessionId) return;
    addOrActivateFile(api, sessionId, parsed);
  };

  return (
    <a
      className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-4 decoration-dotted hover:decoration-solid"
      data-file-href={href}
      href={href}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
