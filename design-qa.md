# Design QA — Electron Scheme 01: Split Context Bars

- source visual truth path: `.design-evidence/raft/prototype-desktop.png`
- selected structure/spec path: `docs/原型/electron-variant-01-split-context-bars.html`
- implementation screenshots:
  - `/tmp/divisor-scheme1-active-artifact-light-stable.png`
  - `/tmp/divisor-scheme1-settings-dark.png`
  - `/tmp/divisor-scheme1-settings-light.png`
  - `/tmp/divisor-scheme1-chat-toast-light.png`
- viewport: 1200 × 800 Electron renderer viewport; source visual normalized to the same 800 px height for comparison
- states: active chat, three-pane artifact layout, collapsed sidebar, Settings light/dark, success Toast

## Full-view comparison evidence

`/tmp/divisor-scheme1-full-comparison.png` places the source style study and the rendered Electron implementation in one side-by-side image. The implementation intentionally removes the source study's global yellow product header and follows Scheme 01's later `#electron-variant` override: each product area owns a 48 px drag/header row, with native window-control safe areas.

The comparison confirms the retained visual language: warm canvas, 2 px dark dividers, compact hard shadows, squared controls, pink primary action, cyan/yellow identity blocks, purple artifact header, dense Space Grotesk typography, and a persistent bottom composer. Product data and controls remain those of the existing application.

## Focused region comparison evidence

`/tmp/divisor-scheme1-focused-comparison.png` compares the source's chat/tool density with the implementation's session, message, action, and artifact regions. It confirms consistent border weight, icon scale, colored identity markers, compact metadata, and hard-surface treatment. Additional focused screenshots verify:

- split 48 px headers and artifact panel: `/tmp/divisor-scheme1-active-artifact-light-stable.png`
- native-control-safe collapsed sidebar header: `/tmp/divisor-scheme1-collapsed-artifact-light.png`
- Settings token parity: `/tmp/divisor-scheme1-settings-light.png` and `/tmp/divisor-scheme1-settings-dark.png`
- semantic success Toast: `/tmp/divisor-scheme1-chat-toast-light.png`

## Findings

No actionable P0, P1, or P2 findings remain.

- [P3] Source study and production content density are not pixel-identical.
  Location: chat message stream and settings content.
  Evidence: the source study uses curated mock copy while the implementation renders real session history, model configuration, and existing responsive panels.
  Impact: minor differences in wrapping and vertical rhythm are expected at equivalent viewport sizes.
  Classification: acceptable product constraint; replacing real content would violate the requirement to preserve functionality.

## Required fidelity surfaces

- Fonts and typography: Space Grotesk/Space Mono remain active; display, body, metadata, and code weights preserve the source hierarchy. CJK falls back to the platform sans stack without clipping.
- Spacing and layout rhythm: 48 px split headers align across sidebar/chat/artifact and Settings panes. The 2 px dividers, 3 px hard shadows, compact radii, panel gaps, and composer insets are consistent. Sidebar collapse and artifact resize were exercised without overlap after layout stabilization.
- Colors and visual tokens: light and dark palettes map to semantic yellow, pink, cyan, green, purple, danger, surface, border, and code tokens. No decorative gradients were introduced.
- Image quality and asset fidelity: this workflow has no required raster product imagery. Existing Lucide icons are retained as the product icon system; no fake CSS/HTML artwork replaces source assets.
- Copy and content: existing application labels, dynamic sessions, model names, permission modes, Settings copy, and empty states remain intact. Only visual presentation changed.
- Accessibility and interaction: keyboard focus styling remains visible, native title-bar controls retain safe hit regions, drag regions exclude interactive controls, and light/dark/system selection still persists.

## Patches made since the previous QA pass

- Removed the extra global application header from the production workspace.
- Added independent 48 px draggable context bars for sidebar, chat, artifact, and Settings panes.
- Reserved macOS and Windows/Linux native-control safe areas and synchronized non-macOS symbol color with the active theme.
- Kept the sidebar toggle in the chat header and aligned it across expanded/collapsed states.
- Applied the hard-edge token system to pending states, permissions, overlays, rich-text controls, Settings surfaces, status markers, and empty states.
- Added semantic, hard-edged Sonner Toast styling and verified it through the real copy-message interaction.

## Implementation checklist

- [x] Existing workspace and Settings functionality preserved.
- [x] Scheme 01 split context bars implemented.
- [x] Native Electron controls considered on macOS, Windows, and Linux.
- [x] Sidebar collapse and artifact panel interactions verified.
- [x] Light, dark, and system-derived themes verified.
- [x] Success Toast verified in a real interaction.
- [x] Build, TypeScript, lint, and whitespace checks passed.

## Follow-up polish

- P3 only: re-check native Windows caption-button geometry on a Windows machine before release packaging; the implementation uses Electron's documented overlay path and a 138 px reserved region, but this QA run was performed on macOS.

final result: passed
