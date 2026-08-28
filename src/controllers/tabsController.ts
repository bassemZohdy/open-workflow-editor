import { createController, type Controller } from './controller';

export interface TabsState {
  openTabIds: string[];
  libraryOrder: string[];
  revealActiveTick: number;
}

export function createTabsController(): Controller<TabsState> & {
  addTab: (id: string) => void;
  removeTab: (id: string) => void;
  reorderTabs: (draggedId: string, overId: string) => void;
  setLibraryOrder: (order: string[]) => void;
  revealActive: () => void;
  resetTo: (id: string) => void;
} {
  const controller = createController<TabsState>({
    openTabIds: [],
    libraryOrder: [],
    revealActiveTick: 0,
  });

  return {
    ...controller,
    addTab(id) {
      controller.dispatch((prev) =>
        prev.openTabIds.includes(id) ? prev : { ...prev, openTabIds: [...prev.openTabIds, id] },
      );
    },
    removeTab(id) {
      controller.dispatch((prev) => {
        const next = prev.openTabIds.filter((t) => t !== id);
        return next.length === prev.openTabIds.length ? prev : { ...prev, openTabIds: next };
      });
    },
    reorderTabs(draggedId, overId) {
      controller.dispatch((prev) => {
        const from = prev.openTabIds.indexOf(draggedId);
        const to = prev.openTabIds.indexOf(overId);
        if (from === -1 || to === -1 || from === to) return prev;
        const next = [...prev.openTabIds];
        next.splice(from, 1);
        next.splice(to, 0, draggedId);
        return { ...prev, openTabIds: next };
      });
    },
    setLibraryOrder(order) {
      controller.dispatch((prev) => ({ ...prev, libraryOrder: order }));
    },
    revealActive() {
      controller.dispatch((prev) => ({ ...prev, revealActiveTick: prev.revealActiveTick + 1 }));
    },
    resetTo(id) {
      controller.dispatch(() => ({
        openTabIds: [id],
        libraryOrder: [],
        revealActiveTick: 0,
      }));
    },
  };
}
