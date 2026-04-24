/* Aggregate runner: imports every split test file and prints the
   combined pass/fail summary. */

import { state } from './helpers.mjs';
import './test-numerics.mjs';
import './test-comparisons.mjs';
import './test-variables.mjs';
import './test-eval.mjs';
import './test-control-flow.mjs';
import './test-binary-int.mjs';
import './test-algebra.mjs';
import './test-entry.mjs';
import './test-matrix.mjs';
import './test-types.mjs';
import './test-lists.mjs';
import './test-reflection.mjs';
import './test-units.mjs';
import './test-ui.mjs';

const total = state.passed + state.failed;
console.log(state.failed === 0
  ? `\nALL TESTS PASSED (${state.passed})`
  : `\n${state.failed} FAILED (of ${total})`);
process.exit(state.failed === 0 ? 0 : 1);
