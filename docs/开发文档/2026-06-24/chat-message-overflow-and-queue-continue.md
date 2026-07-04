# Chat message overflow, artifact panel simplification, and queued-message auto-continue

- **Date:** 2026-06-24
- **Touched:**
  - `packages/app/src/main/agent-runtime.ts`
  - `packages/app/src/renderer/components/ai-elements/message.tsx`
  - `packages/app/src/renderer/pages/workspace/chat/active-session-content.tsx`
  - `packages/app/src/renderer/pages/workspace/chat/messages/assistant-response-message.tsx`
  - `packages/app/src/renderer/pages/workspace/chat/messages/index.tsx`
  - `packages/app/src/renderer/pages/workspace/chat/prompt-input/index.tsx`

## Why

Three independent issues landed together because they all touch the same chat layout/render path and would otherwise require three separate cross-file reviews.

### 1. Wide content broke the chat column

Long unbreakable content (URLs, code fences, tables, inline code that is longer than the message column) was escaping the message bubble and pushing the right edge of the page outward. The visible symptom was a horizontal scrollbar on the chat panel and the artifact panel handle drifting off-screen when a long table or pre block was rendered.

Three layers needed to opt into shrinking/clipping:

- The virtual row container inside `@tanstack/react-virtual` — needs `min-w-0` because the absolute-positioned `transform: translateY(...)` row inherits a `w-full` parent that is otherwise `min-width: auto`, which becomes the natural content width.
- The assistant message wrapper — needed `min-w-0 max-w-full overflow-x-hidden`, plus explicit `overflow-x-auto` on `<pre>` and `<table>` so individual code/table blocks can scroll horizontally **inside** the message instead of the whole page.
- The shared `MessageResponse` (streamdown wrapper) — same `min-w-0 max-w-full overflow-x-hidden` treatment so any extension-rendered markdown behaves identically.

Without `min-w-0`, every flex item in a `min-h-0 flex-1` chain claims its intrinsic content width and silently disables the `overflow-x-hidden` on the ancestor. The message column therefore has to be a `min-w-0` chain end-to-end:

```
ChatMessages (min-w-0 overflow-x-hidden)
  └─ virtual row (absolute, w-full min-w-0)
       └─ inner column (mx-auto w-full max-w-4xl min-w-0)
            └─ AssistantResponseMessage (min-w-0 max-w-full overflow-x-hidden)
                 └─ MessageResponse (min-w-0 max-w-full overflow-x-hidden)
```

The pre and table blocks intentionally keep their own `overflow-x-auto` so wide code/tables stay readable inside the bubble rather than vanishing behind `overflow-x-hidden`.

### 2. Artifact panel mount strategy

The panel used to always render both `ResizablePanel`s and let the artifact side collapse to `0%` via `useArtifactPanel`. That required:

- `usePanelRef` + `useEffect` calling `panel.expand()` / `panel.collapse()` to react to `isArtifactPanelOpen` flips.
- A `ResizableHandle` with `pointer-events-none opacity-0` styling when collapsed.
- A second panel that was mounted but invisible.

The collapsed panel still participated in `react-resizable-panels` internal measurement and reconciliation. On fast open/close toggles this produced visible jank and unnecessary reflow.

The new shape conditional-renders the handle and the artifact panel only when open, and unmounts both on close. A `key={isArtifactPanelOpen ? "with-artifacts" : "chat-only"}` on `ResizablePanelGroup` forces a fresh measurement when the layout transitions, so the main panel always lands at its correct `defaultSize` (`68%` vs `100%`). The previously hand-rolled collapse/expand effect is gone — `useArtifactPanel` and its `usePanelRef` dependency have been deleted.

This is the simpler model: when the panel is closed, no panel exists; the layout chain has fewer participants and fewer derived states. Trade-off: every toggle resets the resize divider position to its `defaultSize`, which matches existing behavior because there is no persisted divider state today.

### 3. Queued messages never auto-continued after a turn

The user can drop follow-up / steering messages into the pending queue while the agent is mid-turn. After the agent ended a turn, the queued messages sat in `pi-agent-core`'s queue but no one called `agent.continue()` to drain them. The renderer had to manually re-invoke prompt through IPC, which:

- Bypassed the agent's own queue semantics.
- Could double-prompt if both renderer-side and runtime-side reacted to the same `agent_end` event.
- Did not work for renderer-less reattach scenarios (reopening the app mid-queue).

`AgentRuntime` now subscribes to `agent_end` and, if the underlying agent reports queued messages, schedules a single `agent.continue()` on the next macrotask. The `setTimeout(..., 0)` is intentional: `agent_end` fires synchronously inside the agent's internal state machine, and calling `continue()` in the same tick re-enters the state machine while it is still unwinding. Deferring to the next tick lets the agent settle.

```ts
private scheduleQueuedContinue() {
  setTimeout(() => {
    if (this.agent.state.isStreaming || !this.agent.hasQueuedMessages()) {
      return;
    }
    this.agent.continue().catch((error) => {
      console.error("Failed to continue queued agent messages", error);
    });
  }, 0);
}
```

The early-return on `isStreaming` defends against the (unlikely) race where the agent has already started another turn by the time the timer fires.

### 4. Failed steer/follow-up left stale pending entries

Previously, `submitSteer` and `submitFollowUp` pushed a pending message into `pending-messages-slice`, then called `invoke("prompt", ...)`. If the IPC call threw, the pending message was never removed — the user's typed message stayed in the "pending" list forever and was no longer associated with any in-flight agent turn.

Both handlers now capture the `timestamp` before pushing, and on rejection call `mainStore.getState().removePendingMessageByTimestamp(sessionId, timestamp)`. The slice already exposes this removal helper (it was used by the agent-event handler in `use-agent-messages.ts`), so no new store API was needed.

### 5. Width consistency between input and message column

The message column was `max-w-4xl` while the prompt input was `max-w-3xl`. With the overflow fixes the mismatch became visually obvious: the input bubble was narrower than the assistant text on the same page. Both now use `max-w-4xl`. The prompt input also no longer `await`s its submit callbacks (`onSteer` / `onFollowUp` / `onSubmit`); they are fire-and-forget so the editor can clear content immediately and the user sees the message leave the input without waiting for the IPC round-trip.

## Code organization

No new files were introduced. The cleanup deliberately:

- Removed `useArtifactPanel` from `active-session-content.tsx` rather than moving it; the conditional-render approach makes the hook obsolete.
- Kept `removePendingMessageByTimestamp` calls inline in the two handlers instead of building a `safeSubmit` wrapper; the duplication is two lines and an explicit per-handler `catch` is easier to read than a generic helper that hides which submission path failed.
- Kept `scheduleQueuedContinue` private inside `AgentRuntime` rather than exposing it as an event; queue draining is the runtime's responsibility, not the renderer's.

## Review checklist

- Long URLs / code blocks / tables inside assistant messages must not push the chat panel beyond its container; verify by pasting a long URL and a wide markdown table.
- Closing and reopening the artifact panel must not leave the divider at a stale width and must not flash the handle.
- Drop two follow-up messages while the agent is mid-turn; both must drain automatically after the current turn ends without the renderer firing extra prompts.
- `invoke("prompt", ...)` rejection (e.g. killing the agent mid-call) must remove the corresponding pending message so the queued list returns to its previous size.
- Editor `clearContent()` must run regardless of IPC success/failure so the user is never stuck with their typed text after submission.