import { validateGraph } from './workflowModel';
import type { WorkflowDocument } from './types';

interface SchemaErrorItem {
  instancePath?: string;
  message?: string;
}

/** Error shape produced by the SDK parser (AJV schema errors and reason). */
export interface WorkflowParseError {
  schemaErrors?: SchemaErrorItem[];
  reason?: string;
  message?: string;
}

function formatError(error: WorkflowParseError | undefined | null): string {
  if (error?.schemaErrors?.length) {
    const schemaErrors: SchemaErrorItem[] = error.schemaErrors;
    const formatted = schemaErrors
      .slice(0, 3)
      .map((item) => `${item.instancePath || '/'} — ${item.message}`)
      .join('\n');
    const unsupportedTask = schemaErrors.some(
      (item) =>
        /\/do\/\d+\//.test(item.instancePath || '') &&
        item.message === 'must match exactly one schema in oneOf',
    );
    return unsupportedTask ? `Unsupported task or structure:\n${formatted}` : formatted;
  }
  return error?.reason || error?.message || 'The workflow could not be parsed.';
}

function formatJsonInput(value: unknown, fallback = '{}'): string {
  if (value === undefined) return fallback;
  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? fallback : serialized;
}

export interface KeyValueEntry {
  key: string;
  value: string;
}

function objectToPairs(value: unknown): KeyValueEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => ({
    key,
    value: typeof entryValue === 'string' ? entryValue : JSON.stringify(entryValue),
  }));
}

export interface CatalogEntry {
  name: string;
  endpoint: string;
}

function objectToCatalogEntries(value: unknown): CatalogEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([name, catalog]) => ({
    name,
    endpoint:
      catalog &&
      typeof catalog === 'object' &&
      typeof (catalog as { endpoint?: unknown }).endpoint === 'string'
        ? (catalog as { endpoint: string }).endpoint
        : '',
  }));
}

function formatGraphIssues(document: WorkflowDocument): string {
  const issues = validateGraph(document);
  return issues.length
    ? issues.map((issue: { path: string; message: string }) => `${issue.path} — ${issue.message}`).join('\n')
    : '';
}

function validationTitle(message: string): string {
  if (/must match|unevaluated|unsupported|unknown task/i.test(message))
    return 'Unsupported task or structure';
  if (/yaml|mapping|parse|unexpected|flow sequence|flow mapping/i.test(message))
    return 'Could not parse specification';
  return 'Specification needs attention';
}

export {
  formatError,
  formatJsonInput,
  objectToPairs,
  objectToCatalogEntries,
  formatGraphIssues,
  validationTitle,
};
