/**
 * Phase A exposes only `browser/goto` and `browser/observe`. Phase B will add
 * the click/type/scroll/press/extract/wait family; Phase C will add multi-tab.
 */
export { browserGotoTool } from "./goto.js";
export { browserObserveTool } from "./observe.js";
export {
  registerBrowserArtifact,
  resolveBrowserArtifact,
  unregisterBrowserArtifact,
} from "./artifact-registry.js";