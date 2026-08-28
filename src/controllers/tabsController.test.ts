import { describe, it, expect } from 'vitest';
import { createTabsController } from './tabsController';

describe('TabsController', () => {
  it('starts with empty state', () => {
    const ctrl = createTabsController();
    expect(ctrl.getState()).toEqual({
      openTabIds: [],
      libraryOrder: [],
      revealActiveTick: 0,
    });
  });

  it('addTab adds a new tab', () => {
    const ctrl = createTabsController();
    ctrl.addTab('tab-1');
    expect(ctrl.getState().openTabIds).toEqual(['tab-1']);
  });

  it('addTab skips duplicate', () => {
    const ctrl = createTabsController();
    ctrl.addTab('tab-1');
    ctrl.addTab('tab-1');
    expect(ctrl.getState().openTabIds).toEqual(['tab-1']);
  });

  it('removeTab removes a tab', () => {
    const ctrl = createTabsController();
    ctrl.addTab('tab-1');
    ctrl.addTab('tab-2');
    ctrl.removeTab('tab-1');
    expect(ctrl.getState().openTabIds).toEqual(['tab-2']);
  });

  it('removeTab skips when id not found', () => {
    const ctrl = createTabsController();
    ctrl.addTab('tab-1');
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.removeTab('tab-99');
    expect(count).toBe(0);
  });

  it('reorderTabs moves tab to new position', () => {
    const ctrl = createTabsController();
    ctrl.addTab('a');
    ctrl.addTab('b');
    ctrl.addTab('c');
    ctrl.reorderTabs('a', 'c');
    expect(ctrl.getState().openTabIds).toEqual(['b', 'c', 'a']);
  });

  it('reorderTabs skips when ids invalid', () => {
    const ctrl = createTabsController();
    ctrl.addTab('a');
    ctrl.addTab('b');
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.reorderTabs('a', 'x');
    expect(count).toBe(0);
  });

  it('reorderTabs skips when same position', () => {
    const ctrl = createTabsController();
    ctrl.addTab('a');
    let count = 0;
    ctrl.subscribe(() => {
      count++;
    });
    ctrl.reorderTabs('a', 'a');
    expect(count).toBe(0);
  });

  it('setLibraryOrder updates order', () => {
    const ctrl = createTabsController();
    ctrl.setLibraryOrder(['b', 'a']);
    expect(ctrl.getState().libraryOrder).toEqual(['b', 'a']);
  });

  it('revealActive increments tick', () => {
    const ctrl = createTabsController();
    ctrl.revealActive();
    expect(ctrl.getState().revealActiveTick).toBe(1);
    ctrl.revealActive();
    expect(ctrl.getState().revealActiveTick).toBe(2);
  });

  it('resetTo sets single tab', () => {
    const ctrl = createTabsController();
    ctrl.addTab('a');
    ctrl.addTab('b');
    ctrl.setLibraryOrder(['x']);
    ctrl.revealActive();
    ctrl.resetTo('new');
    expect(ctrl.getState()).toEqual({
      openTabIds: ['new'],
      libraryOrder: [],
      revealActiveTick: 0,
    });
  });
});
