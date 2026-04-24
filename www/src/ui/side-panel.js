/* =================================================================
   Side-panel: Commands / History / Characters / Files

   A slide-in overlay on the right edge of the bezel that replaces
   several shift-layer soft menus (CMD, PRG, CHARS, MTH, CAT, EXP&LN,
   TRIG, CALC, ALG, MATRICES, STAT, CONVERT, UNITS, ARITH, CMPLX).
   Instead of 6 cramped labels on the LCD, the user gets a scrollable,
   tabbed panel.

   Three tabs:

     1. Commands  —  Every registered op, grouped by the same categories
                     used in docs/COMMANDS.md.  Click behavior
                     mirrors a keypad button press: if the command line
                     has content, the op commits the buffer first, then
                     runs.  Inside algebraic entry (unclosed tick), text
                     commands are appended as identifiers instead.

     2. History   —  The Entry command-history ring buffer, newest
                     first.  A sort toggle flips to oldest-first.  Click
                     an entry → recall into the command line for edit.

     3. Characters — Greek letters + math / program glyphs that aren't
                     on the keypad.  Click → `entry.type(char)`.

   The panel is intentionally NOT modal — the user can click inside the
   panel and then keep typing or press keypad buttons.  Only a close
   button (×) or another CAT press dismisses it.
   ================================================================= */

import { allOps, lookup } from '../rpl/ops.js';
import {
  state as calcState, subscribe as subscribeState,
  varRecall, goInto, currentPath,
} from '../rpl/state.js';
import { TYPES } from '../rpl/types.js';
import { UNIT_CATALOG } from '../rpl/units.js';

/* -----------------------------------------------------------------
   Command categories.  Keys are the display names; values are arrays
   of op names (must match the registered op names from ops.js).  Ops
   not in this map fall into "Other".  Missing-from-registry names are
   rendered but disabled — lets the catalog double as a roadmap.
   Kept roughly aligned with docs/COMMANDS.md so the two
   stay in sync.
   ----------------------------------------------------------------- */
