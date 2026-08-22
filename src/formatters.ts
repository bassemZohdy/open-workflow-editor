import { validateGraph } from './workflowModel';
import type { GraphIssue, WorkflowDocument, WorkflowFormat } from './types';

interface SchemaErrorItem {
  instancePath?: string;
  message?: string;
}

/** A positioned, code-editor-ready diagnostic (line/column are 0-based). */
export interface SpecDiagnostic {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  /** JSON-pointer style path when known (e.g. `/do/name/then`). */
  path?: string;
}

/** Shape of the parse/schema error produced by the SDK `validate` call. */
export type WorkflowParseErrorLike = unknown;

interface YamlErrorMark {
  line?: number;
  column?: number;
}

interface YamlErrorLike {
  mark?: YamlErrorMark;
  reason?: string;
  message?: string;
}

interface SchemaErrorContainer {
  schemaErrors?: SchemaErrorItem[];
}

/** Error shape produced by the SDK parser (AJV schema errors and reason). */
export interface WorkflowParseError {
  schemaErrors?: SchemaErrorItem[];
  reason?: string;
  message?: string;
}

function formatError(error: unknown): string {
  if (!error) return 'The workflow could not be parsed.';
  if (typeof error === 'string') return error;

  const errObj = error as WorkflowParseError;
  if (Array.isArray(errObj?.schemaErrors) && errObj.schemaErrors.length) {
    const schemaErrors: SchemaErrorItem[] = errObj.schemaErrors;
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
  return (
    errObj.reason ||
    errObj.message ||
    (error instanceof Error ? error.message : 'The workflow could not be parsed.')
  );
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Best-effort resolution of a JSON pointer-ish path (e.g. `/do/0`, `/do/checkX/then`,
 * `/use/functions/foo`) to the 0-based line of the matching YAML key.
 */
function resolveIssueLine(text: string, path: string): number {
  const lines = text.split(/\r?\n/);
  const segments = path.split('/').filter(Boolean);
  let cursor = 0;
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      // Array index: advance past the nth "- " entry (only the first few keys are searched).
      const index = Number(segment);
      let seen = -1;
      for (let i = cursor; i < lines.length; i += 1) {
        if (/^\s*-(\s|$)/.test(lines[i])) {
          seen += 1;
          if (seen === index) {
            cursor = i;
            break;
          }
        }
      }
      if (seen < index) return Math.min(cursor, lines.length - 1);
      continue;
    }
    const pattern = new RegExp(`^\\s*(?:-\\s*)?${escapeRegex(segment)}\\s*(?::|$)`, 'i');
    let found = -1;
    for (let i = cursor; i < lines.length; i += 1) {
      if (pattern.test(lines[i])) {
        found = i;
        break;
      }
    }
    if (found === -1) return Math.min(cursor, lines.length - 1);
    cursor = found;
  }
  return Math.min(cursor, lines.length - 1);
}

function syntaxPositionFromJsonError(text: string, message: string): { line: number; column: number } {
  const positionMatch = /at position (\d+)/i.exec(message);
  if (positionMatch) {
    const offset = Number(positionMatch[1]);
    const prefix = text.slice(0, offset);
    const line = prefix.split(/\n/).length - 1;
    const column = prefix.length - (prefix.lastIndexOf('\n') + 1);
    return { line, column };
  }
  return { line: 0, column: 0 };
}

function syntaxPositionFromYamlError(error: YamlErrorLike): { line: number; column: number } {
  const mark = error.mark;
  if (mark && typeof mark.line === 'number') {
    return { line: mark.line, column: mark.column ?? 0 };
  }
  return { line: 0, column: 0 };
}

/**
 * Collect positioned diagnostics for a specification text:
 * 1. YAML/JSON syntax errors (precise position from the parser).
 * 2. SDK schema errors (position resolved from the instancePath).
 * 3. Graph issues (position resolved from the task path).
 */
export function collectSpecDiagnostics(
  text: string,
  format: WorkflowFormat,
  parseError: WorkflowParseErrorLike | null | undefined,
  graphIssues: GraphIssue[],
): SpecDiagnostic[] {
  const diagnostics: SpecDiagnostic[] = [];
  const rawMessage = (error: unknown): string =>
    (error as YamlErrorLike)?.reason ||
    (error as YamlErrorLike)?.message ||
    'The specification could not be parsed';

  const errorContainer = parseError as SchemaErrorContainer | undefined;
  const hasSchemaErrors =
    Array.isArray(errorContainer?.schemaErrors) && errorContainer.schemaErrors.length > 0;

  // When the SDK reports schema violations, surface those individually; the raw
  // parser message would only duplicate them.
  if (parseError && !hasSchemaErrors) {
    if (format === 'json') {
      diagnostics.push({
        message: rawMessage(parseError),
        ...syntaxPositionFromJsonError(text, rawMessage(parseError)),
        severity: 'error',
      });
    } else {
      diagnostics.push({
        message: rawMessage(parseError),
        ...syntaxPositionFromYamlError(parseError as YamlErrorLike),
        severity: 'error',
      });
    }
  }

  if (hasSchemaErrors) {
    (errorContainer!.schemaErrors as SchemaErrorItem[]).forEach((item) => {
      const instancePath = item.instancePath || '/';
      diagnostics.push({
        message: `${instancePath === '/' ? '/' : instancePath} — ${item.message || 'Schema violation'}`,
        line: resolveIssueLine(text, instancePath),
        column: 0,
        severity: 'error',
        path: instancePath,
      });
    });
  }

  graphIssues.forEach((issue) => {
    diagnostics.push({
      message: issue.message,
      line: resolveIssueLine(text, issue.path),
      column: 0,
      severity: 'warning',
      path: issue.path,
    });
  });

  return diagnostics;
}

export {
  formatError,
  formatJsonInput,
  objectToPairs,
  objectToCatalogEntries,
  formatGraphIssues,
  validationTitle,
};
