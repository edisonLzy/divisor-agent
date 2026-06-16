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

export interface AppendSideChatArtifactInput {
  context?: Record<string, unknown>;
  id: string;
  inputDisabled?: boolean;
  model?: {
    modelId: string;
    providerId: string;
  };
  pendingPrompt: string;
  title: string;
}

export interface ExtensionsContextAPI {
  appendSideChatArtifact(parentSessionId: string, input: AppendSideChatArtifactInput): void;
  openArtifact(sessionId: string, artifactId: string): void;
  upsertArtifact<TContent extends Record<string, unknown> = Record<string, unknown>>(
    sessionId: string,
    artifact: ExtensionArtifactInput<TContent>,
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
