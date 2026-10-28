// ============================================================
// Motorrad M3 – Garage: Helm-Farbe, Kombi-Farbe, Startnummer (frei wählbar, gratis) + Motorrad-Texte statt Auto-Texte.
// Reine Logik (Node-Test: tests/test_moto_m3.js), die Verdrahtung mit der Garage-Oberfläche steht in motoM3Start.js.
//
// Speicher: eigener Schlüssel „<garage.speicherSchluessel>.stil“ (also …v1.motorrad.stil, getrennt von Autorennen und vom Münz-Konto der Garage):
//   { "<Fahrer>": { "<autoId>": { helm: hex | null, kombi: hex | null, nr: 1..99 | null } } }     null = Standard des Katalogeintrags
// Alle Zugriffe in try/catch; ohne localStorage (Node, Privatmodus) bleibt der Stand im Arbeitsspeicher.
// stilAuto(auto, stil) liefert eine Kopie des Katalogeintrags mit optionen { helm, fahrer (= Kombi), nummer } – der Katalogeintrag bleibt unverändert.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  /** Auswahlfarben für Helm und Kombi (kunterbunt, kindgerecht). */
  const FARBEN = [
    { hex: 0xf4f4f4, name: 'Weiß' }, { hex: 0xd7261e, name: 'Rot' }, { hex: 0x1e5bd8, name: 'Blau' }, { hex: 0x1fa84f, name: 'Grün' },
    { hex: 0xf6c20a, name: 'Gelb' }, { hex: 0xf0409a, name: 'Pink' }, { hex: 0x7a3cc8, name: 'Lila' }, { hex: 0x23262d, name: 'Schwarz' },
  ];
  const NR_MIN = 1, NR_MAX = 99;

  let _ram = {};
  const speicher = () => { try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; } };
  const schluessel = () => ((R.config && R.config.garage && R.config.garage.speicherSchluessel) || 'rennspiel.garage.v1.motorrad') + '.stil';

  function laden() {
    const s = speicher();
    let o = null;
    if (s) { try { o = JSON.parse(s.getItem(schluessel()) || 'null'); } catch (e) { o = null; } } else o = JSON.parse(JSON.stringify(_ram));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  }
  function speichern(o) {
    _ram = JSON.parse(JSON.stringify(o));
    const s = speicher();
    if (s) { try { s.setItem(schluessel(), JSON.stringify(o)); } catch (e) { /* egal */ } }
  }
  const gueltigeFarbe = (h) => (Number.isInteger(h) && h >= 0 && h <= 0xffffff ? h : null);
  const nummerKlemmen = (n) => (Number.isFinite(n) ? Math.max(NR_MIN, Math.min(NR_MAX, Math.round(n))) : null);

  /** Stil eines Fahrers für ein Motorrad: { helm, kombi, nr } (geprüft, null = Standard). */
  function stilHolen(name, autoId) {
    const o = laden(), f = o[name] && o[name][autoId] && typeof o[name][autoId] === 'object' ? o[name][autoId] : {};
    return { helm: gueltigeFarbe(f.helm), kombi: gueltigeFarbe(f.kombi), nr: nummerKlemmen(f.nr) };
  }
  /** Teile des Stils setzen und speichern (patch: { helm?, kombi?, nr? }). Rückgabe der neuen Werte. */
  function stilSetzen(name, autoId, patch) {
    if (!name || !autoId) return null;
    const o = laden(); if (!o[name] || typeof o[name] !== 'object') o[name] = {};
    const alt = stilHolen(name, autoId), neu = Object.assign({}, alt);
    if (patch && 'helm' in patch) neu.helm = gueltigeFarbe(patch.helm);
    if (patch && 'kombi' in patch) neu.kombi = gueltigeFarbe(patch.kombi);
    if (patch && 'nr' in patch) neu.nr = nummerKlemmen(patch.nr);
    o[name][autoId] = neu;
    speichern(o);
    return neu;
  }
  /** Nächste Farbe der Palette (Pfeil/Taste): aktuell = hex oder null (Standard → erste Farbe). */
  function naechsteFarbe(aktuell, richtung) {
    const i = FARBEN.findIndex((f) => f.hex === aktuell), n = FARBEN.length;
    return FARBEN[(i < 0 ? (richtung < 0 ? n - 1 : 0) : (i + (richtung || 1) + n) % n)].hex;
  }
  /** Kopie des Katalogeintrags mit dem Stil (Katalogeintrag bleibt unverändert). */
  function stilAuto(auto, stil) {
    if (!auto || !stil || (stil.helm === null && stil.kombi === null && stil.nr === null)) return auto;
    const o = Object.assign({}, auto.optionen || {});
    if (stil.helm !== null) o.helm = stil.helm;
    if (stil.kombi !== null) o.fahrer = stil.kombi;
    if (stil.nr !== null) o.nummer = stil.nr;
    return Object.assign({}, auto, { optionen: o, farbe2: stil.kombi !== null ? stil.kombi : auto.farbe2 });
  }
  const stilSchluessel = (s) => [s.helm, s.kombi, s.nr].join('/');

  // ---------- Texte: Auto → Motorrad (Garage) ----------
  const ERSETZE = [[/\bAutos\b/g, 'Motorräder'], [/\bAuto\b/g, 'Motorrad'], [/\bautos\b/g, 'Motorräder'], [/\bauto\b/g, 'Motorrad']];
  /** Einen Text der Garage vom Auto- in den Motorrad-Ton setzen („Dein Auto schneller“ → „Dein Motorrad schneller“; „Welches Auto soll …“ → „Welches Motorrad soll …“). */
  function garageText(t) {
    if (typeof t !== 'string' || !/auto/i.test(t)) return t;
    return ERSETZE.reduce((s, [re, ers]) => s.replace(re, ers), t);
  }
  /** Alle Textknoten unter `wurzel` umschreiben (nur Anzeige). Rückgabe: Anzahl geänderter Knoten. */
  function texteErsetzen(wurzel) {
    if (typeof document === 'undefined' || !wurzel) return 0;
    let n = 0;
    const w = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT, null);
    for (let k = w.nextNode(); k; k = w.nextNode()) { const neu = garageText(k.nodeValue); if (neu !== k.nodeValue) { k.nodeValue = neu; n++; } }
    return n;
  }

  R.Moto.m3garage = { FARBEN, NR_MIN, NR_MAX, schluessel, laden, speichern, stilHolen, stilSetzen, naechsteFarbe, stilAuto, stilSchluessel, garageText, texteErsetzen,
    _ramLeeren() { _ram = {}; } };
})();
