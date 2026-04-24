/* =================================================================
   Main orchestrator.  Wires together stack, entry, display, and
   keyboard and installs a physical-keyboard handler for desktop use.
   ================================================================= */

import { Stack }        from './rpl/stack.js';
import { Entry }        from './ui/entry.js';
import { Display }      from './ui/display.js';
import { renderKeyboard } from './ui/keyboard.js';
import { SidePanel }    from './ui/side-panel.js';
import { clampStackScroll, computeMenuPage } from './ui/paging.js';
import { handleModifierShortcut } from './ui/shortcuts.js';
import {
  interactiveStackMenu, clampLevel, levelUp, levelDown,
  rollLevel, rollDownToLevel, dropLevel,
} from './ui/interactive-stack.js';
import { format } from './rpl/formatter.js';
import {
  state as calcState, subscribe as subscribeState,
  cycleAngle, toggleApproxMode, cycleCoordMode, setBinaryBase,
  varList, varRecall, varStore, currentPath,
  goInto, goHome, goUp,
} from './rpl/state.js';
import { lookup } from './rpl/ops.js';
import {
  isProgram, isDirectory, isList, isName, isString, isTagged, Real,
} from './rpl/types.js';
import './rpl/ops.js';                     // register ops as side effect
import {
  loadFromLocalStorage, saveToLocalStorage,
  exportToFile, importFromFile,
} from './rpl/persist.js';

class App {
  constructor() {
    this.stack = new Stack();
    this.entry = new Entry(this.stack);

    this.display = new Display({
      stackView:  document.getElementById('stackView'),
      cmdline:    document.getElementById('cmdline'),
      statusLine: document.getElementById('statusLine'),
      menuBar:    document.getElementById('menuBar'),
    });

    // Shift state.  `shift` is one of:
    //   null         — no shift active
    //   'shiftL'     — next key takes its left (orange) shifted meaning
    //   'shiftR'     — next key takes its right (red) shifted meaning
    //   'alpha'      — next key types its alpha label (single-shot)
    //   'alphaLock'  — alpha stays on across multiple key presses
    //                  (entered by pressing α twice in succession; a
    //                  third α press releases it).  HP50 "alpha lock".
    this.shift = null;
    this._shiftListeners = new Set();

    // Active soft-menu state.
    // `menuAll` holds every slot; only `menuAll[page*6..page*6+6]` is
    // shown on the LCD at a time.  NXT advances the page, PREV (shift-L
    // on NXT) or ◀ / ▶ page backward/forward.  `menuSlots` is the
    // currently-visible 6-slot view — what pressSoftKey(i) dispatches
    // through.  `menuKind` tags dynamic menus (e.g. VARS) so the state
    // subscriber can rebuild them when the underlying data changes.
    this.menuKind = null;
    this.menuAll = [];
    this.menuPage = 0;
    this.menuSlots = Array(6).fill(null);

    // Stack scroll: 0 means level 1 is at the bottom of the LCD (usual
    // HP50 view).  ▲ increments, ▼ decrements.  Any stack mutation
    // snaps back to 0 so newly-pushed results stay visible.
    this.stackScroll = 0;

    renderKeyboard(this, {
      softRow: document.getElementById('softRow'),
      navRow:  document.getElementById('navRow'),
      keypad:  document.getElementById('keypad'),
    });

    // Session 038 — side panel (Commands / History / Characters).  Mounts
    // itself into #sidePanelRoot and starts hidden.  Replaces several
    // shifted soft-menus (CMD / PRG / CHARS / MTH / CAT / EXP&LN / TRIG /
    // CALC / ALG / MATRICES / STAT / ARITH / CMPLX).
    const sidePanelRoot = document.getElementById('sidePanelRoot');
    if (sidePanelRoot) {
      this.sidePanel = new SidePanel({ root: sidePanelRoot, app: this });
    }

    this._installChromeToggles();

    // Session 037 — interactive-stack state (set by enterInteractiveStack,
    // read by the arrow-key dispatch below).  null means "not active";
    // otherwise { savedMenuAll, savedMenuPage, savedMenuKind } holds the
    // pre-existing soft menu so we can restore it on exit.
    this._interactive = null;

    // Session 037 — "editing level 1" shadow.  When editLevel1() pops
    // level 1 onto the command line, it stashes the popped value here.
    // cancelEntry() restores it if the user escapes out; commitEntry()
    // clears it if the user presses ENTER.  See editLevel1 for the full
    // lifecycle explanation.
    this._pendingEditValue = null;

    // Session 037 — plumb the Display's click-delegate callbacks into
    // App-level handlers.  Stack-row click echoes the value into the
    // command line; indicator click cycles the underlying mode; path
    // segment click jumps to that directory.
    this.display.onStackRowClick    = (level) => this.echoStackLevel(level);
    this.display.onIndicatorClick   = (id)    => this.cycleIndicator(id);
    this.display.onPathSegmentClick = (index) => this.navigateToPathSegment(index);

    // Restore persisted state from localStorage before wiring any
    // autosave listener — otherwise the restore itself would trigger
    // a redundant save round-trip.  A silent failure here just means
    // the user boots into an empty HOME, which is what they'd see on
    // first visit anyway.
    loadFromLocalStorage(this.stack);

    this.stack.subscribe(() => {
      this.stackScroll = 0;
      this.display.setStackScroll(0);
      this.display.renderStack(this.stack);
    });
    // Session 037 — any stack mutation invalidates a pending edit
    // shadow.  Covers the operator-auto-commit path (pressing e.g. +
    // with a non-empty buffer commits the buffer via Entry.enter() and
    // then runs the op) so we never end up with a stale shadow that a
    // later ESC would mistakenly restore.
    this.stack.subscribe(() => { this._pendingEditValue = null; });
    this.entry.subscribe(() => this.display.renderCmdline(this.entry));

    // Mirror global calc state (angle mode, path, future flags) into
    // the LCD.  When variables change (STO/PURGE) the VARS menu, if
    // it's the active one, must re-render too.
    subscribeState((st) => {
      this.display.setAngleMode(st.angle);
      this.display.setPath(currentPath());
      this.display.setApproxAnnunciator(st.approxMode);
      this.display.setBinaryBaseAnnunciator(st.binaryBase);
      this.display.setCoordMode(st.coordMode);
      if (this.menuKind === 'VARS')  this.showVarsMenu({ preservePage: true });
      if (this.menuKind === 'MODES') this.showModesMenu({ preservePage: true });
      // Textbook mode toggling (session 019): re-render the stack so
      // Symbolic rows swap between pretty-printed SVG and flat text
      // at the moment the flag flips.  We re-render unconditionally
      // on every state event because renderStack is cheap for the
      // handful of rows on the LCD and reliably picks up the flag.
      this.display.renderStack(this.stack);
    });

    // Initial render
    this.display.renderStack(this.stack);
    this.display.renderCmdline(this.entry);
    this.display.setMenu(['', '', '', '', '', '']);
    this.display.setAngleMode(calcState.angle);
    this.display.setPath(currentPath());
    this.display.setApproxAnnunciator(calcState.approxMode);
    this.display.setBinaryBaseAnnunciator(calcState.binaryBase);
    this.display.setCoordMode(calcState.coordMode);

    // Alpha annunciator on the LCD status line mirrors shift state.
    // The annunciator is visible whenever alpha OR alphaLock is active;
    // a distinct 'locked' class lets CSS style lock differently (e.g.,
    // steady vs. blinking) if desired later.
    this.onShiftChange(() => {
      const a = this.shift === 'alpha' || this.shift === 'alphaLock';
      this.display.setAnnunciator('alpha', a);
      const el = this.display.statusLine?.querySelector('#ann-alpha');
      if (el) el.classList.toggle('locked', this.shift === 'alphaLock');
    });

    this._installKeyboardShortcuts();
    this._installAutosave();
  }

