// v28c: node tests/latenz_proxy.js <zielPort> [rtt_ms=0]  → gibt "PORT <n>" aus
// TCP-Proxy mit FESTER künstlicher Latenz (je Richtung rtt/2, Reihenfolge bleibt), für Browser-Tests wie Tailscale/Funnel (20–80 ms).
// Über stdin umschaltbar: Zeile "rtt 100" → ab jetzt 100 ms Rundlauf (beim Verkleinern wird nie überholt: Ziel = max(jetzt+d, letztes Ziel)).
'use strict';
const net = require('net');
const ziel = +process.argv[2];
let einweg = (+(process.argv[3] || 0)) / 2;
const jetzt = () => performance.now();

function rohr(von, nach) {
  let letzt = 0;
  const reihe = [];
  let timer = null;
  const pumpen = () => {
    timer = null;
    const t = jetzt();
    while (reihe.length && reihe[0].t <= t + 0.5) { const x = reihe.shift(); if (!nach.destroyed) nach.write(x.d); }
    if (reihe.length) timer = setTimeout(pumpen, Math.max(0, reihe[0].t - jetzt()));
  };
  von.on('data', (d) => {
    const t = Math.max(jetzt() + einweg, letzt);
    letzt = t;
    reihe.push({ t, d });
    if (!timer) timer = setTimeout(pumpen, Math.max(0, reihe[0].t - jetzt()));
  });
  von.on('end', () => setTimeout(() => nach.end(), einweg + 5));
}

const srv = net.createServer((c) => {
  const s = net.connect(ziel, '127.0.0.1');
  c.setNoDelay(true); s.setNoDelay(true);
  rohr(c, s); rohr(s, c);
  const zu = () => { c.destroy(); s.destroy(); };
  c.on('error', zu); s.on('error', zu); c.on('close', zu); s.on('close', zu);
});
srv.listen(0, '127.0.0.1', () => console.log('PORT ' + srv.address().port));
process.stdin.setEncoding('utf8');
process.stdin.on('data', (t) => {
  for (const z of t.split('\n')) { const m = z.match(/^rtt\s+(\d+)/); if (m) { einweg = +m[1] / 2; console.log('RTT ' + m[1]); } }
});
