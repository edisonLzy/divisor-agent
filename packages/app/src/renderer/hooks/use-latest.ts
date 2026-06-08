import { useRef } from "react";

/**
 * Returns a ref whose `.current` always holds the latest value.
 * The ref object itself is stable across renders, so it can be safely
 * captured in closures without triggering effects or re-computation.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
