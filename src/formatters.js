import { validateGraph } from './workflowModel';

function formatError(error) {
  if (error?.schemaErrors?.length) {
    const formatted = error.schemaErrors
      .slice(0, 3)
      .map((item) => `${item.instancePath || '/'} — ${item.message}`)
      .join('\n');
    const unsupportedTask = error.schemaErrors.some(
      (item) =>
        /\/do\/\d+\//.test(item.instancePath || '') &&
        item.message === 'must match exactly one schema in oneOf',
    );
    return unsupportedTask ? `Unsupported task or structure:\n${formatted}` : formatted;
  }
  return error?.reason || error?.message || 'The workflow could not be parsed.';
}

function formatJsonInput(value, fallback = '{}') {
  if (value === undefined) return fallback;
  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? fallback : serialized;
}

function objectToPairs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    value: typeof entryValue === 'string' ? entryValue : JSON.stringify(entryValue),
  }));
}

function objectToCatalogEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, catalog]) => ({
    name,
    endpoint: typeof catalog?.endpoint === 'string' ? catalog.endpoint : '',
  }));
}

function formatGraphIssues(document) {
  const issues = validateGraph(document);
  return issues.length ? issues.map((issue) => `${issue.path} — ${issue.message}`).join('\n') : '';
}

function validationTitle(message) {
  if (/must match|unevaluated|unsupported|unknown task/i.test(message))
    return 'Unsupported task or structure';
  if (/yaml|mapping|parse|unexpected|flow sequence|flow mapping/i.test(message))
    return 'Could not parse specification';
  return 'Specification needs attention';
}

export { formatError, formatJsonInput, objectToPairs, objectToCatalogEntries, formatGraphIssues, validationTitle };