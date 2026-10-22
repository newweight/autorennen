// ============================================================
// Arcade-Fahrphysik (2D auf der Bodenebene, y = Höhe kommt von der Strecke)
//
// Modell: Das Auto hat Position (x, z), Fahrtrichtung (heading, Radiant),
// eine Vorwärtsgeschwindigkeit (vLaengs) und eine Seitwärtsgeschwindigkeit
// (vQuer). Lenken dreht das Auto abhängig vom Tempo; der Grip baut die
// Seitwärtsgeschwindigkeit wieder ab (Driften bei wenig Grip).
// Keine Abhängigkeit von Three.js, damit Node-Tests möglich sind.
//
// Runde 4: optionales 4. Argument `umwelt` von schritt() (Wetter/Wind aus src/world/wetter.js):
// { gripFaktor, bremsFaktor, windX, windZ } – fehlt es, rechnet alles exakt wie vorher.
//
// Runde 5 (Fahrbarkeit):
// - Tempo-Klasse: new Vehicle(daten, { tempoKlasse: 'normal' | 'schnell' }) rechnet die Faktoren aus
//   config.tempoKlassen EINMAL in this.daten ein (vMax/beschleunigung/bremsen). Schaden (datenBasis) und
//   Turbo multiplizieren danach weiter auf diese Werte. Ohne Option: Vehicle.klasseStandard (null = Katalogwerte).
// - Lenkung: Drehrate bei hohem Tempo direkter (arcade-Untergrenze aus config.physik.lenkung), über der
//   Haftgrenze rutscht das Auto spürbar nach außen und verliert Tempo (Untersteuern statt „nichts passiert").
//
// Runde 6 (W1): untergrundMisch (0..1, main.js) – hinter dem Randstreifen mischen Rand und Gras/Sand weich
// (Rollwiderstand, Haftung, Tempo-Deckel); undefined/1 = rechnet exakt wie vorher.
// drehImpuls (rad/s, > 0 = heading wächst = nach links): Rempler „echt" (collisions.js) dreht das Auto; die
// Welt-Geschwindigkeit bleibt dabei erhalten (das Auto rutscht quer), klingt exponentiell in ~1 s ab, Lenkung
// währenddessen nur config.kollision.rempeln.drehLenkung (30 %) wirksam. 0 = keinerlei Wirkung.
//
// v15 (Öl/Sand): Beim EINFAHREN in einen Fleck (Wechsel this.untergrund → 'oel' bzw. 'sandFleck', erkannt über _ugAlt) wirkt
// einmal untergrundEinfahrt(): Öl gibt einen tempo-skalierten Drehimpuls (drehImpuls, Richtung: Lenkung → Querbewegung →
// Positions-Hash, KEIN Math.random – Server und Vorhersage rechnen gleich; Fahrhilfe dämpft), Sand nimmt einmalig Tempo.
// Werte: config.physik.schleudern. Die Schleuder-Drehung nutzt eigene Lenk-/Abkling-Werte (drehLenk/drehAb, sonst Rempler-Werte).
// ============================================================
(function () {
  const R = window.Rennspiel;

  /** Kürzeste Winkeldifferenz a - b in (-π, π]. */
  function winkelDiff(a, b) {
    let d = (a - b) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI; else if (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }

  class Vehicle {
    /**
     * @param {object} daten Fahrwerte aus dem Auto-Katalog:
     *   vMax (m/s), beschleunigung (m/s²), bremsen (m/s²), rueckwaertsMax (m/s),
     *   wendigkeit (rad/s Drehrate bei langsamer Fahrt), grip (0..1), masse (kg), laenge, breite
     *   Schnell begrenzt config.physik.querGrip die Drehrate (siehe drehrateMax()).
     */
    constructor(daten, optionen) {
      // Standard = Mittelklasse (240 km/h), passt zum Passat im Katalog
      this.daten = Object.assign({
        vMax: 240 / 3.6, beschleunigung: 5.2, bremsen: 21, rueckwaertsMax: 8,
        wendigkeit: 1.9, grip: 0.9, masse: 1400, laenge: 4.4, breite: 1.8,
      }, daten);
      // Runde 5: Tempo-Klasse (Faktoren direkt in daten → Schaden/Turbo bleiben multiplikativ)
      const klassen = R.config.tempoKlassen || {};
      const klasse = optionen && optionen.tempoKlasse !== undefined ? optionen.tempoKlasse : Vehicle.klasseStandard;
      this.tempoKlasse = klassen[klasse] ? klasse : null;
      this.tempoKlasseFaktor = klassen[klasse] || { vMax: 1, beschleunigung: 1, bremsen: 1 };
      const kf = this.tempoKlasseFaktor;
      if (kf.vMax !== 1) this.daten.vMax *= kf.vMax;
      if (kf.beschleunigung !== 1) this.daten.beschleunigung *= kf.beschleunigung;
      if (kf.bremsen !== 1) this.daten.bremsen *= kf.bremsen;
      this.gripBonus = 1;        // Faktor auf die Haftung (KI "unschlagbar" setzt 1.05)
      this.umweltGrip = 1;       // Runde 4: Wetter-Faktor auf die Haftung (aus umwelt.gripFaktor, gilt auch für die KI-Planung)
      this.windSeite = 0;        // Runde 4: Seitenwind relativ zum Auto −1..1 (> 0 = drückt nach rechts), für das HUD
      this.windLaengs = 0;       // Runde 4: > 0 Rückenwind, < 0 Gegenwind (−1..1)
      this.x = 0; this.z = 0; this.y = 0;
      this.heading = 0;          // 0 = Richtung -z (nach "vorne" in Three.js)
      this.vLaengs = 0;          // m/s, negativ = rückwärts
      this.vQuer = 0;            // m/s seitlich (Drift)
      this.lenkung = 0;          // geglätteter Lenkwert -1..1
      this.untergrund = 'strasse';
      this.neigung = 0;          // optische Wankbewegung (rad, um die Längsachse)
      this.nicken = 0;           // optisches Nicken (rad, um die Querachse, > 0 = Bug hoch)
      this.letzteSteuerung = { gas: 0, bremse: 0, lenkung: 0 };
      this.streckeFortschritt = 0; // wird vom Rennmanager gesetzt
      this.drehImpuls = 0;       // Runde 6: Drehung nach einem Rempler (rad/s), siehe Kopf
      this.drehLenk = undefined; // v15: Lenkanteil während der Schleuder-Drehung (undefined = Rempler-Wert)
      this.drehErhalt = undefined; // v15: Anteil der Welt-Bewegung, der bei der Schleuder-Drehung erhalten bleibt (undefined = 1)
      this.drehAb = undefined;   // v15: Abklingrate der Schleuder-Drehung 1/s (undefined = Rempler-Wert)
      this._ugAlt = undefined;   // v15: Untergrund des vorigen Schritts (Erkennung „Einfahrt")
      this.untergrundMisch = undefined;   // Runde 6: 0 = noch Rand, 1 = ganz Gras/Sand (main.js setzt es abseits)
    }

    get tempo() { return Math.abs(this.vLaengs); }
    get tempoKmh() { return Math.round(this.vLaengs * 3.6); }

    /** Einheitsvektor der Fahrtrichtung in der XZ-Ebene. */
    richtung() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; }

    /** Einheitsvektor nach RECHTS (in Fahrtrichtung gesehen). Heading 0: (+1, 0). */
    rechts() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }

    /** Geschwindigkeit in Weltkoordinaten (für Kollisionen). */
    weltGeschwindigkeit() {
      const r = this.richtung(), q = this.rechts();
      return { x: r.x * this.vLaengs + q.x * this.vQuer, z: r.z * this.vLaengs + q.z * this.vQuer };
    }

    /** Geschwindigkeit aus Weltkoordinaten zurück in Längs-/Queranteil zerlegen. */
    weltGeschwindigkeitSetzen(vx, vz) {
      const r = this.richtung(), q = this.rechts();
      this.vLaengs = vx * r.x + vz * r.z;
      this.vQuer = vx * q.x + vz * q.z;
      const d = this.daten;
      this.vLaengs = Math.max(-d.rueckwaertsMax, Math.min(d.vMax, this.vLaengs));
    }

    /**
     * Fahrhilfen auf die Steuerbefehle anwenden (liefert neue Befehle).
     * hilfe = { lenkhilfe 0..1, bremshilfe 0..1, tangente {tx,tz}, seitenabstand (rechts +), zieltempo m/s }
     * - Lenkhilfe: zieht die Lenkung sanft Richtung Straßentangente + Straßenmitte.
     *   Lenkt der Spieler selbst, wirkt sie nur noch schwach (er soll überholen können).
     * - Bremshilfe: bremst leicht, wenn das Zieltempo der Ideallinie deutlich überschritten wird.
     */
    _fahrhilfe(s, hilfe) {
      if (!hilfe) return s;
      let { gas = 0, bremse = 0, lenkung = 0 } = s;
      const vorwaerts = this.vLaengs > 2;
      if (hilfe.lenkhilfe > 0 && hilfe.tangente && vorwaerts && hilfe.seitenabstand !== undefined) {
        const hTangente = Math.atan2(-hilfe.tangente.tx, -hilfe.tangente.tz);
        let fehlerTangente = winkelDiff(hTangente, this.heading);
        // Nur helfen, wenn das Auto grob in Fahrtrichtung steht (nicht beim Wenden)
        if (Math.abs(fehlerTangente) < Math.PI / 2) {
          // rechts der Mitte (seitenabstand > 0) → Ziel leicht nach links (heading größer).
          // Regler: Soll-Drehrate = k × (Winkelfehler + Winkel zur Mitte über Vorausblick v·T).
          // Gedämpft wie ein Feder-Dämpfer mit ζ ≈ √(k·T)/2 → T = 2/k ergibt ζ ≈ 0,7,
          // unabhängig vom Tempo (sonst schaukelt die Hilfe bei 250 km/h auf).
          const anteil = hilfe.lenkhilfe * (Math.abs(lenkung) > 0.1 ? 0.3 : 1);
          const k = 2.5 * anteil;
          const T = Math.max(1.0, 2.0 / Math.max(k, 1e-3));
          const vorausblick = Math.max(12, this.vLaengs * T);
          const zurMitte = Math.max(-0.3, Math.min(0.3, Math.atan(hilfe.seitenabstand / vorausblick)));
          const fehler = fehlerTangente + zurMitte;
          // Soll-Drehrate in Lenkwert umrechnen (über die mögliche Drehrate bei diesem Tempo)
          const rateMax = Math.max(0.2, this.drehrateMax());
          const hilfsLenkung = Math.max(-1, Math.min(1, -fehler * k / rateMax));   // heading größer = links = negativ
          const spieler = lenkung;
          lenkung = Math.max(-1, Math.min(1, lenkung + hilfsLenkung));
          // v32 (N2): abseits nimmt die Hilfe einer Spieler-Lenkung höchstens hilfeMax weg (sonst lenkt „links“ im Gras kaum)
          const LA = Math.abs(spieler) > 0.1 ? this.abseitsLenkung() : null;
          if (LA) lenkung = spieler > 0 ? Math.max(lenkung, spieler * (1 - LA.hilfeMax)) : Math.min(lenkung, spieler * (1 - LA.hilfeMax));
        }
      }
      if (hilfe.bremshilfe > 0 && vorwaerts && hilfe.zieltempo > 0) {
        const grenze = hilfe.zieltempo * 1.1 + 1.5;            // "deutlich" überschritten
        const zuViel = this.vLaengs - grenze;
        if (zuViel > 0) {
          // Runde 3: kräftiger als vorher (höhere Tempi, längere Bremswege)
          const staerke = Math.min(1, zuViel / 4) * hilfe.bremshilfe;
          gas *= 1 - Math.min(1, staerke * 1.5);               // erst Gas wegnehmen …
          bremse = Math.max(bremse, Math.min(1, staerke * 1.6)); // … dann bremsen (wenig bis 32 %, viel bis 80 %)
        }
      }
      return { gas, bremse, lenkung };
    }

    /**
     * Einen Physikschritt rechnen.
     * @param {number} dt Zeit in Sekunden (fest, z. B. 1/60)
     * @param {{gas:number,bremse:number,lenkung:number}} s Steuerbefehle (lenkung: links negativ)
     * @param {object} [hilfe] Fahrhilfe { lenkhilfe, bremshilfe, tangente:{tx,tz}, seitenabstand, zieltempo }
     * @param {object} [umwelt] Runde 4 – Wetter/Wind { gripFaktor, bremsFaktor, windX, windZ } (windX/Z in Stufen 0..5,
     *   Richtung, in die der Wind weht). Fehlt es: Haftung/Bremsen unverändert, kein Wind.
     */
    schritt(dt, s, hilfe, umwelt) {
      const d = this.daten;
      // v15: Einfahrt in Öl/Sand-Fleck (einmal je Wechsel des Untergrunds)
      const ugAlt = this._ugAlt;
      this._ugAlt = this.untergrund;
      if (ugAlt !== undefined && ugAlt !== this.untergrund) this._untergrundEinfahrt(this.untergrund, s, hilfe);
      let ug = R.config.physik.untergrund[this.untergrund] || R.config.physik.untergrund.strasse;
      // Runde 6: weicher Übergang Rand → Gras/Sand (nur wenn main.js einen Mischfaktor < 1 gesetzt hat)
      const misch = this.untergrundMisch;
      const gemischt = misch !== undefined && misch < 1 && ug.vMaxAbs !== undefined;
      if (gemischt) {
        const ur = R.config.physik.untergrund.rand, m = Math.max(0, misch);
        ug = { grip: ur.grip + (ug.grip - ur.grip) * m, rollwiderstand: ur.rollwiderstand + (ug.rollwiderstand - ur.rollwiderstand) * m };
      }
      // Runde 4: Wetter wirkt auf die Haftung (auch drehrateMax/querBeschleunigungMax über gripGesamt)
      this.umweltGrip = umwelt && umwelt.gripFaktor !== undefined ? umwelt.gripFaktor : 1;
      const bremsFaktor = umwelt && umwelt.bremsFaktor !== undefined ? umwelt.bremsFaktor : 1;
      // Wind relativ zum Auto (Stufen): seit > 0 = weht nach rechts, laengs > 0 = Rückenwind
      let windSeit = 0, windLaengs = 0;
      if (umwelt && (umwelt.windX || umwelt.windZ)) {
        const r0 = this.richtung(), q0 = this.rechts();
        windSeit = umwelt.windX * q0.x + umwelt.windZ * q0.z;
        windLaengs = umwelt.windX * r0.x + umwelt.windZ * r0.z;
      }
      const W = R.config.wind || { seitK: 0, gierK: 0, vMaxJeStufe: 0, staerkeMax: 5 };
      this.windSeite = windSeit / (W.staerkeMax || 5);
      this.windLaengs = windLaengs / (W.staerkeMax || 5);
      // Gegen-/Rückenwind verschiebt das Höchsttempo (±3 % je Stufe); ohne Wind exakt d.vMax
      const vMaxWind = windLaengs ? d.vMax * (1 + W.vMaxJeStufe * windLaengs) : d.vMax;
      const grip = Math.min(1, d.grip * ug.grip * this.gripBonus * this.umweltGrip);
      s = s || {};
      // --- Lenkung: kleine Totzone NUR auf die Eingabe (Gamepad-Rauschen), sanft skaliert;
      //     die Fahrhilfe kommt danach, damit ihre feinen Korrekturen nicht verschluckt werden ---
      let roh = Math.max(-1, Math.min(1, s.lenkung || 0));
      const TOTZONE = 0.04;
      roh = Math.abs(roh) < TOTZONE ? 0 : Math.sign(roh) * (Math.abs(roh) - TOTZONE) / (1 - TOTZONE);
      s = this._fahrhilfe({ gas: s.gas || 0, bremse: s.bremse || 0, lenkung: roh }, hilfe);
      this.letzteSteuerung = s;   // für Bremslicht (Bremshilfe sichtbar machen)

      const zielLenkung = s.lenkung;
      // Runde 5: schneller ansprechend (einschwingen 6 → 9, zurückstellen 9 → 12 je s)
      const LK = R.config.physik.lenkung || {};
      const lenkTempo = zielLenkung === 0 ? (LK.zurueck || 12) : (LK.einschwingen || 9);
      this.lenkung += (zielLenkung - this.lenkung) * Math.min(1, lenkTempo * dt);
      if (zielLenkung === 0 && Math.abs(this.lenkung) < 0.002) this.lenkung = 0;

      // --- Längsbeschleunigung ---
      // Antrieb fällt zum Höchsttempo hin ab (kraftAbfall); der Luftwiderstand (∝ v²) ist so
      // gewählt, dass bei vMax noch endKraft × beschleunigung übrig bleibt → vMax wird sicher
      // erreicht und dort gedeckelt. Rollwiderstand hängt vom Untergrund ab.
      const P = R.config.physik;
      let a = 0;
      const gas = s.gas || 0, bremse = s.bremse || 0;
      const vRel = this.vLaengs / vMaxWind;
      const RW = P.rueckwaerts || {};
      if (gas > 0 && this.vLaengs >= -0.5) {
        a += d.beschleunigung * gas * (1 - P.kraftAbfall * Math.max(0, vRel)) * (0.6 + 0.4 * ug.grip);
      } else if (gas > 0 && RW.gasBremst) {
        // 15.10. (v23): Gas beim Rückwärtsfahren bremst die Rückwärtsfahrt zügig bis zum Stand (dann fährt das Auto vorwärts). Vorher rollte das Auto
        // auf der Straße noch ≈ 10 s rückwärts weiter (nur 0,6 m/s² Rollwiderstand) und das Gas „ging nicht“.
        a += Math.min(d.bremsen, RW.gasBremst) * gas * bremsFaktor;
      }
      if (bremse > 0) {
        if (this.vLaengs > 0.5) a -= d.bremsen * bremse * bremsFaktor;   // bremsen (Runde 4: × Wetter)
        else if (gas === 0) a -= Math.max(Math.min(6, d.beschleunigung) * 0.8, RW.beschleunigung || 0) * bremse;   // rückwärts (nach Stillstand; v23: mindestens config.physik.rueckwaerts.beschleunigung)
      }
      const luft = Math.max(0, (1 - P.kraftAbfall - P.endKraft) * d.beschleunigung - 0.6);
      let rw = ug.rollwiderstand;
      // Runde 6: abseits (Gras/Sand mit Deckel) greift der volle Rollwiderstand erst ab abseitsAnfahren m/s – darunter
      // gemischt mit dem Randstreifen, damit man aus dem Gras/Sand (auch rückwärts, z. B. vom Zaun weg) wieder anfährt
      const ugRoh = R.config.physik.untergrund[this.untergrund];
      if (ugRoh && (ugRoh.vMaxAbs !== undefined || ugRoh.anfahrenRampe) && P.abseitsAnfahren) {   // v15: auch Sandfleck (anfahrenRampe)
        const rr = R.config.physik.untergrund.rand.rollwiderstand, t = Math.min(1, Math.abs(this.vLaengs) / P.abseitsAnfahren);
        if (rw > rr) rw = rr + (rw - rr) * t;
      }
      let widerstand = 0.6 * rw + luft * vRel * vRel;
      // Reifen radieren in der Kurve (Untersteuern kostet Tempo)
      widerstand += P.kurvenWiderstand * Math.abs(this._querBeschl || 0);
      // Runde 5: über der Haftgrenze radieren die Reifen stärker (Untersteuern kostet spürbar Tempo)
      widerstand += (P.lenkung ? P.lenkung.ueberBremsen : 0) * (this._ueberBeschl || 0);
      if (this.vLaengs > 0) a -= widerstand; else if (this.vLaengs < 0) a += Math.min(widerstand, 3);

      const vAlt = this.vLaengs;
      let vNeu = this.vLaengs + a * dt;
      // Stillstand sauber erreichen (kein Zittern um 0)
      if (gas === 0 && bremse === 0 && Math.abs(vNeu) < 0.3) vNeu = 0;
      if (this.vLaengs > 0 && vNeu < 0 && bremse > 0 && gas === 0) vNeu = 0;
      // Abseits ist das Höchsttempo deutlich niedriger (Gras ≤ 90 km/h, Sand ≤ 79 km/h).
      // Darüber wird kräftig, aber nicht schlagartig abgebremst.
      let vMaxHier = this.vMaxAuf(this.untergrund);
      if (gemischt) { const vr = this.vMaxAuf('rand'); vMaxHier = vr + (vMaxHier - vr) * Math.max(0, misch); }
      if (windLaengs) vMaxHier *= vMaxWind / d.vMax;          // Runde 4: Wind verschiebt auch den Untergrund-Deckel
      if (vNeu > vMaxHier) vNeu = Math.max(vMaxHier, Math.min(vNeu, vAlt - P.abseitsBremsen * dt));
      vNeu = Math.max(-d.rueckwaertsMax, Math.min(vMaxWind, vNeu));
      this.vLaengs = vNeu;

      // --- Drehung (Arcade): Drehrate in rad/s. Langsam begrenzt die Wendigkeit, schnell die
      //     Querhaftung (Drehrate ≤ aQuer / v) → bei hohem Tempo untersteuert das Auto. ---
      const tempoAnteil = Math.min(1, this.tempo / d.vMax);
      this._querBeschl = 0;
      this._ueberBeschl = 0;
      if (this.tempo > 0.2) {
        const drehrateMax = this.drehrateMax();
        const richtungVz = this.vLaengs >= 0 ? 1 : -1;      // rückwärts lenkt spiegelverkehrt
        let drehrate = this.lenkung * drehrateMax * richtungVz;   // > 0 = Rechtskurve
        if (this.drehImpuls) {
          const fD = this.drehLenk !== undefined ? this.drehLenk : ((R.config.kollision && R.config.kollision.rempeln.drehLenkung) || 0.3);   // Runde 6
          const LA = this.abseitsLenkung();
          // v32 (N2): abseits nicht Gras × Drehung multiplizieren – mindestens drehMindest × Asphalt-Drehrate (Asphalt/Öl: wie vorher)
          if (LA) drehrate = this.lenkung * richtungVz * Math.max(drehrateMax * fD, LA.drehMindest * this._drehrateAuf(this.tempo, 'strasse'));
          else drehrate *= fD;
        }
        this.heading -= drehrate * dt;
        this._querBeschl = drehrate * this.vLaengs;
        // Fliehkraft: das Auto rutscht zur Kurvenaußenseite – proportional zur Querbeschleunigung,
        // die selbst begrenzt ist (kein Wegdrehen bei hohem Tempo).
        // vQuer > 0 = nach rechts. Rechtskurve (drehrate > 0) → nach links (vQuer sinkt).
        this.vQuer -= this._querBeschl * (1 - grip) * 0.4 * dt;
        // Runde 5: Anteil über der Haftgrenze (arcade-Drehrate > aQuer/v) → zusätzlich nach außen rutschen
        const LK = R.config.physik.lenkung;
        if (LK && this.vLaengs > 0) {
          const grenze = this.querBeschleunigungMax(this.vLaengs);
          const ueber = Math.abs(this._querBeschl) - grenze;
          if (ueber > 0) {
            this._ueberBeschl = ueber;
            this.vQuer -= Math.sign(this._querBeschl) * ueber * LK.ueberDrift * dt;
          }
        }
      }
      // Runde 4: Seitenwind – schiebt das Auto seitlich (vQuer) und dreht es leicht mit (Lenkversatz),
      // beides ∝ Stufe × Tempo. Wer nicht gegenlenkt, wird zur Seite getragen.
      if (windSeit && this.vLaengs > 1) {
        this.vQuer += W.seitK * windSeit * this.vLaengs * dt;
        this.heading -= W.gierK * windSeit * this.vLaengs * dt;     // heading kleiner = nach rechts
      }
      // Runde 6: Drehung nach einem Rempler – Heading dreht, die Bewegung (Welt) bleibt → das Auto rutscht quer
      if (this.drehImpuls) {
        const vw = this.weltGeschwindigkeit();
        this.heading += this.drehImpuls * dt;
        if (this.drehErhalt !== undefined) {
          // v15 Schleudern: nur der Anteil drehErhalt der Welt-Bewegung bleibt (sonst rutscht das Auto bei 140 km/h Dutzende Meter quer)
          const l0 = this.vLaengs, q0 = this.vQuer, e = this.drehErhalt;
          this.weltGeschwindigkeitSetzen(vw.x, vw.z);
          this.vLaengs = l0 + (this.vLaengs - l0) * e; this.vQuer = q0 + (this.vQuer - q0) * e;
        } else this.weltGeschwindigkeitSetzen(vw.x, vw.z);
        const K = (R.config.kollision && R.config.kollision.rempeln) || {};
        this.drehImpuls *= Math.exp(-(this.drehAb !== undefined ? this.drehAb : (K.drehAbklingen || 3)) * dt);
        if (Math.abs(this.drehImpuls) < 0.05) { this.drehImpuls = 0; this.drehLenk = undefined; this.drehAb = undefined; this.drehErhalt = undefined; }
      }
      // Grip baut Drift ab
      const dampf = Math.exp(-(2.5 + 9 * grip) * dt);
      this.vQuer *= dampf;
      if (Math.abs(this.vQuer) < 0.02) this.vQuer = 0;

      // --- Position ---
      const r = this.richtung();
      const q = this.rechts();             // rechts vom Auto
      this.x += (r.x * this.vLaengs + q.x * this.vQuer) * dt;
      this.z += (r.z * this.vLaengs + q.z * this.vQuer) * dt;

      // --- nur Optik: Wanken in Kurven, Nicken beim Beschleunigen/Bremsen ---
      const zielNeigung = -this.lenkung * tempoAnteil * 0.06;
      this.neigung += (zielNeigung - this.neigung) * Math.min(1, 5 * dt);
      const laengsBeschl = (this.vLaengs - vAlt) / dt;     // tatsächliche Beschleunigung
      // > 0 = Bug hoch (Anfahren), < 0 = Bug runter (Bremsen); um die Querachse (rotation.x)
      const zielNicken = Math.max(-0.045, Math.min(0.03, laengsBeschl * 0.0035));
      this.nicken += (zielNicken - this.nicken) * Math.min(1, 6 * dt);
    }

    /**
     * v15: Einmalwirkung beim Einfahren in einen Fleck (siehe Kopf). s = Steuerbefehle des Schritts (roh), hilfe = Fahrhilfe.
     * Öl: drehImpuls = Vorzeichen × impuls × Tempo-Faktor (0 unter vMin, 1 bei vRef, höchstens faktorMax); Fahrhilfe dämpft.
     * Sand: Tempo × tempoFaktor (nur vorwärts, ab vMin).
     */
    _untergrundEinfahrt(neu, s, hilfe) {
      const SC = R.config.physik.schleudern;
      if (!SC) return;
      if (neu === 'oel' && SC.oel) {
        const O = SC.oel, v = this.vLaengs;
        if (v <= O.vMin) return;
        let f = Math.min(O.faktorMax, (v - O.vMin) / (O.vRef - O.vMin));
        if (hilfe && hilfe.lenkhilfe > 0) f *= 1 - O.hilfeDaempfung * Math.min(1, hilfe.lenkhilfe / O.hilfeVoll);
        // Richtung (heading wächst = links): in Lenkrichtung eindrehen (Lenkung rechts > 0 → Drehimpuls negativ);
        // sonst Querbewegung; sonst deterministisch aus der Position (Fleck-Einfahrt)
        const lenk = (s && s.lenkung) || this.lenkung || 0;
        let vz;
        if (Math.abs(lenk) > O.lenkSchwelle) vz = -Math.sign(lenk);
        else if (Math.abs(this.vQuer) > O.querSchwelle) vz = -Math.sign(this.vQuer);
        else vz = (Math.floor(this.x * O.hashX + this.z * O.hashZ) & 1) ? 1 : -1;
        const neuImp = vz * O.impuls * f;
        // schon vorhandene (größere) Drehung nicht abschwächen
        if (Math.abs(neuImp) > Math.abs(this.drehImpuls)) {
          this.drehImpuls = neuImp; this.drehLenk = O.lenkung; this.drehAb = O.abklingen; this.drehErhalt = O.weltErhalt;
        }
      } else if (neu === 'sandFleck' && SC.sand) {
        if (this.vLaengs > SC.sand.vMin) this.vLaengs *= SC.sand.tempoFaktor;
      }
    }

    /** Haftung gesamt (Auto × Untergrund × Bonus), 0..1. */
    gripGesamt(untergrund) {
      const U = R.config.physik.untergrund;
      const ug = U[untergrund || this.untergrund] || U.strasse;
      return Math.min(1, this.daten.grip * ug.grip * this.gripBonus * this.umweltGrip);
    }

    /**
     * Mögliche Querbeschleunigung (m/s²) bei Tempo v: querGrip × Haftung × (1 + v/abtriebTempo).
     * Auch für die KI-Tempoplanung (ai/driver.js) – dieselbe Formel, damit Plan und Physik passen.
     */
    querBeschleunigungMax(v, untergrund) {
      const P = R.config.physik;
      return P.querGrip * this.gripGesamt(untergrund) * (1 + Math.abs(v) / P.abtriebTempo);
    }

    /**
     * Größte Drehrate (rad/s) bei Volleinschlag im aktuellen Zustand (bzw. Tempo v).
     * Langsam begrenzt die Wendigkeit, schnell die Querhaftung (aQuer/v) – Runde 5: aber nie unter einer
     * Arcade-Untergrenze (rateVmax … rateHalb rad/s × √(Wendigkeit/Bezug)), linear über den Tempo-Anteil
     * (vMax: rateVmax, 50 % vMax: rateHalb). Über der Haftgrenze rutscht das Auto dafür nach außen (schritt()).
     */
    drehrateMax(v) {
      const t = Math.abs(v === undefined ? this.vLaengs : v);
      const r = this._drehrateAuf(t, this.untergrund);
      // v32 (N2): abseits (Gras/Sand) nie unter mindest × Asphalt-Drehrate (gleiches Auto/Tempo/Schaden) – kindgerecht lenkbar
      const LA = this.abseitsLenkung();
      return LA ? Math.max(r, LA.mindest * this._drehrateAuf(t, 'strasse')) : r;
    }

    /** v32 (N2): config.physik.lenkung.abseits, wenn das Auto auf Gras/Sand (Untergrund mit vMaxAbs) steht, sonst null. */
    abseitsLenkung() {
      const LK = R.config.physik.lenkung, ug = R.config.physik.untergrund[this.untergrund];
      return LK && LK.abseits && ug && ug.vMaxAbs !== undefined ? LK.abseits : null;
    }

    /** Drehrate bei Volleinschlag auf Untergrund `untergrund` (Formel bis v31 = drehrateMax). */
    _drehrateAuf(t, untergrund) {
      const grip = this.gripGesamt(untergrund);
      const langsam = this.daten.wendigkeit * (0.55 + 0.45 * grip) * Math.min(1, t / 4);
      const haft = this.querBeschleunigungMax(t, untergrund) / Math.max(t, 0.5);
      const LK = R.config.physik.lenkung;
      if (!LK) return Math.min(langsam, haft);
      // Untergrenze in rad/s für ein Auto mit Bezugs-Wendigkeit (langsam = LK.bezug), andere Autos × √(langsam/bezug)
      // (gestaucht: der wendige Mini dreht bei vMax nicht weg, der Bus bleibt nicht träge)
      const tA = Math.min(1, t / this.daten.vMax);
      const voll = this.daten.wendigkeit * (0.55 + 0.45 * grip);
      const arcade = (LK.rateVmax + (LK.rateHalb - LK.rateVmax) * 2 * (1 - tA)) * Math.sqrt(voll / LK.bezug);
      return Math.min(langsam, Math.max(haft, arcade));
    }

    /** Höchsttempo auf einem Untergrund (m/s). */
    vMaxAuf(untergrund) {
      const U = R.config.physik.untergrund;
      const ug = U[untergrund] || U.strasse;
      // Deckel per Feld; ohne Feld aus der Haftung (wie vor Runde 3): 0,25 + 0,75·grip²
      const vf = ug.vMaxFaktor !== undefined ? ug.vMaxFaktor : (0.25 + 0.75 * ug.grip * ug.grip);
      let v = this.daten.vMax * vf;
      if (ug.vMaxAbs) v = Math.min(v, ug.vMaxAbs);
      return v;
    }

    /** Auto an eine Stelle setzen (Start, Reset). */
    setzen(x, z, heading) {
      this.x = x; this.z = z; this.heading = heading;
      this.vLaengs = 0; this.vQuer = 0; this.lenkung = 0; this.neigung = 0; this.nicken = 0; this._querBeschl = 0;
      this.drehImpuls = 0; this.drehLenk = undefined; this.drehAb = undefined; this.drehErhalt = undefined; this._ugAlt = undefined; this._kollAlt = null;   // Runde 6: keine Drehung/kein Sweep über einen Reset hinweg
    }
  }

  Vehicle.winkelDiff = winkelDiff;
  /** Runde 5: Tempo-Klasse, wenn new Vehicle() keine Option bekommt (null = Katalogwerte; Tests setzen sie). */
  Vehicle.klasseStandard = null;
  R.Vehicle = Vehicle;
})();
