// ============================================================
// Motorrad-Cockpit (M2d): Fahrersicht mit Lenker + zwei Rückspiegel. Läuft NACH src/main.js, nur mit window.MOTORRAD === true.
// Alles sind Umhüllungen zur Laufzeit; src/ui/cockpit.js, src/ui/rueckspiegel.js und src/render/cameras.js bleiben unverändert
// (Autorennen.html lädt diese Datei nicht).
//
// Kamera (Taste „Kamera“, Ansicht „cockpit“): Die Cockpit-Kamera sitzt schon auf Helmhöhe (config.kamera.cockpit, motoKatalog.js).
//   FahrzeugKamera.prototype.update   umhüllt: jede neue Kamera startet im Cockpit (Wunsch des Vaters, config.motoCockpit.startCockpit); in der Cockpit-Ansicht kippt die Kamera mit der Schräglage des Motorrads, gedämpft (rollAnteil 50 %).
// Lenker (nur Cockpit-Ansicht, nicht auf dem Handy mit Touch-Tasten – dort liegen unten die Knöpfe, wie beim Auto):
//   R.cockpit.fuerHud                 umhüllt: je HUD ein Zusatz-Objekt, das ein Bild (Canvas) unten in der Mitte zeichnet:
//                                     Vorderrad-Kotflügel mit Startnummer, Gabel, Lenker mit Griffen und Handschuhen, Bremshebel,
//                                     rundes Anzeige-Instrument mittig (km/h, Gang, Drehzahl-Segmente). Der Lenker dreht sich leicht mit.
//   Das Auto-Cockpit (Instrumente von VW/Porsche, Tafel) gibt es für Motorräder nie (config.cockpit.stile kennt keine Motorräder);
//   der Scheibenwischer gehört zur Windschutzscheibe und ist im Motorradmodus aus (config.cockpit.wischer.modi = []).
// Rückspiegel: ZWEI statt einem (links / rechts), rund-oval wie am Lenker. Links zeigt hinten-links, rechts hinten-rechts.
//   R.rueckspiegel.zeichnen/sichtbar/vorwaermen/entsorgen/zuruecksetzen   umhüllt
//   Kosten wie der eine Spiegel des Autorennens: halbe Auflösung je Spiegel, doppelter Takt je Spiegel, die beiden werden abwechselnd
//   neu gezeichnet (in jedem Bild höchstens einer; Zweispieler mit den Sparwerten zweiAufloesung/zweiTakt/zweiDeko/zweiSicht des Autorennens).
//   Cockpit-Ansicht: die Spiegel sitzen an den Lenkerenden, mindestens 25 % der Ansichtsbreite von der Mitte entfernt (spiegel.mitteAbstand).
//   Verfolger/Weit (24.10., Wunsch des Vaters „wirklich links und rechts“): linker Spiegel am linken, rechter am rechten Bildrand, beide auf derselben Höhe
//   UNTER den oberen HUD-Chips (Spieler-Chip links, Zeiten rechts; Platz-Chip bleibt oben Mitte); reicht der Platz im oberen Drittel nicht, auf ~40 % Bildhöhe.
//   Zweispieler: je Bildhälfte an deren Rändern. Gezeigt in allen Ansichten: im Motorradmodus wird config.cockpit.spiegel.modi zur Laufzeit auf
//   ['cockpit','verfolger','weit'] gesetzt (config.js bleibt unverändert).
// Reine Funktionen (Node-testbar): rechtecke, spiegelRichtung, spiegelPosition, taktPlan, faellig, rollWinkel, leanFuerKamera.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  if (window.MOTORRAD !== true) return;
  R.Moto = R.Moto || {};

  R.config.motoCockpit = {
    startCockpit: true,               // Startansicht jedes Rennens = Cockpit (Taste Kamera wechselt weiter)
    aus: false,                       // true = Autorennen-Spiegel (ein Spiegel oben Mitte), kein Lenker (nur für Vergleichsmessungen)
    rollAnteil: 0.5,                  // die Kamera kippt so viel der Schräglage des Motorrads mit (0,5 = halb so stark)
    rollWeichheit: 10,                // 1/s (τ 0,1 s): zusätzliche eigene Glättung der Kamera-Kippung, on top der Feder in schraeglage.js
    // Gasgriff + Bremshebel (nur Anzeige, keine Physik): Werte aus der letzten Steuerung des Fahrzeugs (gas/bremse 0..1), weich nachgeführt
    gasBremse: {
      an: true,                       // false = Lenker wie bisher (Griff/Hebel starr)
      rollMax: 0.75,                  // rad: so weit rollt der Gasgriff bei Vollgas (Handgelenk nach hinten)
      handRoll: 0.85,                 // Anteil davon, den der Handschuh mitkippt
      handVersatz: 22,                // Lenker-Einheiten: Handschuh wandert bei Vollgas so weit zum Fahrer (nach unten)
      hebelMax: 0.55,                 // rad: Bremshebel bei voller Bremse zum Griff gezogen
      daumenMax: 0.5,                 // rad: Quad: Daumenhebel bei Vollgas gedrückt
      weichHoch: 16, weichRunter: 9,  // 1/s: Nachführung bei steigendem / fallendem Wert (Gas ~0,06 s, Zurückschnellen ~0,11 s)
      verfolger: { an: true, rollMax: 0.9, hebelMax: 0.5 },   // dezente Marke am Motorradmodell (Verfolger-/Weit-Ansicht), nur eigene Fahrer
    },
    kameraVor: 0.42,                  // m vor der Motorradmitte: so sitzt die Cockpit-Kamera VOR dem Helmschirm (0,40 m) – sonst schneidet der Schirm in Schräglage als dunkles Band durchs Bild
    lenker: {
      seitenverh: 3.4,                // Breite : Höhe des Lenker-Bildes
      breite: 0.62,                   // höchstens so viel der Ansichtsbreite
      breiteZwei: 0.86,               // Zweispieler (halbe Bildbreite): der Lenker darf breiter sein, damit das Instrument lesbar bleibt
      maxHoehe: 0.29,                 // höchstens so viel der Ansichtshöhe
      lenkWinkel: 0.07,               // rad: so weit dreht sich der Lenker bei vollem Einschlag
      spiegelX: 0.115,                // Spiegel-Mitte: Abstand vom Lenker-Bildrand (Anteil Bildbreite)
      spiegelOben: 0.08,              // Spiegel-Mitte liegt so viel (Anteil Bildhöhe) ÜBER der Oberkante des Lenker-Bildes
      spiegelB: 0.205, spiegelH: 0.44, // Spiegelgröße (Anteil Lenker-Bildbreite / -höhe) – oval
      spiegelXZwei: 0.21, spiegelBZwei: 0.29, spiegelHZwei: 0.60,   // Zweispieler (halbe Bildbreite): Spiegel größer und etwas weiter innen, damit man die Gegner erkennt
    },
    spiegel: {
      winkel: 26,                     // Grad: so weit schaut jeder Spiegel von „genau hinten“ nach außen
      blickWinkel: 58,                // waagerechter Blickwinkel (Grad)
      blickWinkelZwei: 40,            // Zweispieler: engerer Blick (Gegner erscheinen größer, die Sicht reicht dafür weniger weit zur Seite)
      zweiFaktor: 0.8,                // Zweispieler: Spiegelbild-Breite = Autorennen-Auflösung × aufloesungFaktor × diesen Faktor (v34-Wert zweiAufloesung 0,5 war hier zu grob: 72 px für ein 115-px-Fenster)
      seitlich: 0.42, vor: 0.35,      // Lage der Spiegel-Kamera am Motorrad (m): seitlich der Mitte, vor der Mitte
      aufloesungFaktor: 0.5,          // Breite des Spiegelbilds = config.cockpit.spiegel.aufloesung × diesen Faktor (halbe Auflösung je Spiegel)
      lueckeOben: 6,                  // (alt, ungenutzt seit 24.10.)
      randAnteil: 0.012,              // Verfolger/Weit: Abstand zum Bildrand (Anteil Ansichtsbreite, mindestens 6 px)
      maxAnteil: 0.17,                // Verfolger/Weit: ein Spiegel höchstens so breit (Anteil Ansichtsbreite) → bleibt am Rand (< 20 %)
      untenLuecke: 8,                 // Verfolger/Weit: Abstand unter den oberen HUD-Chips (px)
      bandMax: 1 / 3,                 // Verfolger/Weit: Spiegel müssen im oberen Drittel enden, sonst …
      ersatzMitte: 0.40,              // … sitzt die Mitte der Spiegel auf dieser Bildhöhe (35–45 %)
      mitteAbstand: 0.27,             // Cockpit: Spiegel-Mitte mindestens so weit (Anteil Ansichtsbreite) von der Bildmitte; gefordert sind ≥ 25 %
    },
  };
  const CFG = () => R.config.motoCockpit;

  const TAU = Math.PI * 2, klemme = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // ---------- reine Funktionen ----------
  /**
   * Rechtecke (px, relativ zur Ansicht, links oben) der beiden Spiegel und des Lenker-Bildes. hind = Liste {x,y,b,h} von Flächen, die frei bleiben (Minimap).
   * cockpit = true: Spiegel an den Lenkerenden; sonst teilen sie sich das Rechteck `basis` (= Platz des einen Spiegels des Autorennens).
   * Rückgabe { lenker: {x,y,b,h} | null, spiegel: [links, rechts] }.
   */
  function rechtecke(vw, vh, cockpit, basis, hind, split, oben) {
    const C = CFG();
    if (!cockpit) {
      // oben = untere Kante der oberen HUD-Chips (px, 0/undefined = unbekannt): die Spiegel sitzen darunter, am linken und rechten Rand der Ansicht
      const M = C.spiegel, rand = Math.max(6, vw * M.randAnteil), b = Math.max(20, Math.min(basis.b / 2, vw * M.maxAnteil)), h = Math.min(basis.h, b);
      let y = Math.max(basis.y, oben > 0 ? oben + M.untenLuecke : 0);
      if (y + h > vh * M.bandMax) y = Math.max(basis.y, vh * M.ersatzMitte - h / 2);
      return { lenker: null, spiegel: [{ x: rand, y, b, h }, { x: vw - rand - b, y, b, h }] };
    }
    const L = C.lenker;
    let H = Math.min(vh * L.maxHoehe, vw * (split && L.breiteZwei ? L.breiteZwei : L.breite) / L.seitenverh), W = H * L.seitenverh, x0 = (vw - W) / 2;
    // Hindernisse (Minimap links unten): der Lenker wird schmaler, notfalls nach rechts neben das Hindernis geschoben – nie darüber
    if (hind && hind.length) {
      const rand = 6, rechts = vw - 4, bandOben = vh - H * 1.35;
      let links = 0;
      for (let k = 0; k < hind.length; k++) { const o = hind[k]; if (o.y + o.h > bandOben && o.x + o.b / 2 < vw / 2) links = Math.max(links, o.x + o.b + rand); }
      if (x0 < links) {
        const Wc = 2 * (vw / 2 - links);
        if (Wc >= 0.7 * W) { W = Wc; x0 = (vw - W) / 2; }
        else { W = Math.min(W, rechts - links); x0 = links + (rechts - links - W) / 2; }
        H = W / L.seitenverh;
      }
    }
    const z2 = !!(split && L.spiegelBZwei), sx = z2 ? L.spiegelXZwei : L.spiegelX;
    const y0 = vh - H, bm = (z2 ? L.spiegelBZwei : L.spiegelB) * W, hm = (z2 ? L.spiegelHZwei : L.spiegelH) * H, cy = y0 - L.spiegelOben * H;
    // Spiegel-Mitte: am Lenkerende, aber mindestens `mitteAbstand` der Ansichtsbreite von der Bildmitte (weiter außen, auch über das Lenker-Bild hinaus);
    // nie ganz aus dem Bild und nie auf ein Hindernis (Minimap) – dann bleibt die alte Lage
    const lim = vw * (0.5 - C.spiegel.mitteAbstand);
    const bau = (aussen) => [0, 1].map((m) => {
      const c0 = m === 0 ? x0 + sx * W : x0 + (1 - sx) * W;
      const c = aussen ? klemme(m === 0 ? Math.min(c0, lim) : Math.max(c0, vw - lim), bm / 2 + 3, vw - bm / 2 - 3) : c0;
      return { x: c - bm / 2, y: cy - hm / 2, b: bm, h: hm };
    });
    let sp = bau(true);
    // Liegt ein Spiegel (weiter außen) auf einem Hindernis (Minimap), bleiben BEIDE am Lenkerende (symmetrisch, wie bisher): die Minimap blockt dort den Rand
    if (hind && sp.some((rc) => hind.some((o) => rc.x < o.x + o.b && rc.x + rc.b > o.x && rc.y < o.y + o.h && rc.y + rc.h > o.y))) {
      let nach = 0;     // so weit nach innen, bis der linke Spiegel rechts neben der Minimap sitzt (der rechte spiegelbildlich)
      hind.forEach((o) => { if (sp[0].y < o.y + o.h && sp[0].y + sp[0].h > o.y && o.x + o.b / 2 < vw / 2) nach = Math.max(nach, o.x + o.b + 6 - sp[0].x); });
      sp = sp.map((rc, m) => ({ x: Math.min(vw - rc.b - 3, rc.x + (m === 0 ? nach : -nach)), y: rc.y, b: rc.b, h: rc.h }));
      if (sp[0].x + sp[0].b > sp[1].x - 4 || sp.some((rc) => hind.some((o) => rc.x < o.x + o.b && rc.x + rc.b > o.x && rc.y < o.y + o.h && rc.y + rc.h > o.y))) sp = bau(false);
    }
    return {
      lenker: { x: x0, y: y0, b: W, h: H },
      spiegel: sp,
      stiel: sp.map((rc, m) => klemme(m === 0 ? (rc.x + bm / 2 - x0) / W : 1 - (rc.x + bm / 2 - x0) / W, 0.02, 0.5)),   // Anteil Lenker-Bildbreite von der eigenen Seite (für den Spiegel-Stiel)
    };
  }

  /**
   * Blickrichtung eines Spiegels. seite −1 = links, +1 = rechts. heading wächst nach links (Linkskurve).
   * „Genau hinten“ = heading + π; links dreht den Blick nach links hinten (heading + π − winkel), rechts nach rechts hinten (heading + π + winkel):
   * yaw = heading + π + seite · winkel.
   * Rückgabe { yaw (Kamera-Drehung um y), dx, dz (Blickrichtung in der Welt), hinten (dx, dz), links (dx, dz) }.
   */
  function spiegelRichtung(heading, seite, winkelGrad) {
    const w = (winkelGrad === undefined ? CFG().spiegel.winkel : winkelGrad) * Math.PI / 180;
    const yaw = heading + Math.PI + seite * w;
    return { yaw, dx: -Math.sin(yaw), dz: -Math.cos(yaw),
      hinten: { dx: Math.sin(heading), dz: Math.cos(heading) }, links: { dx: -Math.cos(heading), dz: Math.sin(heading) } };
  }
  /** Lage der Spiegel-Kamera: seitlich versetzt zur eigenen Seite, ein Stück vor der Mitte. */
  function spiegelPosition(x, z, heading, seite, seitlich, vor) {
    const s = seitlich === undefined ? CFG().spiegel.seitlich : seitlich, v = vor === undefined ? CFG().spiegel.vor : vor;
    const lx = -Math.cos(heading), lz = Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);   // links, vorwärts
    return { x: x - seite * s * lx + fx * v, z: z - seite * s * lz + fz * v };
  }
  // seite −1 → +links: x + (−seite)·s·links; seite +1 → rechts

  /** Takt-Plan: n Spiegel teilen sich den Takt T (Bilder zwischen zwei Aufnahmen desselben Spiegels); Versatz je Spiegel gleichmäßig verteilt. */
  function taktPlan(n, T) { const o = []; for (let k = 0; k < n; k++) o.push(Math.floor(k * T / n)); return o; }
  /** Ist der Spiegel mit Versatz `off` in diesem Bild (Zähler) dran? */
  function faellig(zaehler, T, off) { return (zaehler % T) === off; }
  /** Kippung der Kamera aus der Schräglage (rad; positiv = nach links). */
  function rollWinkel(lean, anteil) { return (Number.isFinite(lean) ? lean : 0) * (anteil === undefined ? CFG().rollAnteil : anteil); }
  /** Schräglage für die Kamera: beim Purzelbaum (Sturz) fällt der Anteil mit der Lage des Motorrads auf 0 (die Kamera überschlägt sich nicht). */
  function leanFuerKamera(z, purzelPose, purzelDauer) {
    if (!z || !Number.isFinite(z.lean)) return 0;
    let a = 1;
    if (z.purzel && z.purzel.aktiv && purzelPose) a = purzelPose(z.purzel.t / purzelDauer).lean;
    return z.lean * a;
  }

  /**
   * Größe (Pixel) des Spiegelbilds für ein Spiegel-Rechteck rc: halbe Auflösung des einen Autorennen-Spiegels (config.cockpit.spiegel.aufloesung × aufloesungFaktor),
   * zu zweit nochmal × zweiAufloesung; nie größer als der Ausschnitt auf dem Bildschirm (kein Hochskalieren, kein Verschwenden).
   */
  function rtGroesse(rc, split) {
    const sp = R.config.cockpit.spiegel, mc = CFG().spiegel;
    const af = split ? (mc.zweiFaktor !== undefined ? mc.zweiFaktor : (sp.zweiAufloesung !== undefined ? sp.zweiAufloesung : 0.5)) : 1, auf = sp.aufloesung * mc.aufloesungFaktor * af;
    const b = Math.max(40, Math.round(Math.min(auf, rc.b * 1.1)));
    return { b, h: Math.max(16, Math.round(b * rc.h / rc.b)) };
  }

  /**
   * Takt der Spiegel: Takt des Autorennens × Zahl der Spiegel je Ansicht (2) → insgesamt gleich viele Aufnahmen je Bild wie dort.
   * Autorennen solo: 1 Spiegel alle `takt` Bilder; zu zweit: 2 Spiegel (je Bildhälfte einer) alle `zweiTakt` Bilder. Motorrad: 2 bzw. 4 Spiegel, je alle 2 × so viel Bilder.
   * stufe = adaptive Qualität des Spiels (ab 2 halber Takt). Rückgabe { T, n, plan (Versatz je Spiegel), proBild (Aufnahmen je Bild im Mittel) }.
   */
  function taktFuer(split, stufe, ansichten) {
    const sp = R.config.cockpit.spiegel, basis = split ? (sp.zweiTakt !== undefined ? sp.zweiTakt : 4) : sp.takt;
    const T = Math.max(2, Math.round(basis * 2 * (stufe >= 2 ? 2 : 1))), n = 2 * (ansichten || 1);
    return { T, n, plan: taktPlan(n, T), proBild: n / T };
  }

  const rein = { nachfuehren, taktFuer, rechtecke, spiegelRichtung, spiegelPosition, taktPlan, faellig, rollWinkel, leanFuerKamera, rtGroesse };
  R.Moto.cockpit = Object.assign(R.Moto.cockpit || {}, rein);

  // ============================================================ ab hier Browser (DOM + three.js)
  if (typeof document === 'undefined' || typeof THREE === 'undefined') return;
  if (!R.rueckspiegel || !R.cockpit || !R.FahrzeugKamera || !R.Spiel) return;

  if (R.config.kamera && R.config.kamera.cockpit) R.config.kamera.cockpit.vor = CFG().kameraVor;
  // Scheibenwischer = Windschutzscheibe: gibt es am Motorrad nicht
  if (R.config.cockpit && R.config.cockpit.wischer) R.config.cockpit.wischer.modi = [];
  // Spiegel in allen Ansichten (Wunsch des Vaters); config.js bleibt unverändert, die Laufzeit-Konfig gilt nur im Motorradmodus
  if (R.config.cockpit && R.config.cockpit.spiegel) R.config.cockpit.spiegel.modi = ['cockpit', 'verfolger', 'weit'];

  // ---------- Kamera: Kippung mit der Schräglage ----------
  const kUpdate = R.FahrzeugKamera.prototype.update;
  R.FahrzeugKamera.prototype.update = function (dt) {
    // Startansicht im Motorradmodus = Cockpit (jede neue Kamera, solo und zu zweit, auch Touch); die Taste Kamera wechselt danach wie bisher.
    // Das Autorennen merkt sich keine Kamera (kein localStorage) – deshalb gibt es auch hier keinen Schlüssel.
    if (!this._motoStart) {
      this._motoStart = true;
      const ci = R.config.kamera.modi.indexOf('cockpit');
      if (!CFG().aus && CFG().startCockpit !== false && ci >= 0) { this.modusIndex = ci; this._erstesMal = true; }
    }
    const erst = this._erstesMal;
    const r = kUpdate.apply(this, arguments);
    try {
      if (this.modus === 'cockpit' && !CFG().aus && this.ziel) {
        const sp = R.spiel, f = sp && sp._fahrzeugVon ? sp._fahrzeugVon(this.ziel) : null, z = f && f.motoZ;
        const SL = R.Moto.schraeglage;
        const ziel = rollWinkel(leanFuerKamera(z, SL && SL.purzelPose, SL && SL.PURZEL ? SL.PURZEL.dauer : 1.2));
        // Die Schräglage dreht das Motorrad um den Boden: der Helm wandert nach innen und etwas nach unten. Die Kamera sitzt im Helm und geht mit
        // (voll, wie das Motorrad), sonst säße sie neben dem Fahrer und sähe ihn von innen.
        const lean = leanFuerKamera(z, SL && SL.purzelPose, SL && SL.PURZEL ? SL.PURZEL.dauer : 1.2), hh = R.config.kamera.cockpit.hoehe, hd = f && f.vehicle ? (this.quelle || this.ziel).heading : 0;
        if (hh > 0 && Math.abs(lean) > 1e-4 && hd !== undefined) {
          const seit = hh * Math.sin(lean);
          this.kamera.position.x += -Math.cos(hd) * seit; this.kamera.position.z += Math.sin(hd) * seit; this.kamera.position.y -= hh * (1 - Math.cos(lean));
        }
        if (erst || this._motoRoll === undefined) this._motoRoll = ziel;
        else this._motoRoll += (ziel - this._motoRoll) * (1 - Math.exp(-CFG().rollWeichheit * Math.max(0, dt || 0)));
        // FIX3: im Flug (Schanze, Kanone, Gleitschirm) die Schräglage-Kippung dämpfen und auf ca. 8° begrenzen (kein schief hängendes Bild); Sturz-Purzel bleibt wie vorher
        const lw = this._luftW || 0, pur = !!(z && z.purzel && z.purzel.aktiv);
        let rz = this._motoRoll;
        if (lw > 0.001 && !pur) { rz *= 1 - 0.75 * lw; const m = 0.14; if (Math.abs(rz) > m) rz = rz < 0 ? -m : m; }
        this.kamera.rotation.z += rz;
      } else this._motoRoll = undefined;
    } catch (e) { console.error('Motorrad-Cockpit (Kamera):', e); }
    return r;
  };

  // Beim Sturz-Purzelbaum überschlägt sich das Motorrad um den Fahrer-Helm; die Cockpit-Kamera sitzt im Helm und sähe es von innen durchs Bild fliegen.
  // Allein am Bildschirm (Solo) blenden wir das eigene Motorrad für diese gut eine Sekunde aus (zu zweit sieht der Mitspieler es, dort bleibt es sichtbar).
  // Verfolger-/Weit-Ansicht: am Motorradmodell dezent Gasgriff-Marke (rollt) und Bremshebel (wird gezogen) am rechten Griff, nur eigene Fahrer (2 Draw-Calls je Fahrer).
  // Eigene Objekte im Fahrer-Teil des Modells, folgen der rechten Hand (und damit der Lenkung); das Modell selbst bleibt unverändert.
  function modellMarke(f, jetzt) {
    const GB = CFG().gasBremse, V = GB && GB.verfolger;
    if (!GB || !GB.an || !V || !V.an || !f.istSpieler || !f.vehicle || !f.mesh || !f.mesh.userData || !f.mesh.userData.moto) return;
    const u = f.mesh.userData, inh = u.inhalt;
    if (!inh) return;
    let m = f._gbm;
    if (m === undefined) {
      const hand = inh.children.find((c) => c.name === 'handschuh' && c.position.x > 0);
      if (!hand) { f._gbm = null; return; }
      const quad = !!(f.auto && (f.auto.typ === 'quad' || f.auto.id === 'quad'));
      const gruppe = new THREE.Group(); gruppe.name = 'gasBremse';
      const kappe = new THREE.Group(); gruppe.add(kappe);                                    // Gasgriff-Marke: Ring + heller Klotz, dreht um die Griffachse (x)
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 8), new THREE.MeshBasicMaterial({ color: 0x23262d })); ring.rotation.z = Math.PI / 2; kappe.add(ring);
      const klotz = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.022), new THREE.MeshBasicMaterial({ color: 0xffa31a })); klotz.position.set(0, 0.038, 0); kappe.add(klotz);
      kappe.position.set(0.075, 0, 0);
      const gelenk = new THREE.Group(); gelenk.position.set(-0.03, 0.02, -0.045); gruppe.add(gelenk);   // Bremshebel: Gelenk innen vor dem Griff, Hebel zeigt nach außen, dreht um die Hochachse
      const hebel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.016, 0.016), new THREE.MeshBasicMaterial({ color: 0xf2f4f8 })); hebel.position.set(0.065, 0, 0); gelenk.add(hebel);
      kappe.visible = !quad;                                                                  // Quad: Daumengas, kein rollender Griff (Hebel-Marke dort = Daumenhebel)
      inh.add(gruppe);
      m = f._gbm = { hand, gruppe, kappe, gelenk, quad };
    }
    if (!m) return;
    const g = glaettenGasBremse(m, f.vehicle, jetzt);
    m.gruppe.position.copy(m.hand.position);
    m.gruppe.quaternion.copy(u.lenkGruppe ? u.lenkGruppe.quaternion : m.gruppe.quaternion);
    m.kappe.rotation.x = g.gas * V.rollMax;                                                   // oben nach hinten (zum Fahrer, +z)
    m.gelenk.rotation.y = 0.5 - g.brems * V.hebelMax * (m.quad ? 0.6 : 1) - (m.quad ? g.gas * 0.3 : 0);
    m.gruppe.visible = true;
  }

  const spielZeichnen = R.Spiel.prototype.zeichnen;
  R.Spiel.prototype.zeichnen = function () {
    let f = null;
    try {
      const jetzt = performance.now();
      if (this.fahrzeuge && this.zustand !== 'menue') this.fahrzeuge.forEach((fz) => { if (fz.istSpieler) modellMarke(fz, jetzt); });
    } catch (e) { console.error('Motorrad-Cockpit (Gasgriff-Modell):', e); }
    try {
      const k = this.kameras && this.kameras.length === 1 ? this.kameras[0] : null;
      if (k && !CFG().aus && k.modus === 'cockpit' && this.zustand !== 'menue' && k.ziel) {
        const g = this._fahrzeugVon(k.ziel);
        if (g && g.mesh && g.mesh.visible && g.motoZ && g.motoZ.purzel && g.motoZ.purzel.aktiv) { f = g; f.mesh.visible = false; }
      }
    } catch (e) { f = null; }
    try { return spielZeichnen.apply(this, arguments); } finally { if (f) f.mesh.visible = true; }
  };

  // ---------- Rückspiegel: zwei Spiegel ----------
  const S = R.rueckspiegel, sichtOrig = S.sichtbar, zeichnenOrig = S.zeichnen, vorwaermenOrig = S.vorwaermen, entsorgenOrig = S.entsorgen, zuruecksetzenOrig = S.zuruecksetzen;
  const rts = [[null, null], [null, null]], rtB = [[0, 0], [0, 0]], rtH = [[0, 0], [0, 0]], geladen = [[false, false], [false, false]], zaehler = [0, 0];
  const kams = [null, null];
  let flaeche = null, flaecheSzene = null, flaecheKam = null, _vp = null, _sc = null;

  /** Die Spiegel-Anzeige (Cockpit-Ansicht): das Autorennen-Rahmenelement + Platz-Chip bleiben dafür aus (siehe unten). */
  S.sichtbar = function (spiel, i) {
    const ok = sichtOrig.call(S, spiel, i);
    if (CFG().aus || !ok) return ok;
    return spiel.kameras[i].modus === 'cockpit' ? false : ok;       // Cockpit: eigene Rahmen an den Lenkerenden, der Platz-Chip bleibt oben Mitte
  };

  /** Flächen, die der Lenker frei lassen muss (Minimap der Ansicht i, relativ zur Ansicht). Einmal gemessen, dann gemerkt (kein Layout-Lesen je Bild). */
  let hindCache = {};
  function hindernisse(spiel, i, vw, vh) {
    const key = i + '|' + vw + 'x' + vh;
    if (hindCache[key]) return hindCache[key];
    const h = spiel.huds && spiel.huds[i], liste = [];
    if (h && h.minimap && h.minimap.canvas && h.el) {
      const hr = h.el.getBoundingClientRect(), cr = h.minimap.canvas.getBoundingClientRect();
      if (cr.width > 0 && cr.height > 0) liste.push({ x: cr.left - hr.left, y: cr.top - hr.top, b: cr.width, h: cr.height });
    }
    if (liste.length) hindCache[key] = liste;
    return liste;
  }

  /** Untere Kante der oberen HUD-Chips (Spieler-Chip links mit Stunt-/Unfallanzeige, Zeiten rechts) in px relativ zur Ansicht. Nur Verfolger/Weit. Wächst nur (kein Springen), Rückstellung bei Größenänderung. */
  let obenWert = [0, 0];
  function messeOben(spiel, i) {
    const h = spiel.huds && spiel.huds[i];
    if (!h || !h.el) return obenWert[i];
    const hr = h.el.getBoundingClientRect();
    let u = 0;
    ['.hud-links', '.hud-zeiten'].forEach((q) => { const e = h.el.querySelector(q); if (e) { const r = e.getBoundingClientRect(); if (r.height > 0) u = Math.max(u, r.bottom - hr.top); } });
    if (u > obenWert[i]) obenWert[i] = u;
    return obenWert[i];
  }

  function vorbereiten(i, m, rc, split) {
    const g = rtGroesse(rc, split), pb = g.b, ph = g.h;
    if (!rts[i][m] || rtB[i][m] !== pb || rtH[i][m] !== ph) {
      if (rts[i][m]) rts[i][m].dispose();
      rts[i][m] = new THREE.WebGLRenderTarget(pb, ph, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
      rtB[i][m] = pb; rtH[i][m] = ph; geladen[i][m] = false;
    }
    if (!_vp) { _vp = new THREE.Vector4(); _sc = new THREE.Vector4(); }
    if (!kams[m]) kams[m] = new THREE.PerspectiveCamera(30, 1.5, 0.4, 200);
    if (!flaeche) {
      // Anzeige-Fläche: Ellipse (Kreis, im Spiegel-Ausschnitt gestreckt), Textur links/rechts vertauscht wie ein echter Spiegel
      flaecheSzene = new THREE.Scene();
      flaecheKam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
      const mat = new THREE.MeshBasicMaterial({ map: rts[i][m].texture, side: THREE.DoubleSide, toneMapped: false, depthTest: false, depthWrite: false });
      flaeche = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
      flaeche.scale.x = -1; flaeche.frustumCulled = false;
      flaecheSzene.add(flaeche);
    }
  }

  function ansichtRechtecke(spiel, i, vw, vh) {
    const split = spiel.kameras.length > 1, cockpit = spiel.kameras[i].modus === 'cockpit';
    return rechtecke(vw, vh, cockpit, S.rechteck(vw, vh, split), cockpit ? hindernisse(spiel, i, vw, vh) : null, split, cockpit ? 0 : (obenWert[i] || messeOben(spiel, i)));
  }

  S.zeichnen = function (spiel, i, vx, vw, vh) {
    if (CFG().aus) return zeichnenOrig.apply(S, arguments);
    if (!sichtOrig.call(S, spiel, i)) return;
    const r = spiel.renderer, k = spiel.kameras[i], cfg = R.config.cockpit.spiegel, mc = CFG().spiegel;
    const split = spiel.kameras.length > 1, rects = ansichtRechtecke(spiel, i, vw, vh).spiegel;
    if (rects[0].b < 12 || rects[0].h < 6) return;
    const stufe = spiel.qualitaet ? spiel.qualitaet.stufe : 0;
    const deko = (split ? (cfg.zweiDeko !== undefined ? cfg.zweiDeko : false) : cfg.deko) && stufe < 1;
    const tk = taktFuer(split, stufe, spiel.kameras.length), T = tk.T, plan = tk.plan;
    zaehler[i]++;
    const q = k.quelle || k.ziel;
    for (let m = 0; m < 2; m++) {
      const rc = rects[m];
      vorbereiten(i, m, rc, split);
      const slot = (split ? i : 0) * 2 + m;
      if (!(faellig(zaehler[i], T, plan[slot]) || !geladen[i][m]) || !q) continue;
      geladen[i][m] = true;
      const seite = m === 0 ? -1 : 1, fz = spiel.fahrzeuge.find((f) => f.anzeige === q), hd = q.heading !== undefined ? q.heading : 0;
      const dir = spiegelRichtung(hd, seite), pos = spiegelPosition(q.x, q.z, hd, seite), kam = kams[m];
      kam.position.set(pos.x, q.y + (mc.hoehe !== undefined ? mc.hoehe : cfg.hoehe), pos.z);
      kam.rotation.order = 'YXZ';
      kam.rotation.set(-0.03, dir.yaw, 0);
      kam.far = Math.min(split ? (cfg.zweiSicht !== undefined ? cfg.zweiSicht : cfg.sicht) : cfg.sicht, k.kamera.far);
      kam.aspect = rc.b / rc.h;
      kam.fov = 2 * Math.atan(Math.tan((split && mc.blickWinkelZwei ? mc.blickWinkelZwei : mc.blickWinkel) * Math.PI / 360) / kam.aspect) * 180 / Math.PI;
      kam.updateProjectionMatrix(); kam.updateMatrixWorld(true);
      const alt = r.getRenderTarget(), sz = spiel.szene, schatten = r.shadowMap.autoUpdate;
      const scissor = r.getScissorTest(), vp = r.getViewport(_vp), sc = r.getScissor(_sc);
      const sichtbarAlt = fz ? fz.mesh.visible : true;
      let dekoAlt = null;
      try {
        if (fz) fz.mesh.visible = false;                                             // eigenes Motorrad nicht im Spiegel
        if (!deko) { dekoAlt = sz.children.filter((c) => c.visible && c.name && c.name.indexOf('Deko') === 0); dekoAlt.forEach((c) => { c.visible = false; }); }
        r.shadowMap.autoUpdate = false;
        r.setScissorTest(false);
        r.setRenderTarget(rts[i][m]);
        r.render(sz, kam);
      } finally {
        r.setRenderTarget(alt);
        if (dekoAlt) dekoAlt.forEach((c) => { c.visible = true; });
        r.shadowMap.autoUpdate = schatten;
        if (fz) fz.mesh.visible = sichtbarAlt;
        r.setViewport(vp); r.setScissor(sc); r.setScissorTest(scissor);
      }
    }
    // beide Bilder in ihre Ausschnitte legen (WebGL-Ursprung unten links); ohne Löschen, damit außerhalb der Ellipse das Bild bleibt
    const H = window.innerHeight, scissor = r.getScissorTest(), ac = r.autoClear;
    r.setScissorTest(true); r.autoClear = false;
    for (let m = 0; m < 2; m++) {
      const rc = rects[m];
      if (!rts[i][m]) continue;
      const x = Math.round(vx + rc.x), y = Math.round(H - (rc.y + rc.h)), b = Math.round(rc.b), h = Math.round(rc.h);
      r.setViewport(x, y, b, h); r.setScissor(x, y, b, h);
      flaeche.material.map = rts[i][m].texture;
      r.render(flaecheSzene, flaecheKam);
    }
    r.autoClear = ac; r.setScissorTest(scissor);
  };

  /** Shader-Variante für Bilder in RenderTargets vorwärmen (wie im Autorennen), auch wenn die Ansicht zuerst nicht „cockpit“ ist. */
  S.vorwaermen = function (spiel) {
    if (CFG().aus) return vorwaermenOrig.apply(S, arguments);
    if (!spiel || !spiel.kameras) return;
    const r = spiel.renderer, w = window.innerWidth, h = window.innerHeight, split = spiel.kameras.length > 1;
    for (let i = 0; i < spiel.kameras.length; i++) {
      if (!sichtOrig.call(S, spiel, i)) continue;
      const vw = split ? (i === 0 ? Math.floor(w / 2) : w - Math.floor(w / 2)) : w, rc = S.rechteck(vw, h, split);
      if (rc.b < 8 || rc.h < 4) continue;
      const rs = rechtecke(vw, h, false, rc).spiegel;
      vorbereiten(i, 0, rs[0], split);
      const alt = r.getRenderTarget();
      try { r.setRenderTarget(rts[i][0]); r.compile(spiel.szene, kams[0]); } finally { r.setRenderTarget(alt); }
    }
  };
  S.zuruecksetzen = function () { zuruecksetzenOrig.apply(S, arguments); hindCache = {}; obenWert = [0, 0]; zaehler[0] = zaehler[1] = 0; for (let i = 0; i < 2; i++) geladen[i][0] = geladen[i][1] = false; };
  S.entsorgen = function () {
    entsorgenOrig.apply(S, arguments);
    for (let i = 0; i < 2; i++) for (let m = 0; m < 2; m++) { if (rts[i][m]) { rts[i][m].dispose(); rts[i][m] = null; } rtB[i][m] = rtH[i][m] = 0; }
    S.zuruecksetzen();
  };

  // ---------- Lenker + Rahmen im HUD ----------
  const SCHRIFT = '"Helvetica Neue", Arial, system-ui, sans-serif';
  const LW = 1000;                                       // Zeichenfläche des Lenker-Bildes (logisch): LW × LW / seitenverh
  function mische(c, ziel, t) {
    const n = typeof c === 'string' ? parseInt(c.slice(1), 16) : c, z = ziel;
    const ch = (s) => Math.round(((n >> s) & 255) * (1 - t) + z * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  const heller = (c, t) => mische(c, 255, t), dunkler = (c, t) => mische(c, 0, t);

  /** Das ganze Lenker-Bild. p = { steer, kmh, anteil (0..1 Drehzahl), gang, bike, fahrer, helm, nr }. */
  function lenkerZeichnen(g, cw, ch, LH, p) {
    g.setTransform(cw / LW, 0, 0, ch / LH, 0, 0);
    g.clearRect(0, 0, LW, LH);
    const cx = LW / 2;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // --- Teile, die sich mit dem Lenker drehen ---
    g.save(); g.translate(cx, LH); g.rotate(p.steer * CFG().lenker.lenkWinkel); g.translate(-cx, -LH);
    // Vorderrad-Kotflügel (Kuppel, vorn über dem Rad) mit Glanzkante
    let gr = g.createLinearGradient(0, 205, 0, LH);
    gr.addColorStop(0, heller(p.bike, 0.3)); gr.addColorStop(0.5, heller(p.bike, 0)); gr.addColorStop(1, dunkler(p.bike, 0.4));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, 338, 160, 130, 0, 0, TAU); g.fill();
    g.strokeStyle = dunkler(p.bike, 0.55); g.lineWidth = 5; g.beginPath(); g.ellipse(cx, 338, 160, 130, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 6; g.beginPath(); g.ellipse(cx, 338, 148, 118, 0, Math.PI * 1.14, Math.PI * 1.86); g.stroke();
    // Startnummer-Tafel
    g.fillStyle = '#f6f6f6'; g.strokeStyle = dunkler(p.bike, 0.25); g.lineWidth = 6;
    g.beginPath(); g.roundRect ? g.roundRect(cx - 40, 224, 80, 66, 16) : g.rect(cx - 40, 224, 80, 66); g.fill(); g.stroke();
    g.fillStyle = '#15171c'; g.font = '800 46px ' + SCHRIFT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(p.nr), cx, 259);
    // Gabelrohre (golden)
    for (const sx of [-1, 1]) {
      const x = cx + sx * 66;
      const gg = g.createLinearGradient(x - 12, 0, x + 12, 0);
      gg.addColorStop(0, '#6b500c'); gg.addColorStop(0.3, '#f2d36b'); gg.addColorStop(0.6, '#c99b22'); gg.addColorStop(1, '#5d440a');
      g.fillStyle = gg; g.fillRect(x - 12, 170, 24, LH - 160);
      g.fillStyle = '#23262c'; g.fillRect(x - 14, 232, 28, 14);                           // Gabelschutz
    }
    // Halterung des Instruments
    g.fillStyle = '#22262d'; g.fillRect(cx - 34, 168, 68, 40);
    // Lenkerrohr (Mitte höher, Enden zum Fahrer hin tiefer)
    const stange = () => { g.beginPath(); g.moveTo(96, 236); g.quadraticCurveTo(cx, 96, LW - 96, 236); };
    g.strokeStyle = '#15181d'; g.lineWidth = 26; stange(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 6; g.save(); g.translate(0, -7); stange(); g.stroke(); g.restore();
    g.fillStyle = '#2b3037'; g.fillRect(160, 192, 40, 30); g.fillRect(LW - 200, 192, 40, 30);   // Klemmen
    // linke und rechte Seite gleich (rechts gespiegelt)
    for (const seite of [-1, 1]) {
      g.save(); if (seite > 0) { g.translate(LW, 0); g.scale(-1, 1); }
      // Spiegel-Stiel von der Klemme nach oben (endet im Spiegel-Rahmen)
      g.strokeStyle = '#16181c'; g.lineWidth = 10; g.beginPath(); g.moveTo(178, 200); g.lineTo(((p.stiel && p.stiel[seite < 0 ? 0 : 1]) || (p.zwei ? CFG().lenker.spiegelXZwei : CFG().lenker.spiegelX)) * LW, 48); g.stroke();
      // Hebel, Griff, Arm und Handschuh sitzen 44 Einheiten weiter innen: der Arm läuft dann zum Bildrand hin weich aus (siehe unten)
      g.save(); g.translate(44, 0);
      // Rechte Seite (seite > 0, Anzeige): Gasgriff rollt, Bremshebel wird gezogen, bzw. beim Quad Daumengas. Links (Kupplung) bleibt alles starr.
      const GB = CFG().gasBremse, aktiv = seite > 0 && GB && GB.an, gas = aktiv ? klemme(p.gas || 0, 0, 1) : 0, brems = aktiv ? klemme(p.brems || 0, 0, 1) : 0, quad = !!p.quad;
      const roll = quad ? 0 : gas * GB.rollMax, hebelW = aktiv ? brems * GB.hebelMax : 0;
      // Hebel (Kupplung / Bremse): vorn am Griff, nach innen gebogen, Kugelende; Bremshebel dreht sich um sein Gelenk (112, 212) zum Griff hin
      g.save(); g.translate(112, 212); g.rotate(hebelW); g.translate(-112, -212);
      g.strokeStyle = '#d4d8df'; g.lineWidth = 9; g.beginPath(); g.moveTo(112, 212); g.bezierCurveTo(140, 184, 184, 168, 244, 166); g.stroke();
      g.fillStyle = '#eef1f5'; g.beginPath(); g.arc(246, 166, 8, 0, TAU); g.fill();
      g.restore();
      // Griff (schwarzes Gummi mit Rillen); der Gasgriff (rechts) rollt: drei Längsstreifen wandern über den Zylinder, Endkappe mit Marke läuft mit
      g.strokeStyle = '#121316'; g.lineWidth = 56; g.beginPath(); g.moveTo(108, 220); g.lineTo(30, 262); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 4;
      for (let t = 0.12; t < 0.95; t += 0.13) { const x = 108 - 78 * t, y = 220 + 42 * t; g.beginPath(); g.moveTo(x - 6, y - 24); g.lineTo(x + 6, y + 24); g.stroke(); }
      if (aktiv && !quad) {
        const nx = 0.474, ny = 0.880, ax = -78, ay = 42;                          // Querrichtung (zum Fahrer hin = nach unten) und Achse des Griffs
        g.save(); g.lineCap = 'butt';
        for (let k = 0; k < 3; k++) {
          const ph = -0.9 + k * 0.9 + roll, off = 23 * Math.sin(ph), sicht = Math.cos(ph);
          if (sicht < 0.15) continue;
          g.strokeStyle = k === 1 ? 'rgba(255,170,40,' + (0.55 * sicht).toFixed(2) + ')' : 'rgba(255,255,255,' + (0.34 * sicht).toFixed(2) + ')'; g.lineWidth = k === 1 ? 7 : 4;
          g.beginPath(); g.moveTo(104 + nx * off, 218 + ny * off); g.lineTo(104 + ax * 0.9 + nx * off, 218 + ay * 0.9 + ny * off); g.stroke();
        }
        g.restore();
        g.fillStyle = '#2b3037'; g.beginPath(); g.ellipse(30, 262, 17, 28, 0.5, 0, TAU); g.fill();                                          // Endkappe
        g.fillStyle = '#ffb347'; g.beginPath(); g.arc(30 + nx * 20 * Math.sin(-0.6 + roll), 262 + ny * 20 * Math.sin(-0.6 + roll), 4.5, 0, TAU); g.fill();   // Marke rollt mit
      }
      // Arm/Ärmel (zum unteren Rand hin) und Handschuh
      g.strokeStyle = dunkler(p.fahrer, 0.2); g.lineWidth = 78; g.beginPath(); g.moveTo(58, 248); g.lineTo(-24, 316); g.stroke();
      g.strokeStyle = heller(p.helm, 0); g.lineWidth = 12; g.beginPath(); g.moveTo(34, 236); g.lineTo(-14, 272); g.stroke();       // Bündchen
      // Hand: beim Gas rollt das Handgelenk nach hinten (Handschuh kippt und rückt zum Fahrer), Finger liegen am Bremshebel
      g.save();
      if (aktiv) { g.translate(0.474 * GB.handVersatz * (roll / GB.rollMax || 0), 0.88 * GB.handVersatz * (roll / GB.rollMax || 0)); g.translate(74, 240); g.rotate(roll * GB.handRoll); g.translate(-74, -240); }
      const hg = g.createRadialGradient(70, 230, 6, 74, 244, 76);
      hg.addColorStop(0, heller(p.fahrer, 0.28)); hg.addColorStop(1, dunkler(p.fahrer, 0.28));
      g.fillStyle = hg; g.strokeStyle = dunkler(p.fahrer, 0.5); g.lineWidth = 4;
      g.beginPath(); g.ellipse(74, 240, 66, 44, 0.42, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = dunkler(p.fahrer, 0.45); g.lineWidth = 3;
      if (!aktiv) for (let f = -1; f <= 1; f++) { g.beginPath(); g.moveTo(40 + f * 14 + 10, 216 + f * 12); g.lineTo(76 + f * 14, 246 + f * 12 + 6); g.stroke(); }   // Finger
      g.fillStyle = heller(p.fahrer, 0.12); g.strokeStyle = dunkler(p.fahrer, 0.5); g.lineWidth = 3;
      if (!(aktiv && quad)) { g.beginPath(); g.ellipse(116, 214, 26, 15, -0.5, 0, TAU); g.fill(); g.stroke(); }                                          // Daumen (Quad: liegt auf dem Daumenhebel)
      g.restore();
      if (aktiv && quad) {
        // Daumengas: orangener Hebel unter dem Daumen (nach innen vom Handschuh), der Daumen drückt ihn bei Gas nach unten
        const da = gas * GB.daumenMax;
        g.save(); g.translate(168, 226); g.rotate(da);
        g.strokeStyle = '#2b2e34'; g.lineWidth = 20; g.beginPath(); g.moveTo(0, 0); g.lineTo(62, -6); g.stroke();
        g.strokeStyle = '#ff7a2e'; g.lineWidth = 11; g.beginPath(); g.moveTo(4, 0); g.lineTo(60, -6); g.stroke();
        g.fillStyle = heller(p.fahrer, 0.12); g.strokeStyle = dunkler(p.fahrer, 0.5); g.lineWidth = 3;
        g.beginPath(); g.ellipse(34, -9, 28, 15, -0.15, 0, TAU); g.fill(); g.stroke();                                            // Daumen auf dem Hebel
        g.restore();
      }
      if (aktiv && !quad) {
        // Gasgriff-Ring (Hülse am inneren Griffende, auf dem Handschuh sichtbar): die orange Marke wandert beim Gasgeben über den Ring = Griff rollt
        const rx = 150, ry = 224, ang = -1.25 + roll * 1.9, co = Math.cos(ang), si = Math.sin(ang);
        g.save(); g.translate(rx, ry); g.rotate(0.51);
        g.fillStyle = '#1a1c20'; g.strokeStyle = '#6a707a'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, 0, 13, 31, 0, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#ffb347'; g.beginPath(); g.ellipse(co * 4, si * 24, 6, 5, 0, 0, TAU); g.fill();
        g.restore();
      }
      if (aktiv) {
        // zwei Finger (Zeige-, Mittelfinger) am Bremshebel: liegen auf dem Hebel und gehen mit ihm zum Griff; Punkte auf dem Hebel (Bezier) um das Gelenk gedreht
        const bez = (t) => { const u = 1 - t; return [u * u * u * 112 + 3 * u * u * t * 140 + 3 * u * t * t * 184 + t * t * t * 244, u * u * u * 212 + 3 * u * u * t * 184 + 3 * u * t * t * 168 + t * t * t * 166]; };
        const rot = (q) => { const dx = q[0] - 112, dy = q[1] - 212, c = Math.cos(hebelW), sn = Math.sin(hebelW); return [112 + dx * c - dy * sn, 212 + dx * sn + dy * c]; };
        const wurzel = [[88, 226], [96, 232]];
        g.save(); g.lineCap = 'round';
        [0.46, 0.64].forEach((t, k) => {
          const e = rot(bez(t)), w0 = wurzel[k];
          g.strokeStyle = dunkler(p.fahrer, 0.5); g.lineWidth = 17; g.beginPath(); g.moveTo(w0[0], w0[1]); g.lineTo(e[0], e[1]); g.stroke();
          g.strokeStyle = heller(p.fahrer, 0.06); g.lineWidth = 12; g.beginPath(); g.moveTo(w0[0], w0[1]); g.lineTo(e[0], e[1]); g.stroke();
        });
        g.restore();
      }
      g.restore();
      g.restore();
    }
    g.restore();
    // Weiche Ränder: links und rechts blendet das Bild über 70 Einheiten aus (kein harter senkrechter Rand, der Arm „läuft aus“)
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (const seite of [0, 1]) {
      const x0 = seite ? LW : 0, x1 = seite ? LW - 70 : 70, ra = g.createLinearGradient(x0, 0, x1, 0);
      ra.addColorStop(0, 'rgba(0,0,0,1)'); ra.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ra; g.fillRect(seite ? LW - 70 : 0, 0, 70, LH);
    }
    g.restore();
    // --- Anzeige-Instrument (steht fest) ---
    // Zu zweit (p.zwei) ist das Bild klein: das Instrument wird größer, nur km/h groß, kein Gang, Drehzahl-Segmente dünn
    const zwei = !!p.zwei;
    const px = cx, py = zwei ? 148 : 100, pr = zwei ? 134 : 92;
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 16; g.shadowOffsetY = 5; g.fillStyle = '#1b1f26'; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill(); g.restore();
    gr = g.createLinearGradient(px - pr, py - pr, px + pr, py + pr); gr.addColorStop(0, '#d6dbe2'); gr.addColorStop(0.5, '#6b727d'); gr.addColorStop(1, '#2c3037');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
    gr = g.createRadialGradient(px, py - 14, 8, px, py, pr - 8); gr.addColorStop(0, '#1b2634'); gr.addColorStop(1, '#05080c');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr - 9, 0, TAU); g.fill();
    // Drehzahl-Segmente (270°, von links unten über oben nach rechts unten)
    const N = 22, A0 = Math.PI * 0.75, SW = Math.PI * 1.5, an = Math.max(1, Math.round(p.anteil * N));
    g.lineWidth = zwei ? 9 : 11; g.lineCap = 'butt';
    for (let s = 0; s < N; s++) {
      const a0 = A0 + SW * s / N + 0.012, a1 = A0 + SW * (s + 0.8) / N, f = s / N;
      g.strokeStyle = s < an ? (f < 0.6 ? '#35e08a' : f < 0.82 ? '#ffc233' : '#ff4a3a') : 'rgba(255,255,255,.12)';
      g.beginPath(); g.arc(px, py, pr - 22, a0, a1); g.stroke();
    }
    g.lineCap = 'round';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const gross = zwei ? (p.kmh > 99 ? 92 : 108) : (p.kmh > 99 ? 48 : 56);
    g.fillStyle = '#ffffff'; g.font = '800 ' + gross + 'px ' + SCHRIFT; g.fillText(String(p.kmh), px, py + (zwei ? 4 : 2));
    g.fillStyle = '#7fc4ff'; g.font = '700 ' + (zwei ? 22 : 15) + 'px ' + SCHRIFT; g.fillText('km/h', px, py + (zwei ? 62 : 36));
    g.fillStyle = '#ffb347'; g.font = '800 ' + (zwei ? 20 : 16) + 'px ' + SCHRIFT; if (!zwei) g.fillText(p.gang, px, py - 40);                                      // zu zweit ohne Gang: km/h reicht, die Ziffer wäre nur ~10 px groß
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, pr - 12, Math.PI * 1.1, Math.PI * 1.55); g.stroke();   // Glanz
  }

  /** Weiche Nachführung eines Anzeigewerts (0..1) zum Ziel: hoch schnell, runter etwas langsamer (Feder-Gefühl). Rein. */
  function nachfuehren(alt, ziel, dt, hoch, runter) {
    const k = ziel > alt ? hoch : runter;
    return alt + (ziel - alt) * (1 - Math.exp(-k * Math.max(0, dt)));
  }
  /** Gas/Bremse des Fahrzeugs (letzte Steuerung nach Fahrhilfe) → geglättete Anzeigewerte; Zustand am Objekt `o`. */
  function glaettenGasBremse(o, v, jetzt) {
    const GB = CFG().gasBremse || {}, st = v && v.letzteSteuerung ? v.letzteSteuerung : null;
    const dt = Math.min(0.1, o._gbT ? (jetzt - o._gbT) / 1000 : 0.1); o._gbT = jetzt;
    const gz = st ? klemme(st.gas || 0, 0, 1) : 0, bz = st ? klemme(st.bremse || 0, 0, 1) : 0;
    o._gas = nachfuehren(o._gas || 0, gz, dt, GB.weichHoch || 16, GB.weichRunter || 9);
    o._brems = nachfuehren(o._brems || 0, bz, dt, GB.weichHoch || 16, GB.weichRunter || 9);
    if (o._gas < 0.004) o._gas = 0; if (o._brems < 0.004) o._brems = 0;
    return { gas: o._gas, brems: o._brems };
  }

  const styl = (e, k) => Object.assign(e.style, k);
  function stilEinbauen() {
    if (document.getElementById('moto-cockpit-stil')) return;
    const s = document.createElement('style'); s.id = 'moto-cockpit-stil';
    s.textContent =
      '.hud-spiegel{visibility:hidden !important}\n' +                       // der eine Rahmen des Autorennens: im Motorradmodus malen wir zwei
      '.cp-moto-spiegel{position:absolute;box-sizing:border-box;border-radius:50%;pointer-events:none;border:5px solid #17191d;' +
        'box-shadow:0 0 0 2px rgba(255,255,255,.24),0 3px 8px rgba(0,0,0,.55),inset 0 0 9px rgba(0,0,0,.55);' +
        'background:linear-gradient(120deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 32%)}\n' +
      '.cp-moto-lenker{position:absolute;pointer-events:none;display:none}\n';
    document.head.appendChild(s);
  }

  class MotoCockpit {
    constructor(anz, hud) {
      this.anz = anz; this.hud = hud; this.aktiv = false; this.spAn = false; this.rpm = 0; this.zeit = 0; this.schluessel = ''; this.letzteZeichnung = 0;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas = document.createElement('canvas'); this.canvas.className = 'cp-moto-lenker'; this.g = this.canvas.getContext('2d');
      anz.wurzel.appendChild(this.canvas);
      this.rahmen = [0, 1].map((m) => { const d = document.createElement('div'); d.className = 'cp-moto-spiegel ' + (m ? 'rechts' : 'links'); d.style.display = 'none'; anz.wurzel.appendChild(d); return d; });
      this.alterTacho = hud.el.querySelector('.hud-tacho'); this.tachoWeg = null; this.hinweisHoch = false;
      this.layoutKey = '';
    }

    update() {
      const hud = this.hud, spiel = R.spiel, kam = spiel && spiel.kameras && spiel.kameras[hud.nr];
      if (!kam || CFG().aus) { this._aus(); return; }
      const touch = document.documentElement.classList.contains('t-rennen');
      const cockpit = kam.modus === 'cockpit' && R.config.cockpit.an && !touch;
      const sp = !!sichtOrig.call(S, spiel, hud.nr);
      const vw = this.anz.vw || hud.el.clientWidth, vh = this.anz.vh || hud.el.clientHeight;
      const split = spiel.kameras.length > 1;
      // Spiegel-Rahmen
      if (sp) {
        if (!cockpit && (this.messZ = (this.messZ || 0) + 1) % 8 === 1) messeOben(spiel, hud.nr);       // Chip-Höhe nur alle 8 Aufrufe messen (kein Layout-Lesen je Bild)
        const ob = cockpit ? 0 : Math.round(obenWert[hud.nr] || 0);
        const key = vw + 'x' + vh + (cockpit ? 'c' : 'v' + ob) + (split ? 's' : '');
        if (key !== this.layoutKey || !this.spAn) {
          this.layoutKey = key;
          const rs = rechtecke(vw, vh, cockpit, S.rechteck(vw, vh, split), cockpit ? hindernisse(spiel, hud.nr, vw, vh) : null, split, ob);
          rs.spiegel.forEach((rc, m) => {
            const rand = Math.max(2, Math.min(5, Math.round(rc.h * 0.06)));
            styl(this.rahmen[m], { left: (rc.x - 3) + 'px', top: (rc.y - 3) + 'px', width: (rc.b + 6) + 'px', height: (rc.h + 6) + 'px', borderWidth: rand + 'px', display: 'block' });
          });
          this.rects = rs;
        }
      } else if (this.spAn) this.rahmen.forEach((d) => { d.style.display = 'none'; });
      this.spAn = sp;
      // Lenker + Instrument
      if (cockpit !== this.aktiv) {
        this.aktiv = cockpit; this.canvas.style.display = cockpit ? 'block' : 'none'; this.schluessel = '';
        if (this.alterTacho) this.alterTacho.style.display = cockpit ? 'none' : '';
        if (!cockpit && hud.eHinweis) hud.eHinweis.style.bottom = '';
      }
      if (!cockpit) return;
      const rs = this.rects && this.layoutKey === (vw + 'x' + vh + 'c' + (split ? 's' : '')) ? this.rects : rechtecke(vw, vh, true, S.rechteck(vw, vh, split), hindernisse(spiel, hud.nr, vw, vh), split);
      const lb = rs.lenker;
      if (!lb) return;
      // Hinweis („Festgefahren? R drücken“) mittig über die Oberkante der Spiegel setzen, sonst läge der breite Text auf ihnen
      if (hud.eHinweis) { const unten = Math.round(vh - Math.min(rs.spiegel[0].y, rs.spiegel[1].y) + 10) + 'px'; if (hud.eHinweis.style.bottom !== unten) hud.eHinweis.style.bottom = unten; }
      const LH = LW / CFG().lenker.seitenverh;
      const cw = Math.max(40, Math.min(Math.round(lb.b * this.dpr), 1000)), ch = Math.max(12, Math.round(cw / CFG().lenker.seitenverh));
      if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; this.schluessel = ''; }
      styl(this.canvas, { left: lb.x + 'px', top: lb.y + 'px', width: lb.b + 'px', height: lb.h + 'px' });

      const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - (this.zeit || jetzt)) / 1000); this.zeit = jetzt;
      if (jetzt - this.letzteZeichnung < 1000 / (R.config.cockpit.zeichenrate || 30) - 1) return;
      this.letzteZeichnung = jetzt;
      const v = hud.f.vehicle, auto = hud.f.auto, gt = R.cockpit.getriebe(auto, v.vLaengs, v.daten && v.daten.vMax);
      const gb = glaettenGasBremse(this, v, jetzt);
      this.rpm += (gt.rpm - this.rpm) * (1 - Math.exp(-14 * Math.max(dt, 0.016)));
      const anteil = klemme((this.rpm - gt.leerlauf) / Math.max(1, gt.begr - gt.leerlauf), 0, 1);
      const kmh = Math.abs(Math.round(v.vLaengs * 3.6)), steer = Math.round(klemme(v.lenkung || 0, -1, 1) * 20) / 20;
      const gang = Math.abs(v.vLaengs) < 0.3 ? 'N' : (gt.gang < 0 ? 'R' : 'GANG ' + gt.gang);
      const key = kmh + '|' + Math.round(anteil * 22) + '|' + Math.round(gb.gas * 24) + 'g' + Math.round(gb.brems * 24) + '|' + gang + '|' + steer + '|' + cw + (split ? 'z' : '') + (rs.stiel ? '|' + Math.round(rs.stiel[0] * 100) : '');
      if (key === this.schluessel) return;
      this.schluessel = key;
      const o = (auto && auto.optionen) || {};
      lenkerZeichnen(this.g, cw, ch, LH, { steer, kmh, anteil, gang, bike: auto ? auto.farbe : 0xff6a10, fahrer: auto && auto.farbe2 !== undefined ? auto.farbe2 : 0x1d4ed8,
        helm: o.helm !== undefined ? o.helm : 0xf4f4f4, nr: o.nummer !== undefined ? o.nummer : 1, zwei: split, stiel: rs.stiel, gas: gb.gas, brems: gb.brems, quad: !!(auto && (auto.typ === 'quad' || auto.id === 'quad')) });
    }

    _aus() {
      if (this.aktiv) { this.aktiv = false; this.canvas.style.display = 'none'; if (this.alterTacho) this.alterTacho.style.display = ''; if (this.hud.eHinweis) this.hud.eHinweis.style.bottom = ''; }
      if (this.spAn) { this.spAn = false; this.rahmen.forEach((d) => { d.style.display = 'none'; }); }
    }
  }
  const fuerHud = R.cockpit.fuerHud;
  R.cockpit.fuerHud = function (hud, wurzel) {
    const anz = fuerHud.apply(this, arguments);
    try {
      stilEinbauen();
      const mc = new MotoCockpit(anz, hud);
      const upd = anz.update.bind(anz), grs = anz.groesse.bind(anz);
      anz.update = function () { upd(); try { mc.update(); } catch (e) { console.error('Motorrad-Cockpit:', e); } };
      anz.groesse = function (vw, vh) { grs(vw, vh); mc.layoutKey = ''; hindCache = {}; obenWert = [0, 0]; };
      // Der Platz-Chip rückt im Autorennen neben den Spiegel oben Mitte – hier sitzen die Spiegel am Rand: der Chip bleibt oben Mitte
      const platz = anz._platzChip && anz._platzChip.bind(anz);
      if (platz) anz._platzChip = function () { return platz(false); };
      anz.moto = mc;
    } catch (e) { console.error('Motorrad-Cockpit (HUD):', e); }
    return anz;
  };

  R.Moto.cockpit.lenkerZeichnen = lenkerZeichnen;
  R.Moto.cockpit.kameras = () => kams;                         // die beiden Spiegel-Kameras (Tests: Blickrichtung)
  R.Moto.cockpit.zustandSpiegel = () => ({ rt: rts.map((a) => a.map((t) => !!t)), groesse: rtB.map((a, i) => a.map((b, m) => [b, rtH[i][m]])) });
  R.Moto.cockpit.installiert = ['FahrzeugKamera.update', 'Spiel.zeichnen', 'rueckspiegel.sichtbar/zeichnen/vorwaermen/zuruecksetzen/entsorgen', 'cockpit.fuerHud'];
})();
