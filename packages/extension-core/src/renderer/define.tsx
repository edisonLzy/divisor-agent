import type { Editor, Range } from "@tiptap/core";
import type { ComponentType, JSX } from "react";
import type { Components as StreamdownComponents } from "streamdown";

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

export interface RendererExtensionContext {
  manifest: ExtensionManifest;
  slashCommands: {
    register(command: RendererSlashCommand): void;
  };
  assistantBlocks: {
    register(block: AssistantBlockRegistration): void;
  };
  artifacts: {
    register<TContent = Record<string, unknown>>(artifact: ArtifactRegistration<TContent>): void;
  };
  /**
   * Streamdown component hooks. Each registered function receives the
   * previously registered renderer for a key and returns a new renderer,
   * allowing multiple extensions to layer behavior for the same element.
   *
   * Use this to customize how the assistant's markdown is rendered — for
   * example, override `a` to intercept `file://` links or `code` to wrap
   * code blocks in custom UI.
   */
  streamdown: {
    registerComponents(components: StreamdownComponentComposerMap): void;
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
