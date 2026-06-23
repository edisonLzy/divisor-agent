# Agent message: lift to shared, lift to a real type

- **Branch:** `refactor/architecture-upgrade`
- **Date:** 2026-06-23
- **Touched:** 25 files, +241 / −164
- **Supersedes:** the renderer-local `AgentUserMessage` interface + `createAgentUserMessage()` factory

## Why

Two smells were bundled in this refactor:

1. **Cross-process type drift.** The renderer declared its own `AgentUserMessage` interface (`renderer/store/entries-slice.ts`) that extended `UserMessage` with `content: JSONContent` and `text: string`. The main process `agent-runtime.ts` only saw `(content: string, metadata?)` — the TipTap JSON tree, the model selector id, and the chosen skillIds all arrived separately. There was no single canonical user-message shape, and the renderer-only factory `createAgentUserMessage()` couldn't be called from main or from extension packages.
2. **Lost rich-text on edit-rewind.** When a user edited and resubmitted a message, the resubmit path sent only the plain text back across IPC. The TipTap `jsonContent` from the original entry was discarded. The edited text lost any `@-mention` nodes, skill decorations, or formatting round-trip.

We fix both by declaring **one** user-message type — `AppUserMessage` — via module augmentation against `@earendil-works/pi-agent-core`, defined in `shared/agent-message.ts` so it is reachable from renderer, main, and extension packages without any one side re-importing the others.

## How

### New canonical type

`packages/app/src/shared/agent-message.ts` (new):

```ts
import "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { JSONContent } from "@tiptap/core";
import type { AvailableModel } from "./models-ipc";

declare module "@earendil-works/pi-agent-core" {
  type AppUserMessageKind = "prompt" | "follow-up" | "steering";

  interface AppUserMessage extends UserMessage {
    kind: AppUserMessageKind;
    jsonContent: JSONContent;
    metadata?: {
      model?: Pick<AvailableModel, "modelId" | "providerId">;
      skillIds?: string[];
    };
  }

  interface CustomAgentMessages {
    AppUserMessage: AppUserMessage;
  }
}
```

Notes:

- `jsonContent` is the source of truth for the rich-text tree; `content: string` remains the plain-text projection sent to the LLM.
- `kind` is a discriminator so initial prompts, follow-ups (regenerate), and mid-stream steering can carry different semantics without further signature changes.
- The augmentation attaches to the upstream `AgentMessage` union via `CustomAgentMessages`, so `AgentMessage` will include `AppUserMessage` automatically — no local `AgentMessageData = Exclude<AgentMessage, UserMessage> | AgentUserMessage` shim needed any more.

### IPC signature change

`packages/app/src/shared/session-ipc.ts`:

- `PromptMetadata` interface deleted.
- `prompt: (sessionId, content: string, metadata?: PromptMetadata)` → `prompt: (sessionId, message: AppUserMessage)`.
- The renderer, the main-process agent pool, the extension runtime service, and the subagents extension all see the same shape.

### Renderer-side moves

- `renderer/lib/agent-message.ts` deleted (the `createAgentUserMessage` factory and the `agentMessageToRuntimeMessage` adapter).
- `renderer/lib/rich-text.ts` (new) holds the lone survivor: `createTextDocument(text)` returning a single-paragraph TipTap doc.
- `renderer/store/entries-slice.ts` drops the local `AgentUserMessage` interface. `AgentMessageData` is now simply `AgentMessage`.
- `renderer/lib/is.ts`: `isAgentUserMessage` narrows to the upstream `AppUserMessage`.

Every call site that used to build `(text, metadata?)` and the factory now builds a literal `AppUserMessage`:

```ts
const appUserMessage: AppUserMessage = {
  role: "user",
  content: submission.content,
  timestamp: Date.now(),
  kind: "prompt",
  jsonContent: submission.jsonContent,
  metadata: {
    model: { modelId, providerId },
    skillIds,
  },
};
await invoke("prompt", sessionId, appUserMessage);
```

