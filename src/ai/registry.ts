/**
 * AI component registry — the single source of truth for every AI component
 * the editor offers. Components are composed from valid Open Workflow
 * extension mechanisms (`use.catalogs`, `use.functions`, defined sub-flows
 * via `run.workflow`) instead of native DSL keys, so each entry here fully
 * declares: palette presentation, delegation-task identity, sub-flow
 * document shape, catalog-backed provider descriptor, runnable script
 * contract, and the demo-engine mock recipe.
 *
 * Adding an AI component = adding one entry to `AI_COMPONENTS` (plus tests).
 * Nothing else branches on specific kinds.
 */

import type { AiTaskKind } from '../scriptContract';
import {
  AI_AGENT_SCRIPT,
  AI_LLM_SCRIPT,
  AI_TEXT_CLASSIFIER_SCRIPT,
  AI_TEXT_SUMMARIZER_SCRIPT,
} from '../scriptContract';

/** Where a component resolves its provider configuration from. */
export interface AiCatalogDescriptor {
  /** `use.catalogs` key inside the scaffolded sub-flow. */
  catalogKey: string;
  /** Endpoint scaffolded into the catalog entry (placeholder until wired). */
  endpoint: string;
}

/**
 * Declarative demo-engine mock recipe: when an AI delegation has no matching
 * workspace document, the engine fabricates a contract-shaped result from
 * these fields instead of executing the sub-flow.
 */
export interface AiMockRecipe {
  /** Input/context keys tried in order to find the echo source. */
  sourceKeys: string[];
  /** Result key merged under the delegation task name. */
  resultKey: string;
  /** Mock marker prefixed to the echoed source. */
  prefix: string;
  /** Maximum echoed source length. */
  maxEchoLength: number;
  logLabel: string;
  /** Deterministic extra output fields beyond the echoed result. */
  extraOutput?: (source: string, input: Record<string, unknown>) => Record<string, unknown>;
  /** Log metadata emitted alongside the mock result (replaces per-kind type-sniffing). */
  logMeta?: (source: string, input: Record<string, unknown>) => Record<string, unknown>;
}

/** A first-class AI component assembled from spec-valid primitives. */
export interface AiComponent {
  /** Palette/task-kind identifier (also the delegation's logical type). */
  kind: AiTaskKind;
  label: string;
  description: string;
  icon: string;
  /** Palette row hint shown under the label. */
  plan: string;
  /** Parent delegation task name (`addTopLevelAiTask` dedupes with -2, -3…). */
  taskName: string;
  subflowNamespace: string;
  subflowName: string;
  subflowVersion: string;
  catalog: AiCatalogDescriptor;
  /** Runnable contract executed inside the sub-flow (`run.script`). */
  script: string;
  /** Name of the script task inside the sub-flow. */
  invokeName: string;
  /** Result path captured into the sub-flow's final context. */
  resultKey: string;
  resultPath: string;
  mock: AiMockRecipe;
}

const LLM_SOURCE_KEYS = ['prompt', 'goal'];
const AGENT_SOURCE_KEYS = ['goal', 'prompt'];

/**
 * All registered AI components. Order defines palette order within the AI
 * group.
 */
