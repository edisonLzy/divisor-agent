export const EXAMPLE_EXTENSION = {
  id: "example",
  name: "Example",
} as const;

export interface ExampleState {
  greetingCount: number;
}

export interface ExampleInvokeEvents {
  getState(): ExampleState;
}

export interface ExampleOnEvents {
  stateChanged(state: ExampleState): void;
}