export const CATEGORIES = {
  'Stack': [
    'DUP', 'DUP2', 'DUPN', 'DUPDUP', 'NDUPN',
    'DROP', 'DROP2', 'DROPN',
    'SWAP', 'OVER', 'UNDER', 'ROT', 'NIP',
    'PICK', 'PICK3', 'UNPICK', 'ROLL', 'ROLLD',
    'DEPTH', 'CLEAR',
    'UNDO', 'REDO', 'LASTSTACK',
    'LAST', 'LASTARG',
  ],
  'Arithmetic': [
    '+', '-', '*', '/', '^',
    'NEG', 'INV', 'ABS', 'SQ', 'SQRT', 'XROOT',
    'FLOOR', 'CEIL', 'IP', 'FP', 'SIGN', 'MOD', 'RND', 'TRNC',
    'MIN', 'MAX', 'MINR', 'MAXR',
    'MANT', 'XPON',
    '%', '%CH', '%T',
    'DECR', 'INCR',
    'HMS+', 'HMS-', '→HMS', 'HMS→', '->HMS', 'HMS->',
    'D→HMS', 'HMS→D', 'D->HMS', 'HMS->D',
    'RAND', 'RDZ',
    '→Q', 'Q→', '->Q', 'Q->', '→QΠ', '->QΠ',
  ],
  'Trig / log / exp / hyperbolic': [
    'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN',
    'LN', 'LOG', 'EXP', 'ALOG', 'LNP1', 'EXPM',
    'SINH', 'COSH', 'TANH', 'ASINH', 'ACOSH', 'ATANH',
    'R→D', 'D→R', 'R->D', 'D->R',
    'DEG', 'RAD', 'GRD', 'GRAD',
  ],
  'Complex / coordinates': [
    'RE', 'IM', 'CONJ', 'ARG',
    'R→C', 'C→R', 'R->C', 'C->R',
    'C→P', 'P→C', 'C->P', 'P->C',
    'RECT', 'CYLIN', 'SPHERE',
    'CMPLX', 'CMPLX?',
  ],
  'Comparisons / logic': [
    '==', '=', 'SAME', '≠', '<>', '<', '>', '≤', '<=', '≥', '>=',
    'AND', 'OR', 'XOR', 'NOT',
    'TRUE', 'FALSE',
  ],
  'Integer / number theory': [
    'GCD', 'LCM', 'FACT', '!',
    'DIVIS', 'FACTORS', 'EULER',
    'ISPRIME?', 'NEXTPRIME', 'PREVPRIME',
    'IABCUV', 'IBERNOULLI', 'ICHINREM', 'IEGCD',
  ],
  'Polynomials': [
    'FCOEF', 'PCOEF', 'PEVAL', 'HORNER', 'PTAYL',
    'PROOT', 'FROOTS', 'QUOT', 'REMAINDER',
  ],
  'CAS / symbolic': [
    'DERIV', 'INTEG', 'SUBST', 'PREVAL',
    'EXPAND', 'COLLECT', 'FACTOR', 'SOLVE', 'DISTRIB',
    'EXPLN', 'LNCOLLECT', 'EPSX0',
    'TEXPAND', 'TLIN', 'TCOLLECT', 'TSIMP', 'HALFTAN',
    'ACOS2S', 'ASIN2C', 'ASIN2T', 'ATAN2S',
    'TAN2SC', 'TAN2SC2', 'TAN2CS2',
    'HEAVISIDE', 'DIRAC', 'LAPLACE', 'ILAP',
  ],
  'Vectors / matrices': [
    'SIZE', 'TRN', 'DET', 'NORM', 'CNRM', 'RNRM', 'TRACE', 'COND', 'RANK',
    'DOT', 'CROSS', 'HADAMARD',
    'IDN', 'CON', 'RANM', 'LSQ', 'REF', 'RREF', 'AUGMENT',
    'ROW+', 'ROW-', 'COL+', 'COL-',
    'ROW→', '→ROW', 'COL→', '→COL', 'ROW->', '->ROW', 'COL->', '->COL',
    'RSWP', 'CSWP', 'RCI', 'RCIJ', 'RDM',
    'LU', 'QR', 'LQ', 'CHOLESKY', 'GRAMSCHMIDT',
    'HERMITE', 'LEGENDRE', 'TCHEB', 'TCHEBYCHEFF', 'VANDERMONDE', 'HILBERT',
    'AXL', 'AXM',
    '→V2', '→V3', 'V→', '->V2', '->V3', 'V->',
    '→ARRY', 'ARRY→', '->ARRY', 'ARRY->',
  ],
  'Lists / strings': [
    'GET', 'PUT', 'GETI', 'PUTI', 'HEAD', 'TAIL', 'SUB', 'POS', 'APPEND',
    '→LIST', 'LIST→', 'OBJ→', '->LIST', 'LIST->', 'OBJ->',
    '→STR', 'STR→', '->STR', 'STR->', 'CHR',
    'REVLIST', 'SORT',
    'REPL', 'SREPL',
    'ΔLIST', 'ΠLIST', 'ΣLIST', 'DLIST', 'PLIST', 'SLIST', 'SUM',
    'MAP', 'SEQ', 'DOLIST', 'DOSUBS', 'STREAM',
    'NSUB', 'ENDSUB',
  ],
  'Statistics': [
    'MEAN', 'MEDIAN', 'VAR', 'SDEV', 'MAD', 'NSIGMA',
    'TOT', 'MAXS', 'MINS',
    'SX', 'SX2', 'SY', 'SY2', 'SXY',
    'ΣX', 'ΣX2', 'ΣY', 'ΣY2', 'ΣXY', 'NΣ',
    'MAXΣ', 'MINΣ',
    'CORR', 'COV',
    'LINFIT', 'LOGFIT', 'EXPFIT', 'PWRFIT', 'BESTFIT',
    'PREDV', 'PREDX',
  ],
  'Variables / directories': [
    'STO', 'RCL', 'PURGE', 'VARS',
    'CRDIR', 'UPDIR', 'HOME', 'PATH', 'PGDIR', 'ORDER', 'MERGE',
    'STO+', 'STO-', 'STO*', 'STO/',
    'SNEG', 'SINV', 'SCONJ',
  ],
  'Evaluation / program': [
    'EVAL', '→NUM', 'NUM', '->NUM',
    'APPROX', 'EXACT',
    'IFT', 'IFTE',
    'ERRM', 'ERRN', 'ERR0', 'DOERR',
  ],
  'Flags': [
    'SF', 'CF', 'FS?', 'FC?', 'FS?C', 'FC?C',
    'RCLF', 'STOF',
  ],
  'Display / base': [
    'TEXTBOOK', 'FLAT',
    'STD', 'FIX', 'SCI', 'ENG',
    'HEX', 'DEC', 'OCT', 'BIN', 'CLB',
    'B→R', 'R→B', 'B->R', 'R->B',
    'STWS', 'RCWS',
    'ASR', 'SL', 'SR', 'RL', 'RR',
    'SLB', 'SRB', 'RLB', 'RRB',
  ],
  'Types & tags': [
    'TYPE', 'KIND', 'VTYPE',
    '→TAG', '->TAG', 'DTAG',
  ],
  'Units': [
    // Commands
    'UVAL', 'UBASE', '→UNIT', 'CONVERT', '->UNIT',
    // Length
    'm', 'cm', 'mm', 'km', 'in', 'ft', 'yd', 'mi',
    // Mass
    'kg', 'g', 'mg', 'lb', 'oz',
    // Time
    's', 'ms', 'us', 'ns', 'min', 'h', 'd', 'yr',
    // Volume
    'L', 'mL',
    // Electric / thermo / amount / luminous base SI units
    'A', 'K', 'mol', 'cd',
    // Derived SI (mechanical)
    'Hz', 'N', 'J', 'W',
    // Pressure
    'Pa', 'kPa', 'bar', 'atm',
    // Electrical (derived)
    'V', 'Ω', 'ohm', 'C',
  ],
  'System': [
    'MEM', 'BYTES', 'NEWOB',
  ],
};

