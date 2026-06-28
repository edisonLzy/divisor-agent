import type {
  AnyExtensionIPCFunction,
  ExtensionDisposer,
  ExtensionIPCArgs,
  ExtensionIPCKey,
  ExtensionIPCResult,
  ExtensionIPCTransport,
} from "../common/ipc/index.js";

declare global {
  interface Window {
    extensionsAPI: ExtensionIPCTransport;
  }
}

export interface RendererExtensionIPC<InvokeEvents, OnEvents> {
  invoke<K extends ExtensionIPCKey<InvokeEvents>>(
    method: K,
    ...args: ExtensionIPCArgs<InvokeEvents, K>
  ): Promise<Awaited<ExtensionIPCResult<InvokeEvents, K>>>;
  on<K extends ExtensionIPCKey<OnEvents>>(
    event: K,
    listener: (...args: ExtensionIPCArgs<OnEvents, K>) => void,
  ): ExtensionDisposer;
}

export function createUseExtensionIPC<
  InvokeEvents extends Record<keyof InvokeEvents, AnyExtensionIPCFunction> = {},
  OnEvents extends Record<keyof OnEvents, AnyExtensionIPCFunction> = {},
>(extensionId: string): () => RendererExtensionIPC<InvokeEvents, OnEvents> {
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
  } as RendererExtensionIPC<InvokeEvents, OnEvents>;

  return function useExtensionIPC() {
    return client;
  };
}