  /* ================================================================
     Persistence
     ================================================================ */

  /** Save on every stack or state change, coalesced on a microtask
   *  so a program pushing many values in a row only writes once. */
  _installAutosave() {
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        saveToLocalStorage(this.stack);
      });
    };
    this.stack.subscribe(schedule);
    subscribeState(schedule);
  }

  /** Brand tag cycles chrome density (full → simple → minimal) via a
   *  class on <body>; subtitle toggles the side panel.  Mode class is
   *  set here so the first paint already matches whatever the user
   *  last chose — kept in memory only for now. */
  _installChromeToggles() {
    const MODES = ['full', 'simple', 'minimal'];
    let idx = 0;
    document.body.classList.add(`mode-${MODES[idx]}`);
    document.querySelector('.brand')?.addEventListener('click', () => {
      document.body.classList.remove(`mode-${MODES[idx]}`);
      idx = (idx + 1) % MODES.length;
      document.body.classList.add(`mode-${MODES[idx]}`);
    });
    document.querySelector('.model')?.addEventListener('click', () => {
      const sp = this.sidePanel;
      if (!sp) return;
      if (sp.isOpen()) sp.close();
      else sp.open(sp.tab);
    });
  }

  /** Download the current stack + HOME directory as a JSON snapshot.
   *  Called from the side-panel Files tab.  Errors are flashed on the
   *  LCD rather than raised — the user can just try again. */
  exportSnapshot() {
    try { exportToFile(this.stack); }
    catch (e) { this.entry.flashError({ message: `Export failed: ${e.message}` }); }
  }

  /** Load a snapshot from the given File object, replacing the stack
   *  and HOME tree.  Also used by the side-panel Files tab. */
  async importSnapshotFromFile(file) {
    try { await importFromFile(file, this.stack); }
    catch (e) { this.entry.flashError({ message: `Import failed: ${e.message}` }); }
  }

  /** Called by the MODE meta-key.  For now, a single press cycles the
   *  angle mode; a full MODE dialog is future work. */
  cycleAngleMode() { cycleAngle(); }

  /** Session 038 — open / close the side panel on the chosen tab.  Used
   *  by the 📖 button (→ 'commands').  History is still reachable as a
   *  tab inside the panel; pressing the same tab again closes the
   *  panel, matching what you'd expect from a toggle. */
  toggleSidePanel(tab = 'commands') {
    if (!this.sidePanel) return;
    this.sidePanel.toggle(tab);
  }

  /* ================================================================
     MODES soft-menu (session 020)

     Presents display / angle mode toggles on F1..F6 when MODE is
     pressed.  On a real HP50 this lives inside a full-screen MODE
     dialog (Flag -17 for angle, Flag -80 for textbook, etc.); our
     soft-menu version gives the user keypad access to the flags
     that matter most for day-to-day use.

     F1  ANGL    cycle DEG → RAD → GRD (label shows the active mode)
     F2  TXT     toggle textbookMode (label shows '→TXT' in flat mode,
                 '→FLT' in textbook mode — user reads "press to switch")
     F3  HEX     set binary display base to hex
     F4  DEC     set binary display base to decimal
     F5  OCT     set binary display base to octal
     F6  BIN     set binary display base to binary

     The menu labels refresh whenever state changes (angle mode,
     textbook mode) so the user always sees the current mode without
     having to look at the annunciator.  Labels rebuild on each
     render because `showModesMenu` re-captures the live state values
     when called.

     Added session 020 — closes the "keypad-reachable end-to-end"
     checkbox for TEXTBOOK / FLAT, which session 019 shipped as ops
     without any physical key or soft-menu binding.
     ================================================================ */
  showModesMenu(opts = {}) {
    // Re-read current state each call so the labels stay live.  When
    // the user presses ANGL or TXT, the follow-up state event is also
    // caught by the subscribeState hook below which rebuilds the
    // MODES menu — so the user sees the updated label even if they
    // triggered the toggle via other means (e.g., typing ANGL in an
    // alpha session).
    //
    // `preservePage`: keep the current page index on rebuild so a
    // user who clicks the EXA→APX slot on page 2 doesn't get kicked
    // back to page 1 by the self-rebuild that follows the state
    // change.  The initial call from MODE leaves it false so the
    // menu always opens on page 1.
    const prevPage = this.menuPage;
    const rebuild = () => this.showModesMenu({ preservePage: true });
    const slots = [
      { label: `ANGL ${calcState.angle}`,
        onPress: () => { cycleAngle(); rebuild(); } },
      { label: calcState.textbookMode ? 'TXT→FLT' : 'FLT→TXT',
        onPress: () => {
          this.entry.safeRun(() =>
            lookup(calcState.textbookMode ? 'FLAT' : 'TEXTBOOK').fn(this.stack, this.entry));
          rebuild();
        } },
      { label: 'HEX',
        onPress: () => this.entry.safeRun(() => lookup('HEX').fn(this.stack, this.entry)) },
      { label: 'DEC',
        onPress: () => this.entry.safeRun(() => lookup('DEC').fn(this.stack, this.entry)) },
      { label: 'OCT',
        onPress: () => this.entry.safeRun(() => lookup('OCT').fn(this.stack, this.entry)) },
      { label: 'BIN',
        onPress: () => this.entry.safeRun(() => lookup('BIN').fn(this.stack, this.entry)) },
      // Session 035: EXACT/APPROX toggle.  Label shows the target mode
      // the user would switch INTO if they pressed the key, matching
      // the TXT→FLT / FLT→TXT pattern above.
      { label: calcState.approxMode ? 'APX→EXA' : 'EXA→APX',
        onPress: () => {
          this.entry.safeRun(() =>
            lookup(calcState.approxMode ? 'EXACT' : 'APPROX').fn(this.stack, this.entry));
          rebuild();
        } },
    ];
    this.menuKind = 'MODES';
    this.menuAll = slots;
    this.menuPage = opts.preservePage ? prevPage : 0;
    this._renderMenuPage();
  }

  /* ================================================================
     Menu helper (session 030)

     A single "commit-and-run" factory shared by every soft-menu whose
     F-keys just dispatch to a registered op.  Keeps each menu
     definition to a single array of `{label, onPress}` entries.
     ================================================================ */
  _run(opName) {
    return () => {
      if (this.entry.buffer.trim().length > 0) this.entry.enter();
      this.entry.safeRun(() => lookup(opName).fn(this.stack, this.entry));
    };
  }

  /* ================================================================
     Session 038 — the additional soft-menus (showMathMenu, showTrigMenu,
     showExpLnMenu, showCalcMenu, showAlgMenu, showArithMenu,
     showCmplxMenu, showMatricesMenu, showCMDMenu, showPRGMenu) that
     formerly lived here have been removed.  Their contents are all
     reachable from the side-panel Commands tab (📖 on the nav row),
     which provides a single browsable catalog instead of a dozen
     small menus spread across shifted keys.  _pushReal is still useful
     for other soft-menu slots, so it stays.
     ================================================================ */

  /** Push a raw number onto the stack.  Used by menu slots that
   *  produce a constant (e, π, etc.). */
  _pushReal(value) {
    return () => {
      if (this.entry.buffer.trim().length > 0) this.entry.enter();
      this.stack.push(Real(value));
    };
  }

  /** "Not yet implemented" handler for menu slots whose op hasn't
   *  been registered.  Keeps the label visible so the user sees the
   *  full menu layout. */
  _stub(label) {
    return () => this.entry.flashError({ message: `${label}: not yet implemented` });
  }

  /* ================================================================
     Soft-menu plumbing
     ================================================================ */

  /** Install a full slot list and jump to page 0.  Each slot is
   *  `{ label, onPress, onPressL?, onPressR? }`.  `onPressL` / `onPressR`
   *  fire when the soft key is pressed with left / right shift active.
   *  Missing shifted handlers fall through to `onPress`. */
  setMenu(slots, kind = null) {
    this.menuKind = kind;
    this.menuAll = Array.isArray(slots) ? slots.slice() : [];
    this.menuPage = 0;
    this._renderMenuPage();
  }

  clearMenu() {
    this.menuKind = null;
    this.menuAll = [];
    this.menuPage = 0;
    this.menuSlots = Array(6).fill(null);
    this.display.setMenu(['', '', '', '', '', '']);
    this._updateSoftKeyLabels(null);
  }

  nextMenuPage() {
    if (this.menuAll.length <= 6) return;
    this.menuPage += 1;
    this._renderMenuPage();
  }

  prevMenuPage() {
    if (this.menuAll.length <= 6) return;
    this.menuPage -= 1;
    this._renderMenuPage();
  }

  _renderMenuPage() {
    const { view, page } = computeMenuPage(this.menuAll, this.menuPage, 6);
    this.menuPage = page;                 // normalized (wrap)
    this.menuSlots = view;
    this.display.setMenu(view.map(s => s?.label ?? ''));
    this._updateSoftKeyLabels(view);
  }

  /** Repaint the on-screen F1..F6 button faces to show the active menu's
   *  slot labels.  When no menu is loaded (or a slot is empty) the button
   *  falls back to its default 'F1'..'F6' label.  This makes the soft
   *  keys self-describing — the user can read what each one does from
   *  the button itself, without having to look up at the LCD menu bar. */
  _updateSoftKeyLabels(view) {
    const buttons = document.querySelectorAll('#softRow .key');
    for (let i = 0; i < buttons.length; i++) {
      const primary = buttons[i].querySelector('.primary');
      if (!primary) continue;
      const dynamic = !!(view && view[i]?.label);
      primary.textContent = dynamic ? view[i].label : `F${i + 1}`;
      primary.classList.toggle('menu-label', dynamic);
    }
  }

  /** Fill the soft-menu bar with the current directory's variables.
   *  Unshifted F-key:  EVAL-on-press for Program values, DESCEND for
   *                    Directory values (HP50 "cd into subdir"),
   *                    otherwise push the value (classic HP50 VARS
   *                    behavior).
   *  Left-shift + F:   STO level 1 into that name (`value SHIFT-L F`).
   *  Right-shift + F:  RCL — push value without evaluating Program or
   *                    descending into a Directory.
   *
   *  `preservePage: true` keeps the current page index after a rebuild,
   *  which the state subscriber uses so STO-ing doesn't kick the user
   *  back to page 0.  The index is still clamped by computeMenuPage
   *  when it ends up past the end of a shrunk var list.
   */
  showVarsMenu(opts = {}) {
    const names = varList();
    const prevPage = this.menuPage;
    const slots = names.map((id) => ({
      label: id,
      // Unshifted: EVAL-or-descend-or-push.  Programs execute; a
      // Directory value descends into that subdirectory (HP50 VARS
      // press-on-a-subdir behavior); everything else is pushed
      // literally.  Looking up via varList() restricts this to names
      // that live in the CURRENT directory, so descent never walks
      // across parent chains — it always enters a direct child.
      onPress: () => {
        if (this.entry.buffer.trim().length > 0) this.entry.enter();
        const v = varRecall(id);
        if (v === undefined) {
          this.entry.flashError({ message: `Undefined: ${id}` });
          return;
        }
        if (isDirectory(v)) {
          // goInto fires its own state event, which will rebuild the
          // VARS menu to show the new directory's contents.
          const ok = goInto(id);
          if (!ok) this.entry.flashError({ message: `Cannot descend: ${id}` });
          return;
        }
        if (isProgram(v)) {
          this.stack.push(v);
          this.entry.safeRun(() => lookup('EVAL').fn(this.stack, this.entry));
          return;
        }
        this.stack.push(v);
      },
      // Left-shift: STO level 1 into this name.  Classic HP50 VAR
      // shortcut — spares the user from keying `'NAME' STO`.
      onPressL: () => {
        if (this.entry.buffer.trim().length > 0) this.entry.enter();
        if (this.stack.depth < 1) {
          this.entry.flashError({ message: 'Too few arguments' });
          return;
        }
        this.entry.safeRun(() => {
          const value = this.stack.pop();
          varStore(id, value);
        });
      },
      // Right-shift: RCL — push the value unchanged, never EVALed.
      onPressR: () => {
        if (this.entry.buffer.trim().length > 0) this.entry.enter();
        const v = varRecall(id);
        if (v === undefined) {
          this.entry.flashError({ message: `Undefined: ${id}` });
          return;
        }
        this.stack.push(v);
      },
    }));
    this.menuKind = 'VARS';
    this.menuAll = slots;
    this.menuPage = opts.preservePage ? prevPage : 0;
    this._renderMenuPage();
  }

  /** Load the CST reserved variable as a soft menu — HP50 "Custom menu".
   *
   *  The CST variable is expected to be a List whose entries are the
   *  menu items.  Each item can be:
   *    - a Name / String             → label = name, press = push name
   *                                    then EVAL (programs run, values
   *                                    get pushed literally)
   *    - a Tagged object { name, value }
   *                                  → label = tag, press = push+EVAL
   *                                    the value
   *    - any other value             → label is the value's display
   *                                    form, press pushes it literally
   *
   *  If CST doesn't exist (or isn't a list) we flash a hint rather than
   *  silently installing an empty menu — the user almost certainly
   *  wants to know why nothing happened.  */
  showCustomMenu() {
    if (this.entry.buffer.trim().length > 0) this.entry.enter();
    const cst = varRecall('CST');
    if (cst === undefined) {
      this.entry.flashError({
        message: 'CST undefined — store a list in CST',
      });
      return;
    }
    if (!isList(cst)) {
      this.entry.flashError({
        message: 'CST must be a list',
      });
      return;
    }
    const slots = cst.items.map((item) => {
      const label = customMenuLabel(item);
      const [target, tag] = customMenuTarget(item);
      return {
        label,
        onPress: () => {
          if (this.entry.buffer.trim().length > 0) this.entry.enter();
          this.stack.push(target);
          if (isProgram(target) || isName(target)) {
            this.entry.safeRun(() => lookup('EVAL').fn(this.stack, this.entry));
          }
        },
        // Left-shift: type the item's label into the command line —
        // useful when the user wants to reference the name without
        // running the program it points to.
        onPressL: () => {
          this.entry.type(tag || label);
        },
        // Right-shift: recall (push without EVAL), parallel to VARS.
        onPressR: () => {
          if (this.entry.buffer.trim().length > 0) this.entry.enter();
          this.stack.push(target);
        },
      };
    });
    this.menuKind = 'CST';
    this.menuAll = slots;
    this.menuPage = 0;
    this._renderMenuPage();
  }

  /* ================================================================
     HP50 arrow-key / direct-manipulation actions (session 037)

     Three HP50 keystroke sequences from the Advanced Guide live here:
       25.1  ▲ from empty cmdline      → interactive stack
       35.1  ▼ from empty cmdline      → edit level 1 (EDITB style)
       36.1  ▶ from empty cmdline      → SWAP

     Plus a family of direct-manipulation helpers for the LCD click
     delegates: echo a stack level, cycle an indicator, navigate to a
     path segment.
     ================================================================ */

  /** Swap level 1 and level 2.  No-op if depth < 2 (with a friendly
   *  error flash so the user sees why ▶ didn't do anything). */
  swapTop() {
    if (this.stack.depth < 2) {
      this.entry.flashError({ message: 'Too few arguments' });
      return;
    }
    this.entry.safeRun(() => lookup('SWAP').fn(this.stack, this.entry));
  }

  /** Pull level 1 onto the command line for editing (HP50 EDITB
   *  shortcut).  Decompiles the value with the default formatter —
   *  round-trippable for Real / Integer / Name / Symbolic; for nested
   *  types the user gets a decompiled form they can re-ENTER to rebuild.
   *
   *  The original value is POPPED and stashed in `_pendingEditValue`.
   *  If the user commits with ENTER, the edited buffer is parsed and
   *  pushed normally (commitEntry discards the stash).  If the user
   *  cancels with ESC (or the ON key), cancelEntry() pushes the stashed
   *  value back so nothing is lost — this matches the behaviour you'd
   *  expect from any "edit in place" affordance and is what the user
   *  asked for in session 037. */
  editLevel1() {
    if (this.stack.depth < 1) {
      this.entry.flashError({ message: 'Too few arguments' });
      return;
    }
    // Re-entrancy guard.  ▼ is only bound to editLevel1 when the buffer
    // is empty, but the pendingEdit shadow can outlive an emptied buffer
    // (user deleted everything without pressing ESC).  In that state,
    // pulling a fresh level 1 would clobber the first shadow and lose
    // the original value.  Silently ignore the second ▼ — ESC is how
    // you exit the pending edit.
    if (this._pendingEditValue !== null && this._pendingEditValue !== undefined) {
      return;
    }
    this.stack.saveForUndo();
    const v = this.stack.pop();
    this._pendingEditValue = v;
    const text = format(v);
    this.entry.buffer = text;
    this.entry.cursor = text.length;
    this.entry.error  = '';
    this.entry._emit();
  }

  /** Cancel-aware wrapper around Entry.cancel.  If the buffer was
   *  populated by editLevel1, restore the popped value to the stack;
   *  otherwise behave exactly like Entry.cancel. */
  cancelEntry() {
    if (this._pendingEditValue !== null && this._pendingEditValue !== undefined) {
      this.stack.push(this._pendingEditValue);
      this._pendingEditValue = null;
      this.entry.buffer = '';
      this.entry.cursor = 0;
      this.entry.error  = '';
      this.entry._emit();
      return;
    }
    this.entry.cancel();
  }

  /** Commit-aware wrapper around Entry.enter.  Clears any pending
   *  edit shadow — once the user presses ENTER, the edited text is
   *  authoritative and the popped original should not be restored on
   *  a later ESC. */
  commitEntry() {
    this._pendingEditValue = null;
    this.entry.enter();
  }

  /** Copy a stack level's decompiled form into the command-line editor
   *  (HP50 "ECHO").  The source value stays on the stack — echo is a
   *  non-destructive copy.  Used by both the interactive-stack menu F1
   *  ECHO slot and by direct clicking on a stack row. */
  echoStackLevel(level) {
    const depth = this.stack.depth;
    if (level < 1 || level > depth) return;
    const v = this.stack.snapshot()[level - 1];   // level 1 == last element
    const text = format(v);
    // Append with a leading space separator if the buffer already has
    // content — otherwise the echoed token runs into whatever the user
    // was typing.  If empty, just type the text.
    if (this.entry.buffer.length > 0 &&
        !/\s$/.test(this.entry.buffer)) {
      this.entry.type(' ' + text);
    } else {
      this.entry.type(text);
    }
  }

  /** Cycle the clicked annunciator through its options.  `id` is the
   *  bare id (e.g. 'angle', 'approx') — the Display strips the `ann-`
   *  prefix before dispatching. */
  cycleIndicator(id) {
    switch (id) {
      case 'angle':  cycleAngle();       return;
      case 'approx': toggleApproxMode(); return;
      case 'coord':  cycleCoordMode();   return;
      // Click the base annunciator → cycle HEX → DEC → OCT → BIN →
      // HEX.  The `null` ("per-value stored base") state is still
      // reachable via the CLB op but skipped in the cycle so the
      // annunciator never blinks out mid-click.
      case 'hex': {
        const order = ['h', 'd', 'o', 'b'];
        const i = order.indexOf(calcState.binaryBase);
        setBinaryBase(order[((i < 0 ? -1 : i) + 1) % order.length]);
        return;
      }
      // Session 037: clicking the α annunciator runs the same
      // null → alpha → alphaLock → null cycle as the α key on the
      // keypad.  Mirrors what the user expects: the LCD marker they
      // can see is the same affordance as the physical button for
      // the corresponding mode.
      case 'alpha': {
        if (this.shift === 'alpha')          this._setShiftDirect('alphaLock');
        else if (this.shift === 'alphaLock') this._setShiftDirect(null);
        else                                 this._setShiftDirect('alpha');
        return;
      }
      // Annunciators without a defined click-cycle action just flash a
      // gentle "no-op" — better than a silent miss on a labelled click.
      default:
        this.entry.flashError({ message: `${id}: nothing to toggle` });
    }
  }

  /** Navigate to the directory at path segment `index` (0 = HOME).
   *  Walks up the appropriate number of levels — we can't use goInto()
   *  because the user may be jumping across multiple segments at once
   *  and we don't have sibling directory names in the path. */
  navigateToPathSegment(index) {
    const path = currentPath();
    if (index < 0 || index >= path.length) return;
    const stepsUp = path.length - 1 - index;
    if (stepsUp <= 0) return;                      // clicked current dir
    if (index === 0) { goHome(); return; }
    for (let i = 0; i < stepsUp; i++) goUp();
  }

  /* ---------------- Interactive stack (session 037) ----------------
     The HP50 interactive stack is a "browse" mode entered by pressing
     ▲ from an empty command line.  A visual cursor highlights a stack
     level (starting at level 1); ▲ / ▼ move the cursor; ENTER runs the
     HP50 default which is ECHO (decompile the selection into the
     command line).  A soft menu exposes PICK / ROLL / ROLLD / DROP /
     CANCL as alternative verbs.  ◀ / ESC cancel without acting.
     -------------------------------------------------------------- */

  enterInteractiveStack() {
    if (this.stack.depth === 0) {
      // Nothing to browse — a silent no-op mirrors HP50.
      return;
    }
    if (this._interactive) return;                 // already active
    // Save the outgoing soft menu so we can restore it on exit.  A user
    // who'd opened VARS shouldn't lose it after one interactive-stack
    // round-trip.
    this._interactive = {
      prevMenuAll:  this.menuAll,
      prevMenuPage: this.menuPage,
      prevMenuKind: this.menuKind,
    };
    this.display.selectedLevel = 1;
    const refresh = () => {
      this.display.selectedLevel = this._interactive
        ? this._interactive.level
        : null;
      this.display.renderStack(this.stack);
    };
    this._interactive.level = 1;
    refresh();

    const cleanup = () => {
      this._interactive = null;
      this.display.selectedLevel = null;
      this.display.renderStack(this.stack);
    };

    const doAndExit = (fn) => () => {
      try { fn(); }
      catch (e) { this.entry.flashError(e); }
      this._exitInteractiveStack();
    };

    const menu = interactiveStackMenu({
      onEcho:   doAndExit(() => this.echoStackLevel(this._interactive.level)),
      onPick:   doAndExit(() => {
        this.stack.saveForUndo();
        this.stack.pick(this._interactive.level);  // pick mutates + pushes
      }),
      onRoll:   doAndExit(() => {
        this.stack.saveForUndo();
        rollLevel(this.stack, this._interactive.level);
      }),
      onRollD:  doAndExit(() => {
        this.stack.saveForUndo();
        rollDownToLevel(this.stack, this._interactive.level);
      }),
      onDrop:   doAndExit(() => {
        this.stack.saveForUndo();
        dropLevel(this.stack, this._interactive.level);
      }),
      onCancel: () => this._exitInteractiveStack(),
    });
    this.setMenu(menu, 'ISTK');
    // Attach the level-move helper so the arrow-key handler can nudge.
    this._interactive.moveUp   = () => {
      this._interactive.level = levelUp(this._interactive.level, this.stack.depth);
      refresh();
    };
    this._interactive.moveDown = () => {
      this._interactive.level = levelDown(this._interactive.level, this.stack.depth);
      refresh();
    };
    // ENTER in interactive mode = default action (ECHO, per HP50).
    this._interactive.defaultAction = doAndExit(
      () => this.echoStackLevel(this._interactive.level)
    );
    // Cleanup hook for _exitInteractiveStack.
    this._interactive._cleanup = cleanup;
  }

  _exitInteractiveStack() {
    if (!this._interactive) return;
    const { prevMenuAll, prevMenuPage, prevMenuKind, _cleanup } = this._interactive;
    _cleanup();
    // Restore the pre-existing menu (or clear if none).
    if (prevMenuAll && prevMenuAll.length) {
      this.menuKind = prevMenuKind;
      this.menuAll  = prevMenuAll;
      this.menuPage = prevMenuPage;
      this._renderMenuPage();
    } else {
      this.clearMenu();
    }
  }

  /* ================================================================
     Stack scrolling
     ================================================================ */

  scrollStackUp() {
    const next = clampStackScroll(this.stackScroll + 1, this.stack.depth);
    if (next === this.stackScroll) return;
    this.stackScroll = next;
    this.display.setStackScroll(next, this.stack);
  }

  scrollStackDown() {
    const next = clampStackScroll(this.stackScroll - 1, this.stack.depth);
    if (next === this.stackScroll) return;
    this.stackScroll = next;
    this.display.setStackScroll(next, this.stack);
  }

  onShiftChange(fn) { this._shiftListeners.add(fn); }

  setShift(state) {
    this.shift = (this.shift === state) ? null : state;
    for (const fn of this._shiftListeners) fn();
  }

  /** Like setShift, but without the toggle shortcut — sets to exactly
   *  the requested state.  Needed for the alpha → alphaLock → null
   *  three-step cycle, which setShift's toggle logic can't express. */
  _setShiftDirect(state) {
    if (this.shift === state) return;
    this.shift = state;
    for (const fn of this._shiftListeners) fn();
  }

  /** Called by keyboard.js when a virtual key is pressed. */
  handleKey(key) {
    switch (key.kind) {
      case 'shiftL': return this.setShift('shiftL');
      case 'shiftR': return this.setShift('shiftR');
      case 'alpha': {
        // α press cycles:   null → alpha → alphaLock → null
        // Matches HP50: single α enables one-letter alpha; a second α
        // upgrades to alpha-LOCK (stays on across subsequent keys); a
        // third α releases it.
        if (this.shift === 'alpha')          this._setShiftDirect('alphaLock');
        else if (this.shift === 'alphaLock') this._setShiftDirect(null);
        else                                 this._setShiftDirect('alpha');
        return;
      }
    }

    // Alpha typing.  If alpha shift is active and the pressed key has
    // a blue alpha label (keyboard.js assigns A..Z across the first 26
    // physical keys), append that letter to the entry buffer.  Under
    // plain 'alpha' the shift releases after one letter (HP50 default);
    // under 'alphaLock' it stays on until the user presses α again.
    const alphaActive = this.shift === 'alpha' || this.shift === 'alphaLock';
    if (alphaActive && key.alpha) {
      this.entry.type(key.alpha);
      if (this.shift === 'alpha') this.setShift(null);
      return;
    }

    const action =
      this.shift === 'shiftL' && key.shiftLAction ? key.shiftLAction :
      this.shift === 'shiftR' && key.shiftRAction ? key.shiftRAction :
      key.action;

    // Labeled-but-unimplemented shift: the key shows a label (e.g.
    // 'USER', 'ENTRY') but no handler is wired.  Flash a clear
    // "Not implemented" rather than silently falling through to the
    // unshifted action — the label was a promise the user followed.
    const unimplementedLabel =
      (this.shift === 'shiftL' && !key.shiftLAction && key.shiftL) ? key.shiftL :
      (this.shift === 'shiftR' && !key.shiftRAction && key.shiftR) ? key.shiftR :
      null;

    if (unimplementedLabel) {
      this.entry.flashError({ message: `Not implemented: ${unimplementedLabel}` });
    } else if (action) {
      action(this.entry, this.shift, this);
    }

    // auto-clear shift after one action — but NOT for alphaLock (which
    // persists) and not when the user just toggled a shift key itself.
    if (
      this.shift &&
      this.shift !== 'alphaLock' &&
      !['shiftL','shiftR','alpha'].includes(key.kind)
    ) {
      this.setShift(null);
    }
  }

  pressSoftKey(i) {
    const slot = this.menuSlots[i];
    if (!slot) {
      this.entry.flashError({ message: `F${i + 1} (no menu)` });
      return;
    }
    // Pick the handler matching the current shift; fall back to the
    // unshifted onPress when a shifted handler is not installed.  We
    // read `this.shift` synchronously because handleKey auto-clears
    // shift only AFTER the action returns.
    const handler =
      (this.shift === 'shiftL' && slot.onPressL) ? slot.onPressL :
      (this.shift === 'shiftR' && slot.onPressR) ? slot.onPressR :
      slot.onPress;
    if (!handler) {
      this.entry.flashError({ message: `F${i + 1} (no menu)` });
      return;
    }
    try { handler(); }
    catch (e) { this.entry.flashError(e); }
  }

  /* ---------------- physical-keyboard shortcuts ----------------
     The physical keyboard is a plain text-input channel: every
     printable character types itself into the command-line buffer,
     exactly like a `<textarea>`.  This means the user can bang out
     `'X^2 + 2*X + 1'` in one go without fighting alpha mode or worrying
     that `+` will execute against a partial buffer.  To run RPN ops,
     they type `+` / `SIN` / `FACTOR` / etc. and press Enter — the
     command-line parser already commits bare-operator tokens and
     op names as ops (see entry.js::enter).  For fluency with the
     virtual calculator, clicking the on-screen buttons still follows
     HP50 semantics (alpha shift, operator-keys-execute, algebraic
     entry rerouting — see keyboard.js).

     Keys with non-text meaning stay special: Enter commits, Backspace
     deletes, Escape cancels, arrow keys drive stack scroll and menu
     paging.  Everything else — letters (either case), digits, `+`,
     `-`, `*`, `/`, `^`, `(`, `)`, `{`, `}`, `[`, `]`, `,`, `=`, `'`,
     `<`, `>`, `_`, etc. — goes straight into the buffer via e.key.
  ---------------------------------------------------------------- */
  _installKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ignore if user is typing into a real <input>/<textarea>
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Editor-style modifier shortcuts (Ctrl/Cmd-Z / -Y / -C); the
      // helper lives in src/ui/shortcuts.js so it can be unit-tested
      // outside the browser.
      if (handleModifierShortcut(e, this.entry)) return e.preventDefault();

      // Respect OS shortcuts: remaining ctrl/cmd/alt-combos pass through.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Interactive-stack override: while the browse-cursor is active,
      // arrow keys move the selection and ENTER echoes the selection.
      // ESC / ◀ cancel.  Everything else (digits, letters, …) exits
      // interactive mode first so the user can just start typing.
      if (this._interactive) {
        switch (e.key) {
          case 'ArrowUp':    this._interactive.moveUp();    return e.preventDefault();
          case 'ArrowDown':  this._interactive.moveDown();  return e.preventDefault();
          case 'Enter':      this._interactive.defaultAction(); return e.preventDefault();
          case 'Escape':
          case 'ArrowLeft':  this._exitInteractiveStack();  return e.preventDefault();
          default:           this._exitInteractiveStack();  // fall through
        }
      }

      // Named non-text keys handled first.
      switch (e.key) {
        case 'Enter':
          if (e.shiftKey) this.entry.type('\n');
          else this.commitEntry();
          return e.preventDefault();
        case 'Backspace':  this.entry.backspace();        return e.preventDefault();
        case 'Escape':     this.cancelEntry();            return e.preventDefault();
        case 'ArrowUp':
          // When the editor is active, ▲ only moves the cursor within
          // the buffer (multi-line-aware).  It never scrolls the stack
          // or enters the interactive-stack browser — user asked for
          // the editor to own up/down as long as any text is typed.
          if (this.entry.buffer.length === 0) this.enterInteractiveStack();
          else this.entry.cursorUp();
          return e.preventDefault();
        case 'ArrowDown':
          if (this.entry.buffer.length === 0 && this.stack.depth >= 1) this.editLevel1();
          else if (this.entry.buffer.length > 0) this.entry.cursorDown();
          return e.preventDefault();
        case 'ArrowLeft':
          if (this.entry.buffer.length > 0) this.entry.cursorLeft();
          else this.prevMenuPage();
          return e.preventDefault();
        case 'ArrowRight':
          if (this.entry.buffer.length > 0) this.entry.cursorRight();
          else if (this.stack.depth >= 2) this.swapTop();
          else this.nextMenuPage();
          return e.preventDefault();
        case 'Home':
          if (this.entry.buffer.length > 0) this.entry.cursorHome();
          return e.preventDefault();
        case 'End':
          if (this.entry.buffer.length > 0) this.entry.cursorEnd();
          return e.preventDefault();
      }

      // Any single printable character (including Shift-produced
      // symbols like !@#$%^&*() and punctuation) goes straight into
      // the buffer.  e.key is already post-shift — Shift+9 arrives
      // as '(' on US layouts, so no case-fiddling needed.
      if (e.key.length === 1) {
        this.entry.type(e.key);
        return e.preventDefault();
      }
    });
  }
}

/* ------------------------------------------------------------------
   CST soft-menu helpers — extract a display label and the underlying
   RPL value to push when the slot is pressed.  Tagged wrappers are
   opened (we show the tag, push the wrapped value); raw names/strings
   are shown verbatim; anything else falls through to the formatter so
   the label at least identifies the item.
   ------------------------------------------------------------------ */
function customMenuLabel(item) {
  if (isTagged(item)) return item.tag || format(item.value);
  if (isName(item))   return item.id;
  if (isString(item)) return item.value;
  return format(item);
}

function customMenuTarget(item) {
  if (isTagged(item)) return [item.value, item.tag];
  return [item, null];
}

window.__hp50 = new App();
