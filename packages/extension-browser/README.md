# @divisor-agent/extension-browser

Read-oriented browser extension with AI-native, in-page reading annotations.

The browser surface is a renderer-owned Electron `<webview>` that the main process registers and
manages. The main process owns persistent profile partitions, navigation policy, accessibility
snapshots, screenshots, Chromium cookie import, and annotation persistence. Agent tools may open
and navigate pages or read page state; they cannot click, type, upload, execute page scripts, or
access cookies.

HTTP(S) links in assistant messages open the current session's Browser Artifact and navigate its
single page. Use the external-link control beside the Profile button in the address toolbar when
the current URL should instead open in the system browser.

## Reading annotations

Select text directly in a page to add a colored annotation. The page-local toolbar lets readers
classify the selection as a vocabulary word, useful sentence, key point, idea, or question, then
either add a Markdown note or send the selected passage and its context to the shared AI prompt.
Clicking an existing highlight reopens its note, changes its tag, navigates between annotations, or
removes it.

The persistent reading-annotation button in the Artifact's bottom-right corner opens a local action
panel for highlighting mode, navigation, and tag filtering. It is not part of the
address toolbar:

- `⌘/Ctrl + Shift + H` turns page highlighting on or off.
- `Alt + ↑/↓` moves through the visible annotations.

Annotations are stored locally per normalized page URL in Electron user data. To mirror changes to
an existing NoteBeam service, configure both `NOTE_BEAM_API_BASE_URL` and
`NOTE_BEAM_ACCESS_TOKEN` in the Electron main-process environment. Without both values, no
annotation data is sent over the network.

The accessibility snapshot/ref model and profile isolation were informed by the MIT-licensed
[stablyai/orca](https://github.com/stablyai/orca) implementation.
