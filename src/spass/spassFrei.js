// ============================================================
// Spaß-Paket S4 – „🗺️ Freie Fahrt“ (Autorennen UND Motorrad): eine Strecke ohne Gegner und ohne Rennende (99 Runden), dazu 12 versteckte ❓-Schalter (bunte Kisten am Rand
//   und neben der Fahrbahn). Wer an einer Kiste vorbeifährt, startet eine Mini-Aufgabe: 🪙 Goldrausch (8 von 10 Goldstücken in 25 s), 🌀 Slalom (5 von 6 Toren in 30 s),
//   🦘 Sprungweite (in 40 s mindestens 20 m weit springen – die Kiste steht kurz vor einem Trampolin/einer Schanze). Belohnung: Goldstücke aufs Garage-Konto + Sticker.
//   Zähler „Gefunden 3/12“ je Strecke und Spiel gespeichert (rennspiel.spass.frei.<spiel> = { <streckeId>: { gefunden: [nr…], geschafft: [nr…] } }).
//   Abseits der Fahrbahn: befahrbar ist die Wiese bis zum Zaun (die Bande der Strecke, 10–18 m neben der Fahrbahn) – weiter lässt die Physik das Fahrzeug nicht hinaus,
//   dort bleibt es auf der Strecke; die Kisten stehen gezielt auch auf dieser Wiese.
// Rechenteil (Node-testbar): plan (Platzierung, deterministisch), slalomPlan, muenzPlan, slalomTor (Torprüfung), weiteOk.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.config) return;

  R.config.spass = R.config.spass || {};
  R.config.spass.frei = Object.assign({
    anzahl: 12, startFrei: 150, zielFrei: 100, minAbstand: 110, randAbstand: 3.8, trigger: 3.4,
    goldrausch: { n: 10, brauche: 8, zeit: 25, gold: 6, reiheAbstand: 9, laenge: 150 },
    slalom: { tore: 6, brauche: 5, zeit: 30, gold: 8, abstand: 30, versatz: 3.2, breite: 3.6 },
    sprung: { zeit: 40, weite: 20, gold: 6 },
  }, R.config.spass.frei || {});
  const C = () => R.config.spass.frei;

  const hash = (t) => { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const NAMEN = { muenzen: 'Goldrausch', slalom: 'Slalom', sprung: 'Sprungweite' };

  // ---------------------------------------------------------------- Platzierung
  /** Sprung-Elemente der Strecke (Trampolin/Kanone aus dem Spaß-Plan, Schanzen): [{ s }] – davor steht eine „Sprungweite“-Kiste. */
  function sprungStellen(strecke) {
    const l = [];
    ((strecke.spass && strecke.spass.liste) || []).forEach((e) => { if (e.art === 'trampolin') l.push(e.s0); });
    (strecke.schanzen || []).forEach((e) => l.push(e.s));
    return l.sort((a, b) => a - b);
  }

  /** 12 Schalter [{ nr, s, q, art }] rein aus der Streckengeometrie (deterministisch, nie in Sperrzonen, mindestens minAbstand auseinander). */
  function plan(strecke) {
    const c = C(), sp = strecke.spline, L = sp.laenge, breite = strecke.breite || 12;
    const belegt = (R.Spass && R.Spass.sperrZonen) ? R.Spass.sperrZonen(strecke, null, true) : [];
    let rand = 6, minA = c.minAbstand;                               // Rückfall für kurze/volle Strecken: engere Ränder und Abstände (2. Durchgang)
    const frei = (s) => {
      if (s < c.startFrei || s > L - c.zielFrei) return false;
      if (strecke.gabelBei && strecke.gabelBei(s)) return false;
      if (strecke.kreuzungNah && strecke.kreuzungNah(s, 40)) return false;
      for (const b of belegt) if (Math.abs(sp.differenzS(s, b.c)) < b.h + rand) return false;
      return true;
    };
    const seed = hash(String((strecke.daten && strecke.daten.id) || strecke.id || '') + '|frei');
    const gesetzt = [];
    const abstandOk = (s) => gesetzt.every((e) => Math.abs(sp.differenzS(s, e.s)) >= minA);
    const stelle = (wunsch, richtung, art) => {
      for (let v = 0; v < 70; v++) {
        const s = ((wunsch + richtung * v * 8) % L + L) % L;
        if (frei(s) && abstandOk(s)) return s;
        if (v > 0) { const s2 = ((wunsch - richtung * v * 8) % L + L) % L; if (frei(s2) && abstandOk(s2)) return s2; }
      }
      return null;
    };
    // 1) Sprungweite-Kisten: 80 m vor Trampolin/Schanze (höchstens 3)
    sprungStellen(strecke).slice(0, 3).forEach((sj) => {
      let s = null;                                                  // nur davor: 80–220 m vor der Sprungstelle, nächster freier Platz
      for (let d = 80; d <= 220 && s === null; d += 8) { const x = ((sj - d) % L + L) % L; if (frei(x) && abstandOk(x)) s = x; }
      if (s !== null) gesetzt.push({ s, art: 'sprung', rand: 1 });
    });
    // 2) übrige gleichmäßig, Art wechselt (Goldrausch / Slalom)
    const rest = c.anzahl - gesetzt.length, nutz = L - c.startFrei - c.zielFrei, phase = (seed % 61);
    let k = 0;
    for (let i = 0; i < rest + 4 && gesetzt.length < c.anzahl; i++) {
      const wunsch = c.startFrei + nutz * (i + 0.5) / (rest + 4) + phase;
      const s = stelle(wunsch, 1, null);
      if (s === null) continue;
      gesetzt.push({ s, art: k % 2 === 0 ? 'muenzen' : 'slalom', rand: 0 }); k++;
    }
    for (const [r2, a2] of [[4, 80], [3, 55], [1, 40]]) {                     // zu wenige? dann enger platzieren (fantasie/dino sind kurz und voller Stunts)
      if (gesetzt.length >= c.anzahl) break;
      rand = r2; minA = a2;
      for (let i = 0; i < 40 && gesetzt.length < c.anzahl; i++) {
        const s = stelle(c.startFrei + (L - c.startFrei - c.zielFrei) * (i + 0.5) / 40 + phase, 1, null);
        if (s !== null) { gesetzt.push({ s, art: k % 2 === 0 ? 'muenzen' : 'slalom', rand: 0 }); k++; }
      }
    }
    gesetzt.sort((a, b) => a.s - b.s);
    return gesetzt.slice(0, c.anzahl).map((e, i) => {
      const seite = (hash(String(i) + '|' + seed) & 1) ? 1 : -1;
      const nebenWiese = (i % 3 !== 0);                              // 2 von 3 Kisten stehen auf der Wiese neben der Fahrbahn, jede 3. am Fahrbahnrand
      const q = seite * (nebenWiese ? breite / 2 + c.randAbstand : Math.max(1.5, breite / 2 - 1.6));
      return { nr: i, s: e.s, q, art: e.art };
    });
  }

  /** Slalom: n Tore ab sStart (Abstand), Mitte wechselt links/rechts. → [{ s, q }] */
  function slalomPlan(sStart, seite) {
    const c = C().slalom, t = [];
    for (let k = 0; k < c.tore; k++) t.push({ s: sStart + k * c.abstand, q: ((k % 2 === 0) ? 1 : -1) * seite * c.versatz });
    return t;
  }
  /** Tor geschafft? qFahrzeug = Seitenabstand beim Überfahren der Torlinie. */
  function slalomTor(tor, qFahrzeug) { return Math.abs(qFahrzeug - tor.q) <= C().slalom.breite / 2 + 0.7; }

  /** Goldrausch: n Münzen in zwei Schlangenlinien-Reihen ab sStart. → [{ s, q }] (nicht über die Fahrbahn hinaus) */
  function muenzPlan(sStart, breite) {
    const c = C().goldrausch, t = [], halb = breite / 2 - 2;
    for (let i = 0; i < c.n; i++) {
      const s = sStart + (i + 0.5) * (c.laenge / c.n) * 1.0;
      t.push({ s, q: Math.max(-halb, Math.min(halb, Math.sin(i * 0.9) * halb * 0.75)) });
    }
    return t;
  }
  const weiteOk = (m) => m >= C().sprung.weite;

  // ---------------------------------------------------------------- Speicher
  const key = (sp) => 'rennspiel.spass.frei.' + sp;
  const ramS = {};
  function stand(sp, streckeId) {
    const M = R.SpassModi;
    let o = M ? M.speicher.lade(key(sp), null) : ramS[sp] || null;
    if (!o || typeof o !== 'object') o = {};
    const e = o[streckeId] && typeof o[streckeId] === 'object' ? o[streckeId] : {};
    e.gefunden = Array.isArray(e.gefunden) ? e.gefunden : []; e.geschafft = Array.isArray(e.geschafft) ? e.geschafft : [];
    o[streckeId] = e;
    return o;
  }
  function sichern(sp, o) { const M = R.SpassModi; if (M) M.speicher.sichern(key(sp), o); else ramS[sp] = JSON.parse(JSON.stringify(o)); }
  function markieren(sp, streckeId, nr, was) {
    const o = stand(sp, streckeId), e = o[streckeId];
    if (e[was].indexOf(nr) < 0) { e[was].push(nr); sichern(sp, o); return true; }
    return false;
  }
  const anzahl = (sp, streckeId) => stand(sp, streckeId)[streckeId];

  R.SpassFrei = { plan, slalomPlan, slalomTor, muenzPlan, weiteOk, sprungStellen, stand, markieren, anzahl, NAMEN };

  // ================================================================ Browser
  const M = R.SpassModi;
  if (!M || typeof document === 'undefined' || typeof THREE === 'undefined') return;
  const spielName = M.spielName;

  function textur(zeichen, farbeOben, farbeUnten) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, farbeOben); v.addColorStop(1, farbeUnten);
    g.fillStyle = v; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
    g.font = '84px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6;
    g.fillText(zeichen, 64, 70);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 2;
    return t;
  }
  function kisteBauen(texA) {
    const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const mat = new THREE.MeshBasicMaterial({ map: texA });
    const m = new THREE.Mesh(geo, mat); m.name = 'S4Kiste';
    return m;
  }

  M.registriere('frei', {
    einstellungen() { return { gegner: 0, runden: R.config.rennen.rundenMax, modus: 'solo', spielart: 'rennen', polizei: false, geist: false, spass: true }; },
    start(spiel) {
      const st = spiel.strecke, r = spiel.rennen, sp = spielName(), id = (st.daten && st.daten.id) || st.id;
      r.runden = 99;
      if (typeof document !== 'undefined') { M.stil(); document.body.classList.add('s4-frei'); }   // S5 (Teil A): „Runde 1/99“ im HUD ausblenden
      const liste = plan(st);
      const texFrage = textur('❓', '#ffcf3a', '#e07b00'), texHaken = textur('✔', '#49d36b', '#1c8a3e');
      const gruppe = new THREE.Group(); gruppe.name = 'S4Frei';
      const stand0 = anzahl(sp, id);
      const kisten = liste.map((e) => {
        const p = st.spline.punktBei(e.s), x = p.x + p.nx * e.q, z = p.z + p.nz * e.q, y = st.hoeheAn(x, z);
        const m = kisteBauen(texFrage); m.position.set(x, y + 1.5, z); gruppe.add(m);
        const k = { e, x, y, z, mesh: m, gefunden: stand0.gefunden.indexOf(e.nr) >= 0, fertig: stand0.geschafft.indexOf(e.nr) >= 0 };
        if (k.fertig) { m.material.map = texHaken; m.material.needsUpdate = true; }
        return k;
      });
      spiel.szene.add(gruppe);
      spiel.s4.frei = { id, sp, liste, kisten, gruppe, texFrage, texHaken, aufgabe: null, muenzen: null, tore: null, gesamtGold: 0, zeit: 0 };
      // „Alle gefunden“ schon aus früheren Besuchen? (Zähler zeigt es)
    },
    schritt(spiel, dt) {
      const z = spiel.s4.frei, r = spiel.rennen, t = r.teilnehmer[0], f = spiel.fahrzeuge[0], v = f.vehicle, st = spiel.strecke;
      if (!z) return;
      z.zeit += dt;
      // ---- aktive Aufgabe
      const a = z.aufgabe;
      if (a) {
        a.t += dt;
        if (a.art === 'muenzen') {
          const n = z.muenzen.schritt(v.x, v.y, v.z); a.zaehl += n;
          if (a.zaehl >= C().goldrausch.brauche) aufgabeEnde(spiel, z, true, `${a.zaehl} Goldstücke!`);
          else if (a.t >= C().goldrausch.zeit) aufgabeEnde(spiel, z, false, `nur ${a.zaehl} von ${C().goldrausch.brauche}`);
        } else if (a.art === 'slalom') {
          const sp = st.spline;
          for (let k = a.naechst; k < z.tore.length; k++) {
            const tor = z.tore[k];
            if (sp.differenzS(t.s, tor.s) >= 0) {                       // Torlinie überfahren
              if (slalomTor(tor, t.seitenabstand)) { a.zaehl++; tor.ok = true; spiel._meldung(0, '✔ Tor ' + a.zaehl, 500); } else { tor.ok = false; a.verpasst++; spiel._meldung(0, '✖ vorbei', 600); }
              tor.mesh.children.forEach((c) => { c.material = tor.ok ? z.matGut : z.matSchlecht; });
              a.naechst = k + 1;
            } else break;
          }
          const c = C().slalom;
          if (a.zaehl >= c.brauche) aufgabeEnde(spiel, z, true, `${a.zaehl} von ${c.tore} Toren!`);
          else if (a.verpasst > c.tore - c.brauche || a.naechst >= c.tore || a.t >= c.zeit) aufgabeEnde(spiel, z, false, `${a.zaehl} von ${c.tore} Toren`);
        } else if (a.art === 'sprung') {
          if (a.landungen > a.landungenStart) {
            const m = f.flug.letzteWeite; a.weite = Math.max(a.weite, m);
            a.landungenStart = a.landungen;
            if (weiteOk(m)) aufgabeEnde(spiel, z, true, `${Math.round(m)} m weit!`);
            else spiel._meldung(0, Math.round(m) + ' m – weiter!', 900);
          }
          if (a.t >= C().sprung.zeit && z.aufgabe) aufgabeEnde(spiel, z, false, a.weite ? `nur ${Math.round(a.weite)} m` : 'kein Sprung');
        }
        return;
      }
      // ---- Kisten: vorbeifahren löst aus (nur am Boden, nicht im Flug)
      if ((f.flug && f.flug.aktiv) || z.zeit < (z.sperreBis || 0)) return;
      for (const k of z.kisten) {
        if (k.fertig) continue;
        const dx = k.x - v.x, dz = k.z - v.z;
        if (dx * dx + dz * dz < C().trigger * C().trigger && Math.abs(k.y - v.y) < 4) { aufgabeStart(spiel, z, k); break; }
      }
    },
    flug(spiel, i, e) {
      const z = spiel.s4.frei, f = spiel.fahrzeuge[i];
      if (z && z.aufgabe && z.aufgabe.art === 'sprung' && f && f.istSpieler && (e === 'landung' || e === 'landungSchraeg')) z.aufgabe.landungen++;
    },
    ereignis() { /* Kanone zählt hier nicht */ },
    bild(spiel) {
      const z = spiel.s4 && spiel.s4.frei;
      if (!z) return;
      const tm = spiel._physikZeit || 0;
      z.kisten.forEach((k, i) => { k.mesh.rotation.y = tm * 0.9 + i; k.mesh.position.y = k.y + 1.5 + Math.sin(tm * 2 + i * 1.7) * 0.18; });
      if (z.muenzen) z.muenzen.animieren(tm);
      if (spiel.zustand !== 'rennen') { M.hudWeg(); return; }
      const sp = z.sp, e = anzahl(sp, z.id), gef = e.gefunden.length, a = z.aufgabe, c = C();
      let zeile = '';
      if (a) {
        const lim = a.art === 'muenzen' ? c.goldrausch.zeit : a.art === 'slalom' ? c.slalom.zeit : c.sprung.zeit, rest = Math.max(0, lim - a.t);
        const ziel = a.art === 'muenzen' ? `🪙 ${a.zaehl}/${c.goldrausch.brauche}` : a.art === 'slalom' ? `🌀 ${a.zaehl}/${c.slalom.brauche} Tore` : `🦘 Spring ≥ ${c.sprung.weite} m weit`;
        zeile = `<small>❓ <b>${NAMEN[a.art]}</b>: ${ziel} · ⏱ <span${rest < 6 ? ' class="rot"' : ''}>${rest.toFixed(0)} s</span></small>`;
      } else zeile = `<small>Fahr an den bunten ❓-Kisten vorbei – sie verstecken Aufgaben!</small>`;
      M.hud(`🗺️ <b>Freie Fahrt</b> · ❓ Gefunden <b>${gef}/${z.liste.length}</b> · 🪙 ${z.gesamtGold} verdient${zeile}`);
    },
    aufraeumen(spiel) {
      if (typeof document !== 'undefined') document.body.classList.remove('s4-frei');
      const z = spiel.s4 && spiel.s4.frei;
      if (!z) return;
      aufgabeWeg(z);
      if (z.gruppe) { if (z.gruppe.parent) z.gruppe.parent.remove(z.gruppe); z.gruppe.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      if (z.texFrage) z.texFrage.dispose(); if (z.texHaken) z.texHaken.dispose();
    },
  });

  function aufgabeWeg(z) {
    if (z.muenzen) { z.muenzen.entfernen(); z.muenzen = null; }
    if (z.tore) { z.tore.forEach((t) => { if (t.mesh) { if (t.mesh.parent) t.mesh.parent.remove(t.mesh); t.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } }); z.tore = null; }
    z.aufgabe = null;
  }

  function aufgabeStart(spiel, z, k) {
    const st = spiel.strecke, sp = st.spline, t = spiel.rennen.teilnehmer[0], art = k.e.art, c = C();
    const sNow = t.s, seite = t.seitenabstand >= 0 ? 1 : -1;
    const erstesMal = markieren(z.sp, z.id, k.e.nr, 'gefunden');
    k.gefunden = true;
    z.aufgabe = { art, k, t: 0, zaehl: 0, verpasst: 0, naechst: 0, weite: 0, landungen: 0, landungenStart: 0 };
    if (art === 'muenzen') {
      const pl = muenzPlan(sNow + 12, st.breite || 12);
      z.muenzen = new M.Muenzen(spiel, pl.map((e) => { const p = sp.punktBei(e.s), x = p.x + p.nx * e.q, zz = p.z + p.nz * e.q; return { x, z: zz, y: st.hoeheAn(x, zz) }; }), { radius: 2.8 });
      spiel._meldung(0, '🪙 Goldrausch! Sammle ' + c.goldrausch.brauche + ' in ' + c.goldrausch.zeit + ' s', 2200);
    } else if (art === 'slalom') {
      if (!z.matGut) { z.matGut = new THREE.MeshBasicMaterial({ color: 0x49d36b }); z.matSchlecht = new THREE.MeshBasicMaterial({ color: 0xd6381f }); z.matStange = new THREE.MeshBasicMaterial({ color: 0xffd23a }); }
      z.tore = slalomPlan(sNow + 22, seite).map((tor) => {
        const g = new THREE.Group();
        [-1, 1].forEach((sg) => {
          const p = sp.punktBei(tor.s), q = tor.q + sg * c.slalom.breite / 2, x = p.x + p.nx * q, zz = p.z + p.nz * q;
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), z.matStange);
          m.position.set(x, st.hoeheAn(x, zz) + 1.3, zz); g.add(m);
        });
        spiel.szene.add(g);
        return { s: tor.s, q: tor.q, mesh: g, ok: null };
      });
      spiel._meldung(0, '🌀 Slalom! Fahr durch ' + c.slalom.brauche + ' von ' + c.slalom.tore + ' Toren', 2200);
    } else {
      spiel._meldung(0, '🦘 Sprungweite! Spring ≥ ' + c.sprung.weite + ' m weit', 2200);
    }
    void erstesMal;
    const e = anzahl(z.sp, z.id);
    if (R.Spass.sticker) R.Spass.sticker('frei', { gefunden: e.gefunden.length, gesamt: z.liste.length });
  }

  function aufgabeEnde(spiel, z, ok, text) {
    const a = z.aufgabe;
    if (!a) return;
    const k = a.k, c = C(), name = spiel.rennen.teilnehmer[0].name;
    const gold = ok ? (a.art === 'muenzen' ? c.goldrausch.gold : a.art === 'slalom' ? c.slalom.gold : c.sprung.gold) : 0;
    aufgabeWeg(z);
    if (ok) {
      k.fertig = true; k.mesh.material.map = z.texHaken; k.mesh.material.needsUpdate = true;
      markieren(z.sp, z.id, k.e.nr, 'geschafft');
      z.gesamtGold += gold;
      if (R.Garage && R.Garage.gutschreiben && name) { try { R.Garage.gutschreiben(name, gold); } catch (e) { /* egal */ } }
      spiel._meldung(0, '🎉 ' + NAMEN[a.art] + ' geschafft: ' + text + ' +' + gold + ' 🪙', 2800);
      if (R.SpassModi && spiel.spassKonfetti) { const v = spiel.fahrzeuge[0].vehicle; spiel.spassKonfetti.burst(v.x, v.y + 2, v.z, 70); }
      if (R.Spass.sticker) { const e = anzahl(z.sp, z.id); R.Spass.sticker('freiAufgabe', { geschafft: e.geschafft.length, gesamt: z.liste.length }); }
      if (R.Audio && R.Audio.ziel) { try { R.Audio.ziel(1); } catch (e) { /* egal */ } }
    } else {
      spiel._meldung(0, '😅 ' + NAMEN[a.art] + ': ' + text + ' – fahr nochmal an die Kiste!', 2800);
    }
    z.sperreBis = z.zeit + 6;      // damit die Kiste nicht sofort wieder auslöst (bleibt aktiv, bis die Aufgabe geschafft ist)
  }
})();
