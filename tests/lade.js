// Lädt die klassischen Script-Dateien (ohne Three.js) in Node für Tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function ladeModule(dateien) {
  // In Node ist "window" = Sandbox-Global, damit window.Rennspiel und Rennspiel dasselbe sind
  const sandbox = { console, Math, performance: { now: () => Date.now() } };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const d of dateien) {
    const code = fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
    vm.runInContext(code, sandbox, { filename: d });
  }
  return sandbox.Rennspiel;
}

module.exports = { ladeModule };
