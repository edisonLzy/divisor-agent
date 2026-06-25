/**
 * Re-export the main-process registry so tools can import from a single
 * location. Renderer-side artifact upserts flow into the main registry via
 * the `browserRegisterArtifact` IPC channel.
 */
export {
  registerBrowserArtifact,
  resolveBrowserArtifact,
  unregisterBrowserArtifact,
} from "../../browser/artifact-registry.js";