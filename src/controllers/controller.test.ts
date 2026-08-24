import { describe, it, expect, vi } from 'vitest';
import { createController } from './controller';

describe('createController', () => {
  it('returns the initial state', () => {
    const ctrl = createController({ count: 0 });
    expect(ctrl.getState()).toEqual({ count: 0 });
  });

  it('dispatch updates state via updater function', () => {
    const ctrl = createController({ count: 0 });
    ctrl.dispatch((prev) => ({ count: prev.count + 1 }));
    expect(ctrl.getState()).toEqual({ count: 1 });
  });

  it('dispatch with same reference is a no-op (no subscriber notification)', () => {
    const ctrl = createController({ count: 0 });
    const listener = vi.fn();
    ctrl.subscribe(listener);
    ctrl.dispatch((prev) => prev); // same reference
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribe receives notifications on state change', () => {
    const ctrl = createController({ count: 0 });
    const listener = vi.fn();
    ctrl.subscribe(listener);
    ctrl.dispatch((prev) => ({ count: prev.count + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const ctrl = createController({ count: 0 });
    const listener = vi.fn();
    const unsub = ctrl.subscribe(listener);
    ctrl.dispatch((prev) => ({ count: prev.count + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    ctrl.dispatch((prev) => ({ count: prev.count + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers all receive notifications', () => {
    const ctrl = createController({ count: 0 });
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    ctrl.subscribe(listener1);
    ctrl.subscribe(listener2);
    ctrl.dispatch((prev) => ({ count: prev.count + 1 }));
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('getState always returns the latest snapshot', () => {
    const ctrl = createController({ count: 0 });
    expect(ctrl.getState().count).toBe(0);
    ctrl.dispatch((prev) => ({ count: prev.count + 5 }));
    expect(ctrl.getState().count).toBe(5);
    ctrl.dispatch((prev) => ({ count: prev.count * 2 }));
    expect(ctrl.getState().count).toBe(10);
  });
});
