# StickyUserMessage fallback implementation

- **Branch:** `refactor/architecture-upgrade`
- **Date:** 2026-06-24
- **Touched:** `ChatMessages`, `UserMessage`, interaction preview
- **Supersedes:** row-local CSS sticky attempts inside the virtualized message item

## Why

The original sticky idea tried to make the existing `UserMessage` stay visible while scrolling through the virtualized chat list. That does not work reliably in the current DOM because the visible row position is owned by `@tanstack/react-virtual`:

```tsx
<div
  className="absolute left-0 top-0 w-full px-2"
  style={{ transform: `translateY(${virtualRow.start}px)` }}
>
  <UserMessage />
</div>
```

Each message row is absolutely positioned under a tall spacer and moved by `transform`. The `UserMessage` bubble is not participating in the normal scroll layout; it is nested inside a transformed virtual row. CSS `position: sticky` only becomes sticky inside a scroll container when the sticky element remains in normal layout flow and can compare its own box against the scrollport. Here, the row's translated position is recalculated by the virtualizer, so the browser never gets the stable sticky geometry that a normal list item would provide.

The visible symptom was: the sticky class could be applied, but the user bubble continued to leave the viewport with its virtual row.

## Sticky condition

For this chat, the desired sticky condition is not "make the current DOM node sticky." It is:

1. Read the virtualizer's current scroll offset.
2. Find the latest user-message row whose measured `end` is above the viewport top.
3. Render that message as the sticky prompt until a newer user message also leaves the viewport.
4. Hide the sticky prompt when no user message has left the viewport.

This matches the product behavior: the sticky prompt is context for the assistant response currently being read, not a second layout mode for the original message row.

## Why not the official TanStack sticky pattern

TanStack Virtual's sticky examples normally keep sticky indexes inside the virtual range. The common pattern is:

- Maintain a list of sticky row indexes.
- Use `rangeExtractor` to force the active sticky index to stay mounted even when it is outside the normal visible range.
- Render the sticky virtual item with `position: sticky; top: 0`.
- Compute the active sticky index from the current virtual range, often by selecting the nearest sticky index at or before `range.startIndex`.

That pattern is good for grouped tables or section headers, where the sticky row is a full-width row owned by the list. It is not a good fit for our current chat message shape:

- The sticky target is not a list section header. It is a right-aligned user bubble nested inside a virtual row.
- The sticky UI should be a special reading aid with only `Click to jump`, not the original message row with copy, edit, rewind, or row measurement behavior.
- Keeping a user row mounted through `rangeExtractor` would couple the fallback to virtual row measurement and could affect row lifecycle, toolbar behavior, and future message actions.
- The chat already uses absolute rows plus `transform`; making one of those rows sticky would require changing row placement or introducing branchy row rendering rules.

The fallback therefore treats sticky prompt rendering as an overlay, not as a virtual row.

## Current implementation

`ChatMessages` still owns the scroll container and the virtualizer. It calls `useStickyUserMessage()` with:

- `messageEntries`
- `scrollRef`
- `sessionId`
- `virtualizer`

The hook derives all user-message indexes from `messageEntries`, owns the active sticky index, and returns the overlay-facing behavior:

- `activeStickyMessage`
- `handleStickyScroll`
- `handleStickyJump`

It updates `activeStickyIndex` from the current virtualizer measurement cache:

```ts
const scrollOffset = virtualizer.scrollOffset ?? scrollRef.current?.scrollTop ?? 0;
const viewportTop = scrollOffset + STICKY_TRIGGER_OFFSET;

let nextStickyIndex: number | null = null;
for (const index of userMessageIndexes) {
  const measurement = virtualizer.measurementsCache[index];
  if (!measurement || measurement.end > viewportTop) {
    break;
  }

  nextStickyIndex = index;
}
```

The selected `AppUserMessage` is rendered by `StickyUserMessage` as an absolutely positioned sibling overlay above the scrollable list:

```tsx
<div className="relative h-full">
  <div ref={scrollRef} className="h-full overflow-y-auto pr-2">
    {/* virtual rows */}
  </div>
  {activeStickyMessage ? (
    <StickyUserMessage message={activeStickyMessage} onJump={handleStickyJump} />
  ) : null}
</div>
```

Clicking `Click to jump` calls `virtualizer.scrollToIndex(activeStickyIndex, { align: "start" })` from inside `useStickyUserMessage`, so the overlay always returns to the source `UserMessage` without leaking sticky index logic back into `ChatMessages`.

## JSONContent is the display source

The sticky prompt renders from `message.jsonContent`, not from `message.content`.

`message.content` is the plain-text projection used by the LLM boundary and copy behavior. It loses rich editor structure such as slash-command mentions and inline skill nodes. `StickyUserMessage` therefore reuses the readonly TipTap editor path:

```ts
const readOnlyEditor = useUserMessageEditor(message.jsonContent);
```

This keeps sticky display aligned with normal `ReadonlyUserMessage` rendering.

## Code organization

The implementation deliberately lives in `packages/app/src/renderer/pages/workspace/chat/messages/user-message.tsx`.

Reasoning:

- `StickyUserMessage` is a user-message presentation variant, not a generic chat overlay.
- `useStickyUserMessage` depends on `AppUserMessage`, `MessageEntry`, `isAgentUserMessage`, and the virtualizer measurement model. Keeping it near `UserMessage` makes the domain boundary obvious.
- `ReadonlyUserMessageContent` was not extracted because it introduced a component layer with no independent reuse. Both `ReadonlyUserMessage` and `StickyUserMessage` can directly call `useUserMessageEditor(message.jsonContent)`.
- This follows the repo convention: colocate private subcomponents and hooks unless multiple files need the abstraction.

The only cross-file connection is that `ChatMessages` imports `StickyUserMessage` and `useStickyUserMessage` from `./user-message`, because `ChatMessages` owns the virtualizer and scroll container. Sticky-specific state, active-index calculation, scroll handling, and jump behavior remain inside `useStickyUserMessage`.

## Interaction constraints

The sticky overlay is intentionally small:

- Show the latest user prompt that has fully left the viewport.
- Render one single-line prompt preview.
- Keep only one action: `Click to jump`.
- Do not show copy, edit, rewind, or collapse controls.
- Keep pointer events local to the overlay while leaving the surrounding layer non-interactive.

This keeps sticky behavior as reading context, not as a duplicate message toolbar.

## Review checklist

- Sticky should appear only after a user row's measured `end` is above the viewport top.
- Sticky should reset when `sessionId` changes.
- Sticky should update on virtualizer change, message-entry change, and scroll.
- Sticky should use `jsonContent` for rendering.
- Jump should scroll to the source user-message index.
- No extra files should be introduced unless another module needs the same abstraction.