`PromptSubmission.text` was renamed to `PromptSubmission.content` to match the upstream `UserMessage` field. Side-chat dedupe in `App.tsx` now compares `data.content === input.text` instead of the legacy `text` accessor.

### Main-side projection

`packages/app/src/main/agent-runtime.ts`:

- New `convertToLlm` adapter on the `Agent` constructor:
  ```ts
  convertToLlm: (messages) => messages.flatMap((message): Message[] => {
    if (message.role === "user") {
      return [{ role: "user", content: message.content, timestamp: message.timestamp }];
    }
    if (message.role === "assistant" || message.role === "toolResult") {
      return [message];
    }
    return [];
  })
  ```
  This projects each `AppUserMessage` (which carries `jsonContent`) back to a vanilla `UserMessage` (plain `content`) when handing the history to the LLM. The in-memory history still keeps `jsonContent` for edit-rewind.
- `prompt(message)` reads `message.metadata?.model` (drives `setModel`), runs skill expansion on `message.content`, then calls `agent.prompt({ ...message, content })`. The spread keeps `jsonContent` on the stored message so a later edit-resubmit round-trip preserves the TipTap tree.

### Extension surface

- `extension-core/src/main/define.ts`: `MainExtensionRuntimeAPI.promptAgent(agentId, content: string, metadata?)` → `promptAgent(agentId, message: AppUserMessage)`.
- `extension-subagents/src/main.ts`: the subagent task body now constructs an `AppUserMessage` literal inline (using `createTextDocument`-style JSON for `jsonContent`) before calling `ctx.runtime.promptAgent(agent.id, appUserMessage)`. Extensions no longer depend on the renderer to build user messages.

### Event-handler tightening

`use-agent-messages.ts` and `use-side-chat-messages.tsx` switched from `message.role !== "assistant"` guards to `isAgentAssistantMessage` / `isAgentUserMessage`. The `message_start` handler now appends a user entry when the start event carries a user message — relevant because prompts round-trip back through the runtime as `message_start` events after `setHistoryMessages` (e.g. on edit-rewind), and the renderer previously silently dropped those user-role start events.

### Tests

`packages/app/__tests__/main/agent-runtime.test.ts` rewritten to construct full `AppUserMessage` literals. `Type.Array` added to the `pi-ai` mock since the type system starts using it.

## Trade-offs

- **Why not just pass `JSONContent` to the LLM and drop the `content: string` projection?** Upstream `Agent`/`UserMessage` already do string-only conversion for the LLM. Adding a TipTap-aware `convertToLlm` that round-trips the JSON would couple our agent runtime to the editor's schema. Keeping both fields — `content` for the wire, `jsonContent` for the editor — and projecting at the boundary stays inside the upstream contract.
- **Why module augmentation rather than a barrel-exported `AppUserMessage` type?** Augmentation flows into the upstream `AgentMessage` union automatically, so existing code that iterates `AgentMessage[]` keeps type-checking without a parallel `AgentMessageData` alias. A barrel would also violate the project's "no barrel-export files" convention.
- **`kind: "prompt" | "follow-up" | "steering"` is declared but not yet discriminated anywhere.** It's there so future work (steering during a running turn, regenerate vs. follow-up semantics) doesn't have to revisit this signature again.

## What to watch for in review

- Any leftover `createAgentUserMessage` import — should be zero after this lands.
- Any leftover `(sessionId, text, metadata)` signature — should be zero.
- Any `(message.role !== "assistant")` guard that should now use `isAgentAssistantMessage`.
- `agent.prompt({ ...message, content })` — make sure callers don't drop `jsonContent` inadvertently; the spread-then-overwrite pattern is load-bearing for the edit-rewind round-trip.

## Related

- [[pi-agent-core-依赖迁移-2026-06-23]] — the `@mariozechner/*` → `@earendil-works/*` migration that this refactor builds on.
- [[pi-agent-core-版本选择-2026-06-23]] — pin rationale for the upstream `Agent` API.