import type {
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

export interface RendererExtensionIPC<AllowedRenderInvokeEvents, AllowedMainExposeEvents> {
  invoke<C extends ExtensionIPCKey<AllowedRenderInvokeEvents>>(
    method: C,
    ...args: ExtensionIPCArgs<AllowedRenderInvokeEvents, C>
  ): Promise<Awaited<ExtensionIPCResult<AllowedRenderInvokeEvents, C>>>;
  on<E extends ExtensionIPCKey<AllowedMainExposeEvents>>(
    event: E,
    listener: (...args: ExtensionIPCArgs<AllowedMainExposeEvents, E>) => void,
  ): ExtensionDisposer;
}
