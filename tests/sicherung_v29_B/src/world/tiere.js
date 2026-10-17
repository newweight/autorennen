// ============================================================
// 16.10. (v28 W10) Tiere queren die Straße – Kühe, Rehe, Bären, Dinos … (Wunsch des Vaters:
//   „Je nach Strecke queren Kühe, Rehe, Bären, Dinos die Straße, manchmal auch nicht auf direktem Weg, sondern schräg.“)
//
// ADD-ON, Einstellung `tiere` (Menü/Lobby, Standard AN, abschaltbar). Ohne die Einstellung bleibt alles wie bisher (nichts wird angelegt).
// Nicht zu verwechseln mit den alten Wildtieren der Dino-Welt (dynamik.js, Katalog `tiere`): die laufen weiter wie vorher.
//
//   Tierarten je Strecke: Wiese Kühe (schwarz-weiß) · Wald Rehe (braun, schnell, Gruppen 1–3) · Alpen Bären (braun, langsam) und gelegentlich
//   Steinböcke · Dino kleine grüne Dinos (hüpfend) · Wüste Kamele · Fantasie Einhörner (bunt) · Megastrecke je Abschnitt nach Herkunftsstrecke.
//   Low-Poly aus Boxen/Zylindern, Beine pendeln (Vertex-Shader, Hüftpunkt je Bein im Vertex), EIN Draw-Call je Tierart (InstancedMesh), keine Lichter.
//
//   Verhalten: ein Tier (bzw. eine Gruppe) erscheint hinter Bande/Zaun, läuft über die Straße zum anderen Rand (gerade oder schräg, Winkel 20–70°
//   zur Fahrbahn, Seed), Kühe bleiben manchmal stehen, drüben verschwindet es. Etwa alle 60–90 s Rennzeit ein Auftritt, nur auf freien
//   Abschnitten (nie Kreuzung, Gabelung, Looping, Schanze, Brücke, Tunnel, Start/Ziel ± 80 m, Werkstatt, Tribüne, harte Hindernisse), nie näher als 40 m
//   an einem Auto und nie direkt vor einem heranfahrenden Auto (Erscheinen wartet). Kontakt = weicher Stoß wie ein Strohballen (Tempo −30 %, kleiner
//   Hüpfer, KEIN Schaden, kein Blut): das Tier erschrickt und rennt davon. Die KI sieht Tiere als bewegliches Hindernis (wie Verkehr.andereFuer).
//
// Schnittstelle (wie Verkehr):
//   Tiere.ausEinstellung(e)                     true, wenn e.tiere !== false (Menü/Spiel: Standard an)
//   new R.Tiere(spiel)  einsetzen(strecke, teilnehmerAnzahl, { seed })     Plätze (Slots) je Tierart anlegen, Sperrzonen berechnen
//   schritt(dt, laeuft)                         Auftritte, Bewegung, Fliehen, Verschwinden (je Physikschritt, nur Server/offline)
//   kollisionen(fahrzeuge)                      weiche Stöße [{ nr, typ: 'tier', art, emoji, staerke }], ändert Tempo der Autos (v28c A2: Spieler, KI, Streifenwagen und Verkehrswagen; geparkte = ausgeschieden zählen nicht)
//   andereFuer(liste)                           aktive Tiere als „andere“ für die KI (nur .vehicle + tier:true, vx/vz = Bewegung; v28c: auch für Streifenwagen, polizei.js)
//   zustandKodieren() / zustandAnwenden(z)      Server → Client (Protokoll: zustand.ti, 14 Zahlen je Platz wie `vk`), siehe server/PROTOKOLL.md
//   bauen() / animieren()                       Grafik (nur Browser): THREE.Group mit einem InstancedMesh je Tierart
//   zerstoeren()
// ============================================================
(function () {
  const R = window.Rennspiel;

  const STANDARD = {
    standardAn: true,
    abstand: [60, 90],          // s Rennzeit zwischen zwei Auftritten (Erwartung 75 s)
    erster: [20, 45],           // s bis zum ersten Auftritt
    vorne: [140, 420],          // m vor einem Spieler (Anker) wird die Querungsstelle gesucht
    versuche: 10,               // Kandidaten je Auftritt
    wiederholung: 0.5,          // s bis zum nächsten Versuch, wenn nichts frei war
    geradeAnteil: 0.4,          // Anteil gerade (90°) querender Tiere, der Rest schräg
    winkel: [20, 70],           // Grad zur Fahrbahn (schräg)
    aussen: 5.5,                // m hinter dem Fahrbahnrand (Rand + Bande), dort erscheint/verschwindet das Tier
    sperrZugabe: 30,            // m Sicherheitsrand um die Sperrzonen (der ganze Weg inkl. Zugabe liegt frei)
    freiAbstand: 40,            // m: so nah darf beim Erscheinen kein Auto sein
    voraus: 1.3,                // s: kein Auto, das in dieser Zeit (zusätzlich zu freiAbstand) den Weg erreicht
    tempoFaktor: 0.7,           // Kontakt: Tempo × 0,7 (= −30 %)
    huepfer: 1.0,               // kleiner Hüpfer des Autos (wie huepfer bei Strohballen/Dino)
    fliehFaktor: 2.4,           // erschrocken: Tempo × 2,4
    fliehMin: 6,                // …mindestens m/s
    lebenMax: 90,               // s: ein Tier ist spätestens dann weg
    kurveMax: 0.6,              // Weg wird verworfen, wenn Krümmung × Weg-q darüber (enge Kurve)
    steinbockAnteil: 0.25,      // Alpen: Anteil Steinböcke statt Bären
    erschreckAbstand: 16,       // stehendes Tier geht weiter, wenn ein schnelles Auto so nah kommt
    zonenAbstand: 40,           // m Zugabe um dynamische Stellen (Strohballen, Bälle, Fontänen, alte Wildtiere)
  };
  function cfg() {
    const c = (R.config && R.config.tierverkehr) || {};
    return Object.assign({}, STANDARD, c);
  }

  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  function winkelNorm(w) { if (!(Math.abs(w) < 1e3)) w = Number.isFinite(w) ? w % (2 * Math.PI) : 0; while (w > Math.PI) w -= 2 * Math.PI; while (w < -Math.PI) w += 2 * Math.PI; return w; }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashText(t) { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  const rd = (x, n) => { const m = Math.pow(10, n); return Math.round(x * m) / m; };

  // ------------------------------------------------------------
  // Tierarten
  // ------------------------------------------------------------
  // tempo [min, max] m/s · gruppe: Gewichte für 1, 2, 3 Tiere · schritt: m je Beinzyklus · beinAmp: Beinschwung (rad) · hop: Hüpfhöhe (m) ·
  // kreise: Kontaktkreise längs der Laufrichtung (m), r Radius · steht: Wahrscheinlichkeit, mitten auf dem Weg kurz zu stehen · plaetze: Slots
  const ARTEN = {
    kuh:       { name: 'Kuh', emoji: '🐄', tempo: [2.4, 3.0], gruppe: [1], schritt: 2.4, beinAmp: 0.5, hop: 0, kreise: [-0.65, 0.65], r: 0.6, steht: 0.6, stehZeit: [1.6, 3.6], plaetze: 2, skala: 1 },
    reh:       { name: 'Reh', emoji: '🦌', tempo: [6.2, 7.8], gruppe: [0.45, 0.35, 0.2], schritt: 3.2, beinAmp: 0.75, hop: 0.45, kreise: [-0.4, 0.4], r: 0.45, steht: 0, plaetze: 6, skala: 1 },
    baer:      { name: 'Bär', emoji: '🐻', tempo: [3.0, 3.8], gruppe: [1], schritt: 2.6, beinAmp: 0.45, hop: 0.06, kreise: [-0.7, 0.1, 0.85], r: 0.7, steht: 0, plaetze: 2, skala: 1 },
    steinbock: { name: 'Steinbock', emoji: '🐐', tempo: [5.0, 6.0], gruppe: [0.6, 0.4], schritt: 2.6, beinAmp: 0.6, hop: 0.3, kreise: [-0.4, 0.4], r: 0.45, steht: 0, plaetze: 3, skala: 1 },
    dino:      { name: 'Dino', emoji: '🦕', tempo: [3.8, 4.6], gruppe: [0.7, 0.3], schritt: 3.0, beinAmp: 0.8, hop: 0.55, kreise: [-0.35, 0.45], r: 0.55, steht: 0, plaetze: 4, skala: 1 },
    kamel:     { name: 'Kamel', emoji: '🐫', tempo: [2.9, 3.5], gruppe: [1], schritt: 3.4, beinAmp: 0.45, hop: 0.04, kreise: [-0.85, 0.1, 0.95], r: 0.65, steht: 0.3, stehZeit: [1.2, 2.4], plaetze: 2, skala: 1 },
    einhorn:   { name: 'Einhorn', emoji: '🦄', tempo: [4.6, 5.4], gruppe: [1], schritt: 3.6, beinAmp: 0.65, hop: 0.25, kreise: [-0.65, 0.65], r: 0.55, steht: 0, plaetze: 2, skala: 1 },
  };
  const ART_FOLGE = ['kuh', 'reh', 'baer', 'steinbock', 'dino', 'kamel', 'einhorn'];
  const THEMA_ART = { wiese: 'kuh', wald: 'reh', alpen: 'baer', dino: 'dino', wueste: 'kamel', fantasie: 'einhorn' };

  /** Tierarten einer Strecke (feste Reihenfolge): Menge der Arten, die dort vorkommen können. */
  function artenFuer(strecke) {
    const id = (strecke && (strecke.id || (strecke.daten && strecke.daten.id))) || 'wiese';
    const set = new Set();
    if (id === 'mega' || (strecke && strecke.mega) || (strecke && strecke.daten && strecke.daten.mega)) {
      const sek = (R.Mega && R.Mega.info && R.Mega.info.sektionen) || [];
      sek.forEach((s) => { set.add(THEMA_ART[s.id] || 'kuh'); if (s.id === 'alpen') set.add('steinbock'); });
      if (!set.size) set.add('kuh');
    } else {
      set.add(THEMA_ART[id] || 'kuh');
      if (id === 'alpen') set.add('steinbock');
    }
    return ART_FOLGE.filter((a) => set.has(a));
  }
  /** Tierart an Bogenlänge s (nur die Megastrecke wechselt je Abschnitt). rnd01 wählt den Steinbock in den Alpen. */
  function artBei(strecke, s, rnd01, C) {
    const id = (strecke && (strecke.id || (strecke.daten && strecke.daten.id))) || 'wiese';
    let basis = THEMA_ART[id] || 'kuh';
    if (id === 'mega' || (strecke && strecke.mega) || (strecke && strecke.daten && strecke.daten.mega)) {
      const sek = (R.Mega && R.Mega.info && R.Mega.info.sektionen) || [];
      const ab = sek.find((x) => s >= x.s0 && s < x.s1);
      basis = ab ? (THEMA_ART[ab.id] || 'kuh') : 'kuh';
      if (ab && ab.id === 'alpen' && rnd01 < C.steinbockAnteil) return 'steinbock';
      return basis;
    }
    if (id === 'alpen' && rnd01 < C.steinbockAnteil) return 'steinbock';
    return basis;
  }

  // ------------------------------------------------------------
  // Sperrzonen (rein): Verkehr.sperrzonen + Gabelung, Tribüne, Werkstatt, dynamische Stellen
  // ------------------------------------------------------------
  function sperrzonen(strecke, spiel) {
    const C = cfg(), sp = strecke.spline, L = sp.laenge;
    const basis = R.Verkehr && R.Verkehr.sperrzonen ? R.Verkehr.sperrzonen(strecke, { startFrei: 80, zielFrei: 80 }) : [[-80, 80]];
    const roh = basis.map((z) => [z[0], z[1]]);
    const add = (a, b) => {
      if (!(b > a)) return;
      if (b - a >= L) { roh.push([0, L]); return; }
      const a2 = ((a % L) + L) % L, e = a2 + (b - a);
      if (e <= L) roh.push([a2, e]); else { roh.push([a2, L]); roh.push([0, e - L]); }
    };
    (strecke.gabelungen || []).forEach((g) => add(g.s0 - 40, g.s1 + 40));
    (strecke.tribuenen || []).forEach((t) => add(t.s - (t.laenge || 40) / 2 - 40, t.s + (t.laenge || 40) / 2 + 40));
    // v28b Gegenlesen F2: Mega hat mehrere Werkstätten (plaetze), sonst platz
    const wks = spiel && spiel.werkstatt ? (spiel.werkstatt.plaetze || [spiel.werkstatt.platz]) : [];
    wks.forEach((wk) => { if (wk && typeof wk.s === 'number') add(wk.s - (wk.laenge || 40) / 2 - 60, wk.s + (wk.laenge || 40) / 2 + 60); });
    const dyn = (liste, vor, nach) => (liste || []).forEach((e) => { if (e && typeof e.s === 'number') add(e.s - vor, e.s + nach); else if (e && typeof e.s0 === 'number' && typeof e.s1 === 'number') add(e.s0 - vor, e.s1 + nach); });
    // v28b Gegenlesen F1: dynamische Stellen liegen in strecke.daten (wie dynamik.js), Fallback strecke[k]
    const D = strecke.daten || {};
    ['strohballen', 'baelle', 'wasserstrahlen', 'dinos', 'schanzen', 'kleber'].forEach((k) => dyn(D[k] || strecke[k], C.zonenAbstand, C.zonenAbstand));
    dyn((strecke.katalog || {}).tiere, C.zonenAbstand, C.zonenAbstand);
    roh.sort((x, y) => x[0] - y[0]);
    const erg = [];
    roh.forEach((z) => {
      const l = erg[erg.length - 1];
      if (l && z[0] <= l[1]) l[1] = Math.max(l[1], z[1]); else erg.push([z[0], z[1]]);
    });
    return erg;
  }
  function gesperrt(zonen, s, zugabe) {
    const z = zugabe || 0;
    for (let i = 0; i < zonen.length; i++) if (s >= zonen[i][0] - z && s <= zonen[i][1] + z) return true;
    return false;
  }
  /** Liegt der Weg [sA, sB] (Bogenlänge, ggf. um die Rundenlänge verschoben) samt Zugabe in einer Sperrzone? */
  function wegGesperrt(zonen, L, sA, sB, zugabe) {
    const a = Math.min(sA, sB), b = Math.max(sA, sB);
    const n = Math.max(2, Math.ceil((b - a) / 8));
    for (let i = 0; i <= n; i++) {
      const s = ((a + (b - a) * i / n) % L + L) % L;
      if (gesperrt(zonen, s, zugabe)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------
  // Tiere (Logik)
  // ------------------------------------------------------------
  class Tiere {
    constructor(spiel) {
      this.spiel = spiel; this.strecke = null; this.n = 0;
      this.c = cfg();
      this.arten = [];            // Tierarten dieser Strecke (feste Reihenfolge)
      this.slots = [];            // Plätze: { k, art, aktiv, reserviert, tier, x,z,y,heading,vLaengs,lenkung,nicken,neigung, flags, netReset }
      this.block = {};            // art → [von, bis) in slots
      this.tiere = [];            // lebende Tiere (auch noch wartende Gruppenmitglieder)
      this.zeit = 0; this.naechster = 0; this.zaehler = 0; this.auftritte = 0; this.versuche = 0; this.nurAnzeige = false;
      this.stoesseGesamt = 0; this.statistik = { auftritte: 0, wartet: 0, getroffen: 0, verworfen: 0 };
      this._andere = []; this._gfx = null;
    }

    static ausEinstellung(e) { const c = cfg(); return e && typeof e.tiere === 'boolean' ? e.tiere : c.standardAn !== false; }
    static arten() { return ARTEN; }
    static artenFuer(strecke) { return artenFuer(strecke); }

    /** Plätze anlegen, Sperrzonen berechnen. opt.seed: Zufallssaat (offline je Rennen anders, online vom Server). */
    einsetzen(strecke, teilnehmerAnzahl, opt) {
      const o = opt || {};
      this.strecke = strecke; this.n = teilnehmerAnzahl; this.c = cfg();
      this.seed = [strecke.id || strecke.name || 'strecke', strecke.variante || '', strecke.welt || '', teilnehmerAnzahl, o.seed === undefined ? '' : o.seed].join('|');
      this.rnd = mulberry32(hashText('tiere|' + this.seed));
      this.arten = artenFuer(strecke);
      this.slots = []; this.block = {};
      this.arten.forEach((a) => {
        const von = this.slots.length;
        for (let i = 0; i < ARTEN[a].plaetze; i++) {
          this.slots.push({ k: this.slots.length, art: a, aktiv: false, reserviert: false, tier: null, x: 0, z: 0, y: 0, heading: 0, vLaengs: 0, lenkung: 0, nicken: 0, neigung: 1, flags: 0, netReset: 0, ki: null, kiAndere: null });
        }
        this.block[a] = [von, this.slots.length];
      });
      this.L = strecke.spline.laenge;
      this.zonen = sperrzonen(strecke, this.spiel);
      this.tiere = []; this.zeit = 0; this.zaehler = 0;
      const e = this.c.erster;
      this.naechster = e[0] + this.rnd() * (e[1] - e[0]);
      return this.slots.length;
    }

    // ---------- Planung eines Auftritts ----------
    _ankerS() {
      const sp = this.strecke.spline, fz = this.spiel.fahrzeuge;
      const menschen = [];
      for (let i = 0; i < this.n && i < fz.length; i++) { const f = fz[i]; if (f && f.istSpieler && !f.ausgeschieden) menschen.push(f); }
      const liste = menschen.length ? menschen : fz.slice(0, this.n).filter((f) => f && !f.ausgeschieden);
      if (!liste.length) return null;
      const f = liste[this.zaehler % liste.length], v = f.vehicle;
      if (f.nah && typeof f.nah.s === 'number') return f.nah.s;
      return sp.naechster(v.x, v.z, f.index >= 0 ? f.index : undefined).s;
    }

    /** Ist (x, z) frei von Autos (≥ freiAbstand) und liegt kein heranfahrendes Auto in Reichweite? */
    _frei(x, z) {
      const C = this.c, fz = this.spiel.fahrzeuge;
      for (let i = 0; i < fz.length; i++) {
        const f = fz[i];
        if (!f || f.ausgeschieden || !f.vehicle) continue;
        const v = f.vehicle, dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz);
        if (d < C.freiAbstand) return false;
        const w = v.weltGeschwindigkeit ? v.weltGeschwindigkeit() : { x: 0, z: 0 }, sp = Math.hypot(w.x, w.z);
        if (sp > 3) {
          const voraus = (dx * w.x + dz * w.z) / sp;
          const quer = Math.abs(dx * w.z - dz * w.x) / sp;
          if (voraus > 0 && voraus < C.freiAbstand + sp * C.voraus && quer < 16) return false;
        }
      }
      return true;
    }

    _welt(s, q) {
      const st = this.strecke, p = st.spline.punktBei(s);
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      const bh = (st.breiteBei ? st.breiteBei(p.s) : st.breite) / 2;
      let y;
      try { y = st.hoeheBeiS ? st.hoeheBeiS(p.s, q) : st.hoeheAn(x, z); } catch (e) { y = p.y; }
      if (Math.abs(q) <= bh + 0.2) y += 0.06;      // sichtbarer Asphalt liegt 6 cm über der Rechenhöhe
      return { x, z, y, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, kr: p.kruemmung || 0, s: p.s, bh };
    }

    /** Neuen Auftritt planen. Rückgabe true = Gruppe angelegt. */
    _auftritt() {
      const C = this.c, st = this.strecke, L = this.L, rnd = this.rnd;
      const sA = this._ankerS();
      if (sA === null) return false;
      this.zaehler++;
      for (let v = 0; v < C.versuche; v++) {
        const weit = 1 + (v >= 6 ? (v - 5) * 0.4 : 0);
        const sM0 = sA + (C.vorne[0] + rnd() * (C.vorne[1] - C.vorne[0])) * weit;
        const sM = ((sM0 % L) + L) % L;
        const art = artBei(st, sM, rnd(), C);
        if (!ARTEN[art] || this.block[art] === undefined) continue;
        const AR = ARTEN[art];
        // Gruppe
        let anzahl = 1;
        if (AR.gruppe.length > 1) { let r = rnd(), k = 0; while (k < AR.gruppe.length - 1 && r >= AR.gruppe[k]) { r -= AR.gruppe[k]; k++; } anzahl = k + 1; }
        // Weg: gerade oder schräg
        const w = this._welt(sM, 0);
        const aussen = w.bh + (st.randBreite || 1.5) + C.aussen;
        const von = rnd() < 0.5 ? -1 : 1, gerade = rnd() < C.geradeAnteil;
        const alpha = gerade ? Math.PI / 2 : (C.winkel[0] + rnd() * (C.winkel[1] - C.winkel[0])) * Math.PI / 180;
        const dirS = rnd() < 0.5 ? -1 : 1;
        const dsGes = gerade ? 0 : 2 * aussen / Math.tan(alpha) * dirS;
        const s0 = sM - dsGes / 2, s1 = sM + dsGes / 2;
        const sa = Math.min(s0, s1) - 6, sb = Math.max(s0, s1) + 6;
        if (wegGesperrt(this.zonen, L, sa, sb, C.sperrZugabe)) { this.statistik.verworfen++; continue; }
        // enge Kurve? (Weg in (s, q) würde sich verbiegen)
        let kurvig = false;
        for (let i = 0; i <= 4; i++) { const kk = this._welt(s0 + (s1 - s0) * i / 4, 0).kr; if (Math.abs(kk) * aussen > C.kurveMax) { kurvig = true; break; } }
        if (kurvig) { this.statistik.verworfen++; continue; }
        // frei von Autos? (Start, Mitte, Ende)
        const pA = this._welt(s0, von * aussen), pM = this._welt(sM, 0), pE = this._welt(s1, -von * aussen);
        if (!this._frei(pA.x, pA.z) || !this._frei(pM.x, pM.z) || !this._frei(pE.x, pE.z)) { this.statistik.verworfen++; continue; }
        // Plätze + Tiere anlegen
        if (!this._gruppeAnlegen(art, anzahl, s0, von, aussen, alpha, dirS, w.bh)) { this.statistik.verworfen++; continue; }
        this.statistik.auftritte++;
        return true;
      }
      return false;
    }

    /** Gruppe anlegen (Plätze reservieren, Tiere warten gestaffelt). false = nicht genug freie Plätze. */
    _gruppeAnlegen(art, anzahl, s0, von, aussen, alpha, dirS, bh) {
      const AR = ARTEN[art], rnd = this.rnd, [b0, b1] = this.block[art], frei = [];
      for (let k = b0; k < b1; k++) if (!this.slots[k].aktiv && !this.slots[k].reserviert) frei.push(k);
      if (frei.length < anzahl) return false;
      let wartet = 0;
      for (let m = 0; m < anzahl; m++) {
        const tempo = AR.tempo[0] + rnd() * (AR.tempo[1] - AR.tempo[0]);
        const sv = (rnd() - 0.5) * 3, qv = (rnd() - 0.5) * 2;
        const t = { id: ++this.auftritte, art, slot: frei[m], s: s0 + sv, q: von * aussen + qv * 0.5, qZiel: -von * aussen, von,
          vs: dirS * tempo * Math.cos(alpha), vq: -von * tempo * Math.sin(alpha), tempo, faktor: 1, ziel: 1,
          warte: wartet, zeit: 0, phase: rnd() * 6.283, heading: 0, zustand: 'wartet', stehtNoch: 0, stehBei: AR.steht && rnd() < AR.steht ? 0.25 + rnd() * 0.5 : -1, schonGestanden: false,
          stehDauer: AR.stehZeit ? AR.stehZeit[0] + rnd() * (AR.stehZeit[1] - AR.stehZeit[0]) : 0,
          getroffen: new Set(), alpha, anfangQ: von * aussen, groesse: 0, wx: 0, wz: 0, bh };
        wartet += 0.7 + rnd() * 0.8;
        this.slots[t.slot].reserviert = true; this.slots[t.slot].tier = t;
        this.tiere.push(t);
      }
      return true;
    }

    /**
     * Test-/Bild-Hilfe: einen Auftritt an Bogenlänge sM erzwingen (ohne Sperrzonen-/Abstandsprüfung, Tiere erscheinen sofort).
     * o = { art?, sM, von: ±1, winkel (Grad, 90 = gerade), richtung: ±1 (Längsrichtung bei schrägem Weg), anzahl? }
     * @returns {object[]} die Tiere der Gruppe
     */
    erzwingen(o) {
      const st = this.strecke, w = this._welt(o.sM, 0), art = o.art || this.arten[0];
      const aussen = w.bh + (st.randBreite || 1.5) + this.c.aussen, alpha = (o.winkel === undefined ? 90 : o.winkel) * Math.PI / 180, dirS = o.richtung || 1;
      const dsGes = Math.abs(alpha - Math.PI / 2) < 1e-6 ? 0 : 2 * aussen / Math.tan(alpha) * dirS;
      const vorher = this.tiere.length;
      if (!this._gruppeAnlegen(art, o.anzahl || 1, o.sM - dsGes / 2, o.von || 1, aussen, alpha, dirS, w.bh)) return null;
      const neu = this.tiere.slice(vorher);
      neu.forEach((t) => { t.erzwungen = true; });      // Test-/Bild-Auftritt: nicht an die Sperrzonen gebunden
      const f = o.fortschritt || 0;      // 0 … 1: schon ein Stück auf dem Weg (für Bilder: Tier mitten auf der Straße)
      neu.forEach((t, i) => {
        t.warte = 0;
        if (f) { t.s += dsGes * f; t.q += -2 * t.von * aussen * f; t.groesse = 1; }
        if (i > 0) { const d = i * (ARTEN[art].r * 3.2) / (t.tempo || 1); t.s -= t.vs * d; t.q -= t.vq * d; }      // Gruppe hintereinander statt übereinander
        if (o.sofort !== false) { t.zustand = 'laeuft'; t.groesse = f ? 1 : t.groesse; this.slots[t.slot].aktiv = true; this.slots[t.slot].netReset++; this._pose(t, this._welt(t.s, t.q), true); }
      });
      this.statistik.auftritte++;
      return neu;
    }

    _aktivieren(t) {
      const sl = this.slots[t.slot];
      const w = this._welt(t.s, t.q);
      if (!this._frei(w.x, w.z)) { t.warte = 0.3; t.wartetN = (t.wartetN || 0) + 1; if (t.wartetN > 16) this._entfernen(t); return; }
      t.zustand = 'laeuft'; t.zeit = 0;
      sl.aktiv = true; sl.netReset++;
      this._pose(t, w, true);
    }

    _entfernen(t) {
      const sl = this.slots[t.slot];
      sl.aktiv = false; sl.reserviert = false; sl.tier = null; sl.flags = 0; sl.vLaengs = 0;
      sl.x = 0; sl.z = 0; sl.y = -100;
      const i = this.tiere.indexOf(t);
      if (i >= 0) this.tiere.splice(i, 1);
    }

    /** Pose des Tiers in den Platz schreiben. erster: Richtung sofort aus der Geschwindigkeit. */
    _pose(t, w, erster) {
      const sl = this.slots[t.slot], AR = ARTEN[t.art];
      // Weltgeschwindigkeit: Tangente × vs·f + Normale × vq·f
      const f = t.faktor;
      t.wx = (w.tx * t.vs + w.nx * t.vq) * f; t.wz = (w.tz * t.vs + w.nz * t.vq) * f;
      const sp = Math.hypot(t.wx, t.wz);
      if (sp > 0.05) {
        const h = R.headingAus ? R.headingAus(t.wx, t.wz) : Math.atan2(-t.wx, -t.wz);
        t.heading = erster ? h : t.heading + winkelNorm(h - t.heading) * Math.min(1, 0.5);
      } else if (erster) {
        const h = R.headingAus ? R.headingAus(w.tx * t.vs + w.nx * t.vq, w.tz * t.vs + w.nz * t.vq) : 0; t.heading = h;
      }
      const v = sp;
      const bewegt = klemme(v / Math.max(0.5, t.tempo), 0, 1.6);
      const hop = AR.hop * Math.abs(Math.sin(t.phase * 0.5)) * Math.min(1, bewegt);
      sl.x = w.x; sl.z = w.z; sl.y = w.y; sl.heading = t.heading; sl.vLaengs = v; sl.lenkung = t.phase; sl.nicken = hop;
      sl.neigung = t.groesse;
      sl.flags = 2 | (t.zustand === 'steht' ? 4 : 0) | (t.zustand === 'flieht' ? 8 : 0);
    }

    // ---------- Schritt ----------
    /** Je Physikschritt (nur Server und offline). laeuft = Rennen läuft (Gas erlaubt). */
    schritt(dt, laeuft) {
      if (!this.strecke || this.nurAnzeige) return;
      const C = this.c;
      if (laeuft) {
        this.zeit += dt;
        this.naechster -= dt;
        if (this.naechster <= 0) {
          if (this._auftritt()) { const a = C.abstand; this.naechster = a[0] + this.rnd() * (a[1] - a[0]); }
          else this.naechster = C.wiederholung;
        }
      }
      for (let i = this.tiere.length - 1; i >= 0; i--) {
        const t = this.tiere[i];
        if (t.zustand === 'wartet') {
          if (!laeuft) continue;
          t.warte -= dt;
          if (t.warte <= 0) this._aktivieren(t);
          continue;
        }
        this._bewegen(t, dt, i);
      }
    }

    _bewegen(t, dt, idx) {
      const C = this.c, AR = ARTEN[t.art];
      t.zeit += dt;
      t.groesse = Math.min(1, t.groesse + dt / 0.6);           // weich erscheinen
      // Stehen (Kuh/Kamel): einmal, mitten auf dem Weg
      const lauf = Math.abs(t.q - t.anfangQ) / Math.max(1e-6, Math.abs(t.qZiel - t.anfangQ));        // 0 … 1 Fortschritt quer
      if (t.zustand === 'laeuft' && t.stehBei >= 0 && !t.schonGestanden && lauf >= t.stehBei) {
        t.zustand = 'steht'; t.schonGestanden = true; t.stehtNoch = t.stehDauer; t.ziel = 0;
      }
      if (t.zustand === 'steht') {
        t.stehtNoch -= dt;
        // ein schnelles Auto nähert sich: weitergehen
        let erschreckt = false;
        const fz = this.spiel.fahrzeuge, sl = this.slots[t.slot];
        for (let i = 0; i < this.n && i < fz.length; i++) {
          const f = fz[i]; if (!f || f.ausgeschieden || !f.vehicle) continue;
          const dx = f.vehicle.x - sl.x, dz = f.vehicle.z - sl.z;
          if (dx * dx + dz * dz < C.erschreckAbstand * C.erschreckAbstand && Math.abs(f.vehicle.vLaengs) > 8) { erschreckt = true; break; }
        }
        if (t.stehtNoch <= 0 || erschreckt) { t.zustand = 'laeuft'; t.ziel = 1; }
      }
      // weich beschleunigen/bremsen
      const da = 3.5 * dt;
      t.faktor += klemme(t.ziel - t.faktor, -da, da);
      t.s += t.vs * t.faktor * dt;
      t.q += t.vq * t.faktor * dt;
      t.phase += Math.max(0, Math.hypot(t.vs, t.vq) * t.faktor) * dt * 6.283 / AR.schritt;
      const w = this._welt(t.s, t.q);
      this._pose(t, w, false);
      // drüben angekommen / zu alt
      const ueber = (t.q - t.qZiel) * (Math.sign(t.qZiel - t.anfangQ) || 1) >= 0;
      if (ueber || t.zeit > C.lebenMax) { this._entfernen(t); return; }
      // erschrocken weggerannt: weit genug vom Fahrbahnrand → weg
      if (t.zustand === 'flieht' && Math.abs(t.q) > t.bh + 2.5 + (this.strecke.randBreite || 1.5) + 2) { this._entfernen(t); return; }
    }

    // ---------- Kontakt ----------
    /**
     * Weiche Stöße Auto ↔ Tier (nach den Fahrzeugschritten). Ändert nur das Tempo des Autos (−30 %, kleiner Hüpfer), KEIN Schaden.
     * @returns {{nr:number, typ:'tier', art:string, emoji:string, staerke:number}[]}
     */
    kollisionen(fahrzeuge) {
      const erg = [];
      if (!this.tiere.length) return erg;
      const C = this.c, kapsel = R.Kollisionen && R.Kollisionen.kapsel;
      for (let i = 0; i < fahrzeuge.length; i++) {
        const f = fahrzeuge[i], v = f && f.vehicle;
        if (!v || f.ausgeschieden || v.imLooping || v.imFlug) continue;      // v28c A2: auch Streifenwagen und Verkehrswagen (geparkte sind ausgeschieden)
        const ka = kapsel ? kapsel(v) : { rad: 0.9, kreise: [{ x: v.x, z: v.z }] };
        for (let k = 0; k < this.tiere.length; k++) {
          const t = this.tiere[k];
          if (t.zustand === 'wartet' || t.getroffen.has(i)) continue;
          const sl = this.slots[t.slot], AR = ARTEN[t.art];
          const gx = sl.x - v.x, gz = sl.z - v.z, gr = 2.2 + AR.r + (v.daten ? v.daten.laenge : 4.5);
          if (gx * gx + gz * gz > gr * gr) continue;
          const lx = -Math.sin(sl.heading), lz = -Math.cos(sl.heading);
          let treffer = false;
          for (let m = 0; m < AR.kreise.length && !treffer; m++) {
            const kx = sl.x + lx * AR.kreise[m], kz = sl.z + lz * AR.kreise[m];
            for (let c = 0; c < ka.kreise.length; c++) {
              const dx = kx - ka.kreise[c].x, dz = kz - ka.kreise[c].z, rr = ka.rad + AR.r;
              if (dx * dx + dz * dz < rr * rr) { treffer = true; break; }
            }
          }
          if (!treffer) continue;
          t.getroffen.add(i);
          const vorher = v.tempo;
          v.vLaengs *= C.tempoFaktor;
          v.vQuer *= 0.7;
          v.huepfer = Math.max(v.huepfer || 0, C.huepfer);
          this._erschrecken(t, v);
          this.statistik.getroffen++;
          erg.push({ nr: i, typ: 'tier', art: t.art, emoji: AR.emoji, staerke: Math.max(2, vorher * 0.35) });
        }
      }
      return erg;
    }

    /** Tier erschrickt: rennt zum nächsten Rand weg (quer zur Fahrtrichtung des Autos). */
    _erschrecken(t, v) {
      const C = this.c, AR = ARTEN[t.art], sl = this.slots[t.slot];
      const w = this._welt(t.s, t.q);
      const rx = sl.x - v.x, rz = sl.z - v.z;
      let seite = rx * w.nx + rz * w.nz >= 0 ? 1 : -1;            // Seite des Autos, von der das Tier wegläuft (in q)
      if (Math.abs(t.q) > w.bh + 0.5) seite = t.q >= 0 ? 1 : -1;  // schon neben der Fahrbahn: nach außen
      const tempo = Math.max(C.fliehMin, t.tempo * C.fliehFaktor);
      const rich = v.richtung ? v.richtung() : { x: 0, z: 0 };
      const vorwaerts = rich.x * w.tx + rich.z * w.tz >= 0 ? 1 : -1;
      t.vq = seite * tempo * 0.95; t.vs = vorwaerts * tempo * 0.3;
      t.qZiel = seite * (t.anfangQ !== 0 ? Math.abs(t.anfangQ) : 10);
      t.anfangQ = t.q;
      t.bh = w.bh;
      t.zustand = 'flieht'; t.ziel = 1; t.faktor = Math.max(t.faktor, 0.6); t.stehBei = -1;
      t.tempo = tempo;
    }

    // ---------- KI ----------
    /** Aktive Tiere als „andere“ für die KI anhängen (nur .vehicle, Markierung tier:true; v28c A1: die KI liest die Weltgeschwindigkeit vx/vz, sagt die Tierposition voraus und weicht hinter dem Tier vorbei aus bzw. bremst – driver.js _tierAusweichen). */
    andereFuer(liste) {
      let aktiv = 0;
      for (let k = 0; k < this.slots.length; k++) if (this.slots[k].aktiv) aktiv++;
      if (!aktiv) return liste;
      const a = this._andere; a.length = 0;
      for (let i = 0; i < liste.length; i++) a.push(liste[i]);
      for (let k = 0; k < this.slots.length; k++) {
        const sl = this.slots[k];
        if (!sl.aktiv) continue;
        const AR = ARTEN[sl.art];
        const ki = sl.ki || (sl.ki = { x: 0, z: 0, y: 0, heading: 0, vLaengs: 0, vQuer: 0, imLooping: false, imFlug: false, tier: true, vx: 0, vz: 0,
          daten: { laenge: 1.2, breite: 1.0 }, weltGeschwindigkeit() { return { x: this.vx, z: this.vz }; }, richtung() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; } });
        ki.x = sl.x; ki.z = sl.z; ki.y = sl.y; ki.heading = sl.heading;
        const t = sl.tier; ki.vx = t ? t.wx : 0; ki.vz = t ? t.wz : 0;
        ki.daten.laenge = AR.kreise[AR.kreise.length - 1] * 2 + AR.r; ki.daten.breite = AR.r * 2 + 0.6;
        a.push(sl.kiAndere || (sl.kiAndere = { vehicle: ki, istSpieler: false, tier: true, ausgeschieden: false }));
      }
      return a;
    }

    // ---------- Netz (Server → Client) ----------
    /** ti[k] = Platz k im Format von `a`/`vk` (14 Zahlen): x, z, y, richtung, tempo, beinphase, flags, hüpfhöhe, größe, 0, 0, 0, 0, resetZähler; 0 = leer. Hinten abgeschnitten. */
    zustandKodieren() {
      const erg = [];
      let letzter = -1;
      for (let k = 0; k < this.slots.length; k++) {
        const s = this.slots[k];
        if (s.aktiv) { erg.push([rd(s.x, 3), rd(s.z, 3), rd(s.y, 3), rd(s.heading, 4), rd(s.vLaengs, 2), rd(s.lenkung, 3), s.flags | 2, rd(s.nicken, 3), rd(s.neigung, 3), 0, 0, 0, 0, s.netReset]); letzter = k; }
        else erg.push(0);
      }
      erg.length = letzter + 1;
      return erg;
    }
    /** Client: Plätze aktiv/inaktiv + Flags aus einem Zustand (Liste ti; die Posen setzt NetzAnzeige.pose). */
    zustandAnwenden(z) {
      for (let k = 0; k < this.slots.length; k++) {
        const s = this.slots[k], e = z && z[k];
        const aktiv = !!(e && (e[6] & 2));
        if (aktiv !== s.aktiv) { s.aktiv = aktiv; if (!aktiv) { s.y = -100; } }
        s.flags = aktiv ? e[6] : 0;
      }
    }
    /** Client: Pose eines Platzes direkt aus einem Zustandseintrag (ohne Interpolation, beim Auftauchen). */
    poseAus(k, e) {
      const s = this.slots[k]; if (!s || !e) return;
      s.x = e[0]; s.z = e[1]; s.y = e[2]; s.heading = e[3]; s.vLaengs = e[4]; s.lenkung = e[5]; s.nicken = e[7]; s.neigung = e[8];
    }

    // ---------- Grafik ----------
    bauen() {
      if (typeof THREE === 'undefined' || !this.slots.length) return null;
      if (this._gfx) return this._gfx.gruppe;
      const g = new THREE.Group(); g.name = 'Tiere';
      const mat = TierGrafik.material();
      const meshes = {};
      this.arten.forEach((a) => {
        const geo = TierGrafik.geometrie(a), n = ARTEN[a].plaetze;
        geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
        const m = new THREE.InstancedMesh(geo, mat, n);
        m.count = 0; m.frustumCulled = false; m.name = 'Tier_' + a; m.userData.tierArt = a;
        g.add(m); meshes[a] = m;
      });
      this._gfx = { gruppe: g, meshes, mat };
      return g;
    }

    /** Matrizen der sichtbaren Tiere setzen (je Bild). */
    animieren() {
      const G = this._gfx; if (!G) return;
      const m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), pos = this._pos || (this._pos = new THREE.Vector3()), sk = this._sk || (this._sk = new THREE.Vector3()), ay = this._ay || (this._ay = new THREE.Vector3(0, 1, 0));
      for (const a of this.arten) {
        const mesh = G.meshes[a], [b0, b1] = this.block[a], AR = ARTEN[a], an = mesh.geometry.attributes.aAnim;
        let n = 0;
        for (let k = b0; k < b1; k++) {
          const s = this.slots[k];
          if (!s.aktiv) continue;
          const gr = Math.max(0.02, s.neigung) * AR.skala;
          pos.set(s.x, s.y + s.nicken, s.z);
          q.setFromAxisAngle(ay, s.heading + Math.PI / 2);
          sk.set(gr, gr, gr);
          m4.compose(pos, q, sk);
          mesh.setMatrixAt(n, m4);
          an.array[n * 2] = s.lenkung;
          an.array[n * 2 + 1] = AR.beinAmp * klemme(s.vLaengs / 2.2, 0, 1);
          n++;
        }
        if (mesh.count !== n) mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true; an.needsUpdate = true;
      }
    }

    /** Anzahl Draw-Calls der Tiere (ein InstancedMesh je Tierart). */
    drawCalls() { return this._gfx ? this.arten.length : 0; }
    vorkompilieren() { }

    zerstoeren() {
      const G = this._gfx;
      if (G) {
        if (G.gruppe.parent) G.gruppe.parent.remove(G.gruppe);
        Object.keys(G.meshes).forEach((a) => { G.meshes[a].geometry.dispose(); if (G.meshes[a].dispose) G.meshes[a].dispose(); });
        G.mat.dispose();
        this._gfx = null;
      }
      this.tiere = []; this.slots.forEach((s) => { s.aktiv = false; s.reserviert = false; s.tier = null; });
    }
  }

  // ------------------------------------------------------------
  // Grafik: Low-Poly-Modelle (Blick +x, Ursprung am Boden unter der Körpermitte), Beine mit Hüftpunkt im Vertex
  // ------------------------------------------------------------
  const TierGrafik = {
    _mat: null,
    material() {
      // EIN Material für alle Tierarten (ein Shader): Vertexfarben, flach schattiert, Beine schwingen um den Hüftpunkt (Attribut aBein = Vorzeichen, Hüfte x, y)
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 aBein;\nattribute vec2 aAnim;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
            'if (aBein.x != 0.0) { float wi = aBein.x * aAnim.y * sin(aAnim.x); float cw = cos(wi), sw = sin(wi); vec2 dh = transformed.xy - aBein.yz;' +
            ' transformed.xy = aBein.yz + vec2(cw * dh.x - sw * dh.y, sw * dh.x + cw * dh.y); }');
      };
      m.customProgramCacheKey = () => 'tiere_v28';
      return m;
    },
    /** Teile [{ geo, farbe, bein?: [vorzeichen, hx, hy] }] zu einer Geometrie (nicht indiziert, Vertexfarben, aBein). */
    vereinen(teile) {
      const flach = teile.map((t) => ({ g: t.geo.index ? t.geo.toNonIndexed() : t.geo, farbe: t.farbe, bein: t.bein }));
      const n = flach.reduce((a, t) => a + t.g.attributes.position.count, 0);
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), bein = new Float32Array(n * 3), c = new THREE.Color();
      let o = 0;
      flach.forEach(({ g, farbe, bein: b }) => {
        const k = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3);
        c.set(farbe);
        for (let i = 0; i < k; i++) {
          col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b;
          if (b) { bein[(o + i) * 3] = b[0]; bein[(o + i) * 3 + 1] = b[1]; bein[(o + i) * 3 + 2] = b[2]; }
        }
        o += k;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aBein', new THREE.BufferAttribute(bein, 3));
      geo.computeVertexNormals();
      return geo;
    },
    geometrie(art) {
      const box = (sx, sy, sz, x, y, z, farbe, rz, ry) => { const g = new THREE.BoxGeometry(sx, sy, sz); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); return { geo: g, farbe }; };
      const zyl = (r0, r1, l, x, y, z, farbe, rz) => { const g = new THREE.CylinderGeometry(r0, r1, l, 6); if (rz) g.rotateZ(rz); g.translate(x, y, z); return { geo: g, farbe }; };
      // Bein: von der Hüfte (hx, hy, hz) nach unten, Länge l, oben r0, unten r1, Huf; v = Schwingvorzeichen
      const bein = (hx, hy, hz, l, r0, r1, farbe, huf, v) => {
        const g = new THREE.CylinderGeometry(r0, r1, l, 6); g.translate(0, -l / 2, 0); g.translate(hx, hy, hz);
        const h = new THREE.BoxGeometry(r1 * 2.4, 0.07, r1 * 2.6); h.translate(hx + r1 * 0.4, hy - l + 0.035, hz);
        return [{ geo: g, farbe, bein: [v, hx, hy] }, { geo: h, farbe: huf, bein: [v, hx, hy] }];
      };
      const vier = (xv, xh, zo, hy, l, r0, r1, farbe, huf) =>
        [].concat(bein(xv, hy, zo, l, r0, r1, farbe, huf, 1), bein(xv, hy, -zo, l, r0, r1, farbe, huf, -1), bein(xh, hy, zo, l, r0, r1, farbe, huf, -1), bein(xh, hy, -zo, l, r0, r1, farbe, huf, 1));
      let T = [];
      if (art === 'kuh') {
        const w = 0xf4f2ec, s = 0x1d1d1f, ro = 0xe9b3b0;
        T = [box(2.0, 0.95, 0.85, 0, 1.2, 0, w), box(0.8, 0.05, 0.6, 0.2, 1.69, 0.12, s), box(0.04, 0.5, 0.45, -1.01, 1.4, -0.12, s), box(0.5, 0.05, 0.4, -0.45, 1.69, -0.2, s), box(0.55, 0.46, 0.04, -0.35, 1.28, 0.44, s), box(0.45, 0.4, 0.04, 0.5, 1.0, -0.44, s),
          box(0.4, 0.05, 0.3, 0.75, 1.69, -0.25, s), box(0.5, 0.4, 0.04, 0.45, 1.35, 0.44, s),
          box(0.3, 0.14, 0.4, -0.4, 0.68, 0, ro),                                                                              // Euter
          box(0.5, 0.5, 0.46, 1.2, 1.35, 0, w), box(0.28, 0.24, 0.42, 1.55, 1.2, 0, ro), box(0.1, 0.1, 0.1, 1.7, 1.24, 0.12, s), box(0.1, 0.1, 0.1, 1.7, 1.24, -0.12, s),
          box(0.12, 0.2, 0.06, 1.1, 1.66, 0.2, 0xf4efe0, 0.35), box(0.12, 0.2, 0.06, 1.1, 1.66, -0.2, 0xf4efe0, -0.35),
          box(0.14, 0.1, 0.22, 1.08, 1.56, 0.34, s), box(0.14, 0.1, 0.22, 1.08, 1.56, -0.34, s),                                // Ohren
          box(0.08, 0.7, 0.08, -1.05, 1.0, 0, s), box(0.14, 0.2, 0.14, -1.05, 0.62, 0, s)]                                       // Schwanz
          .concat(vier(0.7, -0.7, 0.3, 0.74, 0.74, 0.1, 0.075, w, s));
      } else if (art === 'reh') {
        const b = 0xa0673a, h = 0xd8b48a, weiss = 0xf4efe6, d = 0x2a1a10;
        T = [box(1.25, 0.5, 0.42, 0, 1.02, 0, b), box(1.0, 0.16, 0.36, 0, 0.8, 0, h), box(0.16, 0.3, 0.3, -0.66, 1.06, 0, weiss),
          box(0.2, 0.62, 0.2, 0.62, 1.3, 0, b, -0.45), box(0.42, 0.22, 0.22, 0.95, 1.62, 0, b), box(0.16, 0.14, 0.16, 1.2, 1.57, 0, d),
          box(0.08, 0.2, 0.12, 0.84, 1.8, 0.12, b, 0.3), box(0.08, 0.2, 0.12, 0.84, 1.8, -0.12, b, 0.3),
          box(0.05, 0.05, 0.05, 1.08, 1.68, 0.115, 0x111111), box(0.05, 0.05, 0.05, 1.08, 1.68, -0.115, 0x111111)]
          .concat(vier(0.48, -0.48, 0.14, 0.84, 0.84, 0.06, 0.04, b, d));
      } else if (art === 'baer') {
        const f = 0x5e3b20, sn = 0xa07a52;
        T = [box(1.8, 0.95, 1.0, 0, 1.1, 0, f), box(0.7, 0.5, 0.9, 0.55, 1.55, 0, f), box(0.55, 0.5, 0.55, 1.1, 1.3, 0, f), box(0.28, 0.24, 0.3, 1.45, 1.2, 0, sn),
          box(0.1, 0.1, 0.12, 1.6, 1.27, 0, 0x111111), box(0.14, 0.16, 0.12, 1.05, 1.61, 0.2, f), box(0.14, 0.16, 0.12, 1.05, 1.61, -0.2, f),
          box(0.06, 0.06, 0.06, 1.35, 1.43, 0.15, 0x111111), box(0.06, 0.06, 0.06, 1.35, 1.43, -0.15, 0x111111), box(0.2, 0.2, 0.2, -0.95, 1.25, 0, f)]
          .concat(vier(0.62, -0.62, 0.3, 0.72, 0.72, 0.19, 0.16, f, 0x2e1d12));
      } else if (art === 'steinbock') {
        const g = 0x8a7a66, hell = 0xc9b79a, ho = 0xd9cdb0, d = 0x3a2e24;
        T = [box(1.25, 0.6, 0.5, 0, 0.95, 0, g), box(1.0, 0.18, 0.44, 0, 0.7, 0, hell), box(0.3, 0.55, 0.34, 0.6, 1.2, 0, g, -0.35), box(0.5, 0.3, 0.3, 0.85, 1.45, 0, g),
          box(0.2, 0.16, 0.2, 1.12, 1.4, 0, d), box(0.16, 0.34, 0.16, 0.95, 1.1, 0, hell),                                       // Bart
          box(0.12, 0.7, 0.1, 0.62, 1.75, 0.1, ho, -0.7), box(0.12, 0.5, 0.1, 0.35, 1.95, 0.1, ho, -1.0), box(0.12, 0.7, 0.1, 0.62, 1.75, -0.1, ho, -0.7), box(0.12, 0.5, 0.1, 0.35, 1.95, -0.1, ho, -1.0),
          box(0.2, 0.1, 0.1, -0.7, 1.15, 0, g, 0.3)]
          .concat(vier(0.45, -0.45, 0.17, 0.7, 0.7, 0.07, 0.05, g, d));
      } else if (art === 'dino') {
        const gr = 0x4fb34a, dk = 0x2f8a3a, bauch = 0xc9e49a, orange = 0xf08a2a, augen = 0x111111;
        T = [box(1.3, 0.95, 0.8, 0, 1.15, 0, gr), box(1.0, 0.3, 0.7, 0.05, 0.78, 0, bauch),
          box(0.34, 0.9, 0.36, 0.7, 1.9, 0, gr, -0.15), box(0.8, 0.5, 0.5, 1.05, 2.45, 0, gr), box(0.34, 0.2, 0.44, 1.5, 2.35, 0, bauch),
          box(0.14, 0.14, 0.1, 1.15, 2.62, 0.27, augen), box(0.14, 0.14, 0.1, 1.15, 2.62, -0.27, augen),
          box(1.2, 0.5, 0.5, -1.0, 1.1, 0, gr, 0.12), box(0.9, 0.3, 0.36, -1.85, 1.0, 0, dk, 0.2),                                    // Schwanz
          box(0.18, 0.32, 0.12, 0.5, 1.8, 0, orange), box(0.18, 0.34, 0.12, 0.1, 1.82, 0, orange), box(0.18, 0.34, 0.12, -0.3, 1.78, 0, orange), box(0.18, 0.3, 0.12, -0.7, 1.66, 0, orange),
          box(0.12, 0.12, 0.5, 0.6, 0.95, 0, dk)]                                                                                  // Vorderarme (starr)
          .concat(bein(-0.1, 0.85, 0.28, 0.85, 0.2, 0.12, dk, 0x1d5a26, 1), bein(-0.1, 0.85, -0.28, 0.85, 0.2, 0.12, dk, 0x1d5a26, 1));
      } else if (art === 'kamel') {
        const k = 0xc8a06a, hell = 0xe6cf9e, d = 0x4a3a28;
        T = [box(2.0, 0.9, 0.8, 0, 1.55, 0, k), box(0.5, 0.55, 0.6, 0.3, 2.15, 0, k), box(0.5, 0.55, 0.6, -0.5, 2.15, 0, k), box(1.7, 0.2, 0.7, 0, 1.15, 0, hell),
          box(0.3, 1.1, 0.3, 1.05, 2.25, 0, k, -0.35), box(0.6, 0.34, 0.34, 1.45, 2.85, 0, k), box(0.26, 0.24, 0.34, 1.82, 2.75, 0, hell),
          box(0.07, 0.07, 0.07, 1.5, 2.95, 0.16, 0x111111), box(0.07, 0.07, 0.07, 1.5, 2.95, -0.16, 0x111111),
          box(0.1, 0.8, 0.1, -1.05, 1.2, 0, d)]
          .concat(vier(0.7, -0.7, 0.28, 1.15, 1.15, 0.1, 0.07, k, d));
      } else if (art === 'einhorn') {
        const w = 0xfbf9ff, rosa = 0xffc4e6, gold = 0xffd24a;
        const regen = [0xff4f6d, 0xff9a3c, 0xffe14a, 0x5fd16a, 0x4aa8ff, 0x9a6bff];
        T = [box(1.5, 0.7, 0.55, 0, 1.4, 0, w), box(0.4, 0.8, 0.36, 0.85, 1.85, 0, w, -0.5), box(0.62, 0.34, 0.34, 1.35, 2.2, 0, w), box(0.2, 0.18, 0.28, 1.7, 2.1, 0, rosa),
          box(0.08, 0.08, 0.08, 1.5, 2.28, 0.17, 0x2a2a6a), box(0.08, 0.08, 0.08, 1.5, 2.28, -0.17, 0x2a2a6a),
          { geo: (() => { const g = new THREE.ConeGeometry(0.07, 0.6, 6); g.rotateZ(-0.5); g.translate(1.45, 2.65, 0); return g; })(), farbe: gold },
          box(0.1, 0.18, 0.08, 1.2, 2.42, 0.1, w), box(0.1, 0.18, 0.08, 1.2, 2.42, -0.1, w)]
          .concat(regen.map((c, i) => box(0.16, 0.2, 0.06, 0.55 + 0.16 * i * 0.9, 2.18 - i * 0.14, 0.0, c, -0.5)))                       // Mähne (Regenbogen)
          .concat(regen.map((c, i) => box(0.12, 0.3, 0.2, -0.85 - i * 0.12, 1.5 - i * 0.12, 0, c, 0.5 + i * 0.05)))                      // Schweif (Regenbogen)
          .concat(vier(0.55, -0.55, 0.2, 1.06, 1.06, 0.07, 0.05, w, rosa));
      }
      return TierGrafik.vereinen(T);
    },
  };

  Tiere.ARTEN = ARTEN;
  Tiere.sperrzonen = sperrzonen;
  Tiere.gesperrt = gesperrt;
  Tiere.artenFuer = artenFuer;
  Tiere.artBei = artBei;
  Tiere.TierGrafik = TierGrafik;
  Tiere.cfg = cfg;
  R.Tiere = Tiere;
})();
