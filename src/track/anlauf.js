// ============================================================
// Runde 5 (M6): Anlauf-Hilfe vor Loopings und Sprungschanzen
//
// Wer zu langsam auf einen Looping (Einfahrt L.s, Mindesttempo L.vMin = sqrt(5·g·r)) oder eine Schanze
// (Rampenanfang S.s, Mindesttempo config.anlauf.schanzeMin) zufährt, fährt NICHT mehr unten durch bzw.
// über die Rampe, sondern wird sanft gestoppt: weiche „Anlauf-Bremse" (bremsVerz m/s²), Stopp-Linie
// config.anlauf.stopp (10 m) vor der Einfahrt. Rückwärts (Bremse-Taste) und neu anfahren geht immer;
// Taste R/T setzt das Auto in diesem Zustand auf die Anlaufposition (Abstand vor der Einfahrt, freie Stelle,
// Tempo 0). Die KI gibt in der Anlauf-Zone Vollgas, bis Mindesttempo + 10 % erreicht sind (kiHilfe – sonst bremst
// das Gummiband sie u. U. unter das Mindesttempo) und setzt sich nach kiWarten s Stillstand selbst auf die Anlaufposition.
//
// Entscheidung (je Schritt, nach vehicle.schritt): Vorhersage des Tempos an der Einfahrt
//   vVor² = v² + 2·a·d   (a = 85 % der möglichen Beschleunigung bei Gas, ohne Gas 0; d = Weg bis zur Einfahrt)
// Liegt vVor unter vMin und reicht der Weg bis zur Stopp-Linie gerade noch zum sanften Bremsen, greift die
// Bremse: v ≤ sqrt(2·bremsVerz·(d − stopp)), an der Linie v = 0. Rückwärts löst sie wieder.
//
// Anlauf-Abstand je Stelle: Katalog-Feld `anlauf` (Override) oder max(config.anlauf.abstand, berechnet):
// langsamstes Auto aller Tempo-Klassen (Worst Case vMax × 0,7) aus dem Stand mit Vollgas geradeaus,
// Weg bis vMin × (1 + reserve) + 10 m. mindestAnlauf() ist für die Tests offen.
// Rechenteil ohne Three.js (Node-Tests: tests/test_looping.js, tests/test_schanze.js).
// ============================================================
(function () {
  const R = window.Rennspiel;

  function C() { return R.config.anlauf || {}; }
  function wert(x, std) { return x === undefined ? std : x; }

  const _mindest = {};

  /**
   * Weg (m) aus dem Stand mit Vollgas geradeaus auf der Straße bis vZiel – für das langsamste Auto
   * (alle Autos des Katalogs × alle Tempo-Klassen, dazu Worst Case vMax × 0,7). Infinity = nie erreicht.
   * @returns {{weg:number, auto:string, klasse:string}}
   */
  function mindestAnlauf(vZiel) {
    const key = vZiel.toFixed(3);
    if (_mindest[key]) return _mindest[key];
    const autos = (R.carCatalog && R.carCatalog.length) ? R.carCatalog.map(a => ({ id: a.id, fw: a.fahrwerte })) : [{ id: 'standard', fw: {} }];
    const klassen = Object.keys(R.config.tempoKlassen || {});
    const varianten = [];
    autos.forEach((a) => {
      if (klassen.length) klassen.forEach(k => varianten.push({ id: a.id, klasse: k, v: new R.Vehicle(a.fw, { tempoKlasse: k }) }));
      // Worst Case laut Plan: vMax × 0,7 (Beschleunigung der schwächsten Klasse)
      const w = new R.Vehicle(a.fw, { tempoKlasse: null });
      const bMin = klassen.reduce((m, k) => Math.min(m, R.config.tempoKlassen[k].beschleunigung || 1), 1);
      w.daten.vMax = (a.fw.vMax || w.daten.vMax) * 0.7; w.daten.beschleunigung = (a.fw.beschleunigung || w.daten.beschleunigung) * bMin;
      varianten.push({ id: a.id, klasse: 'worst', v: w });
    });
    const dt = 1 / 60;
    let erg = { weg: 0, auto: '', klasse: '' };
    varianten.forEach((va) => {
      const v = va.v; v.setzen(0, 0, 0); v.untergrund = 'strasse';
      let weg = Infinity;
      for (let k = 0; k < 60 * 60; k++) {
        v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
        if (v.vLaengs >= vZiel) { weg = -v.z; break; }
      }
      if (weg > erg.weg) erg = { weg, auto: va.id, klasse: va.klasse };
    });
    _mindest[key] = erg;
    return erg;
  }

  /**
   * Alle Anlauf-Stellen der Strecke (zwischengespeichert): Loopings und Schanzen.
   * { art: 'looping'|'schanze', nr, s (Einfahrt/Rampenanfang), vMin, abstand, halb (halbe Breite, in der
   *   die Bremse wirkt), berechnet (Mindest-Weg des langsamsten Autos), quelle: 'katalog'|'standard'|'berechnet' }
   */
  function stellen(strecke) {
    if (!strecke) return [];
    const loops = strecke.loopings || [];
    const sch = (R.Schanzen && strecke.schanzen && strecke.schanzen.length) ? R.Schanzen.liste(strecke) : [];
    if (strecke._anlaufStellen && strecke._anlaufQuelle === loops && strecke._anlaufSch === sch) return strecke._anlaufStellen;
    const c = C(), l = [];
    const abstandFuer = (vMin, override) => {
      const m = mindestAnlauf(vMin * (1 + wert(c.reserve, 0.1)));
      const berechnet = Math.ceil((m.weg + 10) / 10) * 10;
      if (override) return { abstand: override, berechnet: m.weg, quelle: 'katalog', auto: m.auto, klasse: m.klasse };
      const std = wert(c.abstand, 150);
      return berechnet > std ? { abstand: berechnet, berechnet: m.weg, quelle: 'berechnet', auto: m.auto, klasse: m.klasse }
        : { abstand: std, berechnet: m.weg, quelle: 'standard', auto: m.auto, klasse: m.klasse };
    };
    const kat = strecke.daten || strecke.katalog || {};
    loops.forEach((L, i) => {
      const roh = (kat.loopings || [])[i] || {};
      l.push(Object.assign({ art: 'looping', nr: i, s: L.s, vMin: L.vMin, halb: strecke.breite / 2, ziel: L },
        abstandFuer(L.vMin, roh.anlauf)));
    });
    sch.forEach((S, i) => {
      const roh = (strecke.schanzen || [])[i] || {};
      const vMin = wert(c.schanzeMin, 14);
      const halb = (strecke.breiteBei ? strecke.breiteBei(S.s) : strecke.breite) / 2 + 0.3;
      l.push(Object.assign({ art: 'schanze', nr: i, s: S.s, vMin, halb, ziel: S }, abstandFuer(vMin, roh.anlauf)));
    });
    strecke._anlaufStellen = l; strecke._anlaufQuelle = loops; strecke._anlaufSch = sch;
    return l;
  }

  /** Neuer Zustand je Fahrzeug (f.anlauf = Anlauf.zustand()). */
  function zustand() {
    return { stelle: null, bremst: false, stehZeit: 0, gestoppt: 0, eingriffe: 0, gemeldet: false };
  }

  /**
   * KI-Anlauf (Computerfahrer/Autopilot): In der Anlauf-Zone (abstand m vor einer Stelle) Vollgas und keine Bremse,
   * solange das Tempo unter Mindesttempo × (1 + reserve) liegt – auch wenn das Gummiband oder die Tempo-Klasse
   * die KI sonst bremsen würde. Lenkung bleibt. nah = letzte Abfrage (f.nah). Liefert die (ggf. neue) Steuerung.
   */
  function kiHilfe(az, vehicle, strecke, nah, s) {
    if (!az || !nah || vehicle.imLooping || vehicle.imFlug) return s;
    const l = stellen(strecke);
    if (!l.length) return s;
    const sp = strecke.spline, ziel = 1 + wert(C().reserve, 0.1);
    for (let i = 0; i < l.length; i++) {
      const d = sp.differenzS(l[i].s, nah.s);
      if (d > 0 && d <= l[i].abstand && Math.abs(nah.seitenabstand) <= l[i].halb + 1 && vehicle.vLaengs < l[i].vMin * ziel) {
        az.kiGas = (az.kiGas || 0) + 1;
        return { gas: 1, bremse: 0, lenkung: s ? s.lenkung || 0 : 0 };
      }
    }
    return s;
  }

  /** Mögliche Längsbeschleunigung (m/s²) bei Vollgas auf der Straße bei Tempo v (wie vehicle.schritt). */
  function gasBeschleunigung(vehicle, v) {
    const P = R.config.physik, d = vehicle.daten, vRel = Math.max(0, v / d.vMax);
    const luft = Math.max(0, (1 - P.kraftAbfall - P.endKraft) * d.beschleunigung - 0.6);
    return d.beschleunigung * (1 - P.kraftAbfall * vRel) - (0.6 + luft * vRel * vRel);
  }

  /**
   * Nach vehicle.schritt (vor Looping-Einfahrt und Schanzen-Rampe!): Anlauf-Bremse.
   * nah = strecke.abfrage(...) VOR dem Schritt, xAlt/zAlt = Position vor dem Schritt, steuerung = Eingabe.
   * Liefert null, 'zuLangsam' (Bremse greift neu → HUD-Meldung), 'gestoppt' (steht an der Linie) oder 'frei'.
   */
  function nachSchritt(az, vehicle, strecke, nah, xAlt, zAlt, steuerung, dt) {
    if (!az || !strecke || !nah) return null;
    const l = stellen(strecke);
    if (!l.length || vehicle.imLooping || vehicle.imFlug) { az.bremst = false; az.stehZeit = 0; az.stelle = null; return null; }
    const c = C(), sp = strecke.spline, pt = sp.punktBei(nah.s);
    const dx = vehicle.x - xAlt, dz = vehicle.z - zAlt;
    const sNeu = nah.s + dx * pt.tx + dz * pt.tz, q = nah.seitenabstand + dx * pt.nx + dz * pt.nz;
    const stopp = wert(c.stopp, 10), aSanft = wert(c.bremsVerz, 5);
    let ereignis = null;
    // Zugehörige Stelle: die nächste vor dem Auto (innerhalb abstand + 50 m)
    let st = null, d = Infinity;
    for (let i = 0; i < l.length; i++) {
      const di = sp.differenzS(l[i].s, sNeu);
      if (di > -0.5 && di < l[i].abstand + 50 && di < d) { st = l[i]; d = di; }
    }
    if (!st || Math.abs(q) > st.halb) {
      if (az.bremst) ereignis = 'frei';
      az.bremst = false; az.stehZeit = 0;
      if (!st) az.stelle = null;
      return ereignis;
    }
    const r = vehicle.richtung(), vorwaerts = r.x * pt.tx + r.z * pt.tz > 0.3;
    const v = vehicle.vLaengs;
    if (az.bremst && (v < -0.3 || !vorwaerts)) { az.bremst = false; az.stehZeit = 0; }   // rückwärts: Bremse löst
    if (!az.bremst && vorwaerts && v > -0.3) {
      const gas = (steuerung && steuerung.gas) || 0;
      // ohne Gas: Tempo halten (nicht pessimistisch ausrollen lassen – sonst würde z. B. die KI, die vor einer Rampe
      // kurz vom Gas geht, unnötig gestoppt); mit Gas: 85 % der möglichen Beschleunigung
      const a = gas > 0 ? 0.85 * gas * gasBeschleunigung(vehicle, Math.max(0, v)) : 0;
      const vVor = Math.sqrt(Math.max(0, v * v + 2 * a * Math.max(0, d)));
      const rest = d - stopp, brauch = Math.max(0, v) * Math.max(0, v) / (2 * aSanft) + Math.max(0, v) * dt * 2 + 0.5;
      if (vVor < st.vMin * (1 + wert(c.marge, 0.02)) && rest <= brauch) {
        az.bremst = true; az.stelle = st; az.eingriffe++; az.gemeldet = false;
        ereignis = 'zuLangsam';
      }
    }
    if (az.bremst) {
      az.stelle = st;
      const rest = Math.max(0, d - stopp);
      const erlaubt = Math.sqrt(2 * aSanft * rest);
      if (vehicle.vLaengs > erlaubt) vehicle.vLaengs = Math.max(erlaubt, vehicle.vLaengs - wert(c.bremsMax, 30) * dt);
      if (rest <= 0.05 && vehicle.vLaengs > 0) vehicle.vLaengs = 0;
      vehicle.vQuer *= 0.9;
      if (Math.abs(vehicle.vLaengs) < 0.3) {
        if (az.stehZeit === 0) { az.gestoppt++; if (!ereignis) ereignis = 'gestoppt'; }
        az.stehZeit += dt;
      } else az.stehZeit = 0;
    } else if (Math.abs(vehicle.vLaengs) < 0.3 && d <= stopp + 25 && vorwaerts) {
      // Von selbst (ausgerollt) kurz vor der Stelle stehen geblieben: gleicher Zustand → Hinweis, R/T = Anlaufposition
      if (!az.stelle) { az.stelle = st; az.gestoppt++; if (!ereignis) ereignis = 'gestoppt'; }
      az.stehZeit += dt;
    } else az.stehZeit = 0;
    return ereignis;
  }

  /**
   * Anlaufposition für die Stelle st: abstand m vor der Einfahrt auf der Straßenmitte, Blick in Fahrtrichtung.
   * Freie Stelle: kein anderes Auto in config.anlauf.frei (8 m), sonst je 10 m weiter zurück.
   * @param {Array} fahrzeuge Vehicles oder Einträge mit .vehicle (das eigene wird über `selbst` übersprungen)
   * @returns {{x,z,heading,s}}
   */
  function position(strecke, st, fahrzeuge, selbst) {
    const c = C(), sp = strecke.spline, frei = wert(c.frei, 8);
    const autos = (fahrzeuge || []).map(f => (f && f.vehicle) ? f.vehicle : f).filter(v => v && v !== selbst);
    let erg = null;
    for (let k = 0; k <= 20; k++) {
      const s = sp.wrapS(st.s - st.abstand - 10 * k), p = sp.punktBei(s);
      erg = { x: p.x, z: p.z, heading: R.headingAus(p.tx, p.tz), s };
      if (autos.every(v => Math.hypot(v.x - p.x, v.z - p.z) >= frei)) break;
    }
    return erg;
  }

  /** Auto auf die Anlaufposition setzen (Tempo 0), Zustand zurücksetzen. Liefert die Pose oder null. */
  function zurAnlaufposition(az, vehicle, strecke, fahrzeuge) {
    const st = az && az.stelle;
    if (!st) return null;
    const pose = position(strecke, st, fahrzeuge, vehicle);
    vehicle.setzen(pose.x, pose.z, pose.heading);
    vehicle.y = strecke.hoeheAn(pose.x, pose.z);
    az.bremst = false; az.stehZeit = 0; az.stelle = null;
    return pose;
  }

  /**
   * Hat die Anlauf-Bremse dieses Auto vor der aktuellen Stelle gestoppt (auch wenn es danach zurücksetzt)?
   * → R/T = Anlaufposition. Gilt, bis das Auto die Stelle passiert oder sich weit entfernt.
   */
  function aktiv(az) { return !!(az && az.stelle); }

  R.Anlauf = { stellen, zustand, nachSchritt, position, zurAnlaufposition, aktiv, kiHilfe, mindestAnlauf, gasBeschleunigung };
})();
