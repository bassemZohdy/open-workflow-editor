import { describe, it, expect } from 'vitest';
import { createInspectorController } from './inspectorController';

describe('InspectorController', () => {
  it('starts with default state', () => {
    const ctrl = createInspectorController();
    expect(ctrl.getState()).toEqual({ selectedId: null, collapsed: false });
  });

  it('select sets selectedId', () => {
    const ctrl = createInspectorController();
    ctrl.select('task-1');
    expect(ctrl.getState().selectedId).toBe('task-1');
  });

  it('select skips update when same id', () => {
    const ctrl = createInspectorController();
    ctrl.select('task-1');
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.select('task-1');
    expect(count).toBe(0);
  });

  it('clearSelection sets selectedId to null', () => {
    const ctrl = createInspectorController();
    ctrl.select('task-1');
    ctrl.clearSelection();
    expect(ctrl.getState().selectedId).toBe(null);
  });

  it('clearSelection skips update when already null', () => {
    const ctrl = createInspectorController();
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.clearSelection();
    expect(count).toBe(0);
  });

  it('toggleCollapse flips collapsed state', () => {
    const ctrl = createInspectorController();
    ctrl.toggleCollapse();
    expect(ctrl.getState().collapsed).toBe(true);
    ctrl.toggleCollapse();
    expect(ctrl.getState().collapsed).toBe(false);
  });

  it('collapse sets collapsed to true', () => {
    const ctrl = createInspectorController();
    ctrl.collapse();
    expect(ctrl.getState().collapsed).toBe(true);
    ctrl.collapse();
    expect(ctrl.getState().collapsed).toBe(true);
  });

  it('expand sets collapsed to false', () => {
    const ctrl = createInspectorController();
    ctrl.collapse();
    ctrl.expand();
    expect(ctrl.getState().collapsed).toBe(false);
  });

  it('collapse skips update when already collapsed', () => {
    const ctrl = createInspectorController();
    ctrl.collapse();
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.collapse();
    expect(count).toBe(0);
  });
});
