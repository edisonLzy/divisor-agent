# @divisor-agent/extension-browser

Read-oriented browser extension backed by Electron `WebContentsView`.

The main process owns browser views, persistent partitions, navigation policy, accessibility
snapshots, screenshots, element selection, and Chromium cookie import. The renderer owns only the
Artifact controls and surface bounds. Agent tools may open and navigate pages or read page state;
they cannot click, type, upload, execute page scripts, or access cookies.

The accessibility snapshot/ref model, profile isolation, and browser-selection workflow were
informed by the MIT-licensed [stablyai/orca](https://github.com/stablyai/orca) implementation. This
extension uses a main-owned `WebContentsView` architecture instead of Orca's renderer-owned
`<webview>` architecture.
