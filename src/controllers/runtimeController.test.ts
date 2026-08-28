import { describe, it, expect } from 'vitest';
import { createRuntimeController } from './runtimeController';

describe('RuntimeController', () => {
  it('starts with default state', () => {
    const ctrl = createRuntimeController();
    expect(ctrl.getState()).toEqual({
      open: true,
      healthy: null,
      executionStatusMap: {},
    });
  });

  it('toggle flips open state', () => {
    const ctrl = createRuntimeController();
    ctrl.toggle();
    expect(ctrl.getState().open).toBe(false);
    ctrl.toggle();
    expect(ctrl.getState().open).toBe(true);
  });

  it('open/close set open state', () => {
    const ctrl = createRuntimeController();
    ctrl.close();
    expect(ctrl.getState().open).toBe(false);
    ctrl.open();
    expect(ctrl.getState().open).toBe(true);
  });

  it('setHealthy updates healthy state', () => {
    const ctrl = createRuntimeController();
    ctrl.setHealthy(true);
    expect(ctrl.getState().healthy).toBe(true);
    ctrl.setHealthy(false);
    expect(ctrl.getState().healthy).toBe(false);
    ctrl.setHealthy(null);
    expect(ctrl.getState().healthy).toBe(null);
  });

  it('setHealthy skips update when value unchanged', () => {
    const ctrl = createRuntimeController();
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.setHealthy(true);
    ctrl.setHealthy(true);
    expect(count).toBe(1);
  });

  it('setExecutionStatus adds/updates task status', () => {
    const ctrl = createRuntimeController();
    ctrl.setExecutionStatus('task1', 'running');
    expect(ctrl.getState().executionStatusMap).toEqual({ task1: 'running' });
    ctrl.setExecutionStatus('task1', 'success');
    expect(ctrl.getState().executionStatusMap).toEqual({ task1: 'success' });
  });

  it('setExecutionStatus with null removes task', () => {
    const ctrl = createRuntimeController();
    ctrl.setExecutionStatus('task1', 'running');
    ctrl.setExecutionStatus('task1', null);
    expect(ctrl.getState().executionStatusMap).toEqual({});
  });

  it('setExecutionStatusMap replaces entire map', () => {
    const ctrl = createRuntimeController();
    ctrl.setExecutionStatus('task1', 'running');
    ctrl.setExecutionStatusMap({ task2: 'success', task3: 'failed' });
    expect(ctrl.getState().executionStatusMap).toEqual({ task2: 'success', task3: 'failed' });
  });

  it('clearExecutionStatuses empties the map', () => {
    const ctrl = createRuntimeController();
    ctrl.setExecutionStatusMap({ task1: 'running', task2: 'success' });
    ctrl.clearExecutionStatuses();
    expect(ctrl.getState().executionStatusMap).toEqual({});
  });

  it('clearExecutionStatuses skips update when already empty', () => {
    const ctrl = createRuntimeController();
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.clearExecutionStatuses();
    expect(count).toBe(0);
  });
});
