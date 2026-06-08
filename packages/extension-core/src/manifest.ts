export interface ExtensionManifest {
  id: string;
  name: string;
}

export function defineExtensionManifest(manifest: ExtensionManifest): ExtensionManifest {
  return manifest;
}
