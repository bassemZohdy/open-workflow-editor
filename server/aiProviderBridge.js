/**
 * AI provider bridge — reference implementation (Task 16 companion).
 *
 * Where provider keys live server-side. The editor's AI sub-flows
 * (`ai/prompt-llm`, `ai/ai-agent`) are catalog-backed: they resolve the
 * provider endpoint from `use.catalogs` (`ai-providers` / `agents`) and run a
 * contract stub in the demo engine. Production runtimes wire an adapter that
 * implements this bridge instead of the stub — providers are called from the
 * server, secrets never reach the browser.
 *
 * Contract:
 *   createAiProviderBridge(providerConfig) -> Bridge
 *   bridge.chat({ model, messages, temperature, maxTokens }) -> { completion, usage }
 *   bridge.runAgent({ agent, goal, tools, context }) -> { steps, outcome }
 *
 * Security notes:
 *   - Keys come from the environment (AI_OPENAI_API_KEY etc.) or a secret
 *     manager; never from workflow documents or client requests.
 *   - Requests are validated (schema + size limits) before any provider call.
 *   - Audit each provider call with the same envelope the runtime gateway uses
 *     (`server/runtimeGatewayHandler.js`) so `/audit` stays the single trail.
 */

export function createAiProviderBridge(providerConfig = {}) {
  const apiKey = providerConfig.apiKey || process.env.AI_PROVIDER_API_KEY || '';
  const baseUrl = providerConfig.baseUrl || process.env.AI_PROVIDER_BASE_URL || 'https://api.example.ai/v1';
  if (!apiKey && providerConfig.requireKey !== false) {
    return {
      configurationError: new Error('AI provider key is not configured (AI_PROVIDER_API_KEY).'),
    };
  }

  const validatePayload = (payload, allowedKeys, requiredKeys) => {
    const body = payload || {};
    for (const key of requiredKeys || []) {
      if (body[key] === undefined || body[key] === null || body[key] === '') {
        return { error: `Missing required field: ${key}` };
      }
    }
    for (const key of Object.keys(body)) {
      if (!allowedKeys.includes(key)) {
        return { error: `Unexpected field: ${key}` };
      }
    }
    const serialized = JSON.stringify(body);
    if (serialized.length > 64 * 1024) {
      return { error: 'Request too large (limit 64 KiB).' };
    }
    return null;
  };

  const callProvider = async (path, body) => {
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;

    // SSRF protection: validate URL
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid provider URL: ${url}`);
    }

    // Require HTTPS
    if (parsed.protocol !== 'https:') {
      throw new Error(`Provider URL must use HTTPS: ${url}`);
    }

    // Block loopback/private/link-local destinations
    const hostname = parsed.hostname;
    const isPrivate =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fe80:');

    if (isPrivate) {
      throw new Error(`Provider URL must not target private/loopback addresses: ${hostname}`);
    }

    // Egress timeout: 30 seconds
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`AI provider error (${response.status}): ${text.slice(0, 240)}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    /** LLM chat completion following the `ai/prompt-llm` sub-flow contract. */
    async chat(payload) {
      const invalid = validatePayload(
        payload,
        ['model', 'messages', 'temperature', 'maxTokens', 'tools'],
        ['messages'],
      );
      if (invalid) throw new Error(invalid.error);
      const result = await callProvider('/chat', payload);
      return {
        completion: result.choices?.[0]?.message?.content ?? result.completion ?? '',
        model: result.model || payload.model || 'default-model',
        usage: result.usage || null,
      };
    },

    /** Agent run following the `ai/ai-agent` sub-flow contract. */
    async runAgent(payload) {
      const invalid = validatePayload(payload, ['agent', 'goal', 'tools', 'context', 'maxSteps'], ['goal']);
      if (invalid) throw new Error(invalid.error);
      const result = await callProvider('/agent', payload);
      return {
        steps: result.steps || [],
        outcome: result.outcome || result.result || '',
      };
    },
  };
}

export default createAiProviderBridge;
