// ============================================================
// Motorrad-Unfälle (Stufe M2c) – Verdrahtung: läuft NACH src/main.js und stuntStart.js, nur mit window.MOTORRAD === true.
// Alle Eingriffe sind Umhüllungen zur Laufzeit; keine Datei im Repo wird geändert (Autorennen.html lädt dieses Skript nicht).
//
//   Vehicle.schritt            umhüllt: Tempo-Wirkung beider Zustände (Höchsttempo/Beschleunigung proportional), Haltebremse (Station, Szene), KI-Drossel
//   Spiel.streckeAufbauen      umhüllt: nach dem Aufbau (main.js setzt spiel.werkstatt dort zurück) Werkstatt + Krankenstation (unfallWelt.stationenBauen); spiel.werkstatt = Schnittstelle für main.js
//   Spiel.rennenStarten        umhüllt: Unfall-Zustand je Fahrzeug (spiel.unfall), Modus aus Menü/Speicher
//   Spiel.physikSchritt        umhüllt: Sturz → Folge (Schreck / Motorrad-Schaden / leicht verletzt / schwer), Szenen vor Ort, Stationen
//   R.dach.frame               umhüllt: Qualm, Helfer-Fahrzeuge, HUD (Prozentwerte im Spieler-Chip, Text mitten im Bild)
//   Menue.zeilen/zeilenWert/wertSetzen/zeichnen   umhüllt: Zeile „Unfälle: aus / sanft / echt“ (ersetzt die ausgeblendete Zeile „Schaden“)
//
// Ablauf nach einem Sturz (Purzelbaum): Folge nach R.Moto.unfall.folge (deterministisch, Saat + Fahrer-Nr. + Sturzzähler):
//   Schreck        nichts
//   Motorrad-Schaden  Zustand −20 % (Qualm unter 75 %, weniger Tempo); schwerer Schaden oder Minimum 10 % → Abschleppwagen kommt VOR ORT
//   leicht verletzt   Fahrer −15 % („Aua! Pflaster drauf 🩹“)
//   schwer            Fahrer −50 %, Krankenwagen kommt VOR ORT
// Vor Ort: der Fahrer steht neben dem Motorrad, 1,5 s je 10 % bis 100 %; ab 30 % bei BEIDEN Zuständen beendet Gas geben die Versorgung.
// Werkstatt (Motorrad) / Krankenstation (Fahrer): einfach auf die Fläche fahren, das Motorrad bremst selbst, 0,5 s je 10 % bis 100 % (ab 30 % Gas = los).
// KI: fährt an der Station mit 45 % Tempo vorbei und wird dabei bis 100 % versorgt (Zeitverlust statt Halt); vor Ort fährt sie ab 30 % weiter.
// Zeitlimit je Szene: danach Rückfall auf „zurück an den Kontrollpunkt“ (spiel.zuruecksetzen, wie v32 N1d).
// ============================================================
(function () {
  if (window.MOTORRAD !== true) return;
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Moto || !R.Moto.unfall || !R.Moto.unfallWelt) return;
  const U = R.Moto.unfall, W = R.Moto.unfallWelt, P = R.Spiel.prototype;
  const CFG = () => R.config.motoUnfall;
  const klemme = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- Modus (Menü-Schalter), Speicher mit .motorrad ----------
  const schluessel = () => ((R.config.ui && R.config.ui.speicherSchluessel) || 'rennspiel.einstellungen.v1.motorrad') + '.unfall';
  function modusGueltig(m) { return typeof m === 'string' && CFG().modi[m] !== undefined ? m : null; }
  function modusLesen() {
    try { const v = modusGueltig(window.localStorage.getItem(schluessel())); if (v) return v; } catch (e) { /* kein Speicher: Standard */ }
    return CFG().standard;
  }
  function modusSchreiben(m) { try { window.localStorage.setItem(schluessel(), m); } catch (e) { /* egal */ } }

  // ---------- Vehicle.schritt: Tempo-Wirkung + Haltebremse ----------
  if (R.Vehicle && R.Vehicle.prototype && typeof R.Vehicle.prototype.schritt === 'function') {
    const vSchritt = R.Vehicle.prototype.schritt;
    R.Vehicle.prototype.schritt = function (dt, s, hilfe, umwelt) {
      const u = this._motoU;
      if (!u || u.modus === 'aus') return vSchritt.call(this, dt, s, hilfe, umwelt);
      u.gasEingabe = s && s.gas ? s.gas : 0;                                         // Eingabe merken, bevor die Haltebremse sie ersetzt
      let halt = false;
      if (u.halteBremse) {                                                           // bremsen; im Stand NICHT weiter bremsen (sonst rollt es rückwärts) → Tempo auf 0 festhalten
        halt = Math.abs(this.vLaengs) < 1.5;
        s = Object.assign({}, s, { gas: 0, bremse: halt ? 0 : 1, lenkung: 0 });
      }
      const fk = U.faktoren(u);
      const vm = fk.vMax * (u.kiPflege ? CFG().ki.faktor : 1), be = fk.beschleunigung;
      const dd = this.daten, vm0 = dd.vMax, be0 = dd.beschleunigung;
      dd.vMax = vm0 * vm; dd.beschleunigung = be0 * be;
      try { return vSchritt.call(this, dt, s, hilfe, umwelt); }
      finally {
        dd.vMax = vm0; dd.beschleunigung = be0;
        if (halt) { this.vLaengs = 0; if (this.vQuer !== undefined) this.vQuer = 0; }
      }
    };
  }

  // ---------- Szene: Werkstatt + Krankenstation ----------
  const streckeAufbauen = P.streckeAufbauen;
  P.streckeAufbauen = function () {
    const r = streckeAufbauen.apply(this, arguments);
    try {
      if (this.motoStationen) { try { this.motoStationen.stub.zerstoeren(); } catch (e) { /* schon weg */ } this.motoStationen = null; }
      if (this.strecke && this.szene) {
        const s = W.stationenBauen(this.strecke, this.szene);
        if (s) {
          this.szene.add(s.gruppe);
          this.motoStationen = s;
          if (!this.werkstatt) this.werkstatt = s.stub;
        }
      }
    } catch (e) { console.error('Motorrad-Unfälle (Szene):', e); }
    return r;
  };

  // ---------- Rennstart ----------
  function unfallNeu(spiel, einst) {
    if (spiel.unfall && spiel.unfall.fz) spiel.unfall.fz.forEach((u) => { if (!u) return; try { if (u.stFigur) { W.freigeben(u.stFigur); u.stFigur = null; } if (u.szene) szeneEnde(spiel, 0, u); } catch (e) { /* aufräumen darf nie stören */ } });      // Reste des letzten Rennens aus der Szene nehmen
    const e = spiel.einstellungen || {};
    const modus = modusGueltig(einst && einst.unfall) || modusGueltig(e.unfall) || modusLesen();
    const saat = 'moto|' + (spiel.strecke ? spiel.strecke.id : '') + '|' + (spiel.strecke ? spiel.strecke.variante : '');
    const un = { modus, saat, zeit: 0, fz: [] };
    spiel.fahrzeuge.forEach((f, i) => {
      if (!f || !f.vehicle || f.polizei) { un.fz[i] = null; return; }
      const u = U.zNeu(modus);
      u.purzelGesehen = f.motoZ ? f.motoZ.purzel.anzahl : 0;
      u.inSt = { werkstatt: false, kranken: false };
      u.halteBremse = false; u.gasEingabe = 0; u.kiPflege = null; u.qualm = null; u.halt = null; u.szene = null;
      f.vehicle._motoU = u;
      un.fz[i] = u;
    });
    spiel.unfall = un;
  }
  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function (einst) {
    const r = rennenStarten.apply(this, arguments);
    try { unfallNeu(this, einst); } catch (e) { console.error('Motorrad-Unfälle (Start):', e); }
    return r;
  };

  // ---------- Hilfen ----------
  const istMensch = (f) => !!f.istSpieler && !f.autopilot;
  const meldung = (spiel, i, text, ms) => { try { spiel._meldung(i, text, ms); } catch (e) { /* egal */ } };
  const zahl = (x) => Math.round(x);

  /** Sturz auswerten (Folge deterministisch). ueber = { art, schwer } erzwingt eine Folge (Browser-Tests). */
  function sturzFolge(spiel, i, ueber) {
    const un = spiel.unfall, f = spiel.fahrzeuge[i], u = un && un.fz[i];
    if (!u || !f) return null;
    const e = U.sturz(u, un.saat, i, null, ueber);
    const mensch = istMensch(f);
    if (e.art === 'schreck') { if (mensch) meldung(spiel, i, 'Huch! Alles heil 😅', 1300); }
    else if (e.art === 'schaden' && !e.szene) { if (mensch) meldung(spiel, i, 'Das Motorrad ist angeschlagen 🔧', 1600); }
    else if (e.art === 'leicht') { if (mensch) meldung(spiel, i, 'Aua! Pflaster drauf 🩹', 1600); }
    if (e.szene) szeneStart(spiel, i, e.szene);
    return e;
  }

  // ---------- Szene vor Ort ----------
  function szeneStart(spiel, i, art) {
    const f = spiel.fahrzeuge[i], u = spiel.unfall.fz[i];
    u.halt = null; u.kiPflege = null;
    u.szene = { art, was: art === 'abschlepp' ? 'motorrad' : 'fahrer', phase: 'warten', warte: 0, t: 0, frei: false, tFrei: 0, plan: null, pflege: 0, helfer: null, figur: null, sB: 0, qB: 0, qH: 0, sStop: 0, zeit: 0 };
    u.halteBremse = true;
    if (istMensch(f)) {
      meldung(spiel, i, art === 'abschlepp' ? 'Der Abschleppwagen kommt! 🚛' : 'Der Krankenwagen kommt! 🚑', 1800);
      if (art === 'abschlepp' && R.Audio && R.Audio.abschleppen) { try { R.Audio.abschleppen(); } catch (e) { /* Ton egal */ } }
    }
  }
  function szeneEnde(spiel, i, u) {
    const sz = u.szene;
    if (sz) {
      if (sz.helfer && sz.helfer.mesh) { if (sz.helfer.art === 'abschlepp') W.freigeben(sz.helfer.mesh); else if (sz.helfer.mesh.parent) sz.helfer.mesh.parent.remove(sz.helfer.mesh); }
      if (sz.figur) W.freigeben(sz.figur);
    }
    u.szene = null; u.halteBremse = false;
  }
  /** Rückfall: Szene hängt oder Position fehlt → zurück an den Kontrollpunkt (v32 N1d), Pflege wird nachgeholt. */
  function szeneRueckfall(spiel, i, f, u) {
    const sz = u.szene;
    U.pflegeSchritt(u, sz.was, 'vorOrt', 1e6);
    szeneEnde(spiel, i, u);
    try {
      spiel.zuruecksetzen(i);
      if (f.driver && f.driver.zurueckgesetzt) f.driver.zurueckgesetzt(f.index);
      if (f.autopilot && f.autopilot.zurueckgesetzt) f.autopilot.zurueckgesetzt();
    } catch (e) { console.error('Motorrad-Unfälle (Rückfall):', e); }
    if (istMensch(f)) meldung(spiel, i, 'Weiter geht\'s! 💚', 1500);
    const un = spiel.unfall; un.rueckfaelle = (un.rueckfaelle || 0) + 1;
  }
  function szeneSchritt(spiel, i, f, u, dt) {
    const sz = u.szene, v = f.vehicle, mz = f.motoZ, c = CFG().szene, strecke = spiel.strecke;
    f.stehZeit = 0; if (f.driver) f.driver.festZeit = 0;
    if (u.gasEingabe <= 0.3) sz.gasLos = true;                                        // Gas muss erst losgelassen und NEU gedrückt werden (wer das Gas einfach hält, wird trotzdem versorgt)
    if (sz.phase === 'warten') {
      sz.warte += dt;
      const luft = !!(f.flug && f.flug.aktiv), purzelt = !!(mz && mz.purzel.aktiv);
      if (sz.warte > c.wartenMax * 3) return szeneRueckfall(spiel, i, f, u);
      if ((!luft && !purzelt && Math.abs(v.vLaengs) < 0.6) || sz.warte > c.wartenMax) {
        if (luft || !f.nah) { if (sz.warte > c.wartenMax * 2) return szeneRueckfall(spiel, i, f, u); return; }
        v.vLaengs = 0; if (v.vQuer !== undefined) v.vQuer = 0;
        const n = f.nah, halb = (strecke.breiteBei ? strecke.breiteBei(n.s) : strecke.breite) / 2;
        sz.sB = n.s; sz.qB = n.seitenabstand;
        let qH = sz.qB >= 0 ? sz.qB - c.seitlich : sz.qB + c.seitlich;        // Helfer-Fahrzeug auf der Straßenmitte-Seite des Motorrads
        qH = klemme(qH, -(halb - 1.4), halb - 1.4);
        if (Math.abs(qH - sz.qB) < 2.6) qH = sz.qB >= 0 ? sz.qB - 2.6 : sz.qB + 2.6;
        sz.qH = qH;
        sz.sStop = sz.sB + (sz.art === 'abschlepp' ? -1.0 : 0.3);
        sz.pflege = U.pflegeDauer(sz.was === 'motorrad' ? u.zustand : u.gesundheit, 'vorOrt');
        sz.plan = U.szenePlan(sz.pflege);
        sz.helfer = W.helferBauen(sz.art);
        if (sz.helfer) { spiel.szene.add(sz.helfer.mesh); helferSetzen(spiel, sz, 0); }
        sz.phase = 'lauf'; sz.t = 0;
      }
      return;
    }
    sz.t += dt; sz.zeit += dt;
    const ph = U.szenePhase(sz.pflege, sz.t);
    if (sz.t > sz.plan.limit) return szeneRueckfall(spiel, i, f, u);
    if (!sz.frei) {
      if (ph.name === 'pflege') U.pflegeSchritt(u, sz.was, 'vorOrt', dt);
      else if (ph.name === 'abfahrt') U.pflegeSchritt(u, sz.was, 'vorOrt', 1e6);                // Rundungsrest: jetzt sicher 100 %
      const darf = U.darfWeiter(u), gas = istMensch(f) ? (sz.gasLos && u.gasEingabe > 0.3) : true;
      if ((ph.index >= 1 && darf && gas) || ph.name === 'abfahrt') {
        sz.frei = true; sz.tFrei = Math.max(sz.t, sz.plan.phasen[1].t0); u.halteBremse = false;
        if (istMensch(f)) meldung(spiel, i, sz.art === 'abschlepp' ? 'Repariert! 🔧' : 'Gute Besserung! 💚', 1500);
      }
    }
    const tAb = sz.frei ? sz.tFrei : sz.plan.phasen[2].t0;
    if (sz.frei && sz.t - tAb >= CFG().szene.abfahrt + 0.05) szeneEnde(spiel, i, u);
  }
  /** Helfer-Fahrzeug und Figur an die Pose der Szenenzeit setzen (Aufruf je Bild und einmal beim Start). */
  function helferSetzen(spiel, sz, zeit) {
    const h = sz.helfer, strecke = spiel.strecke, c = CFG().szene;
    if (!h || !sz.plan) return;
    const ph = U.szenePhase(sz.pflege, sz.t), tAb = sz.frei ? sz.tFrei : sz.plan.phasen[2].t0;
    let s = sz.sStop;
    if (sz.frei || ph.name === 'abfahrt') { const au = klemme((sz.t - tAb) / c.abfahrt, 0, 1); s = sz.sStop + c.abfahrtWeg * au * au; }
    else if (ph.name === 'anfahrt') s = sz.sStop - c.anfahrtWeg * (1 - ph.u) * (1 - ph.u);
    W.helferPose(h, strecke, s, sz.qH, zeit);
    // Figur neben dem Motorrad, solange gepflegt wird
    const pflegt = !sz.frei && ph.name === 'pflege';
    if (pflegt && !sz.figur) {
      sz.figur = W.figurBauen(sz.art === 'abschlepp' ? 'mechaniker' : 'sanitaeter');
      spiel.szene.add(sz.figur);
    }
    if (sz.figur) {
      sz.figur.visible = pflegt;
      if (pflegt) {
        const qF = sz.qB + (sz.qH - sz.qB) * 0.42, p = U.fahrPose(strecke, sz.sB + 0.4, qF), pb = U.fahrPose(strecke, sz.sB, sz.qB);
        sz.figur.position.set(p.x, p.y, p.z); sz.figur.userData.basisY = p.y;
        sz.figur.rotation.y = Math.atan2(-(pb.x - p.x), -(pb.z - p.z));
        W.figurAnimieren(sz.figur, zeit);
      }
    }
  }

  /** Figur an der Station: Sanitäter neben dem Fahrer bzw. Mechaniker am Hinterrad, solange gepflegt wird (u.halt.steht). Eine Figur je Fahrer, danach nur unsichtbar. */
  function stationsFigur(spiel, f, u, zeit) {
    const h = u.halt, an = !!(h && h.steht && f.nah && spiel.motoStationen);
    if (!an) { if (u.stFigur && u.stFigur.visible) u.stFigur.visible = false; return; }
    const w = h.art === 'werkstatt' ? spiel.motoStationen.werkstatt : spiel.motoStationen.kranken, P = w.platz, art = h.art === 'werkstatt' ? 'mechaniker' : 'sanitaeter';
    if (!u.stFigur || u.stFigur.userData.art !== art) {
      if (u.stFigur) W.freigeben(u.stFigur);
      u.stFigur = W.figurBauen(art); spiel.szene.add(u.stFigur);
    }
    const n = f.nah, dir = P.seite;                                                   // Platz-Werte sind je Seite positiv: Gebäudeseite = P.seite
    let qF = n.seitenabstand + dir * 0.35;                                            // Figur neben dem Vorderrad, leicht zur Gebäudeseite (die Kamera steht hinten auf der Straßenseite: Figur und Motorrad verdecken sich nicht)
    if (dir * qF > P.qB - 0.4) qF = n.seitenabstand - dir * 0.35;                     // dort kein Platz mehr: auf die Straßenseite
    const sF = n.s + (art === 'mechaniker' ? 1.75 : 1.45), p = U.fahrPose(spiel.strecke, sF, qF), pb = U.fahrPose(spiel.strecke, n.s, n.seitenabstand);
    const fg = u.stFigur; fg.visible = true; fg.position.set(p.x, p.y, p.z); fg.userData.basisY = p.y;
    fg.rotation.y = Math.atan2(-(pb.x - p.x), -(pb.z - p.z));
    W.figurAnimieren(fg, zeit);
  }

  // ---------- Kamera bei der Versorgung ----------
  const V3 = (typeof THREE !== 'undefined') ? { cam: new THREE.Vector3(), blick: new THREE.Vector3(), a: new THREE.Vector3() } : null;
  /** Ziel der Versorgungs-Kamera für Kamera k (Pose { cam: {x,y,z}, blick: {x,y,z} }) oder null, wenn gerade nicht versorgt wird. */
  function pflegeZiel(spiel, k) {
    const f = spiel._fahrzeugVon ? spiel._fahrzeugVon(k.ziel) : null; if (!f || !f.nah) return null;
    const i = spiel.fahrzeuge.indexOf(f), u = spiel.unfall && spiel.unfall.fz[i]; if (!u) return null;
    const c = CFG().kamera, strecke = spiel.strecke;
    let sB, qB, dir, ausgleich = 0;
    if (u.halt && u.halt.steht && spiel.motoStationen) {
      const w = u.halt.art === 'werkstatt' ? spiel.motoStationen.werkstatt : spiel.motoStationen.kranken, P = w.platz;
      sB = f.nah.s; qB = f.nah.seitenabstand; dir = P.seite;                       // Platz-Werte sind je Seite positiv: das Gebäude liegt auf der Seite P.seite
    } else if (u.szene && u.szene.phase === 'lauf' && !u.szene.frei && u.szene.plan) {
      const sz = u.szene; sB = sz.sB; qB = sz.qB; dir = (sz.qH - sz.qB) >= 0 ? 1 : -1; ausgleich = (sz.qH - sz.qB) * 0.5 - dir * c.blickSeitlich;     // Blickpunkt zwischen Motorrad und Helfer-Fahrzeug
    } else return null;
    const cp = U.fahrPose(strecke, sB - c.hinter, qB - dir * c.seitlich), bp = U.fahrPose(strecke, sB + 0.4, qB + dir * c.blickSeitlich + ausgleich);
    return { cam: { x: cp.x, y: Math.max(cp.y, strecke.hoeheAn(f.vehicle.x, f.vehicle.z)) + c.hoehe, z: cp.z }, blick: { x: bp.x, y: bp.y + c.blickHoeher + 0.9, z: bp.z } };
  }
  /** Versorgungs-Kamera über die normale Verfolger-/Weit-Kamera legen (weich ein und aus). */
  function pflegeKamera(k, dt, erst) {
    const spiel = R.spiel, c = CFG().kamera;
    if (!V3 || !c || !c.an) return;
    const z = (spiel && spiel.unfall && spiel.unfall.modus !== 'aus' && spiel.zustand === 'rennen' && k.ziel && k.modus !== 'cockpit') ? pflegeZiel(spiel, k) : null;
    const ziel = z ? 1 : 0, w0 = k._pflegeW || 0;
    k._pflegeW = erst ? ziel : w0 + (ziel - w0) * (1 - Math.exp(-c.weichheit * Math.max(dt || 0, 0)));
    if (z) k._pflegeZ = z;
    if (k._pflegeW < 0.005) { k._pflegeW = 0; return; }
    const pz = k._pflegeZ; if (!pz) return;
    const t = k._pflegeW, w = t * t * (3 - 2 * t), kam = k.kamera;
    V3.cam.set(pz.cam.x, pz.cam.y, pz.cam.z); kam.position.lerp(V3.cam, w);
    V3.blick.copy(k.blick).lerp(V3.a.set(pz.blick.x, pz.blick.y, pz.blick.z), w); kam.lookAt(V3.blick);
  }
  if (R.FahrzeugKamera && R.FahrzeugKamera.prototype.update) {
    const kUpdate = R.FahrzeugKamera.prototype.update;
    R.FahrzeugKamera.prototype.update = function (dt) {
      const erst = this._erstesMal, r = kUpdate.apply(this, arguments);
      try { pflegeKamera(this, dt, erst); } catch (e) { console.error('Motorrad-Unfälle (Kamera):', e); }
      return r;
    };
  }

  // ---------- Stationen ----------
  const STATION = {
    werkstatt: { was: 'motorrad', braucht: U.brauchtWerkstatt, name: 'Werkstatt', symbol: '🔧', ende: 'Repariert! 🔧', bei: 'Werkstatt! 🔧' },
    kranken: { was: 'fahrer', braucht: U.brauchtKranken, name: 'Krankenstation', symbol: '🩹', ende: 'Gute Besserung! 💚', bei: 'Krankenstation! 🩹' },
  };
  function haltEnde(spiel, i, f, u, abgebrochen) {
    const h = u.halt;
    if (!h) return;
    const K = STATION[h.art];
    u.halt = null; u.halteBremse = false;
    if (!abgebrochen && istMensch(f)) meldung(spiel, i, K.ende, 1500);
  }
  function stationenPruefen(spiel, i, f, u, dt) {
    const st = spiel.motoStationen, n = f.nah, v = f.vehicle, strecke = spiel.strecke;
    if (!st || !n) return;
    const mensch = istMensch(f), halb = (strecke.breiteBei ? strecke.breiteBei(n.s) : strecke.breite) / 2;
    for (const art of ['werkstatt', 'kranken']) {
      const w = art === 'werkstatt' ? st.werkstatt : st.kranken, K = STATION[art];
      const drin = mensch ? !!(U.stationBereich(w, n) && !v.imLooping && !(f.flug && f.flug.aktiv))
        : !!(U.stationLaengs(w, strecke, n.s) && Math.abs(n.seitenabstand) <= halb + 3 && !(f.flug && f.flug.aktiv));
      const war = u.inSt[art];
      u.inSt[art] = drin;
      if (drin && !war && K.braucht(u)) {
        if (mensch) { u.halt = { art, t: 0, steht: false }; u.halteBremse = true; meldung(spiel, i, K.bei, 1100); break; }
        u.kiPflege = { art, was: K.was, t: 0 };
        break;
      }
    }
  }
  function haltSchritt(spiel, i, f, u, dt) {
    const h = u.halt, v = f.vehicle, K = STATION[h.art], w = h.art === 'werkstatt' ? spiel.motoStationen.werkstatt : spiel.motoStationen.kranken;
    h.t += dt; f.stehZeit = 0;
    if (!h.steht && Math.abs(v.vLaengs) < 1.2) h.steht = true;
    if (!U.stationBereich(w, f.nah) && !h.steht) return haltEnde(spiel, i, f, u, true);       // von der Fläche abgekommen, bevor er stand
    if (u.gasEingabe <= 0.3) h.gasLos = true;                                         // wie in der Szene: erst loslassen, dann neu Gas geben
    if (h.steht) {
      const fertig = U.pflegeSchritt(u, K.was, 'station', dt);
      if (fertig) return haltEnde(spiel, i, f, u, false);
      if (U.darfWeiter(u) && h.gasLos && u.gasEingabe > 0.3) return haltEnde(spiel, i, f, u, false);
    }
    if (h.t > 25) return haltEnde(spiel, i, f, u, true);                                       // Sicherung: nie festhängen
  }
  function kiPflegeSchritt(spiel, i, f, u, dt) {
    const k = u.kiPflege;
    k.t += dt;
    if (U.pflegeSchritt(u, k.was, 'station', dt) || k.t > 8) u.kiPflege = null;
  }

  // ---------- Physikschritt ----------
  function unfallSchritt(spiel, dt) {
    const un = spiel.unfall;
    if (!un || un.modus === 'aus' || spiel.zustand !== 'rennen' || spiel.pausiert || !spiel.rennen || !spiel.rennen.gasErlaubt) return;
    un.zeit += dt;
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], u = un.fz[i];
      if (!f || !u || !f.vehicle || f.polizei || f.ausgeschieden) continue;
      const mz = f.motoZ;
      if (mz && mz.purzel.anzahl > u.purzelGesehen) {
        u.purzelGesehen = mz.purzel.anzahl;
        if (!u.szene && !u.halt) sturzFolge(spiel, i, null);
      }
      if (u.szene) szeneSchritt(spiel, i, f, u, dt);
      else if (u.halt) haltSchritt(spiel, i, f, u, dt);
      else stationenPruefen(spiel, i, f, u, dt);
      if (u.kiPflege) kiPflegeSchritt(spiel, i, f, u, dt);
    }
  }
  const physikSchritt = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    try { unfallSchritt(this, dt); } catch (e) { console.error('Motorrad-Unfälle:', e); }
    return r;
  };

  // ---------- HUD ----------
  const STIL = `
.hud-links .moto-zustand { display: block; margin-top: .2em; white-space: nowrap; font-weight: 900; font-size: .95em; line-height: 1.2; pointer-events: none; }
.moto-zustand span { margin-right: .5em; }
.moto-zustand .gruen { color: #7dffa0; } .moto-zustand .gelb { color: #ffe14a; } .moto-zustand .rot { color: #ff7a6a; }
.hud .moto-mitte { position: absolute; left: 50%; top: 17%; transform: translateX(-50%); box-sizing: border-box; max-width: 92%; text-align: center; white-space: pre-line;
  font-weight: 900; line-height: 1.25; color: #fff; padding: .25em .8em; border-radius: 1em; border: .08em solid #fff; pointer-events: none; display: none;
  text-shadow: 0 .06em .12em rgba(0,0,0,.5); background: linear-gradient(90deg, rgba(31,111,209,.92), rgba(70,150,235,.92)); }
.hud .moto-mitte.krank { background: linear-gradient(90deg, rgba(31,157,85,.92), rgba(70,200,120,.92)); }
.hud .moto-mitte .hinweis { display: block; font-size: .8em; opacity: .95; }
/* Lage: oben, unter den Chips (Spieler, Platz, Zeiten), weit über Fahrer und Motorrad – die genaue Oberkante setzt mitteLegen() aus den echten Chip-Maßen; die Meldung des Spiels rückt darunter */
.hud.links .moto-mitte, .hud.rechts .moto-mitte { top: 22%; }
@media (max-height: 520px) { .hud .moto-mitte, .hud.links .moto-mitte, .hud.rechts .moto-mitte { max-width: 86%; } }
html .hud.moto-mitte-an .hud-meldung { top: var(--moto-meldung-top, 30%) !important; }
`;
  let stilDa = false;
  function stilEinbauen() {
    if (stilDa || typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = STIL; document.head.appendChild(st); stilDa = true;
  }
  function hudAnlegen(hd) {
    if (hd._motoUnfall) return hd._motoUnfall;
    const chip = hd.el.querySelector('.hud-links') || hd.el;
    const zeile = document.createElement('div'); zeile.className = 'moto-zustand'; zeile.innerHTML = '<span class="mz-m"></span><span class="mz-f"></span>';
    const stunt = chip.querySelector('.moto-stunt');
    chip.insertBefore(zeile, stunt || null);
    const mitte = document.createElement('div'); mitte.className = 'moto-mitte'; hd.el.appendChild(mitte);
    return (hd._motoUnfall = { zeile, eM: zeile.querySelector('.mz-m'), eF: zeile.querySelector('.mz-f'), mitte, z: { m: '', f: '', t: '', k: '' }, schriftgroesse: '' });
  }
  /** Text mitten im Bild je Zustand (leer = ausblenden). */
  function mitteText(spiel, i, f, u) {
    const hinweis = () => (U.darfWeiter(u) ? 'Gas = weiterfahren' : 'Noch kurz warten …');
    const sz = u.szene;
    if (sz) {
      if (sz.phase === 'warten') return null;
      const ph = U.szenePhase(sz.pflege, sz.t);
      if (sz.frei || ph.name === 'abfahrt') return null;
      if (ph.name === 'anfahrt') return { t: sz.art === 'abschlepp' ? '🚛 Der Abschleppwagen kommt!' : '🚑 Der Krankenwagen kommt!', krank: sz.art !== 'abschlepp' };
      return sz.art === 'abschlepp' ? { t: '🔧 Mechaniker schraubt … ' + zahl(u.zustand) + ' %', h: hinweis(), krank: false }
        : { t: '🩹 Sanitäter verbinden … ' + zahl(u.gesundheit) + ' %', h: hinweis(), krank: true };
    }
    if (u.halt) {
      const K = STATION[u.halt.art], krank = u.halt.art === 'kranken';
      if (!u.halt.steht) return { t: K.symbol + ' ' + K.name + ': gleich ist Halt …', krank };
      return { t: (krank ? '🩹 Sanitäter verbinden … ' + zahl(u.gesundheit) : '🔧 Mechaniker schraubt … ' + zahl(u.zustand)) + ' %', h: hinweis(), krank };
    }
    // Station voraus (nur wenn sie gebraucht wird, höchstens 160 m vor der Zufahrt)
    const st = spiel.motoStationen, n = f.nah;
    if (st && n && (u.zustand < 100 || u.gesundheit < 100)) {
      const sp = spiel.strecke.spline;
      let best = null;
      for (const art of ['werkstatt', 'kranken']) {
        if (!STATION[art].braucht(u)) continue;
        const w = art === 'werkstatt' ? st.werkstatt : st.kranken, P0 = w.platz;
        const d = sp.differenzS(P0.s - P0.laenge / 2 - P0.zufahrt, n.s);
        if (d > 0 && d < 160 && (!best || d < best.d)) best = { d, art };
      }
      if (best) { const K = STATION[best.art]; return { t: K.symbol + ' ' + K.name + ' voraus – einfach reinfahren', krank: best.art === 'kranken' }; }
    }
    return null;
  }
  /** Text mitten im Bild unter die Chips legen (nur die, die waagerecht darüber liegen) und die Meldung des Spiels darunter schieben. */
  function mitteLegen(hd, m) {
    const hr = hd.el.getBoundingClientRect(), mr = m.mitte.getBoundingClientRect();
    if (!mr.width) return;
    let unten = 0;
    hd.el.querySelectorAll('.hud-links, .hud-platz, .hud-zeiten').forEach((c) => {
      const r = c.getBoundingClientRect();
      if (r.width && r.right > mr.left - 4 && r.left < mr.right + 4) unten = Math.max(unten, r.bottom - hr.top);
    });
    const top = Math.round(Math.max(unten + 8, hr.height * 0.12));
    if (m.mitte.style.top !== top + 'px') m.mitte.style.top = top + 'px';
    hd.el.style.setProperty('--moto-meldung-top', Math.round(top + m.mitte.offsetHeight + 8) + 'px');
    hd.el.classList.add('moto-mitte-an');
  }
  function hudFrame(spiel) {
    const un = spiel.unfall;
    if (!un) return;
    stilEinbauen();
    (spiel.huds || []).forEach((hd) => {
      if (!hd || !hd.el) return;
      const fi = spiel.fahrzeuge.findIndex((f) => f.istSpieler && f.spielerNr === hd.nr), f = spiel.fahrzeuge[fi], u = un.fz[fi];
      const m = hudAnlegen(hd);
      if (!f || !u || un.modus === 'aus') { if (m.zeile.style.display !== 'none') m.zeile.style.display = 'none'; if (m.mitte.style.display !== 'none') m.mitte.style.display = 'none'; hd.el.classList.remove('moto-mitte-an'); return; }
      if (m.zeile.style.display === 'none') m.zeile.style.display = '';
      const h = U.hudZustand(u);
      const tm = '🏍️ ' + h.prozent + ' %', tf = h.symbol + ' ' + h.gesundheit + ' %', km = h.farbe, kf = h.fahrerFarbe;
      if (m.z.m !== tm + km) { m.z.m = tm + km; m.eM.textContent = tm; m.eM.className = 'mz-m ' + km; }
      if (m.z.f !== tf + kf) { m.z.f = tf + kf; m.eF.textContent = tf; m.eF.className = 'mz-f ' + kf; }
      const t = mitteText(spiel, fi, f, u);
      const key = t ? t.t + '|' + (t.h || '') + '|' + t.krank : '';
      if (m.z.t !== key) {
        m.z.t = key;
        if (!t) m.mitte.style.display = 'none';
        else {
          m.mitte.textContent = t.t;
          if (t.h) { const sp = document.createElement('span'); sp.className = 'hinweis'; sp.textContent = t.h; m.mitte.appendChild(sp); }
          m.mitte.classList.toggle('krank', !!t.krank); m.mitte.style.display = 'block';
        }
        m.n = 0;
        if (!t) hd.el.classList.remove('moto-mitte-an');
      }
      if (t && m.mitte.style.display !== 'none' && (m.n++ % 20) === 0) mitteLegen(hd, m);
      const fs = hd.el.clientWidth < 700 ? '1.1em' : '1.4em';
      if (m.schriftgroesse !== fs) { m.schriftgroesse = fs; m.mitte.style.fontSize = fs; m.n = 0; }
    });
  }
  /** Qualm-Stärke 0..1: ab 75 % sacht (0,2), bei 50 % 0,6, darunter bis 1,0 bei Minimum – ab < 50 % also deutlich stärker (mehr und dunklere Wolken). */
  function qualmStaerke(z, qAb, min) {
    if (z >= 50) return 0.2 + 0.4 * klemme((qAb - z) / Math.max(1, qAb - 50), 0, 1);
    return 0.6 + 0.4 * klemme((50 - z) / Math.max(1, 50 - min), 0, 1);
  }
  /** Qualm am Motorrad + Helfer-Fahrzeuge je Bild. */
  function bild(spiel, dt) {
    const un = spiel.unfall;
    if (!un) return;
    const zeit = (spiel._physikZeit || 0) + (un.bildZeit = (un.bildZeit || 0) + (dt || 0));
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], u = un.fz[i];
      if (!f || !u || !f.mesh) continue;
      if (un.modus !== 'aus') {
        const q = CFG().qualmUnter, min = CFG().minimum, an = u.zustand < q;
        if (an && !u.qualm) { u.qualm = W.qualmBauen(); if (u.qualm) f.mesh.add(u.qualm); }
        if (u.qualm) W.qualmZeigen(u.qualm, zeit, an ? qualmStaerke(u.zustand, q, min) : 0);
      }
      if (u.szene && u.szene.helfer) helferSetzen(spiel, u.szene, zeit);
      stationsFigur(spiel, f, u, zeit);
    }
    hudFrame(spiel);
  }
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { bild(spiel, dt); } catch (e) { console.error('Motorrad-Unfälle (Bild):', e); }
      return r;
    };
  }

  // ---------- Menü: Zeile „Unfälle“ ----------
  const MODI = [['aus', 'Aus'], ['sanft', 'Sanft'], ['echt', 'Echt']];
  if (R.Menue) {
    const M = R.Menue.prototype;
    const zeilen = M.zeilen;
    M.zeilen = function () {
      const z = zeilen.apply(this, arguments), k = z.indexOf('schaden');
      if (k >= 0) z[k] = 'unfall';                                   // die ausgeblendete Schaden-Zeile gibt ihren Platz in der Fokus-Reihenfolge her
      return z;
    };
    const zeilenWert = M.zeilenWert;
    M.zeilenWert = function (zeile, dx) {
      if (zeile === 'unfall') {
        const e = this.e, l = MODI.map((x) => x[0]), i = l.indexOf(modusGueltig(e.unfall) || modusLesen());
        if (dx) this.wertSetzen('unfall', l[klemme(i + dx, 0, l.length - 1)]);
        return;
      }
      return zeilenWert.apply(this, arguments);
    };
    const wertSetzen = M.wertSetzen;
    M.wertSetzen = function (zeile, k) {
      if (zeile === 'unfall') { if (modusGueltig(k)) { this.e.unfall = k; modusSchreiben(k); } return; }
      return wertSetzen.apply(this, arguments);
    };
    const zeichnen = M.zeichnen;
    M.zeichnen = function () {
      if (this.e && !modusGueltig(this.e.unfall)) this.e.unfall = modusLesen();
      const r = zeichnen.apply(this, arguments);
      try {
        const alt = this.wurzel.querySelector('[data-a^="wert:schaden:"]'), zeile = alt && alt.closest('.zeile');
        if (zeile) {
          const z = this.zeilen(), idx = z.indexOf('unfall'), aktuell = modusGueltig(this.e.unfall) || modusLesen();
          zeile.style.display = '';
          zeile.className = 'zeile viele' + (z[this.fokus] === 'unfall' ? ' fokus' : '');
          zeile.setAttribute('data-a', 'fokus:' + idx);
          zeile.title = 'Nach einem Sturz: Aus = es passiert nichts, Sanft = selten etwas, Echt = öfter (Motorrad kaputt, Pflaster, Krankenwagen)';
          zeile.innerHTML = '<div class="z-label">🤕 Unfälle</div><div class="z-wert">' +
            MODI.map(([k, t]) => '<span class="pille' + (k === aktuell ? ' aktiv' : '') + '" data-a="wert:unfall:' + k + '">' + t + '</span>').join('') + '</div>';
        }
      } catch (err) { /* nur Optik */ }
      return r;
    };
  }

  /** Für Tests und die Fehlersuche. */
  R.Moto.unfallStart = { unfallSchritt, sturzFolge, szeneStart, modusLesen, modusSchreiben, bild, hudFrame, STATION };
})();
