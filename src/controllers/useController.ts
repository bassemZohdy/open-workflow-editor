import { useSyncExternalStore } from 'react';
import type { Controller } from './controller';

/**
 * React hook that subscribes to a `Controller<T>` and returns its current
 * state snapshot. Re-renders only when the snapshot changes (referential
 * equality by default; pass `selector` for derived/computed slices).
 *
 * Uses `useSyncExternalStore` for tear-free concurrent-mode reads.
 */
export function useController<T>(controller: Controller<T>): T;
export function useController<T, S>(controller: Controller<T>, selector: (state: T) => S): S;
export function useController<T, S>(controller: Controller<T>, selector?: (state: T) => S): T | S {
  return useSyncExternalStore(controller.subscribe, () =>
    selector ? selector(controller.getState()) : controller.getState(),
  );
}
