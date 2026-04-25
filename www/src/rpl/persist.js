/* =================================================================
   Persistence: snapshot the calculator state to a JSON-safe shape
   and rehydrate it later.

   Drives two features:
     - Autosave to localStorage so refreshing the page doesn't wipe
       the stack and HOME directory.
     - Export/import to a .json file the user can hand around or back
       up.

   Both go through `snapshot(stack)` and `rehydrate(snap, stack)` —
   localStorage just stringifies the snapshot and stashes it under a
   single key, while export wraps it in a download Blob.

   Encoding rules (handled by encode/decode below):
     - BigInt        → { __t: 'bigint', v: '<digits>' }
     - Decimal       → { __t: 'decimal', v: '<toString()>' }
                       (Real's payload is a decimal.js Decimal instance)
     - Map           → { __t: 'map',    v: [[k, encV], ...] }
     - Directory     → { type: 'directory', name, entries: <Map enc> }
                       (parent pointer dropped; relinked on decode)
     - Anything else → walked recursively through arrays / plain
                       objects.  Frozen value objects are treated as
                       plain objects; the rehydrated copies are NOT
                       refrozen — ops never mutate them.

   The snapshot carries a `version` tag.  Bump it whenever the on-disk
   shape changes incompatibly so old saved state is rejected cleanly
   instead of loading as garbage.
   ================================================================= */

import {
  state, currentPath, goHome, goInto, notify,
  setCasVx, resetCasVx,
  setCasModulo, resetCasModulo,
} from './state.js';
import { TYPES, Decimal } from './types.js';

/* PRNG seed survives page reload.  `seedPrng(n)` does the zero-
   avoidance + reduction to [1, PRNG_MOD-1].  Imported here to apply a
   decoded snapshot's prngSeed through the canonical coerce + emit path
   so listeners see exactly one state event when rehydrate runs. */
import { seedPrng } from './state.js';

export const STORAGE_KEY = 'hp50.state';
export const SCHEMA_VERSION = 1;

/* ----------------------------- encode ----------------------------- */

function encode(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  // Decimal instance — detect by the constructor (the decimal.js instance
  // has `Decimal` in its prototype chain).  Preserve full 15-digit
  // precision by round-tripping through `.toString()`.
  if (v instanceof Decimal) return { __t: 'decimal', v: v.toString() };
  if (v instanceof Map) {
    return { __t: 'map', v: [...v].map(([k, x]) => [k, encode(x)]) };
  }
  if (Array.isArray(v)) return v.map(encode);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      // Skip Directory.parent — it's a back-pointer that creates a
      // cycle and is reconstructed on decode by walking the tree.
      if (k === 'parent') continue;
      out[k] = encode(v[k]);
    }
    return out;
  }
  return v;
}

