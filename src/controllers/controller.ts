/**
 * Controller pattern foundation — a minimal reactive state container.
 *
 * A `Controller<TState>` holds an immutable state snapshot and notifies
 * subscribers when it changes. Components consume it via `useController`,
 * which wraps React's `useSyncExternalStore` for tear-free reads.
 *
 * This is the scaffolding the panel extraction migration (Tasks 72–79)
 * builds on. Each panel's state moves into its own controller; `main.tsx`
 * composes them.
 */

export type StateUpdater<T> = (prev: T) => T;

export interface Controller<T> {
  /** Returns the current state snapshot. */
  getState(): T;
  /** Subscribes to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Replaces the state via an updater function (immutable pattern). */
  dispatch(updater: StateUpdater<T>): void;
}

/**
 * Creates a new controller with the given initial state.
 *
 * The controller enforces immutability at the type level — `dispatch` takes
 * an updater `(prev) => next` so callers never mutate the snapshot directly.
 */
export function createController<T>(initialState: T): Controller<T> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(updater) {
      const next = updater(state);
      if (next === state) return;
      state = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
