import { createController, type Controller } from './controller';

export type TaskExecutionStatus = 'running' | 'success' | 'failed' | 'waiting';

export interface RuntimeState {
  open: boolean;
  healthy: boolean | null;
  executionStatusMap: Record<string, TaskExecutionStatus>;
}

export function createRuntimeController(): Controller<RuntimeState> & {
  toggle: () => void;
  open: () => void;
  close: () => void;
  setHealthy: (healthy: boolean | null) => void;
  setExecutionStatus: (taskId: string, status: TaskExecutionStatus | null) => void;
  setExecutionStatusMap: (map: Record<string, TaskExecutionStatus>) => void;
  clearExecutionStatuses: () => void;
} {
  const controller = createController<RuntimeState>({
    open: true,
    healthy: null,
    executionStatusMap: {},
  });

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
    setHealthy(healthy) {
      controller.dispatch((prev) => (prev.healthy === healthy ? prev : { ...prev, healthy }));
    },
    setExecutionStatus(taskId, status) {
      controller.dispatch((prev) => {
        const next = { ...prev.executionStatusMap };
        if (status === null) {
          delete next[taskId];
        } else {
          next[taskId] = status;
        }
        return { ...prev, executionStatusMap: next };
      });
    },
    setExecutionStatusMap(map) {
      controller.dispatch((prev) => ({ ...prev, executionStatusMap: map }));
    },
    clearExecutionStatuses() {
      controller.dispatch((prev) =>
        Object.keys(prev.executionStatusMap).length === 0 ? prev : { ...prev, executionStatusMap: {} },
      );
    },
  };
}
