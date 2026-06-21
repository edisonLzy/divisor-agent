import type { Extension } from "@codemirror/state";

/**
 * Map file extensions to CodeMirror language extensions. Each loader is
 * dynamic-imported on demand so unused language packs never enter the
 * bundle. Unknown extensions return `undefined` and fall back to plain
 * text rendering.
 *
 * To add a new language: add an entry to `MAP` and install the matching
 * `@codemirror/lang-*` package (transitively available via pnpm's hoisted
 * node_modules — they don't need to be listed in `peerDependencies`).
 */

type LanguageLoader = () => Promise<Extension | Extension[]>;

const MAP: Record<string, LanguageLoader> = {
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  rs: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ jsx: true, typescript: true }),
    ),
};

/** Returns the language key (extension) if recognized, else `undefined`. */
export function languageFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return ext in MAP ? ext : undefined;
}

/** Resolves the CodeMirror language extension for the given key, or `null`. */
export function loadLanguageExtension(lang: string | undefined): Promise<Extension[]> | null {
  if (!lang) return null;
  const loader = MAP[lang];
  if (!loader) return null;
  return loader().then((ext) => (Array.isArray(ext) ? ext : [ext]));
}
