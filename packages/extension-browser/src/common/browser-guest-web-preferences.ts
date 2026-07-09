// Guest web preferences shared between the main-owned legacy path and the
// <webview>-based renderer path. Mirrors the config the WebContentsView path
// used (sandbox/contextIsolation/nodeIntegration/webSecurity) so the security
// baseline is unchanged after the migration.
//
// The string follows the window.open features format consumed by Electron's
// <webview webpreferences> attribute: a name alone means `true`, `name=value`
// sets an explicit value.

export const BROWSER_GUEST_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
} as const;

export const BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE =
  "contextIsolation=true,nodeIntegration=false,sandbox=true,webSecurity=true";