/* -----------------------------------------------------------------
   Character palette.  Each entry: [label, textToInsert, optional title]
   Titles are keyboard-friendly reminders ("alpha", "infinity", ...).
   ----------------------------------------------------------------- */
export const CHAR_GROUPS = {
  // Constants go first: the ones that fold under →NUM or APPROX (π, e,
  // i, MAXR, MINR) plus the HP50 CONSTANTS-library symbols people
  // commonly type into expressions.  Clicking inserts the glyph the
  // HP50 would print on the bezel.  Most physical constants aren't
  // yet wired to numeric values in this build — they insert as Names
  // and stay symbolic — but having them discoverable here matches the
  // HP50's CONS catalog and avoids scavenger-hunting through the
  // Greek table for a `μ0`.
  'Constants': [
    ['π',   'π',    'pi — folds to 3.14159… under APPROX / →NUM'],
    ['e',   'e',    'Euler — folds to 2.71828… under APPROX / →NUM'],
    ['i',   'i',    'imaginary unit — folds to (0, 1) under APPROX / →NUM'],
    ['∞',   '∞',    'infinity'],
    ['MAXR','MAXR', 'maximum real (≈ 1.8e308)'],
    ['MINR','MINR', 'minimum real (≈ 5e-324)'],
    // --- HP50 CONSTANTS library (symbolic insertion only for now) ---
    ['c',   'c',    'speed of light in vacuum'],
    ['h',   'h',    'Planck constant'],
    ['ħ',   'ħ',    'reduced Planck constant (hbar)'],
    ['G',   'G',    'gravitational constant'],
    ['g',   'g',    'standard gravity (9.80665 m/s²)'],
    ['NA',  'NA',   'Avogadro constant'],
    ['k',   'k',    'Boltzmann constant'],
    ['R',   'R',    'universal gas constant'],
    ['Vm',  'Vm',   'molar volume (ideal gas, 0°C 1atm)'],
    ['σ',   'σ',    'Stefan-Boltzmann constant'],
    ['ε0',  'ε0',   'vacuum permittivity'],
    ['μ0',  'μ0',   'vacuum permeability'],
    ['q',   'q',    'elementary charge'],
    ['me',  'me',   'electron rest mass'],
    ['mp',  'mp',   'proton rest mass'],
    ['mn',  'mn',   'neutron rest mass'],
    ['F',   'F',    'Faraday constant'],
    ['α',   'α',    'fine-structure constant'],
    ['a0',  'a0',   'Bohr radius'],
    ['μB',  'μB',   'Bohr magneton'],
    ['μN',  'μN',   'nuclear magneton'],
    ['Rinf','Rinf', 'Rydberg constant'],
    ['λc',  'λc',   'Compton wavelength'],
    ['γe',  'γe',   'electron gyromagnetic ratio'],
    ['Z0',  'Z0',   'impedance of free space'],
    ['atm', 'atm',  'standard atmosphere (101325 Pa)'],
    ['T0',  'T0',   'standard temperature (273.15 K)'],
  ],
  'Greek (lowercase)': [
    ['α', 'α', 'alpha'], ['β', 'β', 'beta'], ['γ', 'γ', 'gamma'],
    ['δ', 'δ', 'delta'], ['ε', 'ε', 'epsilon'], ['ζ', 'ζ', 'zeta'],
    ['η', 'η', 'eta'], ['θ', 'θ', 'theta'], ['ι', 'ι', 'iota'],
    ['κ', 'κ', 'kappa'], ['λ', 'λ', 'lambda'], ['μ', 'μ', 'mu'],
    ['ν', 'ν', 'nu'], ['ξ', 'ξ', 'xi'], ['ο', 'ο', 'omicron'],
    ['π', 'π', 'pi'], ['ρ', 'ρ', 'rho'], ['σ', 'σ', 'sigma'],
    ['τ', 'τ', 'tau'], ['υ', 'υ', 'upsilon'], ['φ', 'φ', 'phi'],
    ['χ', 'χ', 'chi'], ['ψ', 'ψ', 'psi'], ['ω', 'ω', 'omega'],
  ],
  'Greek (uppercase)': [
    ['Α', 'Α', 'Alpha'], ['Β', 'Β', 'Beta'], ['Γ', 'Γ', 'Gamma'],
    ['Δ', 'Δ', 'Delta'], ['Ε', 'Ε', 'Epsilon'], ['Ζ', 'Ζ', 'Zeta'],
    ['Η', 'Η', 'Eta'], ['Θ', 'Θ', 'Theta'], ['Ι', 'Ι', 'Iota'],
    ['Κ', 'Κ', 'Kappa'], ['Λ', 'Λ', 'Lambda'], ['Μ', 'Μ', 'Mu'],
    ['Ν', 'Ν', 'Nu'], ['Ξ', 'Ξ', 'Xi'], ['Ο', 'Ο', 'Omicron'],
    ['Π', 'Π', 'Pi'], ['Ρ', 'Ρ', 'Rho'], ['Σ', 'Σ', 'Sigma'],
    ['Τ', 'Τ', 'Tau'], ['Υ', 'Υ', 'Upsilon'], ['Φ', 'Φ', 'Phi'],
    ['Χ', 'Χ', 'Chi'], ['Ψ', 'Ψ', 'Psi'], ['Ω', 'Ω', 'Omega'],
  ],
  'Math / comparison': [
    ['∞', '∞', 'infinity'], ['π', 'π', 'pi constant'],
    ['√', '√', 'sqrt'], ['∂', '∂', 'partial derivative'],
    ['∫', '∫', 'integral'], ['∑', '∑', 'sum'], ['∏', '∏', 'product'],
    ['Δ', 'Δ', 'delta / change'],
    ['≠', '≠', 'not equal'], ['≤', '≤', 'less/equal'],
    ['≥', '≥', 'greater/equal'], ['≈', '≈', 'approx equal'],
    ['±', '±', 'plus-minus'], ['·', '·', 'dot'], ['×', '×', 'times'],
    ['÷', '÷', 'divide'], ['°', '°', 'degree'],
    ['∠', '∠', 'angle — polar / cylindrical separator (R∠θ)'],
  ],
  'Arrows / program': [
    ['→', '→', 'store / local-var arrow'],
    ['←', '←', 'left arrow'], ['↑', '↑', 'up arrow'],
    ['↓', '↓', 'down arrow'], ['↵', '\n', 'newline'],
    ['«', '« ', 'program open'], ['»', ' »', 'program close'],
    ['«»', '«  »', 'program brackets (cursor inside)'],
    ['[ ]', '[ ]', 'list / vector brackets'],
    ['{ }', '{ }', 'list braces'],
    ['::', '::', 'path delimiter'],
    ['_', '_', 'underscore / unit'],
  ],
};