function decode(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(decode);
  if (typeof v === 'object') {
    if (v.__t === 'bigint') return BigInt(v.v);
    if (v.__t === 'decimal') return new Decimal(v.v);
    if (v.__t === 'map') {
      return new Map(v.v.map(([k, x]) => [k, decode(x)]));
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = decode(v[k]);
    return out;
  }
  return v;
}

/* Walk a decoded Directory tree and re-link parent pointers so
   currentPath / goUp / goInto all work as before. */
function relinkParents(dir, parent = null) {
  dir.parent = parent;
  if (!(dir.entries instanceof Map)) return;
  for (const child of dir.entries.values()) {
    if (child && child.type === TYPES.DIRECTORY) relinkParents(child, dir);
  }
}

/* ---------------------------- snapshot ---------------------------- */

/** Build a JSON-safe snapshot of the calculator's persistent state. */
export function snapshot(stack) {
  return {
    version: SCHEMA_VERSION,
    angle:   state.angle,
    home:    encode(state.home),
    path:    currentPath(),                 // ['HOME', ...] segments
    stack:   stack._items.map(encode),      // level-1-last order
    // PRNG seed survives a page reload so seeded sequences resume
    // where they left off.  BigInt is encoded via `encode()` as
    // { __t: 'bigint', v: '<digits>' }.  Older snapshots that omit this
    // key rehydrate with the current module seed untouched (see below).
    prngSeed: encode(state.prngSeed),
    // CAS main variable (VX / SVX) survives a page reload.  Plain
    // string — no encoding helper needed.  Optional on decode (see
    // rehydrate below) so older snapshots predating this field still
    // load cleanly and reset VX to the default `'X'`.
    casVx: state.casVx,
    // CAS MODULO state slot (MODSTO / ADDTMOD / SUBTMOD / MULTMOD /
    // POWMOD).  BigInt → encoded as `{ __t: 'bigint', v: '<digits>' }`.
    // Optional on decode — older snapshots predating this field reset
    // MODULO to the default 13n, matching a fresh boot.
    casModulo: encode(state.casModulo),
  };
}

/** Restore from a snapshot.  Throws on shape/version mismatch.
 *  Mutates `state` in place and replaces the contents of `stack`. */
export function rehydrate(snap, stack) {
  if (!snap || typeof snap !== 'object') throw new Error('snapshot: not an object');
  if (snap.version !== SCHEMA_VERSION) {
    throw new Error(`snapshot: unsupported version ${snap.version}`);
  }

  const home = decode(snap.home);
  if (!home || home.type !== TYPES.DIRECTORY) {
    throw new Error('snapshot: home is not a directory');
  }
  relinkParents(home, null);

  // Replace HOME's contents in place so existing references in
  // state.js (which captured _home at module load) keep pointing at
  // the live root.  Walking the entries map is enough — name and
  // type are invariants of HOME.
  state.home.entries.clear();
  for (const [k, v] of home.entries) state.home.entries.set(k, v);
  // Re-link the freshly-installed children to the live HOME so
  // goUp from a subdir lands on the real _home, not the throw-away
  // decoded copy.
  for (const child of state.home.entries.values()) {
    if (child && child.type === TYPES.DIRECTORY) relinkParents(child, state.home);
  }

  // Snap to HOME, then descend along the saved path (skipping
  // segment 0 which is HOME itself).  Silently stop if a segment is
  // missing — the directory may have been purged in another tab.
  goHome();
  const path = Array.isArray(snap.path) ? snap.path : ['HOME'];
  for (let i = 1; i < path.length; i++) {
    if (!goInto(path[i])) break;
  }

  state.angle = snap.angle === 'DEG' || snap.angle === 'RAD' || snap.angle === 'GRD'
    ? snap.angle : 'RAD';

  // Restore the PRNG seed if the snapshot carries one.  Older v1
  // snapshots that predate this field rehydrate without touching the
  // seed — the module-local default (or whatever was set at run time)
  // stays in place.  `seedPrng` handles the zero-avoidance and range
  // reduction so bogus values can't pin the LCG to a fixed point.
  if (snap.prngSeed !== undefined && snap.prngSeed !== null) {
    try {
      const decoded = decode(snap.prngSeed);
      if (typeof decoded === 'bigint' || typeof decoded === 'number') {
        seedPrng(decoded);
      }
    } catch (e) {
      // Silently ignore a malformed prngSeed — the rest of the snapshot
      // is still worth restoring.  A note on snapshot bump: if we ever
      // change the seed encoding, bump SCHEMA_VERSION so old blobs are
      // rejected rather than silently losing seeded determinism.
      console.warn('hp50 persist: bad prngSeed in snapshot, ignoring', e);
    }
  }

  // Optional CAS main variable (VX).  Older snapshots that lack this
  // field reset VX to the default — matching what a fresh boot would
  // do.  Non-string / empty values are treated as "not present" so a
  // bad payload can't stash garbage into the slot.
  if (typeof snap.casVx === 'string' && snap.casVx.length > 0) {
    try { setCasVx(snap.casVx); }
    catch (e) { console.warn('hp50 persist: bad casVx, ignoring', e); resetCasVx(); }
  } else {
    resetCasVx();
  }

  // Optional CAS MODULO slot.  Older snapshots that lack this field
  // reset MODULO to the default 13n — matching what a fresh boot would
  // do.  Bad payloads (non-bigint after decode, or values that fail
  // the setCasModulo guard) fall back to the default rather than
  // pinning the slot to garbage.
  if (snap.casModulo !== undefined && snap.casModulo !== null) {
    try {
      const m = decode(snap.casModulo);
      if (typeof m === 'bigint') setCasModulo(m);
      else { console.warn('hp50 persist: bad casModulo type, resetting'); resetCasModulo(); }
    } catch (e) {
      console.warn('hp50 persist: bad casModulo, ignoring', e); resetCasModulo();
    }
  } else {
    resetCasModulo();
  }

  const items = Array.isArray(snap.stack) ? snap.stack.map(decode) : [];
  stack.restore(items);
  // stack.restore emits its own event; one notify() covers angle +
  // path + VARS-menu rebuild even when goHome was a no-op.
  notify();
}

/* --------------------------- localStorage --------------------------- */

/** Best-effort save — never throws (e.g. quota errors are swallowed
 *  with a console warn).  The user shouldn't see autosave failures
 *  break the calculator. */
export function saveToLocalStorage(stack) {
  try {
    const json = JSON.stringify(snapshot(stack));
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.warn('hp50 autosave failed:', e);
  }
}

/** Returns true if a snapshot was loaded.  On any failure (no key,
 *  bad JSON, version mismatch) the bad key is dropped and the caller
 *  starts from the default empty state. */
export function loadFromLocalStorage(stack) {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { return false; }
  if (!raw) return false;
  try {
    rehydrate(JSON.parse(raw), stack);
    return true;
  } catch (e) {
    console.warn('hp50 load failed, clearing:', e);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return false;
  }
}

/* ---------------------- export / import (file) ---------------------- */

/** Trigger a browser download of the current state as a JSON file. */
export function exportToFile(stack, filename = defaultFilename()) {
  const json = JSON.stringify(snapshot(stack), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read a File object the user picked, parse it, and rehydrate.
 *  Returns a Promise that resolves on success, rejects on failure. */
export function importFromFile(file, stack) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.onload  = () => {
      try {
        rehydrate(JSON.parse(String(reader.result)), stack);
        resolve();
      } catch (e) { reject(e); }
    };
    reader.readAsText(file);
  });
}

function defaultFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
              + `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `hp50-${stamp}.json`;
}
