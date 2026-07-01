import type { Editor, Range } from "@tiptap/core";
import type { ComponentType, JSX } from "react";
import type { Components as StreamdownComponents, StreamdownProps } from "streamdown";

import type { ExtensionMetadata } from "../common/ipc/index.js";

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
  /** The id of the session this artifact belongs to. */
  sessionId: string;
  /** The artifact record's own id. */
  artifactId: string;
  content: TContent;
}

export interface ArtifactRegistration<TContent = Record<string, unknown>> {
  type: string;
  render: ComponentType<ArtifactRenderProps<TContent>>;
}

export type StreamdownComponent = ComponentType<any> | keyof JSX.IntrinsicElements;
export type StreamdownComponentComposer = (Base: StreamdownComponent) => StreamdownComponent;
export type StreamdownComponentComposerMap = Partial<
  Record<keyof StreamdownComponents | string, StreamdownComponentComposer>
>;
export type StreamdownRehypePlugins = NonNullable<StreamdownProps["rehypePlugins"]>;
export type StreamdownRehypePluginComposer = (
  plugins: StreamdownRehypePlugins,
) => StreamdownRehypePlugins;

export interface RendererExtensionContext {
  readonly extension: ExtensionMetadata;
  slashCommands: {
    register(command: RendererSlashCommand): void;
  };
  assistantBlocks: {
    register(block: AssistantBlockRegistration): void;
  };
  artifacts: {
    register<TContent = Record<string, unknown>>(artifact: ArtifactRegistration<TContent>): void;
  };
  streamdown: {
    registerComponents(components: StreamdownComponentComposerMap): void;
    registerRehypePlugins(composer: StreamdownRehypePluginComposer): void;
  };
}

export type RendererExtensionSetup = (ctx: RendererExtensionContext) => void;

export interface RendererExtensionDefinition extends ExtensionMetadata {
  setup: RendererExtensionSetup;
}

export function defineRendererExtension(
  definition: RendererExtensionDefinition,
): RendererExtensionDefinition {
  return definition;
}
