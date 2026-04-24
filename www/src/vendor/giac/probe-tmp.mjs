// Probe: what does Giac actually return for factor of a rational?
// Session 096 follow-up: user reports `factor: Unexpected character '"' at pos 0`
// when factoring (X-1)^2/(X-1).  Need to see the raw caseval output.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const giacPath = path.resolve(here, "../www/src/vendor/giac/giacwasm.js");

// Emscripten glue exports a singleton Module when required in Node.
// We need to set Module first so the loader attaches to it.
globalThis.Module = {
  locateFile: (p) => path.resolve(path.dirname(giacPath), p),
  noInitialRun: true,
  print: (s) => { /* swallow progress chatter */ },
  printErr: (s) => console.error("[giac]", s),
};

require(giacPath);

// Wait for initialization — emscripten resolves runtime via onRuntimeInitialized
await new Promise((resolve, reject) => {
  const m = globalThis.Module;
  if (m && m.calledRun) return resolve();
  m.onRuntimeInitialized = resolve;
  setTimeout(() => reject(new Error("giac init timeout")), 15000);
});

const caseval = globalThis.Module.cwrap("caseval", "string", ["string"]);

const cmds = [
  "version",
  "factor((X-1)^2/(X-1))",
  "factor((X-1)^2/(X-1));",
  "purge(X);factor((X-1)^2/(X-1))",
  "purge(X);factor((X+1)^2)",
  "purge(X);factor(X^2-1)",
  "purge(X);factor(X^2+2*X+1)",
  "purge(X);factor((X^2-1)/(X-1))",
  "purge(X);factor((X^2-1)/(X+1))",
];

for (const cmd of cmds) {
  try {
    const r = caseval(cmd);
    // Show length, JSON, first/last 4 chars explicitly
    const first = r.length ? r.charCodeAt(0).toString(16).padStart(2, "0") : "--";
    const last  = r.length ? r.charCodeAt(r.length - 1).toString(16).padStart(2, "0") : "--";
    console.log(`CMD: ${cmd}`);
    console.log(`  len=${r.length}  [0]=0x${first}  [-1]=0x${last}`);
    console.log(`  raw=${JSON.stringify(r)}`);
    console.log("");
  } catch (e) {
    console.log(`CMD: ${cmd}  ERR: ${e.message}`);
  }
}
