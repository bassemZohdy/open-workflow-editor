import type { TaskColor, TaskType } from './types';

export interface PaletteItem {
  type: TaskType;
  label: string;
  description: string;
  icon: string;
  color: TaskColor;
}

const paletteItems: PaletteItem[] = [
  { type: 'set', label: 'Set value', description: 'Write data to context', icon: '↳', color: 'blue' },
  { type: 'call', label: 'Call HTTP', description: 'Invoke an HTTP endpoint', icon: '↗', color: 'violet' },
  { type: 'switch', label: 'Switch', description: 'Branch on a condition', icon: '◇', color: 'amber' },
  { type: 'do', label: 'Do group', description: 'Run nested tasks', icon: '≡', color: 'green' },
  { type: 'for', label: 'For each', description: 'Iterate over a collection', icon: '⟳', color: 'cyan' },
  { type: 'fork', label: 'Fork', description: 'Run branches concurrently', icon: '⑂', color: 'rose' },
  { type: 'emit', label: 'Emit event', description: 'Publish an event', icon: '✦', color: 'orange' },
  { type: 'listen', label: 'Listen', description: 'Wait for an event', icon: '◌', color: 'teal' },
  { type: 'raise', label: 'Raise error', description: 'Stop with an error', icon: '!', color: 'red' },
  {
    type: 'run',
    label: 'Run JavaScript',
    description: 'Execute in the Node sandbox',
    icon: 'JS',
    color: 'slate',
  },
  { type: 'try', label: 'Try / catch', description: 'Handle task failures', icon: '⊙', color: 'indigo' },
  { type: 'wait', label: 'Wait', description: 'Pause for a duration', icon: '◷', color: 'purple' },
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
};

export { paletteItems, taskColors, taskSubtitles };
