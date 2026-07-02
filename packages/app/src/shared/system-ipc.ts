export interface SystemIPC {
  isWindowFullScreen(): Promise<boolean>;
  setWindowControlsTheme(theme: "light" | "dark"): Promise<void>;
}
