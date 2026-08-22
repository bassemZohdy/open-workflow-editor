import { useEffect, useMemo, useRef } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  HighlightStyle,
} from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';
import { json } from '@codemirror/lang-json';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import type { AppTheme, WorkflowFormat } from '../../types';
import type { SpecDiagnostic } from '../../formatters';

export interface SpecEditorProps {
  value: string;
  format: WorkflowFormat;
  theme: AppTheme;
  diagnostics: SpecDiagnostic[];
  onChange: (value: string) => void;
  onCursorChange?: (line: number, column: number) => void;
  /** When set, jumps the cursor to the requested line/column (0-based line). */
  jump?: { line: number; column: number; requestId: number } | null;
}

/**
 * Color mapping stays in CSS so all three app themes (light/dark/high-contrast)
 * restyle the editor automatically via the `--cm-*` variables.
 */
function buildHighlight(): HighlightStyle {
  return HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--cm-keyword)' },
    {
      tag: [tags.propertyName, tags.definition(tags.propertyName), tags.labelName],
      color: 'var(--cm-property)',
    },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--cm-string)' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--cm-literal)' },
    { tag: [tags.comment, tags.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
    { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--cm-punct)' },
    { tag: [tags.meta, tags.documentMeta], color: 'var(--cm-keyword)' },
  ]);
}

function buildEditorTheme(): Extension {
  return [
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '12px',
        backgroundColor: 'transparent',
        color: 'var(--ink)',
      },
      '.cm-scroller': {
        fontFamily: "'DM Mono', ui-monospace, monospace",
        lineHeight: '1.7',
        padding: '10px 0',
      },
      '.cm-content': { caretColor: 'var(--ink)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-gutters': {
        backgroundColor: 'var(--cm-gutter-bg)',
        color: 'var(--muted)',
        borderRight: '1px solid var(--line)',
        borderTop: 'none',
        borderBottom: 'none',
      },
      '.cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line)', color: 'var(--ink)' },
      '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--cm-selection) !important',
      },
      '.cm-cursor': { borderLeftColor: 'var(--ink)' },
      '.cm-matchingBracket': {
        backgroundColor: 'var(--blue-soft)',
        outline: '1px solid var(--blue)',
      },
      '.cm-foldGutter .cm-gutterElement': { color: 'var(--muted)' },
      '.cm-tooltip': {
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--line)',
        borderRadius: '6px',
        color: 'var(--ink)',
      },
      '.cm-panels': { backgroundColor: 'var(--bg-surface-soft)', color: 'var(--ink)' },
      '.cm-panels input, .cm-panels button': { font: 'inherit', color: 'var(--ink)' },
    }),
  ];
}

interface EditorDocLike {
  lines: number;
  line: (n: number) => { from: number; to: number; text: string };
}

function diagnosticToLint(doc: EditorDocLike, d: SpecDiagnostic) {
  const lineNumber = Math.min(Math.max(d.line + 1, 1), doc.lines);
  const line = doc.line(lineNumber);
  const from = Math.min(line.from + Math.max(0, d.column), line.to);
  return {
    from,
    to: Math.min(from + Math.max(1, line.text.length - d.column), line.to + 1),
    severity: d.severity,
    message: d.message,
    source: 'open-workflow-editor',
  };
}

export function SpecEditor({
  value,
  format,
  theme,
  diagnostics,
  onChange,
  onCursorChange,
  jump,
}: SpecEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const editorChangeOriginRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  onChangeRef.current = onChange;
  onCursorChangeRef.current = onCursorChange;

  const propsRef = useRef({ value, format, theme, diagnostics });
  propsRef.current = { value, format, theme, diagnostics };

  const baseExtensions = useMemo<Extension[]>(() => {
    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      foldGutter(),
      bracketMatching(),
      highlightSelectionMatches(),
      lintGutter(),
      indentUnit.of('  '),
      syntaxHighlighting(buildHighlight()),
      keymap.of([...defaultKeymap, ...searchKeymap, indentWithTab]),
      buildEditorTheme(),
      EditorView.updateListener.of((update: ViewUpdate) => {
        const state = update.state;
        if (update.docChanged) {
          editorChangeOriginRef.current = true;
          onChangeRef.current(state.doc.toString());
        }
        if (update.selectionSet || update.docChanged) {
          const head = state.selection.main.head;
          const line = state.doc.lineAt(head);
          onCursorChangeRef.current?.(line.number, head - line.from + 1);
        }
      }),
    ];
  }, []);

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return undefined;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: propsRef.current.value,
        extensions: [
          baseExtensions,
          languageCompartment.current.of(format === 'json' ? json() : yaml()),
          highlightCompartment.current.of(EditorView.theme({}, { dark: theme !== 'light' })),
        ],
      }),
    });
    viewRef.current = view;
    // Exposed for E2E test automation and external tooling (see tests/ide-parity.spec.js).
    (window as unknown as { __specEditorView?: EditorView }).__specEditorView = view;
    return () => {
      delete (window as unknown as { __specEditorView?: EditorView }).__specEditorView;
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseExtensions]);

  // Sync external value changes into the view without clobbering the caret when the
  // change originated inside the editor (prop lags one render behind).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || editorChangeOriginRef.current) {
      editorChangeOriginRef.current = false;
      return;
    }
    if (view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.current.reconfigure(format === 'json' ? json() : yaml()),
    });
  }, [format]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: highlightCompartment.current.reconfigure(EditorView.theme({}, { dark: theme !== 'light' })),
    });
  }, [theme]);

  // Debounced diagnostics update (parse+validate already run on each keystroke).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return undefined;
    const timer = window.setTimeout(() => {
      const items = diagnostics.map((d) => diagnosticToLint(view.state.doc, d));
      view.dispatch(setDiagnostics(view.state, items));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [diagnostics]);

  useEffect(() => {
    if (!jump) return;
    const view = viewRef.current;
    if (!view) return;
    const lineNumber = Math.min(Math.max(jump.line + 1, 1), view.state.doc.lines);
    const line = view.state.doc.line(lineNumber);
    const pos = Math.min(line.from + Math.max(0, jump.column), line.to);
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    view.focus();
  }, [jump?.requestId]);

  return <div className="spec-editor" ref={containerRef} />;
}
