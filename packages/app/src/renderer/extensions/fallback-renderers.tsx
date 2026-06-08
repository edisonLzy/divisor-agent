import { Alert, AlertDescription, AlertTitle } from "@renderer/components/ui/alert";

interface UnknownExtensionRendererProps {
  raw: string;
  type: string;
}

export function UnknownAssistantBlock({ raw, type }: UnknownExtensionRendererProps) {
  return (
    <Alert>
      <AlertTitle>Unsupported assistant block</AlertTitle>
      <AlertDescription>
        <span className="block font-mono text-xs">{type}</span>
        <span className="mt-2 block whitespace-pre-wrap font-mono text-xs">{raw}</span>
      </AlertDescription>
    </Alert>
  );
}

export function UnknownArtifact({ raw, type }: UnknownExtensionRendererProps) {
  return (
    <Alert>
      <AlertTitle>Unsupported artifact</AlertTitle>
      <AlertDescription>
        <span className="block font-mono text-xs">{type}</span>
        <span className="mt-2 block whitespace-pre-wrap font-mono text-xs">{raw}</span>
      </AlertDescription>
    </Alert>
  );
}
