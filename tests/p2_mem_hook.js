// Phase 2: Speicher-Messhaken fuer den Server:  node --expose-gc --require tests/p2_mem_hook.js server/server.js ...
// Umgebung: P2_MEM_FILE (JSONL), P2_MEM_SEK (Abstand, Standard 120). Schreibt process.memoryUsage() nach gc().
const fs = require('fs');
const datei = process.env.P2_MEM_FILE, sek = +process.env.P2_MEM_SEK || 120;
function messen() {
  try {
    if (global.gc) global.gc();
    const m = process.memoryUsage();
    fs.appendFileSync(datei, JSON.stringify({ t: Date.now(), rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external,
      arrayBuffers: m.arrayBuffers, handles: (process._getActiveHandles ? process._getActiveHandles().length : -1) }) + '\n');
  } catch (e) { /* egal */ }
}
if (datei) { messen(); setInterval(messen, sek * 1000).unref(); }
