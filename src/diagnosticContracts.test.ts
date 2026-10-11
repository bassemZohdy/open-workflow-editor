import { describe, expect, it } from 'vitest';
import {
  collectSpecDiagnostics,
  formatError,
  formatJsonInput,
  objectToCatalogEntries,
  objectToPairs,
  validationTitle,
} from './formatters';
import { getTaskColor, getTaskIcon, getTaskSubtitle, isAiDelegation, orderPaletteGroups } from './taskMeta';
import { validateJavaScriptFunction } from './scriptContract';

describe('specification diagnostics preserve actionable errors', () => {
  it('keeps parser reasons and distinguishes schema failures from syntax failures', () => {
    expect(formatError(null)).toBe('The workflow could not be parsed.');
    expect(formatError('bad input')).toBe('bad input');
    expect(formatError({ reason: 'bad YAML', message: 'wrapper' })).toBe('bad YAML');
    expect(formatError(new Error('bad JSON'))).toBe('bad JSON');
    expect(formatError({})).toBe('The workflow could not be parsed.');
    expect(formatError({ schemaErrors: [{ message: 'required' }] })).toBe('/ — required');
    expect(
      formatError({
        schemaErrors: [{ instancePath: '/do/0/task', message: 'must match exactly one schema in oneOf' }],
      }),
    ).toContain('Unsupported task or structure');
    expect(validationTitle('unknown task')).toBe('Unsupported task or structure');
    expect(validationTitle('unexpected YAML mapping')).toBe('Could not parse specification');
    expect(validationTitle('required field')).toBe('Specification needs attention');
  });

  it('positions JSON offsets and missing YAML marks without dropping the diagnostic', () => {
    expect(
      collectSpecDiagnostics('a\nbad', 'json', { message: 'Unexpected token at position 3' }, []),
    ).toEqual([{ message: 'Unexpected token at position 3', line: 1, column: 1, severity: 'error' }]);
    expect(collectSpecDiagnostics('', 'json', {}, [])[0]).toMatchObject({
      line: 0,
      column: 0,
      severity: 'error',
    });
    expect(
      collectSpecDiagnostics('', 'yaml', { mark: { line: 2 }, reason: 'bad mapping' }, [])[0],
    ).toMatchObject({ line: 2, column: 0, message: 'bad mapping' });
    expect(collectSpecDiagnostics('', 'yaml', { mark: { line: 'unknown' } }, [])[0]).toMatchObject({
      line: 0,
      column: 0,
    });
    expect(collectSpecDiagnostics('', 'yaml', { schemaErrors: [] }, [])).toHaveLength(1);
    expect(collectSpecDiagnostics('', 'yaml', null, [])).toEqual([]);
  });

  it('retains paths for missing keys, out-of-range arrays and escaped YAML key names', () => {
    const text = 'do:\n  - task.name:\n      set: {}';
    const diagnostics = collectSpecDiagnostics(
      text,
      'yaml',
      {
        schemaErrors: [
          { instancePath: '/do/0/task.name/set', message: 'bad set' },
          { instancePath: '/do/9', message: 'bad index' },
          { instancePath: '/missing', message: 'missing key' },
          {},
        ],
      },
      [],
    );
    expect(diagnostics.map(({ line }) => line)).toEqual([2, 0, 0, 0]);
    expect(diagnostics[0]).toMatchObject({
      path: '/do/0/task.name/set',
      message: '/do/0/task.name/set — bad set',
    });
    expect(diagnostics[3].message).toBe('/ — Schema violation');
  });

  it('keeps JSON values and rejects malformed inspector collections', () => {
    expect(formatJsonInput(undefined, '[]')).toBe('[]');
    expect(formatJsonInput(() => undefined, 'null')).toBe('null');
    expect(formatJsonInput(null)).toBe('null');
    expect(objectToPairs({ raw: 'text', count: 2, nested: { ok: true } })).toEqual([
      { key: 'raw', value: 'text' },
      { key: 'count', value: '2' },
      { key: 'nested', value: '{"ok":true}' },
    ]);
    for (const value of [null, 3, [], 'text']) {
      expect(objectToPairs(value)).toEqual([]);
      expect(objectToCatalogEntries(value)).toEqual([]);
    }
    expect(
      objectToCatalogEntries({
        good: { endpoint: 'https://example.test' },
        absent: {},
        invalid: 3,
        nil: null,
      }),
    ).toEqual([
      { name: 'good', endpoint: 'https://example.test' },
      { name: 'absent', endpoint: '' },
      { name: 'invalid', endpoint: '' },
      { name: 'nil', endpoint: '' },
    ]);
  });
});

describe('palette classification respects the workflow contract', () => {
  it('distinguishes reusable functions from HTTP calls, including configured endpoints', () => {
    expect(getTaskSubtitle('call', { call: 'reusableFunction' })).toBe('fn: reusableFunction');
    expect(getTaskColor('call', { call: 'reusableFunction' })).toBe('purple');
    for (const task of [
      { call: 'https://example.test' },
      { call: 'http://example.test' },
      { call: 'http', with: { endpoint: 'https://example.test' } },
      { call: 'http', with: { method: 'get' } },
      {},
    ]) {
      expect(getTaskSubtitle('call', task)).toBe('HTTP call');
      expect(getTaskColor('call', task)).toBe('violet');
      expect(getTaskIcon('call', task)).toBeTruthy();
    }
    expect(getTaskIcon('call', { call: 'reusableFunction' })).toBeTruthy();
  });
  it('labels unknown and AI subflows without pretending they are built-in tasks', () => {
    const ai = { run: { workflow: { namespace: 'ai', name: 'custom-agent' } } };
    expect(isAiDelegation(ai)).toBe(true);
    expect(getTaskSubtitle('run', ai)).toBe('ai: custom-agent');
    expect(getTaskColor('run', ai)).toBe('magenta');
    expect(getTaskIcon('run', ai)).toBeTruthy();
    expect(getTaskSubtitle('run', { run: { workflow: { namespace: 'ai' } } })).toBe('ai: ai');
    expect(isAiDelegation()).toBe(false);
    expect(getTaskSubtitle()).toBe('Task');
    expect(getTaskSubtitle('unknown')).toBe('unknown');
    expect(getTaskColor()).toBe('blue');
    expect(getTaskColor('unknown')).toBe('blue');
    expect(getTaskIcon()).toBeTruthy();
    expect(getTaskIcon('unknown')).toBeTruthy();
    expect(getTaskSubtitle('try-catch')).toBe('Try / catch');
    expect(getTaskSubtitle('catch')).toBe('Catch handler');
    expect(getTaskColor('catch')).toBe('indigo');
    expect(getTaskIcon('catch')).toBeTruthy();
    expect(orderPaletteGroups([])).toHaveLength(5);
    expect(orderPaletteGroups(['invalid', 'AI'])).toEqual([
      'AI',
      'Flow control',
      'Data & logic',
      'Services',
      'Events',
    ]);
  });
});

describe('JavaScript task validation prevents malformed task submission', () => {
  it.each([undefined, '', '   ', 'return 1', '() => {', 'function broken('])(
    'rejects invalid function source %s',
    (source) => {
      expect(validateJavaScriptFunction(source).valid).toBe(false);
    },
  );
  it.each([
    'function () { return 1; }',
    'async function () { return 1; }',
    'value => value',
    'async (value) => value',
  ])('accepts a function expression %s', (source) => {
    expect(validateJavaScriptFunction(source)).toEqual({ valid: true });
  });
});
