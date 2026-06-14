import type { Editor, Range } from "@tiptap/core";
import type { ComponentType } from "react";

import type { ExtensionManifest } from "../manifest.js";

export interface RendererSlashCommandRunContext {
  editor: Editor;
  range: Range;
}

export interface RendererSlashCommand {
  id: string;
  group: string;
  name: string;
  description: string;
  extra?: string;
  run(ctx: RendererSlashCommandRunContext): void | Promise<void>;
}

export interface AssistantBlockRenderProps<TProps = Record<string, unknown>> {
  props: TProps;
  raw: string;
}

export interface AssistantBlockRegistration<TProps = Record<string, unknown>> {
  type: string;
  render: ComponentType<AssistantBlockRenderProps<TProps>>;
}

export interface ArtifactRenderProps<TContent = Record<string, unknown>> {
  artifactId: string;
  content: TContent;
}

export interface ArtifactRegistration<TContent = Record<string, unknown>> {
  type: string;
  render: ComponentType<ArtifactRenderProps<TContent>>;
}

export interface RendererExtensionContext {
  manifest: ExtensionManifest;
  slashCommands: {
    register(command: RendererSlashCommand): void;
  };
  assistantBlocks: {
    register(block: AssistantBlockRegistration): void;
  };
  artifacts: {
    register(artifact: ArtifactRegistration): void;
  };
}

export type RendererExtensionSetup = (ctx: RendererExtensionContext) => void;

export interface RendererExtensionDefinition {
  setup: RendererExtensionSetup;
}

export function defineRendererExtension(
  setup: RendererExtensionSetup,
): RendererExtensionDefinition {
  return { setup };
}
