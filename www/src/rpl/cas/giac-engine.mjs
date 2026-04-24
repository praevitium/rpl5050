// SPDX-License-Identifier: GPL-3.0-or-later
//
// Giac CAS engine adapter.
//
// Giac (Bernard Parisse, Institut Fourier) is the CAS we delegate to for
// FACTOR, EXPAND, DERIV, INTEG, SOLVE, TEXPAND, TLIN, series, limits,
// and everything else symbolic. This module is the single place the rest
// of the codebase talks to Giac through.
//
// Environment handling:
//   Browser (Tauri webview): the real engine. Loads the Giac WebAssembly
//     blob in a classic Web Worker (see giac-worker.js) so the UI stays
//     responsive during init and during heavy calls like integrate().
//   Node (tests):             a mock engine that returns fixtures the
//     test sets up via _setFixture(). Real Giac is intentionally not run
//     in Node — the 12 MB emscripten build is browser-targeted, and the
//     surface we care about testing in Node is the *adapter* (AST <->
//     Giac string conversion), not Giac's math itself (that's Giac's
//     problem and verified by browser-side smoke pages).
//
// Public API:
//     await giac.init()         // idempotent; resolves once ready
//     await giac.caseval(cmd)   // run a Giac expression, get its string
//     await giac.toLatex(expr)  // shortcut: caseval(`latex(${expr})`)
//
// All calls are async. Ops that delegate to Giac must return Promises
// and the eval loop must await them — see ops.js dispatch.

const isBrowser =
  typeof globalThis !== "undefined" &&
  typeof globalThis.Worker !== "undefined" &&
  typeof globalThis.window !== "undefined";

/* ------------------------------------------------------------------
   Browser: worker-based engine.
   ------------------------------------------------------------------ */

class BrowserGiacEngine {
  constructor() {
    this._worker = null;
    this._ready = null; // Promise<void>
    this._nextId = 1;
    this._pending = new Map(); // id -> { resolve, reject }
  }

  init() {
    if (this._ready) return this._ready;
    this._ready = new Promise((resolve, reject) => {
      let workerUrl;
      try {
        workerUrl = new URL("./giac-worker.js", import.meta.url);
      } catch (err) {
        reject(err);
        return;
      }
      // Classic worker (not { type: 'module' }) so the worker can
      // importScripts() giacwasm.js directly.
      this._worker = new Worker(workerUrl);
      this._worker.onmessage = (e) => {
        const { type, id, result, error } = e.data || {};
        if (type === "ready") {
          resolve();
          return;
        }
        if (type === "init_error") {
          reject(new Error(`Giac init failed: ${error}`));
          return;
        }
        if (type === "result" || type === "error") {
          const p = this._pending.get(id);
          if (!p) return;
          this._pending.delete(id);
          if (type === "error") p.reject(new Error(error));
          else p.resolve(result);
        }
      };
      this._worker.onerror = (err) => {
        // Reject init if it hasn't resolved yet.
        reject(new Error(`Giac worker crashed: ${err.message || err}`));
      };
    });
    return this._ready;
  }

  async caseval(cmd) {
    await this.init();
    if (typeof cmd !== "string") {
      throw new TypeError(`giac.caseval: expected string, got ${typeof cmd}`);
    }
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({ id, cmd });
    });
  }

  async toLatex(expr) {
    return this.caseval(`latex(${expr})`);
  }

  // Test/debug hook — dispose of the worker. Intentionally not exported
  // by the default singleton; callers who want it must reach through
  // `giac._dispose()` deliberately.
  _dispose() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._ready = null;
    for (const { reject } of this._pending.values()) {
      reject(new Error("Giac engine disposed"));
    }
    this._pending.clear();
  }
}

/* ------------------------------------------------------------------
   Node: mock engine for the test suite.
   ------------------------------------------------------------------ */

class MockGiacEngine {
  constructor() {
    this._fixtures = new Map(); // cmd string -> result string | Error
    this._callLog = [];
    this._defaultThrow = true; // unknown cmd throws by default
  }

  // --- test helpers (underscore-prefixed; not part of real API) ---
  _setFixture(cmd, result) {
    this._fixtures.set(cmd, result);
  }
  _setFixtures(obj) {
    for (const [k, v] of Object.entries(obj)) this._fixtures.set(k, v);
  }
  _clear() {
    this._fixtures.clear();
    this._callLog.length = 0;
  }
  _callLogCopy() {
    return [...this._callLog];
  }
  // If true, unknown commands throw. If false, they return "" so ops
  // can degrade gracefully in tests that don't care about the result.
  _setStrict(strict) {
    this._defaultThrow = !!strict;
  }

  // --- public API ---
  async init() {
    /* no-op */
  }

  async caseval(cmd) {
    if (typeof cmd !== "string") {
      throw new TypeError(`giac.caseval: expected string, got ${typeof cmd}`);
    }
    this._callLog.push(cmd);
    if (this._fixtures.has(cmd)) {
      const v = this._fixtures.get(cmd);
      if (v instanceof Error) throw v;
      return v;
    }
    if (this._defaultThrow) {
      throw new Error(
        `MockGiacEngine: no fixture registered for caseval(${JSON.stringify(cmd)})`,
      );
    }
    return "";
  }

  async toLatex(expr) {
    return this.caseval(`latex(${expr})`);
  }
}

/* ------------------------------------------------------------------
   Singleton export.
   ------------------------------------------------------------------ */

export const giac = isBrowser ? new BrowserGiacEngine() : new MockGiacEngine();

// Named exports for environment-specific access in tests. Production
// code should only import { giac }.
export { BrowserGiacEngine, MockGiacEngine };
