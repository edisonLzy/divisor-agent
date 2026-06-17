import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export interface ExtensionArtifactInput<TContent = Record<string, unknown>> {
  content?: TContent;
  id: string;
  name?: string;
  type: string;
}

export interface AppendSideChatMetaInput {
  context?: Record<string, unknown>;
  inputDisabled?: boolean;
  mainSessionId: string;
  model?: {
    modelId: string;
    providerId: string;
  };
  pendingPrompt: string;
}

export interface InsertSideChatUserMessageEntryInput {
  text: string;
}

export interface ExtensionsContextAPI {
  appendSideChatMeta(sideChatId: string, input: AppendSideChatMetaInput): void;
  getActiveSessionId(): string | null;
  getArtifact<TContent = Record<string, unknown>>(
    sessionId: string,
    artifactId: string,
  ): { content: TContent; id: string; name: string; type: string } | null;
  openArtifact(sessionId: string, artifactId: string): void;
  upsertArtifact<TContent = Record<string, unknown>>(
    sessionId: string,
    artifact: ExtensionArtifactInput<TContent>,
  ): void;
  insertSideChatUserMessageEntry(
    sideChatId: string,
    input: InsertSideChatUserMessageEntryInput,
    position: number,
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
