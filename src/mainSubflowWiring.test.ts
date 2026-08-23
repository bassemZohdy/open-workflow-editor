import { describe, expect, it } from 'vitest';
import {
  collectWorkspaceDocuments,
  createRequestIdSequence,
  findMatchingSubflowTab,
  matchesSubflowNamespace,
  subflowRecordMatchesTarget,
} from './subflowWiring';
import { parseWorkflow } from './workflowModel';
import type { WorkflowDocument } from './types';

const spec = (namespace: string, name: string, marker: string) => `document:
  dsl: "1.0.3"
  namespace: ${namespace}
  name: ${name}
  version: "1.0.0"
do:
  - initSubflow:
      set:
        ${marker}: true
`;

const doc = (namespace: string | undefined, name: string, marker: string): WorkflowDocument =>
  ({
    document: { dsl: '1.0.3', ...(namespace === undefined ? {} : { namespace }), name, version: '1.0.0' },
    do: [{ initSubflow: { set: { [marker]: true } } }],
  }) as unknown as WorkflowDocument;

const markerOf = (document: WorkflowDocument): string =>
  Object.keys(
    (document.do?.[0] as { initSubflow?: { set?: Record<string, boolean> } })?.initSubflow?.set ?? {},
  )[0];

describe('createRequestIdSequence (Task 65: same-millisecond scaffold adds)', () => {
  it('yields strictly increasing ids when called twice within the same millisecond', () => {
    const next = createRequestIdSequence(() => 1700000000000);
    const first = next();
    const second = next();
    const third = next();
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(second).toBe(first + 1);
  });

  it('never repeats or rewinds an id, even if the clock stalls or jumps backwards', () => {
    let clock = 1700000000000;
    const next = createRequestIdSequence(() => clock);
    const first = next();
    clock = first - 9999; // clock rewinds below the issued id
    expect(next()).toBeGreaterThan(first);
    expect(next()).toBeGreaterThan(first + 1);
  });

  it('catches up when the clock jumps forward', () => {
    let clock = 1000;
    const next = createRequestIdSequence(() => clock);
    expect(next()).toBe(1000);
    clock = 9000;
    expect(next()).toBe(9000);
    expect(next()).toBe(9001);
  });
});

