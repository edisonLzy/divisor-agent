export interface ExampleState {
  greetingCount: number;
}

export interface AllowedRenderInvokeEvents {
  getState(): ExampleState;
  incrementGreeting(): void;
}

export interface AllowedMainExposeEvents {
  stateChanged(state: ExampleState): void;
}
