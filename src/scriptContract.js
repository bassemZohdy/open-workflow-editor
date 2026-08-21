export const DEFAULT_JAVASCRIPT_TASK = `({ input, context, catalogs }) => ({
  renewed: true,
  reference: input.reference || context.nolTagId,
  catalog: Object.keys(catalogs || {})[0] || 'none',
})`;

export function validateJavaScriptFunction(source) {
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
    return { valid: false, message: `JavaScript syntax error: ${error.message}` };
  }
  return { valid: true };
}
