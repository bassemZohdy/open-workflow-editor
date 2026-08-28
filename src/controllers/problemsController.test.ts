import { describe, it, expect } from 'vitest';
import { createProblemsController } from './problemsController';

describe('ProblemsController', () => {
  it('starts with panel closed', () => {
    const ctrl = createProblemsController();
    expect(ctrl.getState().open).toBe(false);
  });

  it('toggle flips open state', () => {
    const ctrl = createProblemsController();
    ctrl.toggle();
    expect(ctrl.getState().open).toBe(true);
    ctrl.toggle();
    expect(ctrl.getState().open).toBe(false);
  });

  it('open sets open to true', () => {
    const ctrl = createProblemsController();
    ctrl.open();
    expect(ctrl.getState().open).toBe(true);
    ctrl.open();
    expect(ctrl.getState().open).toBe(true);
  });

  it('close sets open to false', () => {
    const ctrl = createProblemsController();
    ctrl.open();
    ctrl.close();
    expect(ctrl.getState().open).toBe(false);
  });

  it('notifies subscribers on state change', () => {
    const ctrl = createProblemsController();
    const states: boolean[] = [];
    ctrl.subscribe(() => {
      states.push(ctrl.getState().open);
    });
    ctrl.toggle();
    ctrl.toggle();
    expect(states).toEqual([true, false]);
  });

  it('unsubscribe stops notifications', () => {
    const ctrl = createProblemsController();
    let count = 0;
    const unsub = ctrl.subscribe(() => {
      count++;
    });
    ctrl.toggle();
    unsub();
    ctrl.toggle();
    expect(count).toBe(1);
  });

  it('dispatch with same state does not notify', () => {
    const ctrl = createProblemsController();
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.dispatch((prev) => prev);
    expect(count).toBe(0);
  });
});
