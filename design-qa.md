# Design QA — Browser reading annotations prototype

- Source visual truth: current browser artifact interaction and existing project tokens (`signal-*`, hard borders, hard shadows).
- Implementation: `docs/design/browser-reading-annotations.html`.
- Intended viewport/state: desktop browser artifact; article with existing highlights and no page-level annotation panel.

## Evidence

- Static verification passed: the prototype script parses with Node, `git diff --check` passes, and no removed browser-tab annotation controls or `本页标注` section remain in the source.
- Browser-rendered implementation screenshot: unavailable. The in-app Browser URL policy blocked access to the local `file:` prototype after its existing tab was discovered, so it could not be captured or compared.

## Findings

- [P1] Browser-rendered visual review is unavailable.
  - Evidence: the Browser denied access to the local file URL before a DOM snapshot or screenshot could be captured.
  - Impact: layout, typography, overflow and interaction states cannot be visually certified in this environment.
  - Fix: open the prototype in an allowed local preview surface, then capture and compare the desktop default state and the selection/note-popover states.

## Static checks

- Fonts and typography: uses the app's system UI convention for controls and serif article content; rendering not captured.
- Spacing and layout rhythm: right panel and annotation controls in the browser chrome were removed in source; rendering not captured.
- Colors and tokens: hard black borders/shadows and the existing cyan/purple/yellow signal treatment are retained; rendering not captured.
- Image and asset fidelity: no image assets are required; Lucide is used for standard interface icons.
- Copy/content: terminology now frames a reading/learning annotation flow rather than webpage-change requests.

## Implementation checklist

- [x] Remove the `本页标注` section.
- [x] Remove annotation controls and counts from the browser Tab/navigation areas.
- [x] Keep annotation creation and editing as page-local floating interactions.
- [x] Keep global management behind the command palette rather than as a persistent panel.
- [ ] Perform browser-rendered visual QA once local-file access is allowed.

final result: blocked
