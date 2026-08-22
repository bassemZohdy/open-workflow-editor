import { describe, expect, it } from 'vitest';
import { fuzzyMatch, fuzzyRank, offsetToLineCol, substringPattern } from './fuzzy';
import { collectSpecDiagnostics, type SpecDiagnostic } from './formatters';
import type { GraphIssue } from './types';

describe('fuzzyMatch', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyMatch('save', 'Save workflow')).not.toBeNull();
    expect(fuzzyMatch('swf', 'Save workflow')).not.toBeNull();
    expect(fuzzyMatch('zzz', 'Save workflow')).toBeNull();
  });

  it('returns positions of matched characters', () => {
    const result = fuzzyMatch('wf', 'Save workflow');
    expect(result).not.toBeNull();
    expect(result!.positions.length).toBe(2);
  });

  it('ranks contiguous and boundary matches higher', () => {
    const text = 'Auto layout workflow';
    const contiguous = fuzzyMatch('layout', text)!;
    const scattered = fuzzyMatch('lwf', text)!;
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });

  it('fuzzyRank drops non-matching items and sorts by score', () => {
    const items = [{ label: 'Save' }, { label: 'Save again' }, { label: 'Delete' }];
    const ranked = fuzzyRank('save', items, (item) => item.label);
    expect(ranked.map((entry) => entry.item.label)).toEqual(['Save', 'Save again']);
  });
});

describe('offsetToLineCol', () => {
  it('computes 1-based line and column', () => {
    const text = 'alpha\nbeta\ngamma';
    expect(offsetToLineCol(text, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineCol(text, 6)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineCol(text, 7)).toEqual({ line: 2, column: 2 });
  });

  it('clamps out-of-range offsets', () => {
    expect(offsetToLineCol('abc', 99)).toEqual({ line: 1, column: 4 });
    expect(offsetToLineCol('abc', -3)).toEqual({ line: 1, column: 1 });
  });
});

describe('substringPattern', () => {
  it('builds a case-insensitive regex or null for empty input', () => {
    expect(substringPattern('hello')?.test('HELLO world')).toBe(true);
    expect(substringPattern('   ')).toBeNull();
  });
});

describe('collectSpecDiagnostics', () => {
  const text = `document:
  dsl: "1.0.3"
  namespace: default
  name: demo
  version: "0.1.0"
do:
  - firstTask:
      set:
        flag: true
  - secondTask:
      set:
        flag: false
      then: missingTask
`;

  it('reports graph issues as positioned warnings', () => {
    const issues: GraphIssue[] = [
      { path: '/do/secondTask/then', message: 'Task target “missingTask” does not exist.' },
    ];
    const diagnostics = collectSpecDiagnostics(text, 'yaml', null, issues);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    // The `then` key lives on the row with "then: missingTask".
    expect(text.split('\n')[diagnostics[0].line]).toContain('then:');
  });

  it('positions YAML syntax errors using the parser mark', () => {
    const error = { mark: { line: 4, column: 3 }, reason: 'unexpected end of the stream' };
    const diagnostics = collectSpecDiagnostics('a: 1\nb: [', 'yaml', error, []);
    expect(diagnostics[0]).toMatchObject({ line: 4, column: 3, severity: 'error' });
  });

  it('positions JSON syntax errors from the offset in the message', () => {
    const error = new SyntaxError('Unexpected token } in JSON at position 5');
    const diagnostics = collectSpecDiagnostics('{\n  "a": }', 'json', error, [] as GraphIssue[]);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].line).toBeGreaterThanOrEqual(1);
  });

  it('renders schema errors with resolved instance paths', () => {
    const error = {
      schemaErrors: [{ instancePath: '/do/0', message: 'must match exactly one schema in oneOf' }],
    };
    const diagnostics = collectSpecDiagnostics(text, 'yaml', error, []);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    const lineText = text.split('\n')[diagnostics[0].line];
    expect(lineText).toContain('firstTask');
  });

  it('returns an empty list for a clean document', () => {
    expect(collectSpecDiagnostics(text, 'yaml', null, [])).toEqual([]);
  });
});

describe('SpecDiagnostic shape', () => {
  it('keeps path for graph diagnostics', () => {
    const diagnostics: SpecDiagnostic[] = collectSpecDiagnostics('a: 1', 'yaml', null, [
      { path: '/do/x', message: 'boom' },
    ]);
    expect(diagnostics[0].path).toBe('/do/x');
  });
});
