/**
 * Control mode state machine.
 *
 * - `agent`: agent can dispatch CDP actions; user keyboard/mouse is blocked.
 * - `user`: agent is blocked from dispatching; user drives the page.
 * - `paused`: both frozen (e.g. while a modal dialog is up).
 */
export type ControlMode = "agent" | "user" | "paused";

const TRANSITIONS: Record<ControlMode, ControlMode[]> = {
  agent: ["user", "paused"],
  user: ["agent", "paused"],
  paused: ["agent", "user"],
};

export function canTransition(from: ControlMode, to: ControlMode): boolean {
  return TRANSITIONS[from].includes(to);
}

export class ControlModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlModeError";
  }
}

export class RefExpiredError extends Error {
  constructor(public ref: string) {
    super(`Ref "${ref}" not found in latest observation; call browser/observe first`);
    this.name = "RefExpiredError";
  }
}