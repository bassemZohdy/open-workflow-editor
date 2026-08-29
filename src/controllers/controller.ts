/**
 * Controller pattern foundation — a minimal reactive state container.
 *
 * A `Controller<TState>` holds a frozen state snapshot and notifies
 * subscribers when it changes. Components consume it via `useController`,
 * which wraps React's `useSyncExternalStore` for tear-free reads.
 *
 * This is the scaffolding the panel extraction migration (Tasks 72–79)
 * builds on. Each panel's state moves into its own controller; `main.tsx`
 * composes them.
 */

export type StateUpdater<T> = (prev: T) => T;

export interface Controller<T> {
  /** Returns the current state snapshot (frozen — mutation throws in strict mode). */
  getState(): T;
  /** Subscribes to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Replaces the state via an updater function (immutable pattern). */
  dispatch(updater: StateUpdater<T>): void;
}

/**
 * Creates a new controller with the given initial state.
 *
 * The returned state is frozen after every dispatch to enforce the immutability
 * contract — in-place mutation of the snapshot throws in strict mode, and the
 * reference-equality no-op check in dispatch remains correct.
 *
 * Listener errors are isolated: a throwing listener does not prevent subsequent
 * listeners from receiving the notification.
 */
export function createController<T>(initialState: T): Controller<T> {
  let state = Object.freeze(initialState);
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
      state = Object.freeze(next);
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
          // Isolate listener errors — subsequent listeners still receive the
          // notification, and the exception doesn't propagate into dispatch.
          console.error('[controller] listener error:', error);
        }
      }
    },
  };
}
