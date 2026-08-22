import type { TaskColor, TaskType } from './types';

export type PaletteGroup = 'Flow control' | 'Data & logic' | 'Services' | 'Events' | 'AI';

/** Canonical palette group order (left rail). */
export const PALETTE_GROUPS: PaletteGroup[] = ['Flow control', 'Data & logic', 'Services', 'Events', 'AI'];

export interface PaletteItem {
  type: TaskType;
  label: string;
  description: string;
  icon: string;
  color: TaskColor;
  group: PaletteGroup;
  /** Prototype items that cannot be added to a document yet. */
  comingSoon?: boolean;
  /** Short tooltip for prototype items (planned surface). */
  plan?: string;
}

const paletteItems: PaletteItem[] = [
  // Flow control & containers.
  {
    type: 'do',
    label: 'Do group',
    description: 'Run nested tasks',
    icon: '≡',
    color: 'green',
    group: 'Flow control',
  },
  {
    type: 'switch',
    label: 'Switch',
    description: 'Branch on a condition',
    icon: '◇',
    color: 'amber',
    group: 'Flow control',
  },
  {
    type: 'for',
    label: 'For each',
    description: 'Iterate over a collection',
    icon: '⟳',
    color: 'cyan',
    group: 'Flow control',
  },
  {
    type: 'fork',
    label: 'Fork',
    description: 'Run branches concurrently',
    icon: '⑂',
    color: 'rose',
    group: 'Flow control',
  },
  {
    type: 'try',
    label: 'Try / catch',
    description: 'Handle task failures',
    icon: '⊙',
    color: 'indigo',
    group: 'Flow control',
  },

  // Data & logic.
  {
    type: 'set',
    label: 'Set value',
    description: 'Write data to context',
    icon: '↳',
    color: 'blue',
    group: 'Data & logic',
  },
  {
    type: 'run',
    label: 'Run JavaScript',
    description: 'Execute in the Node sandbox',
    icon: 'JS',
    color: 'slate',
    group: 'Data & logic',
  },

  // Services & timing.
  {
    type: 'call',
    label: 'Call HTTP',
    description: 'Invoke an HTTP endpoint',
    icon: '↗',
    color: 'violet',
    group: 'Services',
  },
  {
    type: 'wait',
    label: 'Wait',
    description: 'Pause for a duration',
    icon: '◷',
    color: 'purple',
    group: 'Services',
  },

  // Events & errors.
  {
    type: 'emit',
    label: 'Emit event',
    description: 'Publish an event',
    icon: '✦',
    color: 'orange',
    group: 'Events',
  },
  {
    type: 'listen',
    label: 'Listen',
    description: 'Wait for an event',
    icon: '◌',
    color: 'teal',
    group: 'Events',
  },
  {
    type: 'raise',
    label: 'Raise error',
    description: 'Stop with an error',
    icon: '!',
    color: 'red',
    group: 'Events',
  },

  // AI task families (prototype — see TODO.md “AI task families”).
  {
    type: 'llm-call',
    label: 'LLM call',
    description: 'Prompt a language model',
    icon: '◈',
    color: 'magenta',
    group: 'AI',
    comingSoon: true,
    plan: 'Provider/model, prompt template, parameters, context binding, response mapping, retry.',
  },
  {
    type: 'ai-agent-call',
    label: 'AI agent call',
    description: 'Delegate to an AI agent',
    icon: '◮',
    color: 'magenta',
    group: 'AI',
    comingSoon: true,
    plan: 'Agent definition (use.agents), goal, tool allowlist, memory & limits, response mapping.',
  },
];

const taskColors: Record<TaskType, TaskColor> = {
  set: 'blue',
  call: 'violet',
  switch: 'amber',
  do: 'green',
  for: 'cyan',
  fork: 'rose',
  emit: 'orange',
  listen: 'teal',
  raise: 'red',
  run: 'slate',
  try: 'indigo',
  wait: 'purple',
  'llm-call': 'magenta',
  'ai-agent-call': 'magenta',
};

const taskSubtitles: Record<TaskType, string> = {
  set: 'Set values',
  call: 'HTTP call',
  switch: 'Conditional branch',
  do: 'Nested tasks',
  for: 'Collection loop',
  fork: 'Parallel branches',
  emit: 'Event emission',
  listen: 'Event listener',
  raise: 'Error handling',
  run: 'Node sandbox script',
  try: 'Try / catch',
  wait: 'Duration delay',
  'llm-call': 'LLM call',
  'ai-agent-call': 'AI agent',
};

export function getTaskIcon(taskType?: string, task?: Record<string, unknown>): string {
  if (!taskType) return '↳';
  if (taskType === 'try-catch' || taskType === 'catch') return '⊙';
  if (taskType === 'call') {
    const withObj = task?.with as Record<string, unknown> | undefined;
    if (
      !withObj?.endpoint &&
      !withObj?.method &&
      typeof task?.call === 'string' &&
      !task.call.startsWith('http://') &&
      !task.call.startsWith('https://')
    ) {
      return 'ƒ';
    }
    return '↗';
  }
  return paletteItems.find((item) => item.type === taskType)?.icon || '↳';
}

export function getTaskSubtitle(taskType?: string, task?: Record<string, unknown>): string {
  if (!taskType) return 'Task';
  if (taskType === 'try-catch') return 'Try / catch';
  if (taskType === 'catch') return 'Catch handler';
  if (taskType === 'call') {
    const withObj = task?.with as Record<string, unknown> | undefined;
    if (withObj && (withObj.endpoint || withObj.method)) {
      return 'HTTP call';
    }
    if (
      typeof task?.call === 'string' &&
      !task.call.startsWith('http://') &&
      !task.call.startsWith('https://')
    ) {
      return `fn: ${task.call}`;
    }
    return 'HTTP call';
  }
  return taskSubtitles[taskType as TaskType] || taskType;
}

export function getTaskColor(taskType?: string, task?: Record<string, unknown>): TaskColor {
  if (!taskType) return 'blue';
  if (taskType === 'try-catch' || taskType === 'catch') return 'indigo';
  if (taskType === 'call') {
    const withObj = task?.with as Record<string, unknown> | undefined;
    if (
      !withObj?.endpoint &&
      !withObj?.method &&
      typeof task?.call === 'string' &&
      !task.call.startsWith('http://') &&
      !task.call.startsWith('https://')
    ) {
      return 'purple';
    }
    return 'violet';
  }
  return taskColors[taskType as TaskType] || 'blue';
}

export { paletteItems, taskColors, taskSubtitles };
