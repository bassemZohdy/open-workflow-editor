import { createController, type Controller } from './controller';

export interface InspectorState {
  selectedId: string | null;
  collapsed: boolean;
}

export function createInspectorController(): Controller<InspectorState> & {
  select: (id: string) => void;
  clearSelection: () => void;
  toggleCollapse: () => void;
  collapse: () => void;
  expand: () => void;
} {
  const controller = createController<InspectorState>({
    selectedId: null,
    collapsed: false,
  });

  return {
    ...controller,
    select(id) {
      controller.dispatch((prev) => (prev.selectedId === id ? prev : { ...prev, selectedId: id }));
    },
    clearSelection() {
      controller.dispatch((prev) => (prev.selectedId === null ? prev : { ...prev, selectedId: null }));
    },
    toggleCollapse() {
      controller.dispatch((prev) => ({ ...prev, collapsed: !prev.collapsed }));
    },
    collapse() {
      controller.dispatch((prev) => (prev.collapsed ? prev : { ...prev, collapsed: true }));
    },
    expand() {
      controller.dispatch((prev) => (!prev.collapsed ? prev : { ...prev, collapsed: false }));
    },
  };
}
