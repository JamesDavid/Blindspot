// Headless harness: loads src/01.. through the last sim file into a bare
// vm sandbox with no DOM. The renderer/UI/tutorial/demo files are simply
// never loaded here — sim/DOM separation is architectural (§21.1).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
// Sim files are 01..15; DOM-aware files are 16+.
const LAST_SIM_FILE = 15;

function makeSandbox(patchConfig) {
  const sandbox = { console, Math, Date, JSON, Object, Array, Map, Set, Infinity, NaN };
  sandbox.globalThis = sandbox;
  sandbox.module = { exports: {} }; // inert target for each file's node export hook
  vm.createContext(sandbox);
  const files = fs.readdirSync(SRC)
    .filter(f => /^\d\d_.*\.js$/.test(f) && parseInt(f.slice(0, 2), 10) <= LAST_SIM_FILE)
    .sort();
  for (const f of files) {
    let code = fs.readFileSync(path.join(SRC, f), 'utf8');
    if (patchConfig && f === '01_config.js') code = patchConfig(code);
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}

// Patch helper for sweeps: replace `KEY: value` with `KEY: newValue` in the
// CONFIG source before it is evaluated (regex patching per §29.3).
function patchNumber(code, key, value) {
  const re = new RegExp(`(${key}:\\s*)[-\\d.]+`);
  if (!re.test(code)) throw new Error('patchNumber: key not found: ' + key);
  return code.replace(re, `$1${value}`);
}

module.exports = { makeSandbox, patchNumber };
