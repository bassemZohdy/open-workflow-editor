export interface JavaScriptValidationResult {
  valid: boolean;
  message?: string;
}

export const DEFAULT_JAVASCRIPT_TASK = `({ input, context, catalogs }) => ({
  renewed: true,
  reference: input.reference || context.nolTagId,
  catalog: Object.keys(catalogs || {})[0] || 'none',
})`;

/**
 * Contract stub for the LLM-call subflow body. Reads the provider endpoint from
 * the `ai-providers` catalog entry, honours the prompt/model passed through
 * `input`, and returns a completion-shaped result. Production runtimes replace
 * this with a provider call via `server/aiProviderBridge.js` (keys stay
 * server-side); the demo engine executes it as-is.
 */
export const AI_LLM_SCRIPT = `({ input, context, catalogs }) => {
  const provider = catalogs?.['ai-providers'];
  const prompt = input?.prompt || input?.message || context?.prompt || 'Say hello.';
  const model = input?.model || 'default-model';
  return {
    model,
    provider: provider?.endpoint || 'catalog:ai-providers',
    usage: { inputTokens: prompt.length, outputTokens: 24 },
    completion: '[mock-llm] ' + String(prompt).slice(0, 160),
    toolCalls: input?.tools || [],
  };
}`;

/**
 * Contract stub for the AI-agent subflow body. Reads the agent catalog entry,
 * runs a bounded mock tool loop, and returns `{ steps, outcome }`.
 */
export const AI_AGENT_SCRIPT = `({ input, context, catalogs }) => {
  const agent = catalogs?.['agents'];
  const goal = input?.goal || context?.goal || 'Complete the requested task.';
  const tools = input?.tools || agent?.tools || ['search', 'compute'];
  return {
    agent: agent?.endpoint || 'catalog:agents',
    steps: tools.slice(0, 3).map((tool) => ({ tool, status: 'ok' })),
    outcome: '[mock-agent] ' + String(goal).slice(0, 140),
  };
}`;

/**
 * Contract stub for the text-classifier subflow body. Reads the provider
 * endpoint from the `ai-providers` catalog, classifies input text against
 * candidate labels, and returns a classification-shaped result.
 */
export const AI_TEXT_CLASSIFIER_SCRIPT = `({ input, context, catalogs }) => {
  const provider = catalogs?.['ai-providers'];
  const text = input?.text || context?.text || '';
  const candidateLabels = (input?.labels?.length ? input.labels : null) || ['billing', 'technical', 'general'];
  const picked = candidateLabels[String(text).length % candidateLabels.length];
  return {
    model: input?.model || 'default-model',
    provider: provider?.endpoint || 'catalog:ai-providers',
    topLabel: picked,
    confidence: Math.round((0.55 + (String(text).length % 40) / 100) * 100) / 100,
    labels: candidateLabels.map((label) => ({
      label,
      confidence: label === picked ? 0.82 : 0.09,
    })),
  };
}`;

/**
 * Contract stub for the text-summarizer subflow body. Reads the provider
 * endpoint from the `ai-providers` catalog, combines collected chunk summaries,
 * and returns a summary-shaped result.
 */
export const AI_TEXT_SUMMARIZER_SCRIPT = `({ input, context, catalogs }) => {
  const provider = catalogs?.['ai-providers'];
  const text = input?.text || context?.text || '';
  const collected = context?.collectedSummaries || [];
  return {
    model: input?.model || 'default-model',
    provider: provider?.endpoint || 'catalog:ai-providers',
    chunks: collected.length || 1,
    summary: '[mock-summarize] ' + (collected.join(' ') || String(text).slice(0, 140)),
  };
}`;

/** AI-delegation task kinds supported by the editor scaffolding. */
export type AiTaskKind = 'llm-call' | 'ai-agent-call' | 'text-classifier' | 'text-summarizer';

export function validateJavaScriptFunction(source: unknown): JavaScriptValidationResult {
  const code = String(source || '').trim();
  if (!code) return { valid: false, message: 'JavaScript function is required.' };

  const looksLikeFunction =
    /^(?:async\s+)?function\b/.test(code) || /^(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(code);
  if (!looksLikeFunction) {
    return {
      valid: false,
      message: 'Use a function expression, for example: ({ input, context }) => ({ ok: true }).',
    };
  }

  try {
    const candidate = new Function(`"use strict"; return (${code});`)();
    if (typeof candidate !== 'function') {
      return { valid: false, message: 'The JavaScript task must evaluate to a function.' };
    }
  } catch (error) {
    return {
      valid: false,
      message: `JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { valid: true };
}
