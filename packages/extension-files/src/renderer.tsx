import {
  defineRendererExtension,
  type StreamdownRehypePlugins,
  useExtensionsContextAPI,
} from "@divisor-agent/extension-core/renderer";
import type { AnchorHTMLAttributes } from "react";
import { defaultRehypePlugins } from "streamdown";

import {
  FILE_HREF_DATA_ATTR,
  FILE_HREF_PREFIX,
  FILE_HREF_PROTOCOL,
  FILE_HREF_SCHEME,
  FILES_ARTIFACT_TYPE,
} from "./constants";
import { addOrActivateFile, FilesArtifact } from "./files-artifact";
import { parseFileHref } from "./helper";

interface FileAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
}

export default defineRendererExtension((ctx) => {
  // Intercept custom file links in assistant messages. The renderer is
  // responsible for two things only:
  //   1. Mark the anchor with `data-file-href` so the click is identifiable.
  //   2. On click, call `addOrActivateFile` against the active session.
  // Everything else (parsing, state mutation, opening the panel) is handled
  // by the helpers next to `FilesArtifact`.
  ctx.streamdown.registerComponents({
    a:
      (Base) =>
      ({ href, children, ...rest }: FileAnchorProps) => {
        if (typeof href !== "string" || !href.startsWith(FILE_HREF_PREFIX)) {
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
  ctx.streamdown.registerRehypePlugins(allowFileHrefProtocol);

  ctx.artifacts.register({
    type: FILES_ARTIFACT_TYPE,
    render: FilesArtifact,
  });
});

type RehypePluginTuple = [
  plugin: (...args: any[]) => unknown,
  {
    allowedProtocols?: string[];
    protocols?: Record<string, string[]>;
  } & Record<string, unknown>,
];

function allowFileHrefProtocol(plugins: StreamdownRehypePlugins): StreamdownRehypePlugins {
  return plugins.map((plugin) => {
    if (plugin === defaultRehypePlugins.sanitize) {
      const [sanitize, options] = plugin as unknown as RehypePluginTuple;
      return [
        sanitize,
        {
          ...options,
          protocols: {
            ...options.protocols,
            href: [...(options.protocols?.href ?? []), FILE_HREF_SCHEME],
          },
        },
      ];
    }

    if (plugin === defaultRehypePlugins.harden) {
      const [harden, options] = plugin as unknown as RehypePluginTuple;
      return [
        harden,
        {
          ...options,
          allowedProtocols: [...(options.allowedProtocols ?? []), FILE_HREF_PROTOCOL],
        },
      ];
    }

    return plugin;
  }) as StreamdownRehypePlugins;
}

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
      {...{ [FILE_HREF_DATA_ATTR]: href }}
      href={href}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
