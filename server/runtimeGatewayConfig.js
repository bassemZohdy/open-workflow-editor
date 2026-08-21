/**
 * Server-only configuration for the future runtime gateway.
 *
 * Keep this module outside src/ so Vite cannot include credentials in the
 * browser bundle. The browser may receive the gateway URL, but never the
 * upstream runtime token.
 */
export const RUNTIME_GATEWAY_ENV = {
  baseUrl: 'OPEN_WORKFLOW_RUNTIME_BASE_URL',
  authToken: 'OPEN_WORKFLOW_RUNTIME_AUTH_TOKEN',
  name: 'OPEN_WORKFLOW_RUNTIME_NAME',
};

export function readRuntimeGatewayConfig(env = {}) {
  const rawBaseUrl = String(env[RUNTIME_GATEWAY_ENV.baseUrl] || '').trim();
  const authToken = String(env[RUNTIME_GATEWAY_ENV.authToken] || '').trim();
  const name = String(env[RUNTIME_GATEWAY_ENV.name] || 'Open Workflow Java runtime').trim();

  if (!rawBaseUrl) {
    return { enabled: false, baseUrl: null, authToken: authToken || null, name };
  }

  let parsed;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new TypeError(`${RUNTIME_GATEWAY_ENV.baseUrl} must be a valid URL.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError(`${RUNTIME_GATEWAY_ENV.baseUrl} must use http or https.`);
  }

  return {
    enabled: true,
    baseUrl: parsed.toString().replace(/\/$/, ''),
    authToken: authToken || null,
    name,
  };
}

export function runtimeRequestHeaders(config, headers = {}) {
  const nextHeaders = { 'content-type': 'application/json', ...headers };
  if (config.authToken) nextHeaders.authorization = `Bearer ${config.authToken}`;
  return nextHeaders;
}

export function publicRuntimeConfig(config) {
  return {
    enabled: Boolean(config.enabled),
    baseUrl: config.baseUrl || null,
    name: config.name,
  };
}
