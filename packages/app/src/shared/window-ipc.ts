export type AppWindowKind = "main" | "companion";

export interface WindowIPC {
  getWindowKind(): Promise<AppWindowKind>;
  hideCompanionWindow(): Promise<void>;
  openSessionInMainWindow(sessionId: string): Promise<void>;
}

export interface WindowExposeEvents {
  focus_companion_input: undefined;
  open_session_in_main: { sessionId: string };
}
