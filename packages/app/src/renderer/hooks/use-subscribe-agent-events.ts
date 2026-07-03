import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { AllowedMainExposeEvents } from "@shared/events-ipc";
import { useEffect, useRef } from "react";

export type AgentEventHandlers = {
  [K in keyof AllowedMainExposeEvents]?: (event: AllowedMainExposeEvents[K]) => void;
};

type AgentEventPayload = AllowedMainExposeEvents[keyof AllowedMainExposeEvents];

interface AgentEventSubscriptionOptions {
  shouldHandleEvent?: (event: AgentEventPayload) => boolean;
}

/**
 * Type-safe hook to subscribe to agent IPC events from the main process.
 *
 * Pass a map of event type → handler. Only the events you pass will be subscribed.
 * Handlers are called with the full typed event payload (which includes `sessionId`).
 *
 * @example
 * useSubscribeAgentEvents({
 *   agent_start: (event) => { console.log(event.sessionId); },
 *   agent_end: (event) => { /* ... *\/ },
 * });
 */
export function useSubscribeAgentEvents(
  handlers: AgentEventHandlers,
  options: AgentEventSubscriptionOptions = {},
) {
  const { on } = useElectronIPC();

  // Keep ref to avoid re-subscribing on every render, but always dispatch
  // to the latest handler via the ref.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    for (const [event] of Object.entries(handlersRef.current)) {
      const eventName = event as keyof AllowedMainExposeEvents;
      unsubscribes.push(
        on(eventName, ((payload: unknown) => {
          const eventPayload = payload as AgentEventPayload;
          if (optionsRef.current.shouldHandleEvent?.(eventPayload) === false) {
            return;
          }

          handlersRef.current[eventName]?.(payload as never);
        }) as never),
      );
    }

    return () => {
      for (const off of unsubscribes) off();
    };
  }, [on]);
}