export const AI_COMPONENTS: AiComponent[] = [
  {
    kind: 'llm-call',
    label: 'LLM call',
    description: 'Prompt a language model',
    icon: '◈',
    plan: 'Adds an AI sub-flow delegation task + scaffolds the catalog-backed provider sub-flow.',
    taskName: 'aiLlmTask',
    subflowNamespace: 'ai',
    subflowName: 'prompt-llm',
    subflowVersion: '0.1.0',
    catalog: { catalogKey: 'ai-providers', endpoint: 'https://api.example.ai/v1/chat' },
    script: AI_LLM_SCRIPT,
    invokeName: 'invokeLlm',
    resultKey: 'llmResult',
    resultPath: 'completion',
    mock: {
      sourceKeys: LLM_SOURCE_KEYS,
      resultKey: 'llmResult',
      prefix: '[mock-llm]',
      maxEchoLength: 160,
      logLabel: 'LLM sub-flow',
      extraOutput: (_source, input) => ({
        model: String(input.model || 'default-model'),
        usage: { inputTokens: _source.length, outputTokens: 24 },
      }),
      logMeta: (_source, input) => ({ model: String(input.model || 'default-model') }),
    },
  },
  {
    kind: 'ai-agent-call',
    label: 'AI agent call',
    description: 'Delegate to an AI agent',
    icon: '◮',
    plan: 'Adds an AI sub-flow delegation task + scaffolds the agent sub-flow.',
    taskName: 'aiAgentTask',
    subflowNamespace: 'ai',
    subflowName: 'ai-agent',
    subflowVersion: '0.1.0',
    catalog: { catalogKey: 'agents', endpoint: 'https://api.example.ai/v1/agent' },
    script: AI_AGENT_SCRIPT,
    invokeName: 'runAgent',
    resultKey: 'agentResult',
    resultPath: 'outcome',
    mock: {
      sourceKeys: AGENT_SOURCE_KEYS,
      resultKey: 'agentResult',
      prefix: '[mock-agent]',
      maxEchoLength: 140,
      logLabel: 'AI agent sub-flow',
      extraOutput: () => ({
        steps: ['search', 'compute'].map((tool) => ({ tool, status: 'ok' })),
      }),
      logMeta: () => ({ steps: 2 }),
    },
  },
  {
    kind: 'text-classifier',
    label: 'Text classifier',
    description: 'Classify text into labeled categories',
    icon: '❖',
    plan: 'Adds a classifier delegation + scaffolds the prompt-builder/classifier sub-flow.',
    taskName: 'classifyTextTask',
    subflowNamespace: 'ai',
    subflowName: 'text-classifier',
    subflowVersion: '0.1.0',
    catalog: { catalogKey: 'ai-providers', endpoint: 'https://api.example.ai/v1/chat' },
    script: AI_TEXT_CLASSIFIER_SCRIPT,
    invokeName: 'invokeClassifier',
    resultKey: 'classification',
    resultPath: 'topLabel',
    mock: {
      sourceKeys: ['text'],
      resultKey: 'classification',
      prefix: '[mock-classify]',
      maxEchoLength: 120,
      logLabel: 'classifier sub-flow',
      extraOutput: () => ({
        topLabel: 'general',
        confidence: 0.82,
        labels: [
          { label: 'general', confidence: 0.82 },
          { label: 'billing', confidence: 0.11 },
          { label: 'technical', confidence: 0.07 },
        ],
      }),
    },
  },
  {
    kind: 'text-summarizer',
    label: 'Text summarizer',
    description: 'Summarize long text via chunked passes',
    icon: '≡',
    plan: 'Adds a summarizer delegation + scaffolds the chunked map-reduce sub-flow.',
    taskName: 'summarizeTextTask',
    subflowNamespace: 'ai',
    subflowName: 'text-summarizer',
    subflowVersion: '0.1.0',
    catalog: { catalogKey: 'ai-providers', endpoint: 'https://api.example.ai/v1/chat' },
    script: AI_TEXT_SUMMARIZER_SCRIPT,
    invokeName: 'combineSummaries',
    resultKey: 'summary',
    resultPath: 'summary',
    mock: {
      sourceKeys: ['text'],
      resultKey: 'summary',
      prefix: '[mock-summarize]',
      maxEchoLength: 140,
      logLabel: 'summarizer sub-flow',
      extraOutput: () => ({ chunks: 1 }),
    },
  },
];

/** All components, frozen against accidental mutation. */
Object.freeze(AI_COMPONENTS);
export const aiComponents = (): readonly AiComponent[] => AI_COMPONENTS;

/** Lookup by palette/kind identifier. Throws for unknown kinds. */
export function getAiComponent(kind: AiTaskKind): AiComponent {
  const component = AI_COMPONENTS.find((candidate) => candidate.kind === kind);
  if (!component) throw new Error(`Unknown AI component kind: ${kind}`);
  return component;
}

/** Lookup by sub-flow delegation target (namespace + name). */
export function findAiComponentBySubflow(
  namespace: string | undefined,
  name: string | undefined,
): AiComponent | undefined {
  return AI_COMPONENTS.find(
    (candidate) => candidate.subflowNamespace === namespace && candidate.subflowName === name,
  );
}
