import type { AnyExtensionIPCFunction } from "../common/ipc/index.js";
import type { RendererExtensionIPC } from "./ipc.js";
import { useExtensionRegistry } from "./provider";

export function useExtensions() {
  const registry = useExtensionRegistry();
  return registry.listExtensions();
}

export function usePluginSlashCommands() {
  const registry = useExtensionRegistry();
  return registry.getSlashCommands();
}

export function useAssistantBlock(type: string) {
  const registry = useExtensionRegistry();
  return registry.getAssistantBlock(type);
}

export function useArtifact(type: string) {
  const registry = useExtensionRegistry();
  return registry.getArtifact(type);
}

export function createExtensionIPC<
  AllowedRenderInvokeEvents extends Record<
    keyof AllowedRenderInvokeEvents,
    AnyExtensionIPCFunction
  > = Record<string, never>,
  AllowedMainExposeEvents extends Record<keyof AllowedMainExposeEvents, AnyExtensionIPCFunction> =
    Record<string, never>,
>(
  extensionId: string,
): () => RendererExtensionIPC<AllowedRenderInvokeEvents, AllowedMainExposeEvents> {
  if (!extensionId.trim()) {
    throw new Error("Extension id cannot be empty");
  }

  const client = {
    invoke(method: string, ...args: unknown[]) {
      return window.extensionsAPI.invoke(extensionId, method, args);
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      return window.extensionsAPI.on(extensionId, event, listener);
    },
  } as RendererExtensionIPC<AllowedRenderInvokeEvents, AllowedMainExposeEvents>;

  return function useExtensionIPC() {
    return client;
  };
}
