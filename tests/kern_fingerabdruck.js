// Fingerabdrücke für die Golden-Tests (K1, tests/test_kern_golden.js): Strecken-Geometrie je Strecke + Welt und Fahrphysik.
// Reine Funktionen auf einem geladenen Kontext R (Rennspiel); alle Zahlen als Text mit voller Genauigkeit → SHA-1, damit schon 1 Bit Änderung auffällt.
// Wird auch für die Radwelt-Strecken benutzt (window.RADWELT gesetzt, Modulliste aus Radwelt.html bzw. später spiele.json) → tests/golden/radwelt.json.
'use strict';
const crypto = require('crypto');

const hash = (x, n) => crypto.createHash('sha1').update(x).digest('hex').slice(0, n || 16);

/** JSON mit Schutz vor Zyklen; Funktionen fallen weg, nicht-endliche Zahlen werden Text. */
function json(v) {
  const gesehen = new WeakSet();
  return JSON.stringify(v, (k, x) => {
    if (typeof x === 'function') return undefined;
    if (typeof x === 'number' && !Number.isFinite(x)) return String(x);
    if (x && typeof x === 'object') { if (gesehen.has(x)) return '[geteilt]'; gesehen.add(x); }
    return x;
  });
}

const zahlen = (arr) => Array.prototype.map.call(arr, (x) => (+x).toPrecision(17)).join(',');

/** Hash über alle Meshes einer THREE-Gruppe (Positionen, Farben, Normalen, UV, Index, Instanz-Matrizen, Material-Farbe). */
function meshHash(gruppe) {
  const h = crypto.createHash('sha1');
  let n = 0, ecken = 0;
  gruppe.traverse((c) => {
    if (!c.geometry) return;
    n++;
    h.update('M' + (c.name || '') + '|' + c.type + '|');
    const g = c.geometry;
    const attr = g.attributes || {};
    Object.keys(attr).sort().forEach((k) => {
      const a = attr[k].array;
      h.update(k + ':' + a.length + ':');
      h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      if (k === 'position') ecken += a.length;
    });
    if (g.index) { const a = g.index.array; h.update('I' + a.length); h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    if (c.instanceMatrix) { const a = c.instanceMatrix.array; h.update('X' + c.count + ':'); h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    const m = Array.isArray(c.material) ? c.material[0] : c.material;
    if (m && m.color && m.color.getHex) h.update('C' + m.color.getHex());
  });
  return { n, ecken, hash: h.digest('hex').slice(0, 16) };
}

/**
 * Strecken-Fingerabdruck. opt = new R.Strecke-Optionen; was = { bauen, hindernisse, deko } (teure Teile).
 * Ergebnis: { laenge, punkte, spline, felder:{Feldname: kurzer Hash}, bauen:{n,ecken,hash}, hindernisse:{…}, deko:{…} }
 */
function strecke(R, daten, opt, was) {
  was = was || {};
  const s = new R.Strecke(daten, opt);
  const sp = s.spline;
  const erg = { laenge: sp.laenge.toPrecision(17), punkte: sp.punkte.length, spline: hash(sp.punkte.map((p) => zahlen([p.x, p.y, p.z])).join(';')), felder: {} };
  Object.keys(s).sort().forEach((k) => {
    if (k === 'spline' || k[0] === '_' && k.startsWith('_raster')) return;
    const v = s[k];
    if (typeof v === 'function') return;
    erg.felder[k] = hash(json(v), 8);
  });
  if (was.bauen) erg.bauen = meshHash(s.bauen());
  if (was.hindernisse && typeof s.hindernisseBauen === 'function') erg.hindernisse = meshHash(s.hindernisseBauen());
  if (was.deko && R.themes && R.themes.dekoBauen) erg.deko = meshHash(R.themes.dekoBauen(daten.thema, s, 'sommer'));
  return erg;
}

/** Zwei Fingerabdrücke vergleichen → Liste der Unterschiede (leer = gleich). */
function unterschiede(a, b, pfad) {
  const u = [];
  pfad = pfad || '';
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => {
      if (!(k in a)) u.push(pfad + k + ': fehlt in der Referenz');
      else if (!(k in b)) u.push(pfad + k + ': fehlt jetzt');
      else u.push(...unterschiede(a[k], b[k], pfad + k + '.'));
    });
  } else if (a !== b) u.push(pfad.slice(0, -1) + ': ' + a + ' → ' + b);
  return u;
}

// ------------------------------------------------------------------ Fahrphysik
/** Feste Fahrt eines Fahrzeugs (Gas/Bremse/Lenkung/Untergrund/Fahrhilfe wie tests/test_physik.js, Punkt 14). */
function vehicleFahrt(R, fahrwerte, tempoKlasse) {
  const dt = R.config.physik.schritt;
  const v = new R.Vehicle(fahrwerte, { tempoKlasse });
  for (let i = 0; i < 1500; i++) {
    const s = { gas: i % 400 < 300 ? 1 : 0, bremse: i % 400 >= 320 ? 1 : 0, lenkung: Math.sin(i / 37) };
    v.untergrund = (i % 500 < 450) ? 'strasse' : 'gras';
    const h = i % 3 === 0 ? { lenkhilfe: 0.3, bremshilfe: 0.2, tangente: { tx: 0, tz: -1 }, seitenabstand: v.x, zieltempo: 40 } : undefined;
    v.schritt(dt, s, h);
  }
  return zahlen([v.x, v.z, v.heading, v.vLaengs, v.vQuer]);
}

/** Server-Simulation (Auto- oder Motorrad-Raum) mit festen Eingaben: Hash über den ganzen Verlauf (alle 20 Schritte der Zustand aller Teilnehmer) und Endzustand des Spielers. */
function simulationsFahrt(S, moto, autoId, streckeId, n) {
  const sim = new S.Simulation({ einstellungen: { streckeId, gegner: 2, runden: 2, schwierigkeit: 'mittel', unfall: moto ? 'sanft' : undefined },
    spieler: [{ fahrer: 'Jonas', auto: autoId, hilfe: 'wenig' }], seed: 5, moto });
  const h = crypto.createHash('sha1');
  const zustand = () => sim.sim.fahrzeuge.map((f) => zahlen([f.vehicle.x, f.vehicle.z, f.vehicle.heading, f.vehicle.vLaengs, f.vehicle.vQuer]));
  for (let i = 0; i < n; i++) {
    sim.eingabeSetzen(0, { gas: 1, bremse: i % 700 >= 650 ? 1 : 0, lenkung: Math.sin(i / 90) * 0.3 });
    sim.schritt();
    if (i % 20 === 0) h.update(zustand().join(';') + '|');
  }
  const fz = zustand();
  return { fahrzeuge: fz.length, verlauf: h.digest('hex').slice(0, 16), spieler: fz[0] };
}

module.exports = { hash, json, meshHash, strecke, unterschiede, vehicleFahrt, simulationsFahrt, zahlen };