/* -----------------------------------------------------------------
   Render helpers.  All DOM construction happens here — the owning
   App just calls `SidePanel.open('commands' | 'history' | 'chars')`.
   ----------------------------------------------------------------- */

export class SidePanel {
  /**
   * @param {object} params
   * @param {HTMLElement} params.root   - Element to append the panel into.
   * @param {object}      params.app    - App instance (for entry / stack / lookup).
   */
  constructor({ root, app }) {
    this.root = root;
    this.app = app;
    this.tab = 'commands';                         // active tab
    this.historySort = 'newest';                   // 'newest' | 'oldest'
    // Set of `${tab}:${sectionTitle}` strings marking sections the
    // user has collapsed.  Absence = open (the default for every new
    // section).  Persists to localStorage via _saveUIState so the
    // layout survives a reload.
    this._collapsedSections = new Set();
    this.el = null;
    this._build();
    this._restoreUIState();
  }

  _build() {
    const panel = document.createElement('aside');
    panel.className = 'side-panel hidden';
    panel.id = 'sidePanel';
    panel.innerHTML = `
      <div class="side-panel-resizer" role="separator"
           aria-orientation="vertical" aria-label="Resize panel"
           title="Drag to resize"></div>
      <div class="side-panel-head">
        <div class="side-panel-tabs" role="tablist">
          <button type="button" class="sp-tab" data-tab="commands" role="tab"
                  title="Commands" aria-label="Commands">📖</button>
          <button type="button" class="sp-tab" data-tab="chars"    role="tab"
                  title="Characters" aria-label="Characters">🔤</button>
          <button type="button" class="sp-tab" data-tab="files"    role="tab"
                  title="Files" aria-label="Files">📁</button>
          <button type="button" class="sp-tab" data-tab="history"  role="tab"
                  title="History" aria-label="History">🕐</button>
        </div>
        <button type="button" class="sp-close" title="Close panel" aria-label="Close">×</button>
      </div>
      <div class="side-panel-filter">
        <input type="search" class="sp-filter" placeholder="Filter…" aria-label="Filter" />
        <button type="button" class="sp-sort hidden" title="Toggle sort">⇅ Newest</button>
      </div>
      <div class="side-panel-body" role="tabpanel"></div>
    `;
    this.el = panel;
    this.root.appendChild(panel);
    this._bindResizer(panel.querySelector('.side-panel-resizer'));

    // Tab switching
    panel.querySelectorAll('.sp-tab').forEach(btn => {
      btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
    });
    panel.querySelector('.sp-close').addEventListener('click', () => this.close());

    // Live filter
    const filter = panel.querySelector('.sp-filter');
    filter.addEventListener('input', () => this._render());

    // Sort toggle (history only)
    panel.querySelector('.sp-sort').addEventListener('click', () => {
      this.historySort = this.historySort === 'newest' ? 'oldest' : 'newest';
      const lbl = panel.querySelector('.sp-sort');
      lbl.textContent = this.historySort === 'newest' ? '⇅ Newest' : '⇅ Oldest';
      this._render();
      this._saveUIState();
    });

    // Delegated click for body items.
    panel.querySelector('.side-panel-body').addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-action]');
      if (!btn) return;
      const { action, value } = btn.dataset;
      this._handleAction(action, value);
    });

    // Files tab mirrors the current directory — any STO/PURGE or
    // CRDIR/UPDIR fires a state event, and we repaint only if the
    // Files tab is the one on screen.
    subscribeState(() => {
      if (this.tab === 'files' && this.isOpen()) this._render();
    });
  }

  open(tab = 'commands') {
    this.el.classList.remove('hidden');
    this.setTab(tab);
    this._saveUIState();
  }

  close() {
    this.el.classList.add('hidden');
    this._saveUIState();
  }

  toggle(tab = 'commands') {
    if (this.isOpen() && this.tab === tab) { this.close(); return; }
    this.open(tab);
  }

  isOpen() {
    return !this.el.classList.contains('hidden');
  }

  setTab(tab) {
    this.tab = tab;
    this.el.querySelectorAll('.sp-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    // Sort toggle only relevant for History
    this.el.querySelector('.sp-sort').classList.toggle('hidden', tab !== 'history');
    // Clear the filter input when switching tabs so stale text from the
    // Commands filter doesn't hide every History entry.
    const filterInput = this.el.querySelector('.sp-filter');
    filterInput.value = '';
    filterInput.placeholder =
      tab === 'commands' ? 'Filter commands…' :
      tab === 'history'  ? 'Filter history…'  :
      tab === 'files'    ? 'Filter files…'    :
                           'Filter characters…';
    this._render();
    this._saveUIState();
  }

  _render() {
    const body = this.el.querySelector('.side-panel-body');
    const filter = this.el.querySelector('.sp-filter').value.trim().toLowerCase();
    body.innerHTML = '';
    if (this.tab === 'commands') body.appendChild(this._renderCommands(filter));
    else if (this.tab === 'history') body.appendChild(this._renderHistory(filter));
    else if (this.tab === 'files')   body.appendChild(this._renderFiles(filter));
    else body.appendChild(this._renderChars(filter));
  }

  /** Build a collapsible `<details>` section with an `.sp-cat` header.
   *  The grid is populated by the caller via the returned element.
   *  Open/closed state persists per-tab across re-renders (and across
   *  reloads via _saveUIState) keyed by `${tab}:${title}`. */
  _makeSection(title, extraGridClass = '') {
    const key = `${this.tab}:${title}`;
    const collapsed = this._collapsedSections && this._collapsedSections.has(key);
    const section = document.createElement('details');
    section.className = 'sp-section';
    if (!collapsed) section.open = true;
    const summary = document.createElement('summary');
    summary.className = 'sp-cat';
    summary.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'sp-grid' + (extraGridClass ? ' ' + extraGridClass : '');
    section.appendChild(summary);
    section.appendChild(grid);
    // `toggle` fires after the browser has flipped the `open` attribute.
    section.addEventListener('toggle', () => {
      if (section.open) this._collapsedSections.delete(key);
      else this._collapsedSections.add(key);
      this._saveUIState();
    });
    return { section, grid };
  }

  _renderCommands(filter) {
    const wrap = document.createDocumentFragment();
    const seen = new Set();
    const registered = new Set(allOps().map(s => s.toUpperCase()));

    for (const [cat, names] of Object.entries(CATEGORIES)) {
      const matches = names.filter(n => !filter || n.toLowerCase().includes(filter));
      if (!matches.length) continue;
      const { section, grid } = this._makeSection(cat);
      for (const name of matches) {
        seen.add(name.toUpperCase());
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sp-cmd';
        // A name that isn't an op but IS in the unit catalog becomes a
        // unit-insert button — clicking appends `_<name>` at the cursor
        // so the user can attach it to a pending numeric value.  Kept
        // in the Commands tab's Units section so the ops and the unit
        // symbols they operate on stay colocated (rather than pulling
        // the symbols out into a separate tab).
        if (UNIT_CATALOG.has(name)) {
          b.classList.add('sp-cmd-unit');
          b.dataset.action = 'unit';
          b.dataset.value  = name;
          b.textContent = name;
          b.title = `Insert _${name} (unit tag)`;
        } else {
          const available = registered.has(name.toUpperCase());
          if (!available) b.classList.add('sp-cmd-stub');
          b.dataset.action = 'op';
          b.dataset.value  = name;
          b.textContent = name;
          b.title = available ? `Run ${name}` : `${name} — not yet implemented`;
        }
        grid.appendChild(b);
      }
      wrap.appendChild(section);
    }

    // Any registered op not already covered lives under "Other".
    const others = [...registered].filter(n => !seen.has(n))
      .filter(n => !filter || n.toLowerCase().includes(filter))
      .sort();
    if (others.length) {
      const { section, grid } = this._makeSection('Other');
      for (const name of others) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sp-cmd';
        b.dataset.action = 'op';
        b.dataset.value  = name;
        b.textContent = name;
        b.title = `Run ${name}`;
        grid.appendChild(b);
      }
      wrap.appendChild(section);
    }

    const container = document.createElement('div');
    container.className = 'sp-commands';
    container.appendChild(wrap);
    return container;
  }

  _renderHistory(filter) {
    const hist = this.app.entry.getHistory();
    const ordered = this.historySort === 'newest' ? hist.slice().reverse() : hist.slice();
    const matched = ordered.filter(s => !filter || s.toLowerCase().includes(filter));

    const container = document.createElement('div');
    container.className = 'sp-history';

    if (matched.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.textContent = hist.length === 0
        ? 'No history yet — commit some entries with ENTER.'
        : 'No matches.';
      container.appendChild(empty);
      return container;
    }

    for (const text of matched) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-hist';
      b.dataset.action = 'recall';
      b.dataset.value  = text;
      b.textContent = text;
      b.title = `Recall into the command line`;
      container.appendChild(b);
    }
    return container;
  }

  _renderChars(filter) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-chars';
    for (const [cat, entries] of Object.entries(CHAR_GROUPS)) {
      const matches = entries.filter(([label, _v, title]) => {
        if (!filter) return true;
        const hay = `${label} ${title ?? ''}`.toLowerCase();
        return hay.includes(filter);
      });
      if (!matches.length) continue;
      const { section, grid } = this._makeSection(cat, 'sp-chars-grid');
      for (const [label, text, title] of matches) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sp-char';
        b.dataset.action = 'char';
        b.dataset.value  = text;
        b.textContent = label;
        if (title) b.title = title;
        grid.appendChild(b);
      }
      wrap.appendChild(section);
    }
    return wrap;
  }

  _renderFiles(filter) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-files';

    // IO toolbar: Export downloads the full HOME tree + stack as JSON;
    // Import replaces them from a JSON file the user picks.  Lives
    // here rather than in the page header so the calculator bezel
    // stays purely keypad.  Click delegation goes through
    // _handleAction('export' | 'import').
    const io = document.createElement('div');
    io.className = 'sp-io';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'sp-io-btn';
    exportBtn.dataset.action = 'export';
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Download stack + HOME tree as JSON';
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'sp-io-btn';
    importBtn.dataset.action = 'import';
    importBtn.textContent = 'Import';
    importBtn.title = 'Replace stack + HOME tree from a JSON file';
    io.appendChild(exportBtn);
    io.appendChild(importBtn);
    wrap.appendChild(io);

    // Clickable breadcrumb mirroring the LCD path annunciator — each
    // segment navigates via the app's existing path-click handler so
    // the explorer, VARS menu, and path annunciator stay in lockstep.
    const path = currentPath();
    const crumb = document.createElement('div');
    crumb.className = 'sp-breadcrumb';
    path.forEach((seg, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sp-crumb-sep';
        sep.textContent = '/';
        crumb.appendChild(sep);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-crumb' + (i === path.length - 1 ? ' sp-crumb-current' : '');
      b.dataset.action = 'path';
      b.dataset.value  = String(i);
      b.textContent = seg;
      crumb.appendChild(b);
    });
    wrap.appendChild(crumb);

    const entries = [...calcState.current.entries.entries()]
      .filter(([name]) => !filter || name.toLowerCase().includes(filter));

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.textContent = filter
        ? 'No matches.'
        : 'Directory is empty — STO a value into a name to populate.';
      wrap.appendChild(empty);
      return wrap;
    }

    // Directories first (alphabetical), then everything else (alphabetical).
    entries.sort(([an, av], [bn, bv]) => {
      const ad = av.type === TYPES.DIRECTORY ? 0 : 1;
      const bd = bv.type === TYPES.DIRECTORY ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return an.localeCompare(bn);
    });

    const list = document.createElement('div');
    list.className = 'sp-file-list';
    for (const [name, value] of entries) {
      const b = document.createElement('button');
      b.type = 'button';
      const isDir = value.type === TYPES.DIRECTORY;
      b.className = 'sp-file' + (isDir ? ' sp-file-dir' : '');
      b.dataset.action = isDir ? 'dir' : 'var';
      b.dataset.value  = name;
      const label = TYPE_LABELS[value.type] ?? value.type;
      b.title = isDir
        ? `Open directory ${name}`
        : `Recall ${name} (${label}) onto the stack`;
      const nameEl = document.createElement('span');
      nameEl.className = 'sp-file-name';
      nameEl.textContent = name;
      const typeEl = document.createElement('span');
      typeEl.className = 'sp-file-type';
      typeEl.textContent = label;
      b.appendChild(nameEl);
      b.appendChild(typeEl);
      list.appendChild(b);
    }
    wrap.appendChild(list);
    return wrap;
  }

  _handleAction(action, value) {
    const { entry, stack } = this.app;
    if (action === 'op') {
      const op = lookup(value);
      if (!op) { entry.flashError({ message: `${value}: not yet implemented` }); return; }
      // If the user is mid-entry inside a tick-quoted algebraic, insert
      // the op name as a character sequence instead of running it.  This
      // matches how the keypad function-keys behave (see Entry.typeOrExecFn).
      if (entry.isAlgebraic()) {
        entry.type(value);
        return;
      }
      // Otherwise behave like a soft-menu press: commit any pending
      // buffer first, then run the op.
      if (entry.buffer.trim().length > 0) entry.enter();
      entry.safeRun(() => op.fn(stack, entry), value);
      return;
    }
    if (action === 'char') {
      entry.type(value);
      return;
    }
    if (action === 'unit') {
      // Attach a unit tag to the value at the cursor: type `_<unit>`.
      // If the buffer is empty, type the symbol `<unit>` alone —
      // that still parses as a Name the user can then feed to
      // →UNIT etc.  Keeps one path for "insert a unit reference"
      // regardless of whether the user has a pending number.
      entry.type(entry.buffer.length > 0 ? `_${value}` : value);
      return;
    }
    if (action === 'recall') {
      entry.recall(value);
      // Leave the panel open — user typically wants to see the list so
      // they can pick another entry if they got the wrong one.
      return;
    }
    if (action === 'dir') {
      // Files: descend into a subdirectory.  goInto fires a state event
      // which triggers our re-render subscription.
      if (entry.buffer.trim().length > 0) entry.enter();
      const ok = goInto(value);
      if (!ok) entry.flashError({ message: `Cannot descend: ${value}` });
      return;
    }
    if (action === 'var') {
      // Files: click a variable.  Mid-algebraic → insert the name so
      // the user can build an expression referencing it; otherwise push
      // the value (RCL semantics).
      if (entry.isAlgebraic()) { entry.type(value); return; }
      if (entry.buffer.trim().length > 0) entry.enter();
      const v = varRecall(value);
      if (v === undefined) { entry.flashError({ message: `Undefined: ${value}` }); return; }
      stack.push(v);
      return;
    }
    if (action === 'path') {
      // Breadcrumb click — reuse the app's existing segment handler so
      // Files, LCD path annunciator, and VARS menu all navigate the
      // same way.
      if (entry.buffer.trim().length > 0) entry.enter();
      this.app.navigateToPathSegment(Number(value));
      return;
    }
    if (action === 'export') {
      this.app.exportSnapshot();
      return;
    }
    if (action === 'import') {
      // Files tab uses a transient <input type="file"> so the picker
      // state (selected-file, etc.) doesn't need to hang off the DOM
      // between clicks.  Re-creating per press also sidesteps the
      // "picking the same file twice in a row fires no change event"
      // browser quirk — fresh element, fresh state.
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'application/json,.json';
      picker.addEventListener('change', async () => {
        const file = picker.files?.[0];
        if (file) await this.app.importSnapshotFromFile(file);
      });
      picker.click();
      return;
    }
  }

  /* ---- UI persistence: open/tab/sort/width survive a page reload. ----
     Kept separate from the calc-state snapshot in persist.js — UI prefs
     are per-browser and shouldn't travel with an exported .json. */
  _saveUIState() {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
        open: this.isOpen(),
        tab: this.tab,
        historySort: this.historySort,
        width: this._panelWidth,
        collapsed: [...this._collapsedSections],
      }));
    } catch { /* quota or privacy-mode — silently skip */ }
  }

  _restoreUIState() {
    let raw;
    try { raw = localStorage.getItem(UI_STORAGE_KEY); } catch { return; }
    if (!raw) return;
    let st;
    try { st = JSON.parse(raw); } catch { return; }
    if (!st || typeof st !== 'object') return;
    const tab = VALID_TABS.has(st.tab) ? st.tab : 'commands';
    if (st.historySort === 'newest' || st.historySort === 'oldest') {
      this.historySort = st.historySort;
      const lbl = this.el.querySelector('.sp-sort');
      if (lbl) lbl.textContent = st.historySort === 'newest' ? '⇅ Newest' : '⇅ Oldest';
    }
    if (typeof st.width === 'number' && isFinite(st.width)) {
      this._applyWidth(st.width);
    }
    if (Array.isArray(st.collapsed)) {
      this._collapsedSections = new Set(st.collapsed.filter(k => typeof k === 'string'));
    }
    if (st.open) this.open(tab);
    else this.tab = tab;      // remember the tab for the next open()
  }

  /* ---- Drag-to-resize.  The resizer is a thin strip on the panel's
     left edge.  Dragging it updates --panel-width, which drives the
     panel's `width`.  Width is clamped so the panel can't eat the
     calculator or shrink past its tabs; persisted to localStorage so
     the chosen size sticks across reloads. */
  _bindResizer(handle) {
    if (!handle) return;
    const onPointerDown = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      ev.preventDefault();
      const startX = ev.clientX;
      const startW = this._panelWidth || this.el.getBoundingClientRect().width || PANEL_DEFAULT_WIDTH;
      document.body.classList.add('sp-resizing');
      handle.setPointerCapture?.(ev.pointerId);
      const onMove = (e) => {
        // Panel is right-anchored, so rightward drag shrinks it.
        const dx = e.clientX - startX;
        this._applyWidth(startW - dx);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('sp-resizing');
        this._saveUIState();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointerdown', onPointerDown);
    // Double-click resets to default.
    handle.addEventListener('dblclick', () => {
      this._applyWidth(PANEL_DEFAULT_WIDTH);
      this._saveUIState();
    });
  }

  _applyWidth(w) {
    const clamped = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, w));
    this._panelWidth = clamped;
    this.el.style.width = clamped + 'px';
  }
}

const PANEL_DEFAULT_WIDTH = 360;
const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_WIDTH = 800;

const UI_STORAGE_KEY = 'hp50.ui.sidePanel';
const VALID_TABS = new Set(['commands', 'chars', 'files', 'history']);

/* Short labels beside each file row.  Kept compact (≤4 chars) so the
   type column doesn't push the name off-screen on narrow panels. */
const TYPE_LABELS = Object.freeze({
  [TYPES.DIRECTORY]: 'DIR',
  [TYPES.PROGRAM]:   'PRG',
  [TYPES.REAL]:      'REAL',
  [TYPES.INTEGER]:   'INT',
  [TYPES.BININT]:    'BIN',
  [TYPES.COMPLEX]:   'CPX',
  [TYPES.STRING]:    'STR',
  [TYPES.NAME]:      'NAM',
  [TYPES.SYMBOLIC]:  'SYM',
  [TYPES.LIST]:      'LIST',
  [TYPES.VECTOR]:    'VEC',
  [TYPES.MATRIX]:    'MAT',
  [TYPES.TAGGED]:    'TAG',
  [TYPES.UNIT]:      'UN',
  [TYPES.GROB]:      'GROB',
});
