import type { AXNode } from "./cdp-client.js";
import type { ObservationRefEntry } from "@shared/browser-artifact-ipc";

const KEEP_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "menuitem",
  "menuitemradio",
  "menuitemcheckbox",
  "tab",
  "option",
  "heading",
  "img",
  "navigation",
  "main",
  "region",
  "dialog",
  "alert",
  "status",
  "form",
  "list",
  "listitem",
  "table",
  "row",
  "cell",
  "columnheader",
  "rowheader",
]);

const DROP_ROLES = new Set([
  "generic",
  "none",
  "presentation",
  "InlineTextBox",
  "StaticText",
  "Ignored",
]);

export interface CompressedA11y {
  a11y: Array<{
    name?: string;
    ref: string;
    role: string;
    value?: string;
  }>;
  refMap: Record<string, ObservationRefEntry>;
}

export function compressAXTree(
  nodes: AXNode[],
  maxRefs = 32,
): CompressedA11y {
  const refMap: Record<string, ObservationRefEntry> = {};
  const a11y: CompressedA11y["a11y"] = [];

  for (const node of nodes) {
    if (a11y.length >= maxRefs) break;
    const role = node.role?.value;
    if (!role || DROP_ROLES.has(role)) continue;
    if (!KEEP_ROLES.has(role)) continue;
    const name = node.name?.value?.trim();
    const value =
      typeof node.value?.value === "string" ? node.value.value : undefined;
    if (!name && !value) continue;
    if (typeof node.backendDOMNodeId !== "number") continue;

    const ref = `e${a11y.length}`;
    refMap[ref] = {
      backendNodeId: node.backendDOMNodeId,
      name: name ?? "",
      role,
    };
    a11y.push({ name, ref, role, value });
  }

  return { a11y, refMap };
}

export function formatA11yForLLM(compressed: CompressedA11y): string {
  if (compressed.a11y.length === 0) return "(no interactive elements found)";
  return compressed.a11y
    .map((node) => {
      const label = node.name ?? node.value ?? "";
      return `- [${node.ref}] ${node.role}: ${label}`;
    })
    .join("\n");
}