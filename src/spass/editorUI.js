// ============================================================
// Spaß-Paket S7 – Strecken-Editor, OBERFLÄCHE (Autorennen UND Motorrad). Rechenteil: src/spass/editorKern.js (R.Editor).
//   Menü: Karte „✏️ Strecke malen“ (Schritt „Modus“) und Leiste unter den Strecken-Karten; eigene Strecken stehen unter „✏️ Meine Strecken“ (mit Vorschaubild).
//   Editor (Vollbild, Draufsicht auf einem Canvas): mit Finger/Maus eine geschlossene Linie malen → wird zur Strecke (glatt, enge Kurven entschärft,
//   Überschneidung = Brücke). Danach Welt wählen, Teile per Antippen auf die Strecke setzen, Hügel per Schieber, Radiergummi, Rückgängig.
//   „Probefahren“ (allein / mit Computer / zu zweit), „Speichern“ (Name, Vorschaubild, KI-Testrunde), „Teilen“ (Code kopieren, Datei, Code einfügen).
//   Nach dem Probefahren führt „Hauptmenü“ zurück in den Editor. Der Entwurf bleibt gespeichert (localStorage), auch beim Schließen.
// Tasten im Editor: Esc = zurück ins Menü (Dialog zu), Strg+Z = rückgängig. Schalter: R.EditorUI.an = false schaltet alles ab.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Editor || !R.Menue || typeof document === 'undefined') return;
  const E = R.Editor, K = E.K, M = R.Menue.prototype;
  const MOTO = window.MOTORRAD === true;
  const ENTWURF = 'rennspiel.editor.entwurf.' + (MOTO ? 'motorrad' : 'auto');
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);

  // ---------------------------------------------------------------- Stil
  function stil() {
    if (document.getElementById('e7-stil')) return;
    const s = document.createElement('style'); s.id = 'e7-stil';
    s.textContent =
      '.e7{position:fixed;inset:0;z-index:300;display:flex;flex-direction:column;background:linear-gradient(#1c2a66,#121b46);color:#fff;font:800 clamp(14px,2.2vh,22px)/1.2 Arial,sans-serif;user-select:none;-webkit-user-select:none;touch-action:manipulation;overflow:hidden}' +
      '.e7 *{box-sizing:border-box}' +
      '.e7-kopf{flex:0 0 auto;display:flex;align-items:center;gap:.6em;padding:.45em .8em;background:rgba(0,0,0,.28)}' +
      '.e7-kopf h1{margin:0;font-size:1.15em;color:#ffd23a;white-space:nowrap}' +
      '.e7-name{flex:1 1 6em;min-width:0;font:inherit;font-weight:900;padding:.25em .6em;border-radius:.8em;border:.12em solid #fff;background:#fff;color:#1f2a60}' +
      '.e7-x{flex:0 0 auto;padding:.25em .8em;border-radius:1em;background:#e04a3a;border:.12em solid #fff;cursor:pointer;font-weight:900}' +
      '.e7-haupt{flex:1 1 auto;min-height:0;display:flex;flex-direction:row}' +
      '.e7-buehne{position:relative;flex:1 1 auto;min-width:0;min-height:0;background:#0d1330}' +
      '.e7-buehne canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}' +
      '.e7-blase{position:absolute;left:50%;top:.5em;transform:translateX(-50%);max-width:92%;padding:.35em .9em;border-radius:1.1em;background:rgba(255,255,255,.95);color:#1f2a60;text-align:center;font-size:.95em;box-shadow:0 .2em .8em rgba(0,0,0,.4);pointer-events:none;z-index:3}' +
      '.e7-blase.fehler{background:#fff0ee;color:#b3261a;border:.14em solid #e04a3a}.e7-blase.gut{background:#eaffef;color:#16703a;border:.14em solid #2fae4e}' +
      '.e7-panel{flex:0 0 17.5em;display:flex;flex-direction:column;gap:.5em;padding:.6em;overflow-y:auto;background:rgba(0,0,0,.25);-webkit-overflow-scrolling:touch}' +
      '.e7-panel h2{margin:.1em 0 .1em;font-size:.82em;letter-spacing:.04em;text-transform:uppercase;color:#a9b8ff}' +
      '.e7-chips{display:flex;flex-wrap:wrap;gap:.35em}' +
      '.e7-chip{padding:.3em .55em;border-radius:1em;background:#33427f;border:.12em solid transparent;cursor:pointer;font-size:.85em;white-space:nowrap}.e7-chip.an{background:#2f8bff;border-color:#fff}' +
      '.e7-werk{display:grid;grid-template-columns:repeat(3,1fr);gap:.4em}' +
      '.e7-t{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.05em;padding:.35em .15em;border-radius:.9em;background:#33427f;border:.14em solid transparent;cursor:pointer;min-height:3.6em;font-size:.78em;text-align:center}' +
      '.e7-t b{font-size:1.9em;line-height:1}.e7-t.an{background:#ff8a1f;border-color:#fff}.e7-t.aus{opacity:.38;cursor:not-allowed}' +
      '.e7-t .n{position:absolute;top:.1em;right:.25em;font-size:.85em;color:#ffd23a}' +
      '.e7-schieber{display:flex;align-items:center;gap:.5em;font-size:.85em}.e7-schieber input{flex:1 1 auto;min-width:0;height:2em}' +
      '.e7-fuss{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:.4em;justify-content:center;padding:.45em .6em;background:rgba(0,0,0,.35)}' +
      '.e7-k{padding:.4em .9em;border-radius:1.1em;background:#33427f;border:.12em solid #fff;cursor:pointer;font-weight:900;white-space:nowrap}.e7-k.gruen{background:#2fae4e}.e7-k.blau{background:#2f8bff}.e7-k.rot{background:#e04a3a}.e7-k.aus{opacity:.4;cursor:not-allowed}' +
      '.e7-k:active,.e7-t:active,.e7-chip:active{transform:scale(.96)}' +
      '.e7-dlg{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(8,14,40,.78);padding:2vh 3vw}' +
      '.e7-dk{max-width:min(94vw,40em);max-height:92vh;overflow:auto;background:linear-gradient(#2a3a7a,#1a2552);border:.15em solid #fff;border-radius:1.2em;padding:.8em 1.1em;text-align:center;box-shadow:0 .4em 1.4em rgba(0,0,0,.6)}' +
      '.e7-dk h3{margin:.1em 0 .4em;color:#ffd23a;font-size:1.25em}.e7-dk p{margin:.3em 0}.e7-dk textarea{width:100%;height:5.5em;font:12px/1.2 monospace;border-radius:.6em;padding:.4em;border:.1em solid #fff;background:#fff;color:#111;user-select:text;-webkit-user-select:text}' +
      '.e7-dk input[type=text]{font:inherit;font-weight:900;padding:.3em .6em;border-radius:.8em;border:.12em solid #fff;width:90%;color:#1f2a60}' +
      '.e7-liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(10em,1fr));gap:.5em;margin:.4em 0}' +
      '.e7-kachel{background:#fff;color:#1f2a60;border-radius:.9em;padding:.3em;font-size:.8em}.e7-kachel img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:.6em;background:#9bd}.e7-kachel .k{display:flex;gap:.3em;justify-content:center;margin-top:.2em}' +
      '.e7-kachel .k span{padding:.1em .6em;border-radius:.8em;background:#2f8bff;color:#fff;cursor:pointer}.e7-kachel .k span.r{background:#e04a3a}' +
      '.e7-toast{position:absolute;left:50%;bottom:4.5em;transform:translateX(-50%);z-index:30;padding:.4em 1.1em;border-radius:1.2em;background:#2fae4e;border:.14em solid #fff;font-weight:900;box-shadow:0 .2em .8em rgba(0,0,0,.5);pointer-events:none}' +
      '.m-meine-kopf{margin:.6em 0 .2em;font-weight:900;color:#ffd23a;text-align:center;font-size:1.05em}' +
      '.m-meine-leiste{display:flex;gap:.5em;justify-content:center;flex-wrap:wrap;margin:.5em 0 .2em}' +
      '.e7-menuk{padding:.3em 1em;border-radius:1.2em;background:#ff8a1f;color:#fff;font-weight:900;cursor:pointer;border:.12em solid #fff;font-size:.9em}.e7-menuk.blau{background:#2f8bff}.e7-menuk.rot{background:#e04a3a}' +
      '.karte.strecke .strecken-bild.e7-bild{background-size:cover!important;background-position:center!important}.karte.strecke .strecken-bild.e7-bild .strasse{display:none}' +
      '@media (max-aspect-ratio:1/1),(max-width:760px){.e7-haupt{flex-direction:column}.e7-panel{flex:0 0 auto;max-height:42%;padding:.4em}.e7-werk{grid-template-columns:repeat(5,1fr)}.e7-t{min-height:3.1em;font-size:.7em}.e7-kopf h1{font-size:1em}.e7-k{padding:.35em .65em;font-size:.88em}}' +
      '@media (max-height:520px){.e7{font-size:13px}.e7-panel{flex-basis:15em}.e7-t{min-height:2.8em}}';
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------- Zustand
  const HINTERGRUND = { wiese: '#8fd26a', wald: '#4f8f55', wueste: '#e6c47f', fantasie: '#d9a8f5', dino: '#9dbb62', mond: '#9d9daa', regenbogenland: '#bfe4ff', unterwasser: '#3f9fc4' };
  const STRASSE = { wiese: '#4b4f5c', wald: '#4b4f5c', wueste: '#6b5d4b', fantasie: '#6d4b9a', dino: '#5c4f3c', mond: '#55556a', regenbogenland: '#ff9acb', unterwasser: '#2a4d6e' };
  let S = null;            // Editor offen: { menue, d, roh, ort, werkzeug, hoehe, undo, meldung, probleme, ... }
  let el = {};             // DOM-Teile

  const sp = () => (S && S.d ? E.geometrie(S.d) : null);
  function entwurfSichern() {
    try { if (typeof localStorage !== 'undefined') { if (S && S.d) localStorage.setItem(ENTWURF, JSON.stringify(S.d)); else localStorage.removeItem(ENTWURF); } } catch (e) { /* egal */ }
  }
  function entwurfLaden() {
    try { const t = typeof localStorage !== 'undefined' ? localStorage.getItem(ENTWURF) : null; if (t) { const x = JSON.parse(t); const d = E.pruefen(Object.assign({}, x, { id: x.id })); if (d) { if (x.id) d.id = x.id; return d; } } } catch (e) { /* kaputt */ }
    return null;
  }
  const kopie = (d) => (d ? JSON.parse(JSON.stringify(d)) : null);
  function undoMerken() { S.undo.push(kopie(S.d)); if (S.undo.length > 60) S.undo.shift(); }
  function rueckgaengig() {
    if (!S.undo.length) { meldung('Nichts zum Zurücknehmen.', 'info'); return; }
    S.d = S.undo.pop(); S.roh = []; S.ort = null; S.probleme = []; S.ansicht = null;
    meldung('Zurückgenommen.', 'info'); entwurfSichern(); alles();
  }

  // ---------------------------------------------------------------- Ansicht (Meter ↔ Pixel)
  function ansichtBerechnen() {
    const cw = el.leinwand.clientWidth, ch = el.leinwand.clientHeight;
    if (!S.d) { S.ansicht = { cw, ch, sx: Math.min(cw, ch) / K.welt, ox: 0, oz: 0 }; return S.ansicht; }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    S.d.pkt.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
    const m = 46, sx = Math.min((cw - 2 * m) / Math.max(60, x1 - x0), (ch - 2 * m) / Math.max(60, z1 - z0), 1.6);
    S.ansicht = { cw, ch, sx, ox: (x0 + x1) / 2, oz: (z0 + z1) / 2 };
    return S.ansicht;
  }
  const px = (x, z) => { const a = S.ansicht; return [a.cw / 2 + (x - a.ox) * a.sx, a.ch / 2 + (z - a.oz) * a.sx]; };
  const welt = (cx, cy) => { const a = S.ansicht; return [(cx - a.cw / 2) / a.sx + a.ox, (cy - a.ch / 2) / a.sx + a.oz]; };

  // ---------------------------------------------------------------- Zeichnen
  let geplant = false;
  function zeichnenPlan() { if (geplant) return; geplant = true; requestAnimationFrame(() => { geplant = false; if (S) zeichnen(); }); }
  function groesse() {
    const c = el.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), cw = el.leinwand.clientWidth, ch = el.leinwand.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    return dpr;
  }
  function pfad(g, pts, schliessen) { g.beginPath(); pts.forEach((p, i) => { const q = px(p[0], p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); if (schliessen) g.closePath(); }
  function zeichnen() {
    if (!el.canvas) return;
    const dpr = groesse(), g = el.canvas.getContext('2d');
    ansichtBerechnen();
    const a = S.ansicht, wid = S.d ? S.d.welt : S.welt;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = HINTERGRUND[wid] || '#8fd26a'; g.fillRect(0, 0, a.cw, a.ch);
    // Raster alle 100 m
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath();
    const w0 = welt(0, 0), w1 = welt(a.cw, a.ch);
    for (let x = Math.ceil(w0[0] / 100) * 100; x < w1[0]; x += 100) { const p = px(x, 0); g.moveTo(p[0], 0); g.lineTo(p[0], a.ch); }
    for (let z = Math.ceil(w0[1] / 100) * 100; z < w1[1]; z += 100) { const p = px(0, z); g.moveTo(0, p[1]); g.lineTo(a.cw, p[1]); }
    g.stroke();
    if (!S.d) zeichneMalfeld(g, a);
    else zeichneStrecke(g, a);
    // Fehlerort
    if (S.ort) {
      const p = px(S.ort.x, S.ort.z), t = (performance.now() % 900) / 900, r = 14 + 8 * Math.sin(t * 2 * Math.PI);
      g.strokeStyle = '#e04a3a'; g.lineWidth = 4; g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.stroke();
      g.fillStyle = '#e04a3a'; g.font = '900 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', p[0], p[1]);
      zeichnenPlan();
    }
  }
  function zeichneMalfeld(g, a) {
    const p0 = px(-K.welt / 2, -K.welt / 2), p1 = px(K.welt / 2, K.welt / 2);
    g.setLineDash([10, 8]); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.strokeRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]); g.setLineDash([]);
    if (!S.roh.length) {
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '900 ' + Math.round(Math.min(a.cw, a.ch) / 15) + 'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Mal eine große Runde!', a.cw / 2, a.ch / 2 - 14); g.font = '800 ' + Math.round(Math.min(a.cw, a.ch) / 26) + 'px Arial';
      g.fillText('Mit dem Finger oder der Maus – am Ende wieder zum Anfang.', a.cw / 2, a.ch / 2 + 22);
    }
    if (S.roh.length > 1) {
      pfad(g, S.roh, false); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(6, 14 * a.sx * 3); g.strokeStyle = S.ort ? 'rgba(224,74,58,.85)' : 'rgba(40,40,60,.9)'; g.stroke();
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      const q = px(S.roh[0][0], S.roh[0][1]); g.fillStyle = '#2fae4e'; g.beginPath(); g.arc(q[0], q[1], 9, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    }
  }
  function zeichneStrecke(g, a) {
    const d = S.d, spl = E.geometrie(d), pk = spl.punkte, wid = d.welt;
    // Hügel
    d.hoehen.forEach((h) => {
      const p = spl.punktBei(h.s), c = px(p.x, p.z), r = (70 + 6 * Math.abs(h.h)) * a.sx, gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
      gr.addColorStop(0, h.h > 0 ? 'rgba(120,80,30,.55)' : 'rgba(20,80,160,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(c[0], c[1], r, 0, 7); g.fill();
    });
    // Straße (untere zuerst, dann die Brücken oben drauf)
    const breite = Math.max(6, 14 * a.sx), kr = E.kreuzungenVon(d);
    const linie = (s0, s1, w, farbe) => {
      g.beginPath();
      let n = 0;
      for (let s = s0; s <= s1; s += 6) { const p = spl.punktBei(s), q = px(p.x, p.z); if (n++) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.strokeStyle = farbe; g.lineWidth = w; g.lineCap = 'butt'; g.lineJoin = 'round'; g.stroke();
    };
    const L = spl.laenge;
    const ganz = (w, f) => { g.beginPath(); for (let i = 0; i < pk.length; i += 3) { const q = px(pk[i].x, pk[i].z); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.closePath(); g.strokeStyle = f; g.lineWidth = w; g.lineJoin = 'round'; g.stroke(); };
    ganz(breite + 5, '#fff'); ganz(breite, STRASSE[wid] || '#4b4f5c');
    kr.forEach((k) => { linie(Math.max(0, k.sOben - 55), Math.min(L, k.sOben + 55), breite + 7, '#7a4b1e'); linie(Math.max(0, k.sOben - 55), Math.min(L, k.sOben + 55), breite + 1, '#b9b9c6'); linie(Math.max(0, k.sOben - 55), Math.min(L, k.sOben + 55), breite - 3, STRASSE[wid] || '#4b4f5c'); });
    // Mittellinie
    g.setLineDash([Math.max(4, 8 * a.sx * 2), Math.max(4, 8 * a.sx * 2)]); ganz(Math.max(1, 1.2 * a.sx * 2), 'rgba(255,225,90,.9)'); g.setLineDash([]);
    // Start/Ziel
    { const p = spl.punktBei(0), q = px(p.x, p.z), nx = p.nx, nz = p.nz, w = 8;
      g.save(); g.translate(q[0], q[1]); g.rotate(Math.atan2(nz, nx)); const bw = breite + 6;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(-bw / 2 + i * bw / 6, -w / 2 + j * w / 2, bw / 6, w / 2); }
      g.restore();
      const p2 = spl.punktBei(70), q2 = px(p2.x, p2.z);
      g.fillStyle = '#fff'; g.font = '900 ' + Math.max(12, Math.round(14 * Math.min(1.6, a.sx * 2))) + 'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('▶ Start', q2[0] + p2.nx * 24, q2[1] + p2.nz * 24);
    }
    // Elemente
    d.el.forEach((e) => zeichneElement(g, a, spl, e));
    // Geisterbild beim Setzen
    if (S.geist) zeichneGeist(g, a, spl, S.geist);
    // Probleme der KI-Testrunde
    (S.probleme || []).forEach((p) => {
      const q = spl.punktBei(p.s), c = px(q.x, q.z), t = (performance.now() % 900) / 900;
      g.strokeStyle = '#e04a3a'; g.lineWidth = 5; g.beginPath(); g.arc(c[0], c[1], 18 + 8 * Math.sin(t * 6.28), 0, 7); g.stroke();
      g.fillStyle = '#fff'; g.font = '900 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('❗', c[0], c[1]);
      zeichnenPlan();
    });
  }
  const FARBE = { schanze: '#ffb347', ring: '#ff6b3a', looping: '#c58bff', trampolin: '#ff7ab8', kanone: '#ff5d5d', tor: '#4fc3ff', gold: '#ffd23a', magnet: '#6aa0ff', schlucht: '#b0e07a' };
  function band(g, spl, a, s0, s1, farbe, breitePx, alpha) {
    g.beginPath();
    let n = 0;
    for (let s = Math.max(0, s0); s <= Math.min(spl.laenge, s1); s += 5) { const p = spl.punktBei(s), q = px(p.x, p.z); if (n++) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    g.globalAlpha = alpha; g.strokeStyle = farbe; g.lineWidth = breitePx; g.lineCap = 'round'; g.stroke(); g.globalAlpha = 1;
  }
  function symbol(g, p, emoji, groesse, rand) {
    g.fillStyle = rand || '#fff'; g.beginPath(); g.arc(p[0], p[1], groesse * 0.72, 0, 7); g.fill();
    g.font = Math.round(groesse) + 'px "Apple Color Emoji","Segoe UI Emoji",Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(emoji, p[0], p[1] + 1);
  }
  function zeichneElement(g, a, spl, e) {
    const r = E.regel(e.a), info = E.ARTEN_INFO[e.a], w = Math.max(8, 14 * a.sx);
    const gr = Math.round(klemme(16 * a.sx * 2.2 + 12, 20, 30));
    if (e.a === 'gold') {
      for (let j = 0; j < 5; j++) { const p = spl.punktBei(e.s + j * 6), q = px(p.x + p.nx * (e.q || 0) * 14, p.z + p.nz * (e.q || 0) * 14); g.fillStyle = '#ffd23a'; g.strokeStyle = '#a06a00'; g.lineWidth = 2; g.beginPath(); g.arc(q[0], q[1], 5, 0, 7); g.fill(); g.stroke(); }
      return;
    }
    band(g, spl, a, e.s, e.s + r.laenge, FARBE[e.a], w * 0.55, 0.85);
    if (e.a === 'tor') {
      const W = (R.config.spass.welten && R.config.spass.welten.tor.abstand) || 130;
      [e.s, e.s + W].forEach((s, i) => { const p = spl.punktBei(s), q = px(p.x, p.z); symbol(g, q, i ? '🟠' : '🔵', gr * 0.9); });
      const p1 = spl.punktBei(e.s), p2 = spl.punktBei(e.s + W), q1 = px(p1.x, p1.z), q2 = px(p2.x, p2.z);
      g.setLineDash([4, 5]); g.strokeStyle = '#4fc3ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]); g.stroke(); g.setLineDash([]);
      return;
    }
    const mid = spl.punktBei(e.s + Math.min(r.laenge, 40) / 2), q = px(mid.x, mid.z);
    symbol(g, q, info.emoji, gr);
  }
  function zeichneGeist(g, a, spl, geist) {
    const r = E.regel(geist.art), w = Math.max(8, 14 * a.sx), ok = geist.ok, farbe = ok ? '#2fae4e' : '#e04a3a';
    band(g, spl, a, geist.s, geist.s + r.laenge, farbe, w * 0.9, 0.55);
    const p = spl.punktBei(geist.s), q = px(p.x, p.z);
    symbol(g, q, E.ARTEN_INFO[geist.art] ? E.ARTEN_INFO[geist.art].emoji : '⛰️', 24, ok ? '#c8ffd5' : '#ffd0cc');
  }

  // ---------------------------------------------------------------- Meldungen, Toast, Dialog
  let blaseZeit = 0;
  function meldung(text, art, ms) {
    S.meldung = text ? { text, art: art || 'info' } : null;
    if (!el.blase) return;
    el.blase.textContent = text || ''; el.blase.className = 'e7-blase ' + (art || 'info'); el.blase.style.display = text ? 'block' : 'none';
    const t = ++blaseZeit;
    if (text && art !== 'fehler') setTimeout(() => { if (t === blaseZeit && el.blase) el.blase.style.display = 'none'; }, ms || 4200);
  }
  function toast(text) {
    const t = document.createElement('div'); t.className = 'e7-toast'; t.textContent = text; el.wurzel.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }
  function dialog(html, knoepfe, opt) {
    dialogZu();
    const w = document.createElement('div'); w.className = 'e7-dlg';
    w.innerHTML = '<div class="e7-dk">' + html + '<div class="e7-fuss" style="background:none;margin-top:.5em"></div></div>';
    const fuss = w.querySelector('.e7-fuss');
    (knoepfe || [{ t: 'Ok', k: 'gruen' }]).forEach((b) => {
      const k = document.createElement('div'); k.className = 'e7-k ' + (b.k || ''); k.textContent = b.t;
      k.addEventListener('click', () => { if (!b.bleiben) dialogZu(); if (b.fn) b.fn(w); });
      fuss.appendChild(k);
    });
    el.wurzel.appendChild(w); S.dialog = w;
    if (opt && opt.init) opt.init(w);
    return w;
  }
  function dialogZu() { if (S && S.dialog) { S.dialog.remove(); S.dialog = null; return true; } return false; }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- Bedienelemente aktualisieren
  function bedienung() {
    if (!el.wurzel) return;
    const d = S.d, hat = !!d;
    el.welt.innerHTML = E.WELTEN.map((w) => `<span class="e7-chip${(d ? d.welt : S.welt) === w.id ? ' an' : ''}" data-w="${w.id}">${w.emoji} ${w.name}</span>`).join('');
    const werk = E.ARTEN.filter((a) => !(E.ARTEN_INFO[a].moto && !MOTO)).map((a) => {
      const n = hat ? d.el.filter((e) => e.a === a).length : 0;
      return `<div class="e7-t${S.werkzeug === a ? ' an' : ''}${hat ? '' : ' aus'}" data-t="${a}" title="${E.ARTEN_INFO[a].name}"><b>${E.ARTEN_INFO[a].emoji}</b>${E.ARTEN_INFO[a].name}${n ? `<span class="n">×${n}</span>` : ''}</div>`;
    }).join('') +
      `<div class="e7-t${S.werkzeug === 'huegel' ? ' an' : ''}${hat ? '' : ' aus'}" data-t="huegel" title="Hügel oder Senke"><b>⛰️</b>Hügel${hat && d.hoehen.length ? `<span class="n">×${d.hoehen.length}</span>` : ''}</div>` +
      `<div class="e7-t${S.werkzeug === 'radierer' ? ' an' : ''}${hat ? '' : ' aus'}" data-t="radierer" title="Radiergummi"><b>🧽</b>Radierer</div>`;
    el.werk.innerHTML = werk;
    el.schieber.style.display = S.werkzeug === 'huegel' ? 'flex' : 'none';
    el.hoeheText.textContent = (S.hoehe > 0 ? '⛰️ Hügel +' + S.hoehe : S.hoehe < 0 ? '🕳️ Senke ' + S.hoehe : 'Weg') + ' m';
    el.name.value = el.name.value || '';
    el.fuss.querySelectorAll('[data-b]').forEach((b) => { const x = b.dataset.b; b.classList.toggle('aus', (x === 'probe' || x === 'speichern' || x === 'teilen') && !hat); });
    el.hinweis.textContent = hat ? (S.werkzeug ? 'Tippe auf die Strecke.' : 'Wähle ein Teil und tippe auf die Strecke.') : 'Erst eine Runde malen – dann kannst du bauen.';
  }
  function alles() { if (!S) return; bedienung(); zeichnenPlan(); }

  // ---------------------------------------------------------------- Malen
  function strichStart(ev) {
    if (S.d) return false;
    S.roh = []; S.ort = null; S.malt = true; meldung('', 'info');
    strichPunkt(ev); return true;
  }
  function strichPunkt(ev) {
    const r = el.leinwand.getBoundingClientRect(), w = welt(ev.clientX - r.left, ev.clientY - r.top), l = S.roh[S.roh.length - 1];
    if (!l || Math.hypot(w[0] - l[0], w[1] - l[1]) >= 3) { S.roh.push([klemme(w[0], -K.welt / 2, K.welt / 2), klemme(w[1], -K.welt / 2, K.welt / 2)]); if (S.roh.length > 2500) S.roh.shift(); }
  }
  function strichEnde() {
    S.malt = false;
    if (S.roh.length < 6) { S.roh = []; zeichnenPlan(); return; }
    const t0 = performance.now(), v = E.verarbeiten(S.roh);
    if (!v.ok) { S.ort = v.ort; meldung(v.text, 'fehler'); zeichnenPlan(); return; }
    undoMerken();
    const name = (el.name.value || '').trim();
    S.d = E.neu(v.pkt, name || 'Meine Strecke', S.welt);
    S.roh = []; S.ort = null; S.probleme = []; S.werkzeug = null;
    const kr = E.kreuzungenVon(S.d).length;
    meldung('Deine Strecke ist fertig, ' + Math.round(E.geometrie(S.d).laenge) + ' m lang!' + (v.hinweise.length ? ' ' + v.hinweise.join(' ') : '') + (kr ? ' 🌉 Wo sich die Linie kreuzt, fährst du über eine Brücke.' : ''), 'gut', 7000);
    entwurfSichern(); alles();
    void t0;
  }

  // ---------------------------------------------------------------- Antippen: Teile setzen, Hügel, Radierer
  function naechsterS(w) {
    const spl = sp(), pk = spl.punkte;
    let b = 0, bd = Infinity;
    for (let i = 0; i < pk.length; i++) { const dx = pk[i].x - w[0], dz = pk[i].z - w[1], q = dx * dx + dz * dz; if (q < bd) { bd = q; b = i; } }
    return { s: pk[b].s, abstand: Math.sqrt(bd) };
  }
  function tippen(ev, nurGeist) {
    const r = el.leinwand.getBoundingClientRect(), cx = ev.clientX - r.left, cy = ev.clientY - r.top, w = welt(cx, cy), n = naechsterS(w);
    const nah = n.abstand * S.ansicht.sx <= 34;
    const art = S.werkzeug;
    if (nurGeist) {
      if (!art || art === 'radierer' || art === 'huegel' || !nah) { if (S.geist) { S.geist = null; zeichnenPlan(); } return; }
      const st = E.stelle(S.d, art, n.s);
      S.geist = { art, s: st.ok ? st.s : n.s, ok: st.ok }; zeichnenPlan(); return;
    }
    if (!art) { meldung('Wähle unten erst ein Teil, zum Beispiel 🛫 Schanze.', 'info'); return; }
    if (art === 'radierer') {
      // nächstes Element oder Hügel zum Löschen
      const spl = sp(), a = S.ansicht;
      let best = null, bd = 34;
      S.d.el.forEach((e, i) => {
        const r0 = E.regel(e.a), stellen = e.a === 'tor' ? [e.s, e.s + ((R.config.spass.welten && R.config.spass.welten.tor.abstand) || 130)] : e.a === 'gold' ? [e.s, e.s + 12, e.s + 24] : [e.s + Math.min(r0.laenge, 40) / 2];
        stellen.forEach((s) => { const p = spl.punktBei(s), q = px(p.x, p.z), dd = Math.hypot(q[0] - cx, q[1] - cy); if (dd < bd) { bd = dd; best = { art: 'el', i }; } });
      });
      S.d.hoehen.forEach((h, i) => { const p = spl.punktBei(h.s), q = px(p.x, p.z), dd = Math.hypot(q[0] - cx, q[1] - cy) - 6; if (dd < bd) { bd = dd; best = { art: 'h', i }; } });
      void a;
      if (!best) { meldung('Tippe genau auf ein Teil, das weg soll.', 'info'); return; }
      undoMerken();
      if (best.art === 'el') { const was = S.d.el[best.i]; E.entfernen(S.d, best.i); meldung(E.ARTEN_INFO[was.a].emoji + ' ' + E.ARTEN_INFO[was.a].name + ' ist weg.', 'info', 1800); }
      else { S.d.hoehen.splice(best.i, 1); meldung('⛰️ Hügel ist weg.', 'info', 1800); }
      S.probleme = []; entwurfSichern(); alles(); return;
    }
    if (!nah) { meldung('Tippe direkt auf die Strecke.', 'info', 2200); return; }
    if (art === 'huegel') {
      undoMerken(); const rr = E.hoeheSetzen(S.d, n.s, S.hoehe);
      if (!rr.ok) { S.undo.pop(); meldung(rr.grund, 'fehler'); return; }
      meldung(S.hoehe === 0 ? 'Der Hügel ist weg.' : (S.hoehe > 0 ? '⛰️ Hügel mit ' + S.hoehe + ' m' : '🕳️ Senke mit ' + (-S.hoehe) + ' m') + ' gesetzt.', 'gut', 2200);
      S.probleme = []; entwurfSichern(); alles(); return;
    }
    undoMerken();
    const rr = E.setzen(S.d, art, n.s);
    if (!rr.ok) { S.undo.pop(); meldung('Hier geht das nicht: ' + rr.grund, 'fehler', 3500); setTimeout(() => { if (S && S.meldung && S.meldung.art === 'fehler') meldung('', 'info'); }, 3600); return; }
    meldung(E.ARTEN_INFO[art].emoji + ' ' + E.ARTEN_INFO[art].name + ' gesetzt' + (rr.verschoben ? ' – ich habe es auf die nächste passende Stelle geschoben' : '') + '.', 'gut', rr.verschoben ? 4200 : 1800);
    S.probleme = []; S.geist = null; entwurfSichern(); alles();
  }

  // ---------------------------------------------------------------- Speichern, Vorschau, Fahrtest
  function vorschauBild(d) {
    try {
      const c = document.createElement('canvas'); c.width = 192; c.height = 144;
      const g = c.getContext('2d'), spl = E.geometrie(d), pk = spl.punkte;
      g.fillStyle = HINTERGRUND[d.welt] || '#8fd26a'; g.fillRect(0, 0, 192, 144);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      pk.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
      const sc = Math.min(160 / Math.max(50, x1 - x0), 112 / Math.max(50, z1 - z0)), ox = (x0 + x1) / 2, oz = (z0 + z1) / 2, X = (x) => 96 + (x - ox) * sc, Z = (z) => 72 + (z - oz) * sc;
      const pf = () => { g.beginPath(); for (let i = 0; i < pk.length; i += 3) { if (i) g.lineTo(X(pk[i].x), Z(pk[i].z)); else g.moveTo(X(pk[i].x), Z(pk[i].z)); } g.closePath(); };
      g.lineJoin = 'round'; pf(); g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke(); pf(); g.strokeStyle = STRASSE[d.welt] || '#4b4f5c'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#e04a3a'; g.beginPath(); g.arc(X(pk[0].x), Z(pk[0].z), 4, 0, 7); g.fill();
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) { return ''; }
  }
  function speichernFrage() {
    if (!S.d) return;
    const d = S.d;
    dialog('<h3>💾 Strecke speichern</h3><p>Wie heißt deine Strecke?</p><input type="text" id="e7-sname" maxlength="24" value="' + esc(d.name) + '"><p style="font-size:.8em;opacity:.85">Gleicher Name = ersetzt die alte Strecke. Neuer Name = neue Strecke.</p>',
      [{ t: '💾 Speichern', k: 'gruen', fn: (w) => speichernPruefen(w.querySelector('#e7-sname').value) }, { t: 'Abbrechen', k: 'rot' }],
      { init: (w) => { const i = w.querySelector('#e7-sname'); setTimeout(() => { try { i.focus(); i.select(); } catch (e) { /* egal */ } }, 50); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { dialogZu(); speichernPruefen(i.value); } }); } });
  }
  function speichernPruefen(name) {
    const d = S.d;
    name = E.sauber(name) || 'Meine Strecke';
    // neuer Name → neue Strecke (neue id); gleicher Name → überschreibt
    if (d.id && d.gespeichertAls !== undefined && d.gespeichertAls !== name) delete d.id;
    d.name = name; el.name.value = name;
    dialog('<h3>🤖 Ich teste die Strecke …</h3><p>Ein Computer-Auto fährt eine Probe-Runde.</p>', []);
    setTimeout(() => {
      let f;
      try { f = E.fahrtest(E.eintrag(d)); } catch (e) { f = { ok: true, probleme: [] }; }
      dialogZu();
      if (f.ok) { speichernWirklich(null); return; }
      S.probleme = f.probleme; zeichnenPlan();
      const p = f.probleme[0];
      dialog('<h3>🤔 Das schaffen die Computer-Autos nicht</h3><p>' + esc(p.text) + '</p><p>Die Stelle (bei Meter ' + p.s + ') ist auf der Karte mit ❗ markiert. Du kannst sie ändern – oder trotzdem speichern und allein fahren.</p>',
        [{ t: '✏️ Ändern', k: 'blau' }, { t: 'Trotzdem speichern', k: 'rot', fn: () => speichernWirklich(p) }]);
    }, 40);
  }
  function speichernWirklich(problem) {
    const d = S.d;
    d.ki = problem ? { ok: false, s: problem.s, text: String(problem.text).slice(0, 80) } : { ok: true };
    const r = E.Speicher.speichern(d, vorschauBild(d));
    if (!r.ok) { dialog('<h3>😕 Das geht nicht</h3><p>' + esc(r.grund) + '</p>', [{ t: '📂 Meine Strecken', k: 'blau', fn: () => meineStrecken() }, { t: 'Ok', k: 'gruen' }]); return; }
    d.gespeichertAls = d.name; S.letzteId = r.id; S.probleme = []; entwurfSichern();
    toast('✅ Gespeichert – unter „Meine Strecken“!');
    try { if (R.Spass && R.Spass.sticker) R.Spass.sticker('strecke', { anzahl: r.anzahl }); } catch (e) { /* egal */ }
    alles();
  }

  // ---------------------------------------------------------------- Probefahren
  function probefahren() {
    if (!S.d) return;
    dialog('<h3>🏁 Probefahren</h3><p>Wie willst du fahren?</p>',
      [{ t: '👤 Allein', k: 'gruen', fn: () => losFahren('solo', 0) }, { t: '🤖 Mit Computer-Autos', k: 'blau', fn: () => losFahren('solo', 3) }, { t: '👫 Zu zweit', k: 'blau', fn: () => losFahren('zwei', 0) }, { t: 'Zurück', k: 'rot' }]);
  }
  function losFahren(modus, gegner) {
    const d = S.d, spiel = S.menue.spiel;
    const e = E.registrieren(d);
    entwurfSichern();
    const m = S.menue;
    schliessen(true);
    spiel._editorZurueck = true;
    spiel._s4Modus = null;
    if (m && m.e) { m.e.spassModus = ''; m.e.spielart = 'rennen'; }
    try { spiel.rennenStarten({ streckeId: e.id, modus, gegner, runden: 3, spielart: 'rennen', welt: '', variante: '', spass: true }); }
    catch (err) { console.error('Strecken-Editor (Probefahren):', err); spiel._editorZurueck = false; spiel.menue.zeigen(0); }
  }

  // ---------------------------------------------------------------- Meine Strecken, Teilen
  function meineStrecken() {
    const a = E.Speicher.liste();
    const kach = a.map((x, i) => `<div class="e7-kachel">${x.vorschau ? `<img src="${x.vorschau}" alt="">` : '<div style="aspect-ratio:4/3;background:#9bd"></div>'}<b>${esc(x.daten.name)}</b><div>${E.welt(x.daten.welt).emoji} ${Math.round(E.geometrie(x.daten).laenge)} m${x.daten.ki && x.daten.ki.ok === false ? ' ⚠️' : ''}</div>` +
      `<div class="k"><span data-o="${i}">✏️ Öffnen</span><span class="r" data-l="${i}">🗑️</span></div></div>`).join('');
    dialog('<h3>📂 Meine Strecken</h3>' + (a.length ? `<p style="font-size:.8em">${a.length} von ${K.maxStrecken}</p><div class="e7-liste">${kach}</div>` : '<p>Du hast noch keine Strecke gespeichert.</p>'),
      [{ t: 'Schließen', k: 'gruen' }],
      { init: (w) => w.addEventListener('click', (ev) => {
        const o = ev.target.closest('[data-o]'), l = ev.target.closest('[data-l]');
        if (o) { const x = a[+o.dataset.o]; dialogZu(); S.undo.push(kopie(S.d)); S.d = kopie(x.daten); S.d.gespeichertAls = S.d.name; el.name.value = S.d.name; S.roh = []; S.ort = null; S.probleme = []; S.werkzeug = null; S.welt = S.d.welt; entwurfSichern(); alles(); meldung('„' + S.d.name + '“ ist geöffnet.', 'gut'); }
        if (l) { const x = a[+l.dataset.l]; fragen('„' + x.daten.name + '“ wirklich löschen?', () => { E.Speicher.loeschen(x.daten.id); toast('Gelöscht.'); meineStrecken(); }); }
      }) });
  }
  function fragen(text, ja) { dialog('<h3>🗑️ ' + esc(text) + '</h3>', [{ t: 'Ja, löschen', k: 'rot', fn: ja }, { t: 'Nein', k: 'gruen' }]); }
  function teilen() {
    if (!S.d) return;
    const c = E.code(S.d);
    dialog('<h3>📤 Strecke teilen</h3><p style="font-size:.85em">Schick den Code (zum Beispiel per Nachricht) oder die Datei. Wer ihn bekommt, fügt ihn bei „📥 Code einfügen“ ein.</p><textarea id="e7-code" readonly>' + esc(c) + '</textarea>' +
      '<div class="e7-fuss" style="background:none"><span class="e7-k blau" data-x="kopieren">📋 Code kopieren</span><span class="e7-k blau" data-x="datei">💾 Als Datei</span><span class="e7-k" data-x="einfuegen">📥 Code einfügen</span><span class="e7-k" data-x="dateiladen">📂 Datei laden</span></div>',
      [{ t: 'Schließen', k: 'gruen' }],
      { init: (w) => w.addEventListener('click', (ev) => {
        const x = ev.target.closest('[data-x]'); if (!x) return;
        const a = x.dataset.x, ta = w.querySelector('#e7-code');
        if (a === 'kopieren') { ta.select(); let ok = false; try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(c).then(() => toast('📋 Kopiert!'), () => toast('Markiert – jetzt Strg+C')); ok = true; } else ok = document.execCommand('copy'); } catch (e) { ok = false; } if (ok) toast('📋 Kopiert!'); }
        if (a === 'datei') { dateiSpeichern(S.d.name, c); }
        if (a === 'einfuegen') importFrage();
        if (a === 'dateiladen') dateiLaden();
      }) });
  }
  function dateiSpeichern(name, text) {
    try {
      const b = new Blob([text], { type: 'text/plain' }), u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = (E.sauber(name).replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, '_') || 'strecke') + '.strecke.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
      toast('💾 Datei gespeichert');
    } catch (e) { toast('Das Speichern geht hier nicht – nimm den Code.'); }
  }
  function importFrage() {
    dialog('<h3>📥 Code einfügen</h3><p style="font-size:.85em">Füge hier den Streckencode ein (er beginnt mit STRECKE1.).</p><textarea id="e7-imp" placeholder="STRECKE1.…"></textarea><p id="e7-imp-f" style="color:#ffb4a8;min-height:1.2em"></p>',
      [{ t: '📥 Laden', k: 'gruen', bleiben: true, fn: (w) => importieren(w.querySelector('#e7-imp').value, w) }, { t: 'Abbrechen', k: 'rot' }]);
  }
  function importieren(text, w) {
    const d = E.ausCode(text);
    if (!d) { const f = w && w.querySelector('#e7-imp-f'); if (f) f.textContent = E.ausCode.letzterGrund || 'Das ist kein Streckencode.'; else meldung(E.ausCode.letzterGrund, 'fehler'); return; }
    dialogZu(); undoMerken(); delete d.id; S.d = d; S.welt = d.welt; el.name.value = d.name; S.roh = []; S.ort = null; S.probleme = []; S.werkzeug = null;
    entwurfSichern(); alles(); meldung('Strecke „' + d.name + '“ geladen – zum Behalten: 💾 Speichern.', 'gut', 6000);
  }
  function dateiLaden() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.txt,.strecke,text/plain';
    i.addEventListener('change', () => { const f = i.files && i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importieren(String(r.result || ''), null); r.readAsText(f); });
    i.click();
  }

  // ---------------------------------------------------------------- Öffnen / Schließen
  function oeffnen(menue, opt) {
    if (S || R.EditorUI.an === false) return;
    opt = opt || {};
    stil();
    S = { menue, d: null, roh: [], ort: null, werkzeug: null, hoehe: 5, undo: [], meldung: null, probleme: [], dialog: null, welt: 'wiese', malt: false, geist: null, ansicht: null };
    if (opt.neu) { try { localStorage.removeItem(ENTWURF); } catch (e) { /* egal */ } }
    else { const d = opt.daten || entwurfLaden(); if (d) { S.d = d; S.welt = d.welt; } }
    const w = document.createElement('div'); w.className = 'e7'; w.id = 'e7';
    w.innerHTML = '<div class="e7-kopf"><h1>✏️ Strecke malen</h1><input class="e7-name" type="text" maxlength="24" placeholder="Name der Strecke" aria-label="Name"><div class="e7-x" data-b="menue">◀ Menü</div></div>' +
      '<div class="e7-haupt"><div class="e7-buehne"><canvas></canvas><div class="e7-blase" style="display:none"></div></div>' +
      '<div class="e7-panel"><h2>🌍 Welt</h2><div class="e7-chips" data-r="welt"></div><h2>🧰 Bauen</h2><div class="e7-werk" data-r="werk"></div>' +
      '<div class="e7-schieber" data-r="schieber"><input type="range" min="-4" max="8" step="1" value="5" aria-label="Höhe"><span data-r="hoeheText"></span></div><div data-r="hinweis" style="font-size:.78em;opacity:.9;text-align:center"></div></div></div>' +
      '<div class="e7-fuss" data-r="fuss"><span class="e7-k" data-b="zurueck">↩ Zurück</span><span class="e7-k" data-b="neu">🖍️ Neu malen</span><span class="e7-k gruen" data-b="probe">🏁 Probefahren</span><span class="e7-k blau" data-b="speichern">💾 Speichern</span><span class="e7-k" data-b="meine">📂 Meine Strecken</span><span class="e7-k" data-b="teilen">📤 Teilen</span><span class="e7-k" data-b="import">📥 Code einfügen</span></div>';
    document.body.appendChild(w);
    el = { wurzel: w, canvas: w.querySelector('canvas'), leinwand: w.querySelector('.e7-buehne'), blase: w.querySelector('.e7-blase'), name: w.querySelector('.e7-name'), welt: w.querySelector('[data-r=welt]'), werk: w.querySelector('[data-r=werk]'),
      schieber: w.querySelector('[data-r=schieber]'), hoeheText: w.querySelector('[data-r=hoeheText]'), hinweis: w.querySelector('[data-r=hinweis]'), fuss: w.querySelector('[data-r=fuss]') };
    el.name.value = S.d ? S.d.name : '';
    el.name.addEventListener('input', () => { if (S.d) { S.d.name = E.sauber(el.name.value) || 'Meine Strecke'; entwurfSichern(); } });
    // Tasten: alles sperren außer Eingabefeldern; Esc / Strg+Z
    S.tastenFn = (e) => {
      if (!S) return;
      const feld = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!dialogZu()) schliessen(); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !feld) { e.preventDefault(); e.stopImmediatePropagation(); rueckgaengig(); return; }
      if (!feld) { e.stopImmediatePropagation(); }
      else e.stopPropagation();
    };
    window.addEventListener('keydown', S.tastenFn, true); window.addEventListener('keyup', S.tastenFn, true);
    S.resizeFn = () => { S.ansicht = null; zeichnenPlan(); };
    window.addEventListener('resize', S.resizeFn);
    if (typeof ResizeObserver !== 'undefined') { S.ro = new ResizeObserver(() => zeichnenPlan()); S.ro.observe(el.leinwand); }
    // Klicks
    w.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-t]'), c = ev.target.closest('[data-w]'), b = ev.target.closest('[data-b]');
      if (c) { const id = c.dataset.w; S.welt = id; if (S.d) { undoMerken(); S.d.welt = id; entwurfSichern(); } alles(); const wi = E.welt(id); meldung(wi.emoji + ' ' + wi.name, 'info', 1200); }
      else if (t) { if (!S.d) { meldung('Mal zuerst eine Runde – dann kannst du Teile setzen.', 'info'); return; } const a = t.dataset.t; S.werkzeug = S.werkzeug === a ? null : a; S.geist = null; alles(); if (S.werkzeug && S.werkzeug !== 'radierer' && S.werkzeug !== 'huegel') meldung(E.ARTEN_INFO[S.werkzeug].emoji + ' Tippe auf die Strecke, wo es hin soll.', 'info', 2600); }
      else if (b) {
        const x = b.dataset.b;
        if (x === 'menue') schliessen();
        else if (x === 'zurueck') rueckgaengig();
        else if (x === 'neu') { if (!S.d) { S.roh = []; S.ort = null; alles(); return; } fragen2('Neu malen? Die jetzige Strecke wird weggeräumt – mit „Zurück“ holst du sie wieder.', () => { undoMerken(); S.d = null; S.roh = []; S.ort = null; S.probleme = []; S.werkzeug = null; entwurfSichern(); alles(); }); }
        else if (x === 'probe') { if (S.d) probefahren(); else meldung('Mal erst eine Strecke.', 'info'); }
        else if (x === 'speichern') { if (S.d) speichernFrage(); else meldung('Mal erst eine Strecke.', 'info'); }
        else if (x === 'meine') meineStrecken();
        else if (x === 'teilen') { if (S.d) teilen(); else meldung('Mal erst eine Strecke.', 'info'); }
        else if (x === 'import') importFrage();
      }
    });
    el.schieber.querySelector('input').addEventListener('input', (ev) => { S.hoehe = +ev.target.value; bedienung(); });
    // Zeiger auf der Leinwand
    const cv = el.canvas;
    cv.addEventListener('pointerdown', (ev) => {
      if (S.dialog) return;
      ev.preventDefault();
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
      if (!S.d) { strichStart(ev); zeichnenPlan(); } else tippen(ev, false);
    });
    cv.addEventListener('pointermove', (ev) => {
      if (S.malt) { strichPunkt(ev); zeichnenPlan(); } else if (S.d && S.werkzeug && ev.pointerType !== 'touch' && !S.dialog) { tippen(ev, true); }
    });
    const ende = (ev) => { if (S.malt) { strichEnde(); } };
    cv.addEventListener('pointerup', ende); cv.addEventListener('pointercancel', ende);
    cv.addEventListener('pointerleave', () => { if (S.geist) { S.geist = null; zeichnenPlan(); } });
    alles();
    if (S.d) meldung('Weiter geht’s mit „' + S.d.name + '“. Zum Neumalen: 🖍️ Neu malen.', 'info', 4000);
    return S;
  }
  function fragen2(text, ja) { dialog('<h3>🖍️ ' + esc(text) + '</h3>', [{ t: 'Ja', k: 'rot', fn: ja }, { t: 'Nein', k: 'gruen' }]); }
  function schliessen(ohneMenue) {
    if (!S) return;
    const m = S.menue, id = S.letzteId;
    window.removeEventListener('keydown', S.tastenFn, true); window.removeEventListener('keyup', S.tastenFn, true); window.removeEventListener('resize', S.resizeFn);
    if (S.ro) S.ro.disconnect();
    entwurfSichern();
    el.wurzel.remove(); el = {}; S = null;
    if (ohneMenue) return;
    try {
      if (id && m && typeof m.streckeWaehlen === 'function') { m.streckeWaehlen(id); if (m.schritt !== 1) { m.schritt = 1; m.fokus = 0; } }
      if (m && m.zeichnen) m.zeichnen();
    } catch (e) { /* egal */ }
  }
  R.EditorUI = { an: true, oeffnen, schliessen, offen: () => !!S, zustand: () => S, vorschauBild, speichern: () => speichernFrage() };

  // ---------------------------------------------------------------- Menü
  function menuStil() { stil(); }
  const htmlStrecke = M.htmlStrecke;
  M.htmlStrecke = function () {
    let h = htmlStrecke.apply(this, arguments);
    try {
      if (R.EditorUI.an === false) return h;
      menuStil();
      const gew = R.trackCatalog.find((t) => t.id === this.e.streckeId && t.eigen);
      h += `<div class="m-meine-leiste"><span class="e7-menuk" data-a="editor:neu">✏️ Strecke malen</span>` +
        `<span class="e7-menuk blau" data-a="editor:import">📥 Code einfügen</span>` +
        (gew ? `<span class="e7-menuk blau" data-a="editor:bearbeiten:${gew.id}">✎ „${esc(gew.name)}“ bearbeiten</span><span class="e7-menuk rot" data-a="editor:loeschen:${gew.id}">🗑️</span>` : '') + `</div>`;
    } catch (err) { console.error('Strecken-Editor (Menü):', err); }
    return h;
  };
  const htmlModus = M.htmlModus;
  M.htmlModus = function () {
    return htmlModus.apply(this, arguments);
  };
  const aktion = M.aktion;
  M.aktion = function (a) {
    if (typeof a === 'string' && a.startsWith('editor:') && R.EditorUI.an !== false) {
      const [, was, id] = a.split(':');
      if (R.Audio) R.Audio.menueKlick();
      if (was === 'neu') oeffnen(this, { neu: true });
      else if (was === 'weiter') oeffnen(this, {});
      else if (was === 'import') { oeffnen(this, {}); importFrage(); }
      else if (was === 'bearbeiten') { const x = E.Speicher.laden(id); if (x) { x.gespeichertAls = x.name; oeffnen(this, { daten: x }); } }
      else if (was === 'loeschen') {
        const t = R.trackCatalog.find((q) => q.id === id), me = this;
        stil();
        const w = document.createElement('div'); w.className = 'e7-dlg'; w.style.position = 'fixed'; w.style.zIndex = 310;
        w.innerHTML = `<div class="e7-dk"><h3>🗑️ „${esc(t ? t.name : id)}“ wirklich löschen?</h3><div class="e7-fuss" style="background:none"><span class="e7-k rot" data-j="1">Ja, löschen</span><span class="e7-k gruen" data-j="0">Nein</span></div></div>`;
        w.addEventListener('click', (ev) => { const j = ev.target.closest('[data-j]'); if (!j) return; w.remove(); if (j.dataset.j === '1') { E.Speicher.loeschen(id); if (me.e.streckeId === id) me.e.streckeId = R.trackCatalog[0].id; me.zeichnen(); } });
        document.body.appendChild(w);
      }
      return;
    }
    return aktion.apply(this, arguments);
  };
  // Nach dem Zeichnen: eigene Strecken unter „✏️ Meine Strecken“ (eigene Reihe, Vorschaubild) und Karte „✏️ Strecke malen“ im Modus-Schritt
  const zeichnen0 = M.zeichnen;
  M.zeichnen = function () {
    const r = zeichnen0.apply(this, arguments);
    try {
      if (!this.sichtbar || R.EditorUI.an === false) return r;
      const reihe = this.wurzel.querySelector('.reihe.strecken');
      if (reihe) {
        const eig = Array.prototype.filter.call(reihe.querySelectorAll('.karte.strecke'), (c) => /^strecke:eigen-/.test(c.dataset.a || ''));
        if (eig.length) {
          const kopf = document.createElement('div'); kopf.className = 'm-meine-kopf'; kopf.textContent = '✏️ Meine Strecken';
          const r2 = document.createElement('div'); r2.className = 'reihe strecken';
          const vor = {}; E.Speicher.liste().forEach((x) => { vor[x.daten.id] = x.vorschau; });
          eig.forEach((c) => {
            r2.appendChild(c);
            const id = c.dataset.a.slice(8), bild = c.querySelector('.strecken-bild');
            if (bild && vor[id]) { bild.classList.add('e7-bild'); bild.style.backgroundImage = 'url(' + vor[id] + ')'; }
          });
          reihe.parentNode.insertBefore(kopf, reihe.nextSibling); reihe.parentNode.insertBefore(r2, kopf.nextSibling);
        }
      }
      const s4 = this.wurzel.querySelector('.s4-reihe');
      if (s4 && !s4.querySelector('[data-a="editor:weiter"]')) {
        stil();
        const k = document.createElement('div'); k.className = 'karte s4-karte'; k.dataset.a = 'editor:weiter'; k.title = 'Male deine eigene Strecke';
        k.innerHTML = '<div class="emoji">✏️</div><div><div class="karten-name">Strecke malen</div><div class="karten-sub">Eigene Strecke bauen und fahren</div></div>';
        s4.appendChild(k);
      }
    } catch (err) { console.error('Strecken-Editor (Menü zeichnen):', err); }
    return r;
  };
  // Zurück aus dem Probefahren: Hauptmenü → wieder im Editor
  if (R.Spiel && R.Spiel.prototype.zumMenue) {
    const zum = R.Spiel.prototype.zumMenue;
    R.Spiel.prototype.zumMenue = function () {
      const r = zum.apply(this, arguments);
      try { if (this._editorZurueck && this.zustand === 'menue') { this._editorZurueck = false; oeffnen(this.menue, {}); } } catch (e) { console.error('Strecken-Editor (zurück):', e); }
      return r;
    };
  }
  // Gespeicherte Strecken in die Streckenwahl
  try { E.Speicher.alleRegistrieren(); } catch (e) { /* egal */ }
})();