describe('sub-flow namespace matching (Task 66: strict candidate matching)', () => {
  describe.each([
    ['exact namespace', 'payments', 'payments', true],
    ['different namespace', 'payments', 'dubai-government', false],
    ['explicit namespace vs candidate without one', 'payments', undefined, false],
    ['caller without namespace still matches any candidate (legacy fallback)', undefined, 'anything', true],
    ['caller without namespace vs candidate without one', undefined, undefined, true],
  ])('matchesSubflowNamespace(%s)', (_label, requested, candidate, expected) => {
    it(`${JSON.stringify(requested)} vs ${JSON.stringify(candidate)} → ${expected}`, () => {
      expect(matchesSubflowNamespace(requested, candidate)).toBe(expected);
    });
  });

  describe('findMatchingSubflowTab', () => {
    const base = {
      tabIds: ['tab-a', 'tab-b'],
      activeTabId: 'tab-a',
      activeTab: { name: 'parent-flow', document: doc('root', 'parent-flow', 'parent') },
      tabMemories: new Map([
        ['tab-b', { name: 'billing-process', document: doc('dubai-government', 'billing-process', 'dubai') }],
      ]),
      records: [] as { id: string; name: string; specification: string }[],
      target: { name: 'billing-process', namespace: 'payments' },
      parseWorkflowSpec: parseWorkflow,
    };

    it('matches a tab whose namespace and name are exact', () => {
      expect(
        findMatchingSubflowTab({
          ...base,
          tabMemories: new Map([
            ['tab-b', { name: 'billing-process', document: doc('payments', 'billing-process', 'pay') }],
          ]),
        }),
      ).toBe('tab-b');
    });

    it('can match the active tab itself', () => {
      expect(
        findMatchingSubflowTab({
          ...base,
          activeTab: { name: 'billing-process', document: doc('payments', 'billing-process', 'pay') },
          target: { name: 'billing-process', namespace: 'payments' },
        }),
      ).toBe('tab-a');
    });

    it('does NOT match a same-named tab without a namespace when the caller passed one', () => {
      expect(
        findMatchingSubflowTab({
          ...base,
          tabMemories: new Map([
            ['tab-b', { name: 'billing-process', document: doc(undefined, 'billing-process', 'legacy') }],
          ]),
          target: { name: 'billing-process', namespace: 'payments' },
        }),
      ).toBeUndefined();
    });

    it('does NOT match a corrupted same-named library record tab when the caller passed a namespace', () => {
      expect(
        findMatchingSubflowTab({
          ...base,
          tabIds: ['tab-a', 'tab-b'],
          tabMemories: new Map(),
          records: [{ id: 'tab-b', name: 'billing-process', specification: '::: not yaml [' }],
          target: { name: 'billing-process', namespace: 'payments' },
        }),
      ).toBeUndefined();
    });

    it('matches a same-named namespace-less tab when the caller passed no namespace (legacy rule)', () => {
      expect(
        findMatchingSubflowTab({
          ...base,
          tabMemories: new Map([
            ['tab-b', { name: 'billing-process', document: doc(undefined, 'billing-process', 'legacy') }],
          ]),
          target: { name: 'billing-process' },
        }),
      ).toBe('tab-b');
    });

    it('matches a library-record tab by parsing its specification (case-sensitive name preserved)', () => {
      expect(
        findMatchingSubflowTab({
          ...base,
          tabMemories: new Map(),
          records: [
            {
              id: 'tab-b',
              name: 'billing-process',
              specification: spec('payments', 'billing-process', 'pay'),
            },
          ],
          target: { name: 'billing-process', namespace: 'payments' },
        }),
      ).toBe('tab-b');
    });

    it('skips tabs whose name differs', () => {
      expect(
        findMatchingSubflowTab({
          ...base,
          tabMemories: new Map([
            ['tab-b', { name: 'other-process', document: doc('payments', 'other-process', 'pay') }],
          ]),
          target: { name: 'billing-process', namespace: 'payments' },
        }),
      ).toBeUndefined();
    });
  });

  describe('subflowRecordMatchesTarget (library path)', () => {
    it.each([
      [
        'exact namespace and name matches',
        spec('payments', 'billing-process', 'pay'),
        { name: 'billing-process', namespace: 'payments' },
        true,
      ],
      [
        'different namespace is excluded',
        spec('dubai-government', 'billing-process', 'dubai'),
        { name: 'billing-process', namespace: 'payments' },
        false,
      ],
      [
        'unparsable specification is excluded (cannot verify namespace)',
        '::: not yaml [',
        { name: 'billing-process', namespace: 'payments' },
        false,
      ],
      [
        'parsed document without a namespace is excluded',
        spec('payments', 'billing-process', 'pay').replace('namespace: payments\n', ''),
        { name: 'billing-process', namespace: 'payments' },
        false,
      ],
      [
        'caller without namespace accepts a same-named legacy record',
        'no namespace here at all: [',
        { name: 'billing-process' },
        true,
      ],
    ])('%s', (_label, specification, target, expected) => {
      expect(
        subflowRecordMatchesTarget(
          { id: 'rec-1', name: 'billing-process', specification },
          target,
          parseWorkflow,
        ),
      ).toBe(expected);
    });

    it('keeps case-insensitive name comparison and the id fallback', () => {
      const record = {
        id: 'billing-process',
        name: 'Billing-Process',
        specification: spec('payments', 'Billing-Process', 'pay'),
      };
      expect(
        subflowRecordMatchesTarget(record, { name: 'billing-process', namespace: 'payments' }, parseWorkflow),
      ).toBe(true);
    });

    it('still requires the namespace to match when the id fallback is used', () => {
      const record = {
        id: 'billing-process',
        name: 'Unrelated Name',
        specification: spec('dubai-government', 'Unrelated Name', 'dubai'),
      };
      expect(
        subflowRecordMatchesTarget(record, { name: 'billing-process', namespace: 'payments' }, parseWorkflow),
      ).toBe(false);
    });
  });
});

describe('collectWorkspaceDocuments (Task 67: live active-tab snapshot)', () => {
  const staleActive = doc('payments', 'billing-process', 'staleSpec');
  const liveActive = doc('payments', 'billing-process', 'liveSpec');
  const otherTab = doc('dubai-government', 'travel-pass', 'otherTab');

  it("uses the ACTIVE tab's live document over its stale stashed ref entry", () => {
    const memories = new Map([
      ['tab-active', { id: 'tab-active', document: staleActive }],
      ['tab-other', { id: 'tab-other', document: otherTab }],
    ]);
    const docs = collectWorkspaceDocuments(
      memories,
      { id: 'tab-active', document: liveActive },
      [],
      parseWorkflow,
    );
    expect(docs.map((d) => d.document?.name)).toEqual(['billing-process', 'travel-pass']);
    expect(markerOf(docs[0])).toBe('liveSpec');
    expect(docs.some((d) => markerOf(d) === 'staleSpec')).toBe(false);
  });

  it('appends the live active document when the active tab is not stashed yet', () => {
    const memories = new Map([['tab-other', { id: 'tab-other', document: otherTab }]]);
    const docs = collectWorkspaceDocuments(
      memories,
      { id: 'tab-active', document: liveActive },
      [],
      parseWorkflow,
    );
    expect(docs).toHaveLength(2);
    expect(markerOf(docs[docs.length - 1])).toBe('liveSpec');
  });

  it('parses saved library records and skips unparsable ones', () => {
    const memories = new Map([['tab-other', { id: 'tab-other', document: otherTab }]]);
    const docs = collectWorkspaceDocuments(
      memories,
      { id: 'tab-active', document: liveActive },
      [{ specification: spec('billing', 'from-record', 'recordSpec') }, { specification: '::: not yaml [' }],
      parseWorkflow,
    );
    expect(docs).toHaveLength(3);
    expect(docs.some((d) => markerOf(d) === 'recordSpec')).toBe(true);
  });
});
