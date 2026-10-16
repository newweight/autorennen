// Phase 2: TCP-Jitter-Proxy (Kopie der JitterProxy-Klasse aus tests/test_netz_jitter.js, Profil z. B. tailscale)
// node tests/p2_jitter_proxy.js <zielPort> [profil=tailscale] [seed=1]   -> gibt "PORT <n>" aus
'use strict';
const net = require('net');
const jetztMs = () => performance.now();
function zufall(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PROFILE = {
  keins: { basis: 0, klein: 0, mittel: [0, 0], gross: [0, 0], pMittel: 0, pGross: 0, luecke: 0 },
  lan: { basis: 2, klein: 3, mittel: [3, 8], gross: [8, 15], pMittel: 0.05, pGross: 0.01, luecke: 0 },
  mild: { basis: 15, klein: 15, mittel: [15, 40], gross: [40, 70], pMittel: 0.2, pGross: 0.03, luecke: 0 },
  tailscale: { basis: 20, klein: 25, mittel: [25, 70], gross: [70, 120], pMittel: 0.2, pGross: 0.04, luecke: 0 },
  hart: { basis: 20, klein: 25, mittel: [25, 80], gross: [80, 130], pMittel: 0.25, pGross: 0.05, luecke: 300 },
};
class JitterProxy {
  constructor(zielPort, profil, seed) {
    this.zielPort = zielPort; this.p = PROFILE[profil] || PROFILE.tailscale; this.rng = zufall(seed || 1);
    this.stallStart = 0; this.stallEnde = 0; this.naechsterStall = jetztMs() + 6000 + this.rng() * 6000;
    this.srv = net.createServer((c) => this.verbindung(c));
  }
  freigabe(jetzt) {
    const p = this.p, r = this.rng;
    if (p.luecke && jetzt >= this.naechsterStall) { this.stallStart = jetzt; this.stallEnde = jetzt + p.luecke; this.naechsterStall = this.stallEnde + 8000 + r() * 6000; }
    let d = p.basis + r() * p.klein;
    const q = r();
    if (q < p.pGross) d = p.basis + p.gross[0] + r() * (p.gross[1] - p.gross[0]);
    else if (q < p.pGross + p.pMittel) d = p.basis + p.mittel[0] + r() * (p.mittel[1] - p.mittel[0]);
    let t = jetzt + d;
    if (jetzt >= this.stallStart && jetzt < this.stallEnde) t = Math.max(t, this.stallEnde + r() * 5);
    return t;
  }
  verbindung(c) {
    const s = net.connect(this.zielPort, '127.0.0.1');
    c.setNoDelay(true); s.setNoDelay(true);
    // P4 (16.10.): feste Warteschlange je Richtung mit EINEM Timer (statt setTimeout je Paket). Grund (P3 S6 n05): Node-Timer mit verschiedenen Laufzeiten,
    // aber (fast) gleichem Fälligkeitszeitpunkt oder gekürzten Bruchteil-Millisekunden feuern nicht in Einfügereihenfolge → der TCP-Strom wurde verwürfelt
    // (Skripte kamen kaputt an). Die Reihenfolge der Pakete bleibt jetzt immer erhalten; nur der Fälligkeitszeitpunkt (FIFO, monoton) streut.
    const leitung = (von, nach) => {
      let letzte = 0, timer = null; const warte = [];
      const schieben = () => {
        timer = null;
        const jetzt = jetztMs();
        while (warte.length && warte[0].t <= jetzt + 0.25) { const e = warte.shift(); if (!nach.destroyed) nach.write(e.buf); }
        if (warte.length) timer = setTimeout(schieben, Math.max(1, Math.ceil(warte[0].t - jetzt)));
      };
      von.on('data', (buf) => {
        const jetzt = jetztMs();
        const t = Math.max(letzte, this.freigabe(jetzt));          // FIFO (TCP): ein später Block hält alle folgenden zurück → Burst
        letzte = t;
        if (!timer && !warte.length && t - jetzt < 0.5 && !this.p.basis) { if (!nach.destroyed) nach.write(buf); return; }     // Profil „keins“: sofort
        warte.push({ t, buf });
        if (!timer) timer = setTimeout(schieben, Math.max(0, Math.ceil(t - jetzt)));
      });
      const aus = () => { if (timer) { clearTimeout(timer); timer = null; } warte.length = 0; };
      von.on('close', aus); nach.on('close', aus);
    };
    leitung(c, s); leitung(s, c);
    const zu = () => { c.destroy(); s.destroy(); };
    c.on('close', zu); s.on('close', zu); c.on('error', zu); s.on('error', zu);
  }
}
const p = new JitterProxy(+process.argv[2], process.argv[3] || 'tailscale', +process.argv[4] || 1);
p.srv.listen(0, '127.0.0.1', () => console.log('PORT ' + p.srv.address().port));
