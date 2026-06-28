export type AnyExtensionIPCFunction = (...args: any[]) => any;

export type ExtensionIPCKey<T> = Extract<keyof T, string>;

export type ExtensionIPCArgs<T, K extends ExtensionIPCKey<T>> = T[K] extends (
  ...args: infer TArgs
) => unknown
  ? TArgs
  : never;

export type ExtensionIPCResult<T, K extends ExtensionIPCKey<T>> = T[K] extends (
  ...args: any[]
) => infer TResult
  ? TResult
  : never;

export interface ExtensionMetadata {
  readonly id: string;
  readonly name: string;
}

export type ExtensionDisposer = () => void;

export interface ExtensionIPCInvokeRequest {
  args: unknown[];
  extensionId: string;
  method: string;
}

export interface ExtensionIPCEventEnvelope {
  args: unknown[];
  event: string;
  extensionId: string;
}

/** Low-level contextBridge transport. Extension code should use createUseExtensionIPC instead. */
export interface ExtensionIPCTransport {
  invoke(extensionId: string, method: string, args: unknown[]): Promise<unknown>;
  on(extensionId: string, event: string, listener: (...args: unknown[]) => void): ExtensionDisposer;
}
