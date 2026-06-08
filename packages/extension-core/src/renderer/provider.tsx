import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import { RendererExtensionBridge } from "./bridge";
import type { InstalledRendererExtension } from "./bridge";
import type { RendererExtensionRegistry } from "./registry";

const ExtensionRegistryContext = createContext<RendererExtensionRegistry | null>(null);

export interface ExtensionProviderProps {
  extensions: InstalledRendererExtension[];
  children: ReactNode;
}

export function ExtensionProvider({ extensions, children }: ExtensionProviderProps) {
  const registry = useMemo(() => {
    const bridge = new RendererExtensionBridge(extensions);
    bridge.initialize();
    return bridge.getRegistry();
  }, [extensions]);

  return (
    <ExtensionRegistryContext.Provider value={registry}>
      {children}
    </ExtensionRegistryContext.Provider>
  );
}

export function useExtensionRegistry() {
  const registry = useContext(ExtensionRegistryContext);
  if (!registry) {
    throw new Error("useExtensionRegistry must be used within ExtensionProvider");
  }
  return registry;
}
