// SPDX-License-Identifier: GPL-3.0-or-later
//
// Classic (non-module) Web Worker that hosts the Giac WebAssembly engine.
// Loaded by www/src/rpl/cas/giac-engine.mjs.
//
// Protocol:
//     main -> worker: { id: number, cmd: string }
//     worker -> main: { type: 'ready' }                          (once)
//                     { type: 'init_error', error: string }      (if init fails)
//                     { type: 'result',     id, result: string } (per call)
//                     { type: 'error',      id, error: string }  (per call failure)
//
// Note: classic worker, not ES module, because Giac's emscripten output
// expects a `Module` global and uses importScripts(). That means no
// `import` statements here — it's plain script.

self.Module = {
  // Quiet by default; uncomment the print hooks for debugging.
  print: function (_t) {
    /* self.postMessage({ type: 'print', text: _t }); */
  },
  printErr: function (_t) {
    /* self.postMessage({ type: 'printErr', text: _t }); */
  },
  noExitRuntime: true,
  // Locate the .wasm next to giacwasm.js in the vendor dir.
  locateFile: function (name) {
    if (name.endsWith(".wasm")) return "giacwasm.wasm";
    return name;
  },
  onRuntimeInitialized: function () {
    try {
      const caseval = self.Module.cwrap("caseval", "string", ["string"]);
      self._giacCaseval = caseval;
      self.postMessage({ type: "ready" });
    } catch (e) {
      self.postMessage({
        type: "init_error",
        error: (e && e.message) || String(e),
      });
    }
  },
  onAbort: function (reason) {
    self.postMessage({
      type: "init_error",
      error: "Giac aborted: " + ((reason && reason.message) || String(reason)),
    });
  },
};

try {
  // Relative to this worker file: worker is at www/src/rpl/cas/,
  // giacwasm.js sits at       www/src/vendor/giac/.
  self.importScripts("../../vendor/giac/giacwasm.js");
} catch (e) {
  self.postMessage({
    type: "init_error",
    error: "importScripts failed: " + ((e && e.message) || String(e)),
  });
}

self.onmessage = function (e) {
  const data = e.data || {};
  const { id, cmd } = data;
  if (!self._giacCaseval) {
    self.postMessage({
      type: "error",
      id,
      error: "Giac not initialized yet",
    });
    return;
  }
  try {
    const result = self._giacCaseval(String(cmd));
    self.postMessage({ type: "result", id, result: String(result) });
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      error: (err && err.message) || String(err),
    });
  }
};
