import type { WebContents } from "electron";

import type { BrowserGetProperty } from "../common/types";
import { BrowserOperationError } from "./url";

interface AXNode {
  backendDOMNodeId?: number;
  childIds?: string[];
  ignored?: boolean;
  name?: { value?: unknown };
  nodeId: string;
  properties?: Array<{ name: string; value?: { value?: unknown } }>;
  role?: { value?: unknown };
}

interface RefEntry {
  backendDOMNodeId: number;
  name: string;
  role: string;
  sessionId?: string;
}

interface TabSnapshot {
  generation: number;
  refs: Map<string, RefEntry>;
  snapshot: string;
}

const INTERACTIVE = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "menuitem",
  "tab",
  "option",
  "treeitem",
]);

export class SnapshotService {
  private generations = new Map<string, number>();
  private snapshots = new Map<string, TabSnapshot>();
  private queues = new Map<string, Promise<unknown>>();

  markNavigated(tabId: string) {
    this.generations.set(tabId, (this.generations.get(tabId) ?? 0) + 1);
  }

  clear(tabId: string) {
    this.snapshots.delete(tabId);
    this.generations.delete(tabId);
    this.queues.delete(tabId);
  }

  snapshot(tabId: string, contents: WebContents) {
    return this.enqueue(tabId, async () => {
      await this.attach(contents);
      const refs = new Map<string, RefEntry>();
      const lines: string[] = [];
      const seenBackendIds = new Set<string>();
      let nextRef = 1;

      const appendTree = (nodes: AXNode[], sessionId?: string) => {
        const byId = new Map(nodes.map((node) => [node.nodeId, node]));
        const walk = (node: AXNode, depth: number) => {
          const role = String(node.role?.value ?? "");
          const name = String(node.name?.value ?? "").trim();
          const focusable = node.properties?.some(
            (property) => property.name === "focusable" && property.value?.value === true,
          );
          if (!node.ignored && name) {
            const shouldReference =
              Boolean(node.backendDOMNodeId) && (INTERACTIVE.has(role) || focusable);
            if (shouldReference) {
              const ref = `@e${nextRef++}`;
              seenBackendIds.add(`${sessionId ?? "main"}:${node.backendDOMNodeId!}`);
              refs.set(ref, {
                backendDOMNodeId: node.backendDOMNodeId!,
                name,
                role,
                sessionId,
              });
              lines.push(`${"  ".repeat(depth)}[${ref}] ${role || "element"} "${name}"`);
            } else if (role === "heading" || role === "StaticText" || role === "staticText") {
              lines.push(
                `${"  ".repeat(depth)}${role === "heading" ? "heading" : "text"} "${name}"`,
              );
            }
          }
          for (const childId of node.childIds ?? []) {
            const child = byId.get(childId);
            if (child) walk(child, depth + (role ? 1 : 0));
          }
        };
        if (nodes[0]) walk(nodes[0], sessionId ? 1 : 0);
      };

      const mainResult = (await contents.debugger.sendCommand("Accessibility.getFullAXTree")) as {
        nodes: AXNode[];
      };
      appendTree(mainResult.nodes ?? []);
      await this.appendDomInteractiveElements(
        contents,
        refs,
        lines,
        seenBackendIds,
        () => `@e${nextRef++}`,
      );

      const targets = (await contents.debugger.sendCommand("Target.getTargets")) as {
        targetInfos?: Array<{ targetId: string; type: string }>;
      };
      for (const target of targets.targetInfos ?? []) {
        if (target.type !== "iframe") continue;
        try {
          const attached = (await contents.debugger.sendCommand("Target.attachToTarget", {
            flatten: true,
            targetId: target.targetId,
          })) as { sessionId: string };
          const sessionId = attached.sessionId;
          await contents.debugger.sendCommand("Accessibility.enable", undefined, sessionId);
          await contents.debugger.sendCommand("DOM.enable", undefined, sessionId);
          await contents.debugger.sendCommand("Runtime.enable", undefined, sessionId);
          const iframeResult = (await contents.debugger.sendCommand(
            "Accessibility.getFullAXTree",
            undefined,
            sessionId,
          )) as { nodes: AXNode[] };
          appendTree(iframeResult.nodes ?? [], sessionId);
          await this.appendDomInteractiveElements(
            contents,
            refs,
            lines,
            seenBackendIds,
            () => `@e${nextRef++}`,
            sessionId,
          );
        } catch {
          // Cross-origin targets can disappear while a snapshot is being assembled.
        }
      }

      const snapshot = lines.join("\n");
      this.snapshots.set(tabId, {
        generation: this.generations.get(tabId) ?? 0,
        refs,
        snapshot,
      });
      return { refs: [...refs.entries()].map(([ref, value]) => ({ ref, ...value })), snapshot };
    });
  }

