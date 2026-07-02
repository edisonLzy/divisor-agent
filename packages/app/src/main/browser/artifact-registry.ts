/**
 * Main-side registry mapping browser artifact ids → sessionId. Populated by
 * the renderer via `browserRegisterArtifact` whenever an artifact of type
 * "browser" is upserted (which happens in response to `browser/open`).
 *
 * The new `browser/goto` / `browser/observe` tools read this to know which
 * session/artifact to operate on when the LLM does not pass an explicit
 * `artifactId`.
 */
const artifactToSession = new Map<string, string>();

export function registerBrowserArtifact(artifactId: string, sessionId: string): void {
  artifactToSession.set(artifactId, sessionId);
}

export function unregisterBrowserArtifact(artifactId: string): void {
  artifactToSession.delete(artifactId);
}

export function resolveBrowserArtifact(provided?: string): { sessionId: string; artifactId: string } {
  if (provided && artifactToSession.has(provided)) {
    return { artifactId: provided, sessionId: artifactToSession.get(provided)! };
  }
  const entries = [...artifactToSession.entries()];
  const last = entries[entries.length - 1];
  if (!last) {
    throw new Error(
      "browser tool: no browser artifact found. Call browser/open first to create one.",
    );
  }
  return { artifactId: last[0], sessionId: last[1] };
}