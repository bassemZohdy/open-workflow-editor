import { useCallback, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import type { Controller } from './controller';

/**
 * React hook that subscribes to a `Controller<T>` and returns its current
 * state snapshot (or a selected slice via `selector`). Re-renders only when
 * the snapshot/selector result changes.
 *
 * Uses `useSyncExternalStore` for tear-free concurrent-mode reads.
 *
 * The selector result is memoized: if the selector returns a new object on
 * every call (e.g. `s => s.items.filter(...)`), the hook compares the result
 * by reference and reuses the previous value when nothing changed, preventing
 * the infinite-loop trap that `useSyncExternalStore` triggers when `getSnapshot`
 * returns a new reference every time.
 */
export function useController<T, S = T>(
  controller: Controller<T>,
  selector: (state: T) => S = (s) => s as unknown as S,
): S {
  // Store the previous selector result to avoid returning a new reference
  // when the underlying state hasn't changed.
  const prevRef = useRef<{ state: T; result: S } | null>(null);

  const getSnapshot = useCallback((): S => {
    const state = controller.getState();

    // If the state reference hasn't changed, reuse the previous result.
    if (prevRef.current && prevRef.current.state === state) {
      return prevRef.current.result;
    }
    const result = selector(state);
    prevRef.current = { state, result };
    return result;
  }, [controller, selector]);

  return useSyncExternalStore(controller.subscribe, getSnapshot);
}
