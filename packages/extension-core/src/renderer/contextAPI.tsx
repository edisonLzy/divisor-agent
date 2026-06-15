import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export interface ExtensionArtifactInput<
  TContent extends Record<string, unknown> = Record<string, unknown>,
> {
  content?: TContent;
  id: string;
  name?: string;
  type: string;
}

export interface OpenArtifactOptions {
  activate?: boolean;
  open?: boolean;
}

export interface ExtensionsContextAPI {
  openArtifact(sessionId: string, artifactId: string): void;
  upsertArtifact<TContent extends Record<string, unknown> = Record<string, unknown>>(
    sessionId: string,
    artifact: ExtensionArtifactInput<TContent>,
    options?: OpenArtifactOptions,
  ): void;
}

export interface ExtensionsContextAPIProviderProps {
  api: ExtensionsContextAPI;
  children: ReactNode;
}

const ExtensionsContextAPIContext = createContext<ExtensionsContextAPI | null>(null);

export function ExtensionsContextAPIProvider({ api, children }: ExtensionsContextAPIProviderProps) {
  return (
    <ExtensionsContextAPIContext.Provider value={api}>
      {children}
    </ExtensionsContextAPIContext.Provider>
  );
}

export function useExtensionsContextAPI() {
  const api = useContext(ExtensionsContextAPIContext);
  if (!api) {
    throw new Error("useExtensionsContextAPI must be used within ExtensionsContextAPIProvider");
  }
  return api;
}