  get(tabId: string, contents: WebContents, ref: string, property: BrowserGetProperty) {
    return this.enqueue(tabId, async () => {
      const snapshot = this.snapshots.get(tabId);
      if (!snapshot || snapshot.generation !== (this.generations.get(tabId) ?? 0)) {
        throw new BrowserOperationError(
          "browser_stale_ref",
          "Take a new snapshot before reading an element",
        );
      }
      const entry = snapshot.refs.get(ref);
      if (!entry)
        throw new BrowserOperationError("browser_stale_ref", `Unknown element ref: ${ref}`);
      await this.attach(contents);
      const resolved = (await contents.debugger.sendCommand(
        "DOM.resolveNode",
        {
          backendNodeId: entry.backendDOMNodeId,
        },
        entry.sessionId,
      )) as { object?: { objectId?: string } };
      const objectId = resolved.object?.objectId;
      if (!objectId)
        throw new BrowserOperationError("browser_read_failed", `Cannot resolve ${ref}`);
      const expression = getPropertyExpression(property);
      const evaluated = (await contents.debugger.sendCommand(
        "Runtime.callFunctionOn",
        {
          functionDeclaration: `function(){${expression}}`,
          objectId,
          returnByValue: true,
        },
        entry.sessionId,
      )) as { result?: { value?: unknown } };
      return evaluated.result?.value ?? null;
    });
  }

  private async attach(contents: WebContents) {
    if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
    await contents.debugger.sendCommand("Accessibility.enable");
    await contents.debugger.sendCommand("DOM.enable");
    await contents.debugger.sendCommand("Runtime.enable");
  }

  private async appendDomInteractiveElements(
    contents: WebContents,
    refs: Map<string, RefEntry>,
    lines: string[],
    seenBackendIds: Set<string>,
    nextRef: () => string,
    sessionId?: string,
  ) {
    const document = (await contents.debugger.sendCommand(
      "DOM.getDocument",
      { depth: 0 },
      sessionId,
    )) as { root?: { nodeId?: number } };
    if (!document.root?.nodeId) return;
    const queried = (await contents.debugger.sendCommand(
      "DOM.querySelectorAll",
      {
        nodeId: document.root.nodeId,
        selector:
          "[onclick],[tabindex],[contenteditable='true'],[style*='cursor: pointer'],[style*='cursor:pointer']",
      },
      sessionId,
    )) as { nodeIds?: number[] };
    for (const nodeId of (queried.nodeIds ?? []).slice(0, 500)) {
      const described = (await contents.debugger.sendCommand(
        "DOM.describeNode",
        { nodeId },
        sessionId,
      )) as {
        node?: { attributes?: string[]; backendNodeId?: number; nodeName?: string };
      };
      const backendDOMNodeId = described.node?.backendNodeId;
      if (!backendDOMNodeId) continue;
      const key = `${sessionId ?? "main"}:${backendDOMNodeId}`;
      if (seenBackendIds.has(key)) continue;
      seenBackendIds.add(key);
      const attributes = toAttributes(described.node?.attributes ?? []);
      const name = (
        attributes["aria-label"] ??
        attributes.title ??
        attributes.id ??
        described.node?.nodeName ??
        "element"
      ).slice(0, 500);
      const ref = nextRef();
      refs.set(ref, {
        backendDOMNodeId,
        name,
        role: attributes.role ?? "interactive",
        sessionId,
      });
      lines.push(`${sessionId ? "  " : ""}[${ref}] ${attributes.role ?? "interactive"} "${name}"`);
    }
  }

  private enqueue<T>(tabId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(tabId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(tabId, next);
    return next.finally(() => {
      if (this.queues.get(tabId) === next) this.queues.delete(tabId);
    });
  }
}

function getPropertyExpression(property: BrowserGetProperty): string {
  switch (property) {
    case "box":
      return "const r=this.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};";
    case "html":
      return "return String(this.outerHTML||'').slice(0,8000);";
    case "name":
      return "return this.getAttribute('aria-label')||this.innerText||this.textContent||'';";
    case "role":
      return "return this.getAttribute('role')||this.tagName.toLowerCase();";
    case "state":
      return "return {checked:this.checked??null,disabled:this.disabled??false,visible:!!(this.offsetWidth||this.offsetHeight||this.getClientRects().length)};";
    case "text":
      return "return String(this.innerText||this.textContent||'').slice(0,8000);";
    case "value":
      return "return 'value' in this?String(this.value).slice(0,8000):null;";
  }
}

function toAttributes(values: string[]) {
  const attributes: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    attributes[values[index]] = values[index + 1] ?? "";
  }
  return attributes;
}
