/**
 * Browser tool family exposed to the agent.
 *
 * Phase A: goto + observe
 * Phase B: + click / type / press / scroll / back / forward / extract / wait
 * Phase C: + openTab / switchTab / closeTab / listTabs (multi-tab)
 */
export { browserGotoTool } from "./goto.js";
export { browserObserveTool } from "./observe.js";
export { browserClickTool } from "./click.js";
export { browserTypeTool } from "./type.js";
export { browserPressTool } from "./press.js";
export { browserScrollTool } from "./scroll.js";
export { browserBackTool } from "./back.js";
export { browserForwardTool } from "./forward.js";
export { browserExtractTool } from "./extract.js";
export { browserWaitTool } from "./wait.js";
export { browserOpenTabTool } from "./open-tab.js";
export { browserSwitchTabTool } from "./switch-tab.js";
export { browserCloseTabTool } from "./close-tab.js";
export { browserListTabsTool } from "./list-tabs.js";
export {
  registerBrowserArtifact,
  resolveBrowserArtifact,
  unregisterBrowserArtifact,
} from "./artifact-registry.js";