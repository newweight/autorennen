// ============================================================
// Cabrio-Dach bei Niederschlag (15.10. v24) – reine SPIELLOGIK ohne Three.js (läuft in Browser, Server und Node-Tests gleich).
//
// Wunsch des Vaters: „Wenn plötzlich Regen kommt, müssen die Cabrios 3 Sekunden anhalten, um das Dach zu schließen. Dach schließen =
// gleichzeitig Vor- und Zurück-Taste, sonst geht alle 60 Sekunden das Auto um 10 % kaputt. Auch die gegnerischen Autos halten kurz an.“
//
// Regeln (Zahlen: config.dachRegen):
//  - Gilt für jedes Auto MIT Verdeck (Katalog form.dach = T-Roc Cabrio). Niederschlag = Regen, Schnee, Hagel (wie die Scheibenwischer,
//    R.wischer.art); Nebel und Sandsturm zählen nicht. Wetter an der Position des Autos: normale Strecken = Wetter des Rennens,
//    Megastrecke = Wetter der Zone, in der das Auto fährt (Wetter.nass(vehicle) in world/wetter.js bzw. track/megastrecke.js).
//  - Dach auf/zu: Geste (↑+↓ gleichzeitig, siehe cars/dach.js) NUR im Stand (< stand m/s). Dauer `dauer` s (3): in der Zeit steht das Auto
//    (Gas gesperrt, bremsen bis Stand – R.DachRegel.halt), Losfahren wird verhindert bis fertig. Im Countdown darf man schon schließen.
//  - Strafe: nass UND Dach offen UND Rennen läuft → Uhr `strafeAlle` s (60); läuft sie ab: −`strafeProzent` % Gesundheit, Uhr beginnt neu.
//    Uhr zurück auf 60 s, sobald es trocken oder das Dach zu ist; sie pausiert, solange das Dach klappt (kein Schaden beim Schließen).
//    Schaden an (nur offline): Schadensystem (schaden.treffer(i, 'nass')), sonst eigener Wert z.gesund (Tempo/Beschleunigung wie die Schadensstufen,
//    nie unter mindestGesund %); online immer der eigene Wert (online ist das Schadensystem aus).
//  - KI-Cabrios (Gegner mit Dach offen): nass → bremsen bis zum Stand an einem geeigneten Haltepunkt (Fahrbahnrand – rechts, in Rechtskurven links –, nie in/vor Tunnel,
//    Brücke, Überführung, Kreuzung, Looping, Schanze, Gabelung, enger Spur, Start/Ziel, Kleber/Boost), 3 s Dach schließen, weiterfahren.
//    Deterministisch (nur Funktion von Zustand/Strecke, keine Zufallszahlen) → Server und Offline-Spiel rechnen gleich.
//
// Zustand je Auto (R.DachRegel.neu(auto) → Objekt oder null ohne Verdeck):
//   { ziel 0|1 (0 offen, 1 zu), rest (s Klappzeit, 0 = fertig), nass (bool), uhr (s bis zur nächsten Strafe), strafen (Zähler),
//     gesund (%, eigener Wert), faellig (bool: Strafe wartet auf Anwendung) }
// API:
//   R.DachRegel.hat(auto) / neu(auto) / nass(art)
//   R.DachRegel.geste(z, tempo)         Umschalten, wenn möglich (Stand, nicht gerade klappend) → true/false
//   R.DachRegel.schritt(z, dt, nass, laeuft) → 'nass' | 'zu' | 'auf' | null   (einmal je Physikschritt, VOR der Eingabe)
//   R.DachRegel.sperre(z) / halt(v)     Klappt das Dach? / Steuerung beim Klappen { gas 0, bremse nur bis Stand, lenkung 0 }
//   R.DachRegel.strafeAnwenden(z)       eigener Wert −10 % (Schaden aus) → abgezogene Prozentpunkte
//   R.DachRegel.faktoren(z)             { vMax, beschleunigung } aus z.gesund (wie die Schadensstufen)
//   R.DachRegel.anzeige(z, laeuft, nr)  { text, art } für die HUD-Zeile oder null
//   R.DachRegel.kiPlan(f, z, strecke, dt) / kiBremsen(s, v, plan)   KI-Cabrio (siehe unten)
//   R.DachRegel.stoppOk(strecke, s) / kritisch(strecke, s) / haltepunkt(strecke, s, tempo)
// ============================================================
(function () {
  const R = window.Rennspiel;

  const STD = { an: true, dauer: 3, strafeAlle: 60, strafeProzent: 10, stand: 0.5, mindestGesund: 10,
    kiBremsPlan: 6, kiVorlauf: 70, kiSchritt: 15, kiMaxSuche: 900, kiHaltZeit: 12 };
  const cfg = () => Object.assign({}, STD, (R.config && R.config.dachRegen) || {});
  const wert = (x, d) => (x === undefined ? d : x);
  const klemme = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

  const DR = {};
  R.DachRegel = DR;

  DR.an = () => cfg().an !== false;

  /** Hat das Katalogauto ein Verdeck? (nur form.dach, also der T-Roc – der Formel-Renner ist offen, hat aber kein Dach zum Schließen) */
  DR.hat = (auto) => !!(auto && auto.form && auto.form.dach);

  /** Niederschlag? (Wetter-Art wie R.wischer.art: regen, schnee, hagel) */
  DR.nass = (art) => art === 'regen' || art === 'schnee' || art === 'hagel';

  /** Neuer Zustand für ein Katalogauto (optionen.dach 'zu' = Rennstart mit geschlossenem Dach) oder null (kein Verdeck / Regel aus). */
  DR.neu = (auto) => {
    if (!DR.hat(auto) || !DR.an()) return null;
    const c = cfg();
    return { ziel: auto.optionen && auto.optionen.dach === 'zu' ? 1 : 0, rest: 0, nass: false, uhr: c.strafeAlle, strafen: 0, gesund: 100, faellig: false };
  };

  /** Dach umschalten (zu ↔ offen): nur im Stand und nicht, solange es schon klappt. → true = Klappen beginnt (rest = dauer). */
  DR.geste = (z, tempo) => {
    if (!z || z.rest > 0) return false;
    if (!(Math.abs(tempo) < cfg().stand)) return false;
    z.ziel = z.ziel ? 0 : 1;
    z.rest = cfg().dauer;
    return true;
  };

  /**
   * Ein Physikschritt (1/60 s), einmal je Auto VOR der Eingabe: Klappzeit herunterzählen, Nass-Zustand merken, Strafuhr.
   * nass = Niederschlag an der Position des Autos; laeuft = Rennen läuft (Countdown: Uhr steht).
   * → 'nass' (es hat bei offenem Dach zu regnen begonnen), 'zu' / 'auf' (Klappen fertig) oder null.
   */
  DR.schritt = (z, dt, nass, laeuft) => {
    const c = cfg();
    let ev = null;
    if (z.rest > 0) {
      z.rest -= dt;
      if (z.rest <= 1e-9) { z.rest = 0; ev = z.ziel ? 'zu' : 'auf'; }
    }
    const war = z.nass;
    z.nass = !!nass;
    if (z.nass && !war && z.ziel === 0 && z.rest <= 0) ev = ev || 'nass';
    if (!z.nass || (z.ziel === 1 && z.rest <= 0)) z.uhr = c.strafeAlle;              // trocken oder Dach zu: Uhr zurück
    else if (z.ziel === 0 && z.rest <= 0 && laeuft) {                                // nass + offen: Uhr läuft (beim Klappen pausiert sie)
      z.uhr -= dt;
      if (z.uhr <= 1e-9) { z.uhr += c.strafeAlle; z.strafen++; z.faellig = true; }
    }
    return ev;
  };

  /** Klappt das Dach gerade? Dann steht das Auto (Gas gesperrt). */
  DR.sperre = (z) => !!(z && z.rest > 0);

  /** Steuerung beim Klappen: kein Gas, bremsen nur bis zum Stand (Bremse im Stand würde rückwärts fahren), geradeaus. */
  DR.halt = (v) => ({ gas: 0, bremse: v.vLaengs > 0.3 ? 1 : 0, lenkung: 0 });

  /** Eigener Gesundheitswert (Schaden aus / online): −strafeProzent %, nie unter mindestGesund. → abgezogene Prozentpunkte. */
  DR.strafeAnwenden = (z) => {
    const c = cfg(), vor = z.gesund;
    z.gesund = Math.max(Math.min(vor, c.mindestGesund), vor - c.strafeProzent);
    z.faellig = false;
    return vor - z.gesund;
  };

  /** Fahrwerte-Faktoren aus z.gesund (je volle stufeJe % Verlust eine Stufe, wie physics/schaden.js; Grip bleibt unverändert). */
  DR.faktoren = (z) => {
    const C = (R.config && R.config.schaden) || {};
    const stufe = Math.floor((100 - z.gesund) / wert(C.stufeJe, 20) + 1e-9);
    return { vMax: 1 - wert(C.vMaxJeStufe, 0.04) * stufe, beschleunigung: 1 - wert(C.beschleunigungJeStufe, 0.06) * stufe };
  };

  /**
   * HUD-Zeile: Klappen „Dach schließt … 2“, nass + offen: im Countdown Hinweis, im Rennen Uhr „Dach zu! noch 45 s“. Sonst null.
   * nr: 0 = Pfeile (↑+↓), 1 = WASD (W+S).
   */
  DR.anzeige = (z, laeuft, nr) => {
    if (!z) return null;
    if (z.rest > 0) return { text: (z.ziel ? '☂️ Dach schließt … ' : 'Dach öffnet … ') + Math.max(1, Math.ceil(z.rest - 1e-6)), art: 'klappt' };
    if (z.nass && z.ziel === 0) {
      return laeuft ? { text: '☔ Dach zu! noch ' + Math.max(1, Math.ceil(z.uhr - 1e-6)) + ' s', art: 'warn' }
        : { text: '🌧️ Regen! Dach zu: ' + (nr === 1 ? 'W+S' : '↑+↓') + ' im Stand', art: 'warn' };
    }
    return null;
  };

  // ------------------------------------------------------------------ Strecke: wo darf ein Auto halten / wo darf nicht gebremst werden?
  const wrap = (L, d) => ((d % L) + L) % L;
  /** Liegt s im zyklischen Bereich [s0 − vor, s1 + nach] (Bogenlänge, Rundkurs der Länge L)? */
  function drin(L, s, s0, s1, vor, nach) {
    const len = wrap(L, s1 - s0) + vor + nach;
    if (len >= L) return true;
    return wrap(L, s - (s0 - vor)) <= len;
  }

  /** Zonen einer Strecke einmal berechnen: halt = hier nie anhalten, fahrt = Tempo halten (Looping/Schanze brauchen Anlauf). */
  function zonenVon(st) {
    if (st._dachZonen) return st._dachZonen;
    const halt = [], fahrt = [];
    const z = (liste, s0, s1, vor, nach) => { if (Number.isFinite(s0) && Number.isFinite(s1)) liste.push([s0, s1, vor, nach]); };
    (st.tunnel || []).forEach((t) => z(halt, t.s0, t.s1, 25, 25));
    (st.bruecken || []).forEach((b) => z(halt, b.s0, b.s1, 25, 25));
    (st.ueberfuehrungen || []).forEach((u) => { z(halt, u.s0, u.s1, 30, 30); if (u.unten) z(halt, u.unten.s0, u.unten.s1, 30, 30); });
    (st.kreuzungen || []).forEach((k) => { if (k.a) z(halt, k.a.s0, k.a.s1, 35, 35); if (k.b) z(halt, k.b.s0, k.b.s1, 35, 35); });
    (st.gabelungen || []).forEach((g) => z(halt, g.s0, g.s1, 45, 45));
    (st.spuren || []).forEach((e) => { if (e.breite < st.breite) z(halt, e.s0, e.s1, 30, 30); });
    (st.kleber || []).forEach((k) => z(halt, k.s0, k.s1, 15, 15));
    (st.boostFelder || []).forEach((b) => z(halt, b.s, b.s + (b.laenge || 12), 15, 15));
    (st.hindernisse || []).forEach((h) => { const s0 = h.s0 !== undefined ? h.s0 : h.s, s1 = h.s1 !== undefined ? h.s1 : h.s; z(halt, s0, s1, 18, 18); });
    (st.wracks || []).forEach((w) => z(halt, w.s, w.s, 20, 20));
    (st.loopings || []).forEach((l) => { z(halt, l.s0, l.s1, 140, 55); z(fahrt, l.s0, l.s1, 140, 15); });
    (st.schanzen || []).forEach((e) => {
      z(halt, e.s, e.s + (e.laenge || 10), (e.anlauf || 0) + 110, 100);
      z(fahrt, e.s, e.s + (e.laenge || 10), (e.anlauf || 0) + 110, 45);
    });
    z(halt, 0, 0, 40, 70);                                  // Start/Ziel: Startaufstellung und Zielbogen
    return (st._dachZonen = { halt, fahrt });
  }

  /** Darf ein Auto an Bogenlänge s anhalten (und dort 3 s stehen)? */
  DR.stoppOk = (st, s) => {
    const L = st.spline.laenge, zn = zonenVon(st).halt;
    for (let i = 0; i < zn.length; i++) if (drin(L, s, zn[i][0], zn[i][1], zn[i][2], zn[i][3])) return false;
    return true;
  };

  /** Muss das Auto hier Tempo halten (vor/in Looping, vor/auf Schanze)? Dann wird nicht gebremst. */
  DR.kritisch = (st, s) => {
    const L = st.spline.laenge, zn = zonenVon(st).fahrt;
    for (let i = 0; i < zn.length; i++) if (drin(L, s, zn[i][0], zn[i][1], zn[i][2], zn[i][3])) return true;
    return false;
  };

  /**
   * Haltepunkt voraus: erste geeignete Stelle ab Bremsweg + Reserve; liegt vorher ein Looping/eine Schanze (Anlauf nötig), wird erst
   * danach gebremst (→ null, später erneut). → Bogenlänge oder null.
   */
  DR.haltepunkt = (st, s, tempo) => {
    const c = cfg(), L = st.spline.laenge;
    const dMin = tempo * tempo / (2 * c.kiBremsPlan) + c.kiVorlauf;
    for (let d = 0; d <= c.kiMaxSuche; d += c.kiSchritt) {
      if (DR.kritisch(st, s + d)) return null;
      if (d >= dMin && DR.stoppOk(st, s + d)) return wrap(L, s + d);
    }
    return null;
  };

  // ------------------------------------------------------------------ KI-Cabrio
  const RAND = 8;   // gewünschter Seitenversatz (m; rechts, in Rechtskurven links) – der Fahrer begrenzt ihn selbst auf Straßenrand − 2,2 m

  /**
   * Plan für ein KI-Cabrio in diesem Schritt (vor dem Aufruf des Fahrers).
   *   null                          → nichts zu tun (trocken / Dach zu / klappt gerade): normal fahren (klappt es, sperrt main.js ohnehin)
   *   { art: 'halten' }             → Fahrer NICHT fragen (er soll nicht „festgefahren“ melden): steht, Dach wird geschlossen (Geste ist schon ausgelöst)
   *   { art: 'bremsen', dist, ... } → Fahrer fragen (Lenkung), dann kiBremsen(s, v, plan)
   * f: Fahrzeug-Eintrag (vehicle, nah, driver), z: Dach-Zustand, st: Strecke, dt: Schrittweite.
   */
  DR.kiPlan = (f, z, st, dt) => {
    const k = f.dachKi || (f.dachKi = { sStop: null, t: 0, basis0: undefined });
    const v = f.vehicle, c = cfg(), d = f.driver;
    const will = z.nass && z.ziel === 0 && z.rest <= 0;
    // Seitenversatz weich zurück auf den Grundversatz des Fahrers, wenn nichts mehr zu tun ist
    const zurueck = () => {
      if (d && k.basis0 !== undefined) {
        d.versatzBasis += (k.basis0 - d.versatzBasis) * Math.min(1, dt * 1.5);
        if (Math.abs(d.versatzBasis - k.basis0) < 0.02) { d.versatzBasis = k.basis0; k.basis0 = undefined; }
      }
    };
    if (!will) { k.sStop = null; k.t = 0; zurueck(); return null; }
    const tempo = Math.abs(v.vLaengs);
    if (tempo < c.stand) {                                   // steht (Aufstellung, Stau, Haltepunkt erreicht): Dach zu
      DR.geste(z, tempo); k.sStop = null; k.t = 0;
      return { art: 'halten' };
    }
    if (!f.nah || !st || !st.spline) return null;
    const L = st.spline.laenge, s = f.nah.s;
    if (DR.kritisch(st, s)) { k.sStop = null; k.t = 0; zurueck(); return null; }   // Looping/Schanze: Tempo halten, danach bremsen
    if (k.sStop !== null) {                                  // Haltepunkt noch erreichbar?
      let dist = wrap(L, k.sStop - s);
      if (dist > L / 2) dist = 0;
      if (dist < tempo * tempo / (2 * 12) - 1) k.sStop = null;      // zu spät (selbst volle Bremsung reicht nicht) → neu planen
    }
    if (k.sStop === null) {
      k.sStop = DR.haltepunkt(st, s, tempo); k.t = 0;
      if (k.sStop !== null) {                                // Seite: rechts (Standard); in einer Rechtskurve ist rechts INNEN (der Fahrer nimmt dort den Versatz zurück) → dann links (außen)
        let kr = 0;
        for (const dd of [-10, 0, 10, 20]) { const q = st.spline.punktBei(k.sStop + dd).kruemmung; if (Math.abs(q) > Math.abs(kr)) kr = q; }
        k.seite = kr > 0.0015 ? -1 : 1;
      }
    }
    if (k.sStop === null) { zurueck(); return null; }
    k.t += dt;
    let dist = wrap(L, k.sStop - s);
    if (dist > L / 2) dist = 0;                              // schon vorbei: sofort ausrollen
    if (d) {
      if (k.basis0 === undefined) k.basis0 = d.versatzBasis;
      d.versatzBasis += (RAND * (k.seite || 1) - d.versatzBasis) * Math.min(1, dt * 1.5);
    }
    return { art: 'bremsen', dist, t: k.t };
  };

  /**
   * Bremsregler: s = Steuerung des Fahrers (Lenkung), v = Fahrzeug, plan = kiPlan. Ziel: am Haltepunkt stehen (Verzögerung ≤ kiBremsPlan).
   * Bremse nur oberhalb 0,6 m/s (darunter würde das Auto rückwärts fahren); die letzten Meter rollt es aus (Stand < 0,5 m/s = Geste möglich).
   */
  DR.kiBremsen = (s, v, plan) => {
    const c = cfg(), t = Math.abs(v.vLaengs), rest = Math.max(0, plan.dist - 2);
    const bp = Math.max(4, ((v.daten && v.daten.bremsen) || 20) * 0.7);          // nutzbare Verzögerung (Nässe)
    let gas = s.gas, bremse = s.bremse;
    if (t < 1.5 && (rest < 6 || plan.t > c.kiHaltZeit)) { gas = 0; bremse = 0; }  // letzte Meter / Stau: ausrollen
    else {
      const soll = Math.sqrt(2 * c.kiBremsPlan * rest);
      if (t > soll + 0.3 || rest <= 0) {
        const noetig = rest > 0.5 ? t * t / (2 * rest) : bp;                      // m/s², um genau am Haltepunkt zu stehen
        gas = 0;
        if (t > 0.6) bremse = Math.max(bremse, klemme(noetig * 1.15 / bp, 0.15, 1));
      } else if (t > soll - 1.5) gas = 0;                                          // nahe am Sollverlauf: nicht mehr beschleunigen
    }
    return { gas, bremse, lenkung: s.lenkung };
  };
})();
