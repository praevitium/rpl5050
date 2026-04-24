// Bundle entry for CodeMirror 6.  Re-exports only the symbols the
// calculator needs.  `npm run bundle:codemirror` runs esbuild over this
// file to produce `codemirror.bundle.js` — a single self-contained ES
// module with no bare imports, so the app runs offline.

export {
  EditorState,
  EditorSelection,
  Text,
  Compartment,
  Prec,
  Transaction,
  RangeSet,
  RangeSetBuilder,
} from '@codemirror/state';

export {
  EditorView,
  keymap,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  placeholder,
  Decoration,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';

export {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
  redo,
} from '@codemirror/commands';
