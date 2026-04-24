/* Shared test helpers — assertion + fail counter.
   Each split test file imports `assert` from here and bumps the same
   shared counter.  test-all.mjs reads `state.failed` at the end to
   print the aggregate result and exit with a non-zero code on any
   failure. */

export const state = { failed: 0, passed: 0 };

export function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); state.failed++; }
  else { console.log('ok  ', msg); state.passed++; }
}
