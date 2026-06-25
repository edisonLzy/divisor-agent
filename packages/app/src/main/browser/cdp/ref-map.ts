import type { CDPClient } from "./cdp-client.js";
import { RefExpiredError } from "../control-mode.js";
import type { ObservationRefEntry } from "@shared/browser-artifact-ipc";

export interface ResolvedRef {
  cx: number;
  cy: number;
  height: number;
  objectId: string;
  width: number;
  x: number;
  y: number;
}

/**
 * Resolve an `e0`-style ref to a real element on the page. Returns the cached
 * object id (so subsequent commands can reuse it without re-querying the DOM)
 * plus the element's bounding box centre for mouse-event injection.
 */
export async function resolveRef(
  cdp: CDPClient,
  refMap: Map<string, ObservationRefEntry>,
  ref: string,
): Promise<ResolvedRef> {
  const entry = refMap.get(ref);
  if (!entry) throw new RefExpiredError(ref);
  const { object } = await cdp.resolveNode(entry.backendNodeId);
  if (!object?.objectId) throw new RefExpiredError(ref);
  const { result } = await cdp.callFunctionOn<[number, number, number, number]>(
    object.objectId,
    "function() { const r = this.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }",
  );
  const [x, y, width, height] = result.value;
  return {
    cx: x + width / 2,
    cy: y + height / 2,
    height,
    objectId: object.objectId,
    width,
    x,
    y,
  };
}

/** Build a `refMap` Map from an observation's serialised form. */
export function hydrateRefMap(
  source: Record<string, ObservationRefEntry>,
): Map<string, ObservationRefEntry> {
  return new Map(Object.entries(source));
}