import { useExtensionRegistry } from "./provider.js";

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
