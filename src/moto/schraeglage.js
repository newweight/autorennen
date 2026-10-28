// ============================================================
// Schräglage + Sturz-Purzelbaum (Stufe M1) – reine Anzeige, Physik/Netz bleiben unverändert.
//
// Schräglage: Winkel = atan(v · Gierrate / g), exponentiell geglättet (τ = 0,12 s), begrenzt auf 45°, in die Kurve hinein
//   (rotation.z der inneren Gruppe `lage`; positiv = nach links geneigt, weil heading wächst = Linkskurve). Gierrate aus der
//   Heading-Änderung der Anzeige je Bild. Stand/Rückwärts → 0.
// Purzelbaum: bei hartem Anprall dreht sich `purzel` 1,2 s einmal um die Querachse (Überschlag nach vorn, rotation.x 0 → −2π,
//   sanft an/aus) mit einem Hüpfer, landet aufrecht; Abklingzeit 2 s nach der Landung. Keine Strafe außer der Physik; fährt sofort weiter.
// Einhängen (nur MOTORRAD-Modus, nach main.js geladen – motoStart.js ruft installieren()):
//   R.dach.frame(spiel, dt)            umhüllt: läuft je Bild direkt NACH der Mesh-Posen-Schleife von _frameRumpf und VOR Kamera/Render
//                                      (main.js hat keine eigene Methode für die Posen-Schleife) → Lage je Motorrad anwenden
//   R.Spiel.prototype.physikSchritt    umhüllt: nach dem Schritt Stoßsignale auswerten (this.stoesse, this._bandeSt,
//                                      this.hindernisStoesse, this.pflanzenStoesse) → Purzelbaum auslösen
// Reine Funktionen (Node-testbar): winkel, gierrate, zustand, bildSchritt, purzelStart, purzelSchritt, purzelPose, anwenden.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  const G = 9.81;
  const MAX_WINKEL = 45 * Math.PI / 180;       // Deckel der Schräglage
  // Alle Stellschrauben der Schräglage an einer Stelle; überschreibbar über window.Rennspiel.Moto.lageKonfig (z. B. { einlenkzeit: 0.5 }).
  const KONFIG = { gierTau: 0.10, einlenkzeit: 0.28, anteil90: 0.9, maxRateGrad: 90, maxWinkelGrad: 45, maxSchritt: 1 / 240, maxDt: 0.25, maxGierrate: 8 };
  const K = () => Object.assign({}, KONFIG, R.Moto.lageKonfig || {});
  /** Eigenfrequenz ω0 (1/s) der kritisch gedämpften Feder: Sprungantwort 1 − (1+ωt)e^(−ωt) erreicht `anteil` nach `zeit` (Newton-Suche). */
  function omega0(zeit, anteil) {
    let x = 4; for (let i = 0; i < 30; i++) { const f = 1 - (1 + x) * Math.exp(-x) - anteil, d = x * Math.exp(-x); x += f / Math.max(d, 1e-9) * -1; }
    return x / zeit;
  }
  const TAU = KONFIG.gierTau;                   // (Altname erhalten: jetzt Zeitkonstante der Gierraten-Glättung)
  const PURZEL = { dauer: 1.2, abklingzeit: 2.0, hoehe: 1.3, bande: 6, auto: 6, hindernis: 5, baum: 5 };   // Stärken = Aufprall-Tempo (m/s) wie in collisions.js

  const klemme = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const winkelDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  /** Ziel-Schräglage (rad, + = links): atan(v · ω / g), auf ±45° begrenzt; v ≤ 0 (Stand, rückwärts) → 0. */
  function winkel(v, gierrate) {
    if (!(v > 0) || !Number.isFinite(gierrate)) return 0;
    return klemme(Math.atan(v * gierrate / G), -K().maxWinkelGrad * Math.PI / 180, K().maxWinkelGrad * Math.PI / 180);
  }
  /** Gierrate (rad/s, + = links) aus zwei Headings; unplausible Sprünge (Reset/Teleport) → 0. */
  function gierrate(heading, vorher, dt) {
    if (!(dt > 1e-4) || vorher === null || vorher === undefined) return 0;
    const d = winkelDiff(heading, vorher);
    if (Math.abs(d) > 1.0) return 0;
    return klemme(d / dt, -K().maxGierrate, K().maxGierrate);
  }

  function zustand() {
    return { lean: 0, leanRate: 0, heading: null, gierGlatt: 0, purzel: { aktiv: false, t: 0, abkling: 0, anzahl: 0 } };
  }

  /** Ein Bild: Schräglage nachführen. e = { heading, v, dt }; dt ≤ 0 (Pause) hält den Zustand. Rückgabe: aktueller Winkel.
   *  Ablauf: Gierrate (aus Heading-Differenz) → Tiefpass (τ = gierTau, dt-genau) → Ziel = atan(v·ω/g) → kritisch gedämpfte Feder
   *  (lean, leanRate; in Unterschritten ≤ 1/240 s, also bildratenunabhängig) → Änderungsrate ≤ maxRateGrad, Deckel maxWinkelGrad.
   *  Heading-Sprung (Reset/Teleport) setzt Feder und Glättung zurück. */
  function bildSchritt(z, e) {
    const dt = e.dt, c = K();
    if (!(dt > 0)) return z.lean;
    if (z.leanRate === undefined) z.leanRate = 0;
    const dtc = Math.min(dt, c.maxDt);
    if (z.heading !== null && z.heading !== undefined && Math.abs(winkelDiff(e.heading, z.heading)) > 1.0) {   // Teleport/Reset
      z.lean = 0; z.leanRate = 0; z.gierGlatt = 0; z.heading = e.heading; return 0;
    }
    const w = gierrate(e.heading, z.heading, dt);
    z.heading = e.heading;
    z.gierGlatt += (w - z.gierGlatt) * (1 - Math.exp(-dtc / c.gierTau));
    const ziel = winkel(e.v, z.gierGlatt);
    const om = omega0(c.einlenkzeit, c.anteil90), maxR = c.maxRateGrad * Math.PI / 180, maxL = c.maxWinkelGrad * Math.PI / 180;
    const n = Math.max(1, Math.ceil(dtc / c.maxSchritt)), h = dtc / n;
    for (let i = 0; i < n; i++) {
      const acc = om * om * (ziel - z.lean) - 2 * om * z.leanRate;      // kritisch gedämpft
      z.leanRate = klemme(z.leanRate + acc * h, -maxR, maxR);
      z.lean = klemme(z.lean + z.leanRate * h, -maxL, maxL);
      if (Math.abs(z.lean) >= maxL && z.lean * z.leanRate > 0) z.leanRate = 0;
    }
    return z.lean;
  }

  // ---------- Purzelbaum ----------
  /** Pose zum Zeitanteil p ∈ [0,1]: Drehung um die Querachse (rad, Vorwärtsüberschlag = negativ), Hüpferhöhe (m), Anteil der Schräglage (1 → 0 → 1). */
  function purzelPose(p) {
    p = klemme(p, 0, 1);
    if (p >= 1) return { drehung: 0, hoehe: 0, lean: 1 };                    // gelandet, aufrecht
    const e = p * p * (3 - 2 * p);                                           // sanft an und aus
    return { drehung: -2 * Math.PI * e, hoehe: PURZEL.hoehe * Math.sin(Math.PI * p), lean: 1 - Math.min(1, Math.sin(Math.PI * p) * 4) };
  }
  /** Sturz auslösen. false, wenn schon einer läuft oder die Abklingzeit (2 s nach der Landung) noch nicht um ist. */
  function purzelStart(z) {
    const p = z.purzel;
    if (p.aktiv || p.abkling > 0) return false;
    p.aktiv = true; p.t = 0; p.anzahl++;
    return true;
  }
  /** Zeit voranbringen (dt ≤ 0 = Pause). Rückgabe: Pose { aktiv, drehung, hoehe, lean }. */
  function purzelSchritt(z, dt) {
    const p = z.purzel;
    if (dt > 0) {
      if (p.aktiv) { p.t += dt; if (p.t >= PURZEL.dauer) { p.aktiv = false; p.t = 0; p.abkling = PURZEL.abklingzeit; } }
      else if (p.abkling > 0) p.abkling = Math.max(0, p.abkling - dt);
    }
    if (!p.aktiv) return { aktiv: false, drehung: 0, hoehe: 0, lean: 1 };
    const pose = purzelPose(p.t / PURZEL.dauer);
    pose.aktiv = true;
    return pose;
  }

  /** Lage auf die Gruppen eines Motorrad-Meshes legen (userData.lage / purzel aus motoModell.js). */
  function anwenden(mesh, z, pose) {
    const u = mesh && mesh.userData;
    if (!u || !u.lage || !u.purzel) return;
    u.lage.rotation.z = z.lean * (pose ? pose.lean : 1);
    u.purzel.rotation.x = pose ? pose.drehung : 0;
    u.purzel.position.y = (R.Moto.modell ? R.Moto.modell.PIVOT_Y : 0.7) + (pose ? pose.hoehe : 0);
  }

  // ---------- Einhängen ins Spiel ----------
  function bildFuerSpiel(spiel, dt) {
    const liste = spiel.fahrzeuge || [];
    for (let i = 0; i < liste.length; i++) {
      const f = liste[i], m = f && f.mesh;
      if (!m || !m.userData || !m.userData.lage) continue;
      const z = f.motoZ || (f.motoZ = zustand());
      const d = f.anzeige || f.vehicle;
      bildSchritt(z, { heading: d.heading, v: f.vehicle ? f.vehicle.vLaengs : 0, dt });
      const pose = purzelSchritt(z, dt);
      anwenden(m, z, pose);
    }
  }
  /** Stoßsignale des letzten Physikschritts auswerten und Purzelbäume auslösen. */
  function stoesseAuswerten(spiel) {
    const liste = spiel.fahrzeuge || [];
    if (!liste.length || spiel.zustand !== 'rennen') return 0;
    let n = 0;
    const loese = (i) => {
      const f = liste[i];
      if (!f || f.ausgeschieden) return;
      if ((!f.mesh || !f.mesh.userData || !f.mesh.userData.lage) && !f.motoKopflos) return;     // M4: der Server rechnet ohne Mesh (f.motoKopflos) – dort zählt der Sturz trotzdem
      const z = f.motoZ || (f.motoZ = zustand());
      if (purzelStart(z)) n++;
    };
    const st = spiel.stoesse || [];
    for (let k = 0; k < st.length; k++) if (st[k].staerke >= PURZEL.auto) { loese(st[k].a); loese(st[k].b); }
    const bd = spiel._bandeSt;
    if (bd) for (let i = 0; i < bd.length; i++) if (bd[i] >= PURZEL.bande) loese(i);
    const hs = spiel.hindernisStoesse || [];
    for (let k = 0; k < hs.length; k++) if (hs[k].staerke >= PURZEL.hindernis && hs[k].typ !== 'brand' && hs[k].typ !== 'krater') loese(hs[k].nr);
    const ps = spiel.pflanzenStoesse || [];
    for (let k = 0; k < ps.length; k++) if (ps[k].typ === 'baum' && ps[k].staerke >= PURZEL.baum) loese(ps[k].nr);
    return n;
  }

  /** Haken setzen (einmalig). Gibt die Namen der umhüllten Funktionen zurück. */
  function installieren() {
    const erg = [];
    if (installieren.fertig) return erg;
    if (R.dach && typeof R.dach.frame === 'function') {
      const orig = R.dach.frame;
      R.dach.frame = function (spiel, dt) { const r = orig.apply(this, arguments); try { bildFuerSpiel(spiel, dt); } catch (e) { console.error('Motorrad-Lage:', e); } return r; };
      erg.push('R.dach.frame');
    }
    if (R.Spiel && R.Spiel.prototype.physikSchritt) {
      const orig = R.Spiel.prototype.physikSchritt;
      R.Spiel.prototype.physikSchritt = function (dt) { const r = orig.apply(this, arguments); try { stoesseAuswerten(this); } catch (e) { console.error('Motorrad-Sturz:', e); } return r; };
      erg.push('Spiel.physikSchritt');
    }
    installieren.fertig = true;
    return erg;
  }

  R.Moto.schraeglage = { G, MAX_WINKEL, TAU, KONFIG, omega0, PURZEL, winkel, gierrate, zustand, bildSchritt, purzelPose, purzelStart, purzelSchritt, anwenden, bildFuerSpiel, stoesseAuswerten, installieren };
})();
