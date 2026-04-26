/* =================================================================
   Command help popup.

   Lazily fetches docs/hp50-commands.html on the first request, parses
   each <h2 id="cmd-…"> block out of it, and shows the matching block
   as an overlay over the calculator area.  Triggered by a right-click
   on a Commands-tab button; dismissed with the × button, the Esc key,
   or a click on the backdrop outside the content card.

   The popup is owned by the SidePanel and mounted inside #calculator
   so its `position: absolute; inset: 0` exactly covers the calc area
   without overlapping the side panel itself.
   ================================================================= */

/* Panel-name → doc-heading aliases.  The HP50 manual headings use the
   Unicode glyphs (√, –, ≤, …) while the panel labels keep ASCII /
   mnemonic forms (SQRT, -, <=, …).  When a direct lookup misses,
   `show()` falls back through this table.  Keep both sides upper-case
   so the existing key normalization stays one-step. */
const ALIASES = new Map([
  // Operator glyphs the panel labels with ASCII equivalents.
  ['SQRT',    '√'],
  ['-',       '–'],
  ['HMS-',    'HMS–'],
  ['ROW-',    'ROW–'],
  ['COL-',    'COL–'],
  ['STO-',    'STO–'],
  ['<=',      '≤'],
  ['>=',      '≥'],
  ['<>',      '≠'],
  // Names the panel mnemonic-ifies.
  ['LIM',     'LIMIT'],
  ['TCHEB',   'TCHEBYCHEFF'],
  ['CHARPOL', 'PCAR'],
  ['INTEG',   'INTVX'],
  // Statistics ASCII aliases for the Σ-prefixed canonical names.
  ['SX',      'ΣX'],
  ['SY',      'ΣY'],
  ['SXY',     'ΣXY'],
  ['SX2',     'ΣX2'],
  ['SY2',     'ΣY2'],
  ['MAXS',    'MAXΣ'],
  ['MINS',    'MINΣ'],
  ['NSIGMA',  'NΣ'],
  // List-fold ASCII aliases.
  ['SLIST',   'ΣLIST'],
  ['PLIST',   'ΠLIST'],
  ['DLIST',   'ΔLIST'],
]);

let _loadPromise = null;
let _sectionsByName = null;

async function _loadSections() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const res = await fetch('docs/hp50-commands.html');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const map = new Map();
    const headings = doc.querySelectorAll('h2[id^="cmd-"]');
    for (const h2 of headings) {
      // The h2's first text node is the displayed name (before the
      // in-app/not-in-app badge spans).  May be like "!(Factorial)" or
      // "==(Logical Equality)" — strip the parenthetical to get the
      // bare command symbol the panel knows about.
      const raw = (h2.firstChild?.textContent ?? '').trim();
      if (!raw) continue;
      const key = raw.replace(/\s*\(.*\)\s*$/, '').trim();
      if (!key) continue;
      const upper = key.toUpperCase();
      if (map.has(upper)) continue;             // first wins on collisions
      const frag = document.createDocumentFragment();
      const headerClone = h2.cloneNode(true);
      headerClone.querySelectorAll('.back').forEach(b => b.remove());
      headerClone.removeAttribute('id');
      frag.appendChild(headerClone);
      let n = h2.nextElementSibling;
      while (n && n.tagName !== 'H2') {
        frag.appendChild(n.cloneNode(true));
        n = n.nextElementSibling;
      }
      map.set(upper, frag);
    }
    _sectionsByName = map;
  })();
  return _loadPromise;
}

export class CommandHelp {
  /**
   * @param {object} params
   * @param {HTMLElement} params.host  - Element to mount into.
   */
  constructor({ host }) {
    this.host = host;
    this._currentName = null;

    const el = document.createElement('div');
    el.className = 'cmd-help-popup hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <button type="button" class="cmd-help-close"
              aria-label="Close" title="Close (Esc)">×</button>
      <div class="cmd-help-inner"></div>
    `;
    this.host.appendChild(el);
    this.el = el;
    this._inner = el.querySelector('.cmd-help-inner');

    el.querySelector('.cmd-help-close').addEventListener('click', () => this.hide());
    // Backdrop click (anywhere on the popup background that isn't the
    // inner content card or the close button) dismisses.
    el.addEventListener('click', (ev) => {
      if (ev.target === el) this.hide();
    });
    // Esc closes when the popup is open.  Capture phase so we win against
    // any keypad/entry handlers attached to window.
    this._onKey = (ev) => {
      if (ev.key !== 'Escape') return;
      if (this.el.classList.contains('hidden')) return;
      ev.stopPropagation();
      ev.preventDefault();
      this.hide();
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  /** Show help for `name`.  If the same name is already showing, this
   *  is a no-op (avoids re-cloning the fragment for nothing). */
  async show(name) {
    if (!name) return;
    const key = String(name).toUpperCase();
    if (this._currentName === key && !this.el.classList.contains('hidden')) {
      return;
    }
    this._currentName = key;
    let sections;
    try {
      await _loadSections();
      sections = _sectionsByName;
    } catch (e) {
      if (this._currentName !== key) return;
      this._inner.textContent = `Failed to load reference: ${e.message}`;
      this._reveal();
      return;
    }
    if (this._currentName !== key) return;       // request changed mid-load
    const aliased = ALIASES.get(key);
    const frag = sections.get(key)
              ?? (aliased ? sections.get(aliased.toUpperCase()) : undefined);
    this._inner.innerHTML = '';
    if (frag) {
      this._inner.appendChild(frag.cloneNode(true));
    } else {
      const empty = document.createElement('div');
      empty.className = 'cmd-help-empty';
      empty.textContent = `No reference entry for "${name}".`;
      this._inner.appendChild(empty);
    }
    this._reveal();
  }

  /** Hide the popup.  Used by the close button, Esc, backdrop click,
   *  and SidePanel.close(). */
  hide() {
    this._currentName = null;
    this.el.classList.add('hidden');
    this.el.setAttribute('aria-hidden', 'true');
  }

  _reveal() {
    this.el.classList.remove('hidden');
    this.el.setAttribute('aria-hidden', 'false');
    this._inner.scrollTop = 0;
  }
}
