import { createController, type Controller } from './controller';

export interface ProblemsState {
  open: boolean;
}

export function createProblemsController(): Controller<ProblemsState> & {
  toggle: () => void;
  open: () => void;
  close: () => void;
} {
  const controller = createController<ProblemsState>({ open: false });

  return {
    ...controller,
    toggle() {
      controller.dispatch((prev) => ({ ...prev, open: !prev.open }));
    },
    open() {
      controller.dispatch((prev) => ({ ...prev, open: true }));
    },
    close() {
      controller.dispatch((prev) => ({ ...prev, open: false }));
    },
  };
}
