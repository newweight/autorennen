// ============================================================
// Stufe R2 – Online-Modi im Browser (Autorennen UND Motorrad; läuft ganz am Ende, nur Umhüllungen von R.Online.Bildschirm, wie spassOnlineS8.js):
//   Lobby (nur Host, nur wenn der Server `hallo.r2` meldet):  Modus (Rennen · ⭐ Kurz-Level · 🚪 K.-o.-Rallye · 🗺️ Freie Fahrt) · Level · Freie-Fahrt-Zeit · 👻 Geist · 🦖 Dino
//   Der SERVER rechnet alles (server/r2Sim.js, Kern src/spass/spassR2Kern.js); der Browser zeigt nur an:
//     ⭐ Kurz-Level    Start nebeneinander (R.SpassR2.plaetze), eigene Münzwelt, HUD, Ergebnis mit Sternen → Fortschritt/Bestzeit + Gold in die Garage-Kasse
//     🚪 K.-o.-Rallye  Ereignis `raus`: Puff, Zuschauerkamera, eigener Ausfall (Vorhersage steht still), HUD wie offline
//     🗺️ Freie Fahrt   12 ❓-Kisten (SpassFrei.plan), „vergeben“/✔ je Kiste, private Aufgabe (Münzen/Slalom/Sprung), Gold in die Garage-Kasse
//     👻 Geist         nur Client: eigener bester Lauf (Schlüssel streckeId|autoId|online), Aufnahme mit der Vorhersage-Pose, Rundenzeit vom Server
//     🦖 Dino          Server-Aufgaben (dinoGold/-Sammeln/-Wett/-Ende) → Anzeige über den Extern-Modus in spassWeltenUI.js (spiel.dinoExtern)
//   Ohne R2-Wahl und ohne `hallo.r2` ändert sich nichts (kein Codepfad, alles bitgleich wie vorher).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Online || !R.Online.Bildschirm || !R.SpassR2 || !R.SpassModi) return;
  const B = R.Online.Bildschirm.prototype;
  if (B._spassR2) return;
  B._spassR2 = true;
  const K = R.SpassR2, M = R.SpassModi;
  const SP = () => (window.MOTORRAD === true ? 'motorrad' : 'auto');
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const S = { serverR2: false };
  const einst = (ui) => (ui.lobby && ui.lobby.einstellungen) || {};
  const fehler = (X, was, err) => { if (!X || !X['f_' + was]) { if (X) X['f_' + was] = 1; console.error('R2 online (' + was + '):', err); } };
  const mel = (ui, text, ms) => { try { const h = ui.spiel.huds && ui.spiel.huds[0]; if (h && h.meldung) h.meldung(text, ms || 1800); } catch (e) { /* egal */ } };
  const garageGold = (ui, n) => {
    try { const nm = ui.spiel.rennen.teilnehmer[ui.du].name; if (n > 0 && R.Garage && R.Garage.gutschreiben && nm) R.Garage.gutschreiben(nm, n); } catch (e) { /* Konto egal */ }
  };
  const ton = (name, ...a) => { try { if (R.Audio && R.Audio[name]) R.Audio[name](...a); } catch (e) { /* Ton egal */ } };
  const sterneText = (n) => (n > 0 ? '⭐'.repeat(n) : '–');
  const zeitT = (s) => (R.zeitText ? R.zeitText(s) : (+s).toFixed(1) + ' s');

  // ---------- hallo.r2 merken (der Server meldet, dass er die R2-Modi kann; ein alter Server schweigt → keine Zeilen) ----------
  if (R.NetzVerbindung && R.NetzVerbindung.prototype) {
    const bei = R.NetzVerbindung.prototype.bei;
    R.NetzVerbindung.prototype.bei = function (t, fn) {
      if (t === 'hallo' && !this._r2h) { this._r2h = true; S.serverR2 = false; bei.call(this, 'hallo', (m) => { S.serverR2 = !!m && m.r2 === true; }); }
      return bei.apply(this, arguments);
    };
  }

  // ================================================================ Lobby
  const MODI_TEXT = { rennen: '🏁 Rennen', kurz: '⭐ Kurz-Level', ko: '🚪 K.-o.-Rallye', frei: '🗺️ Freie Fahrt' };
  const DINO_TEXT = { aus: 'Aus', dino: '🦖 Dino-Strecke', immer: '🦖 Überall' };
  const ZEILEN = ['r2modus', 'r2level', 'r2frei', 'r2geist', 'r2dino'];
  const LABEL = { r2modus: '🎮 Spielart', r2level: '⭐ Level', r2frei: '⏱ Dauer', r2geist: '👻 Geist', r2dino: '🦖 Dino-Freund' };

  const zeilen = B.zeilen;
  B.zeilen = function () {
    const z = zeilen.apply(this, arguments);
    if (this.istHost && S.serverR2) {
      const m = einst(this).modus || 'rennen';
      z.push('r2modus');
      if (m === 'kurz') z.push('r2level'); else if (m === 'frei') z.push('r2frei'); else if (m === 'rennen') z.push('r2geist', 'r2dino');
    }
    return z;
  };
  const werte = B.werte;
  B.werte = function (zeile) {
    if (ZEILEN.indexOf(zeile) < 0) return werte.apply(this, arguments);
    const e = einst(this);
    if (zeile === 'r2modus') return { wert: e.modus || 'rennen', liste: K.MODI.map((k) => ({ k, text: MODI_TEXT[k] })) };
    if (zeile === 'r2level') { const l = K.levelListe(SP()); return { wert: e.level || l[0].id, liste: l.map((x, i) => ({ k: x.id, text: x.emoji + ' ' + (i + 1), titel: x.titel })) }; }
    if (zeile === 'r2frei') return { wert: String(e.freiZeit || 5), liste: K.FREI_ZEITEN.map((n) => ({ k: String(n), text: n + ' min' })) };
    if (zeile === 'r2geist') return { wert: e.geist === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '👻 An' }] };
    return { wert: e.dino || 'aus', liste: K.DINO.map((k) => ({ k, text: DINO_TEXT[k] })) };
  };
  const MAP = {
    r2modus: (k) => ({ modus: k }), r2level: (k) => ({ level: k }), r2frei: (k) => ({ freiZeit: +k }),
    r2geist: (k) => ({ geist: k === 'an' }), r2dino: (k) => ({ dino: k }),
  };
  const wertSetzen = B.wertSetzen;
  B.wertSetzen = function (zeile, k) {
    if (MAP[zeile]) {
      if (!this.verb || !this.lobby || !this.istHost || !S.serverR2) return;
      this.verb.senden({ t: 'einstellungen', einstellungen: MAP[zeile](k) });
      return;
    }
    return wertSetzen.apply(this, arguments);
  };
  function hinweisText(e) {
    if (e.modus === 'kurz') return '⭐ Kurz-Level: Strecke, Wetter und Gegner legt das Level fest – alle starten zusammen, jeder sammelt für sich.';
    if (e.modus === 'ko') return '🚪 K.-o.-Rallye: mindestens 3 Computer – an jeder Wertung fliegt der Letzte raus. Runden und Gegner passen sich an.';
    if (e.modus === 'frei') return '🗺️ Freie Fahrt: ohne Gegner, ihr findet zusammen die ❓-Kisten (' + (e.freiZeit || 5) + ' min). Strecke und Wetter wählt der Host.';
    const t = [];
    if (e.geist === true) t.push('👻 Geist: dein bester Lauf fährt mit');
    if (e.dino === 'dino' || e.dino === 'immer') t.push('🦖 Dino-Freund wirft Gold und fordert zum Wettrennen');
    return t.join(' · ');
  }
  const htmlLobby = B.htmlLobby;
  B.htmlLobby = function () {
    let h = htmlLobby.apply(this, arguments);
    try {
      const e = einst(this), hint = hinweisText(e);
      if (this.istHost && S.serverR2) {
        const z = this.zeilen();
        const reihe = (id) => {
          const w = this.werte(id);
          return `<div class="on-zeile${z.indexOf(id) === this.fokus ? ' fokus' : ''}" data-a="fokus:${z.indexOf(id)}"><div class="on-label">${LABEL[id]}</div><div class="on-werte">` +
            w.liste.map((x) => `<span class="pille${x.k === w.wert ? ' aktiv' : ''}"${x.titel ? ` title="${esc(x.titel)}"` : ''} data-a="wert:${id}:${esc(x.k)}">${esc(x.text)}</span>`).join('') + '</div></div>';
        };
        const t = z.filter((id) => ZEILEN.indexOf(id) >= 0).map(reihe).join('') + (hint ? `<div class="on-info on-r2">${esc(hint)}</div>` : '');
        h = h.replace('<div class="on-fest">', t + '<div class="on-fest">');
      } else if (hint) {
        h = h.replace(/(<div class="on-zusammen">[\s\S]*?)(<\/div>)/, `$1<br>${esc(hint)}$2`);
      }
    } catch (err) { console.error('R2 (Lobby):', err); }
    return h;
  };
  const lobbyEmpfangen = B.lobbyEmpfangen;
  B.lobbyEmpfangen = function (m) {
    const r = lobbyEmpfangen.apply(this, arguments);
    try { const n = this.zeilen().length; if (this.fokus >= n) this.fokus = Math.max(0, n - 1); } catch (e) { /* egal */ }
    return r;
  };

  // ================================================================ Rennen
  const startEmpfangen = B.startEmpfangen;
  B.startEmpfangen = function (m) { this._r2start = m ? { e: m.einstellungen || {}, r2: m.r2 || null } : null; return startEmpfangen.apply(this, arguments); };

  const rennenAufbauen = B.rennenAufbauen;
  B.rennenAufbauen = function (m) {
    abbau(this);
    const r = rennenAufbauen.apply(this, arguments);
    const e = (m && m.einstellungen) || {};
    if (e.modus || e.geist === true || e.dino === 'dino' || e.dino === 'immer') {
      try { aufbau(this, m); } catch (err) { console.error('R2 online (Aufbau):', err); }
    }
    return r;
  };
  const rennenAbbauen = B.rennenAbbauen;
  B.rennenAbbauen = function () { try { abbau(this); } catch (e) { console.error('R2 online (Abbau):', e); } return rennenAbbauen.apply(this, arguments); };

  const zustandEmpfangen = B.zustandEmpfangen;
  B.zustandEmpfangen = function (z) {
    const r = zustandEmpfangen.apply(this, arguments);
    const X = this._r2;
    if (X && z && z.ich && Array.isArray(z.ich.r2)) { X.zaehl = Math.max(X.zaehl || 0, z.ich.r2[0] | 0); X.status = z.ich.r2[1] | 0; }
    return r;
  };

  const ereignisEmpfangen = B.ereignisEmpfangen;
  B.ereignisEmpfangen = function (m) {
    const r = ereignisEmpfangen.apply(this, arguments);
    const X = this._r2;
    if (X && this.phase === 'rennen' && m && typeof m.art === 'string') {
      try { ereignis(this, X, m); } catch (err) { fehler(X, 'ereignis', err); }
    }
    return r;
  };

  const ergebnisEmpfangen = B.ergebnisEmpfangen;
  B.ergebnisEmpfangen = function (m) {
    const X = this._r2, war = this.phase === 'rennen';
    const r = ergebnisEmpfangen.apply(this, arguments);
    if (war && X) { try { ergebnis(this, X, m); } catch (err) { fehler(X, 'ergebnis', err); } }
    return r;
  };

  const physikSchritt = B.physikSchritt;
  B.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    const X = this._r2;
    if (X && this.phase === 'rennen') { try { schritt(this, X, dt); } catch (err) { fehler(X, 'schritt', err); } }
    return r;
  };

  // ---------------------------------------------------------------- Aufbau / Abbau
  function aufbau(ui, m) {
    const e = m.einstellungen || {}, spiel = ui.spiel, st = spiel.strecke, info = m.r2 || {};
    const X = ui._r2 = { e, art: SP(), t: 0, n: 0, zaehl: 0, status: 0 };
    if (e.modus === 'kurz' && info.kurz) kurzAufbau(ui, X, info.kurz);
    else if (e.modus === 'ko') koAufbau(ui, X, info.ko || {});
    else if (e.modus === 'frei') freiAufbau(ui, X, info.frei || {});
    else if (!e.modus) {
      if (e.geist === true) geistAufbau(ui, X, m);
      if (e.dino === 'dino' || e.dino === 'immer') dinoAufbau(ui, X, st);
    }
  }
  function abbau(ui) {
    const X = ui._r2;
    if (!X) return;
    ui._r2 = null;
    try { M.hudWeg(); } catch (e) { /* egal */ }
    try { document.body.classList.remove('s4-frei'); } catch (e) { /* egal */ }
    if (X.muenzen) { try { X.muenzen.entfernen(); } catch (e) { /* egal */ } }
    if (X.fr) freiAbbau(X.fr);
    if (X.geist && X.geist.mesh) loesen(X.geist.mesh);
    if (ui.spiel && ui.spiel.dinoExtern) ui.spiel.dinoExtern = null;
  }
  function loesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const a = Array.isArray(o.material) ? o.material : [o.material]; a.forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); } });
  }

  // ---------------------------------------------------------------- Ereignisse
  function ereignis(ui, X, m) {
    const spiel = ui.spiel, r = spiel.rennen, du = ui.du, t = r.teilnehmer[m.nr];
    if (X.kurz) {
      if (m.art === 'kMuenze' && X.muenzen) {
        (m.ids || []).forEach((id) => { const c = X.muenzen.punkte[id]; if (c && !c.weg) { c.weg = true; X.muenzen.gesammelt++; } });
        X.zaehl = Math.max(X.zaehl, m.n | 0); ton('muenze');
      } else if (m.art === 'kurz') kurzFertig(ui, X, m, t);
    } else if (X.ko) {
      if (m.art === 'raus' && t) koRaus(ui, X, m, t);
      else if (m.art === 'wertung') mel(ui, '✔ Wertung ' + m.n, 700);
      else if (m.art === 'finale' && !X.ko.finale) { X.ko.finale = true; if (!X.raus) mel(ui, '🏁 Finale! Nur noch zwei!', 2600); }
    } else if (X.fr) freiEreignis(ui, X, m);
    else if (X.dinoQ) dinoEreignis(ui, X, m);
    if (X.geist && m.art === 'runde' && m.nr === du) geistRunde(ui, X, m);
  }

  function schritt(ui, X, dt) {
    const spiel = ui.spiel, r = spiel.rennen;
    X.t += dt; X.n++;
    const tm = spiel._physikZeit || 0;
    if (X.kurz) {
      if (X.muenzen) X.muenzen.animieren(tm);
      if (X.n % 6 === 0) kurzHud(ui, X);
    } else if (X.ko) {
      if (X.raus) zuschauer(ui);
      if (X.n % 6 === 0) koHud(ui, X);
    } else if (X.fr) {
      freiSchritt(ui, X, dt, tm);
      if (X.n % 6 === 0) freiHud(ui, X);
    }
    if (X.geist) geistSchritt(ui, X, dt);
    void r;
  }

  // ================================================================ Kurz-Level
  function kurzAufbau(ui, X, info) {
    const spiel = ui.spiel, st = spiel.strecke, e = X.e;
    const k = K.kurzAbschnitt(st, Object.assign({}, e, { moto: window.MOTORRAD === true }));
    if (!k) return;
    X.kurz = { def: k.def, ab: k.ab, info };
    if (spiel.muenzen) { try { spiel.muenzen.zerstoeren(); } catch (err) { /* egal */ } spiel.muenzen = null; }       // die Garage-Münzen gehören nicht in die Level-Wertung
    if (k.def.art === 'muenzen') {
      const pts = K.weltPunkte(st, R.SpassKurz.muenzPlan(st, k.ab.s0, k.ab.s1, k.def.n));
      X.muenzen = new M.Muenzen(spiel, pts);
    }
    kurzHud(ui, X);
  }
  function kurzHud(ui, X) {
    const spiel = ui.spiel, r = spiel.rennen, d = X.kurz.def, SK = R.SpassKurz, t = r.teilnehmer[ui.du];
    if (X.fertig) {
      const f = X.fertig;
      const k = f.status === 'geschafft' ? `🎉 <b>Geschafft!</b> ${sterneText(f.sterne)} in ${(+f.zeit).toFixed(1)} s` : (f.status === 'zeitUm' ? '⏱️ <b>Zeit um!</b>' : '🚩 <b>Ziel verpasst!</b>');
      M.hud(`${d.emoji} ${k}<small>Warte auf die anderen … (Esc = Rennen verlassen)</small>`);
      return;
    }
    const lst = SK.liste(SP()), nr = lst.findIndex((x) => x.id === d.id) + 1;
    const zeit = r.zustand === 'laeuft' ? r.zeit : 0, lim = X.kurz.info.limit, rest = Math.max(0, Math.round(X.kurz.ab.s1 - (t ? t.fortschritt : 0)));
    const n = d.art === 'ziel' ? '' : (d.art === 'muenzen' ? '🪙 ' : '') + Math.min(X.zaehl, d.n) + '/' + d.n + ' · ';
    M.hud(`${d.emoji} <b>Level ${nr}</b> · ${SK.aufgabeText(d)}<small>${n}⏱ <span${lim - zeit < 10 ? ' class="rot"' : ''}>${zeit.toFixed(0)} s</span> (Limit ${lim} s) · ${rest} m bis zum Ziel</small>`);
  }
  function kurzFertig(ui, X, m, t) {
    const spiel = ui.spiel, name = t ? t.name : '';
    if (m.nr !== ui.du) { mel(ui, `${name}: ${m.status === 'geschafft' ? sterneText(m.sterne) + ' ' + (+m.zeit).toFixed(1) + ' s' : (m.status === 'zeitUm' ? '⏱️ Zeit um' : '🚩 verpasst')}`, 2200); return; }
    X.fertig = { status: m.status, sterne: m.sterne | 0, zeit: m.zeit };
    if (m.status === 'geschafft') {
      let erg = null;
      try { erg = R.SpassKurz.eintragen(SP(), X.kurz.def.id, m.sterne | 0, +m.zeit); } catch (e) { /* Fortschritt egal */ }
      if (erg && erg.gold) garageGold(ui, erg.gold);
      mel(ui, '🎉 Geschafft! ' + sterneText(m.sterne) + (erg && erg.gold ? ' · +' + erg.gold + ' 🪙' : '') + (erg && erg.neuerRekord ? ' · 🏅 neue Bestzeit!' : ''), 3200);
      ton('ziel', 1);
      try { if (spiel.spassKonfetti) { const v = spiel.fahrzeuge[ui.du].vehicle; spiel.spassKonfetti.burst(v.x, v.y + 3, v.z, 120); } } catch (e) { /* Optik */ }
    } else mel(ui, m.status === 'zeitUm' ? '⏱️ Zeit um!' : '🚩 Ziel verpasst!', 2600);
    kurzHud(ui, X);
  }

  // ================================================================ K.-o.-Rallye
  function koAufbau(ui, X, info) {
    const spiel = ui.spiel, r = spiel.rennen;
    r.elimination = { zuschauerSekunden: R.config.spass.ko.zuschauerSekunden, ko: true };
    r._koWert = info.wertungen || R.SpassKO.wertungen(spiel.strecke);
    X.ko = { finale: false };
    koHud(ui, X);
  }
  function koHud(ui, X) {
    const r = ui.spiel.rennen, s = R.SpassKO.status(r);
    const k = s.finale ? '🏁 FINALE – nur noch zwei!' : `Nächste Wertung: Platz ${s.aktive} fliegt raus`;
    M.hud(`🚪 <b>K.-o.-Rallye</b> · noch <b>${s.aktive}</b> im Rennen<small>${X.raus ? '🚪 Du bist raus – schau zu!' : k + ' · Wertung ' + Math.min(s.naechste, s.gesamt) + '/' + s.gesamt}</small>`);
  }
  function koRaus(ui, X, m, t) {
    const spiel = ui.spiel, r = spiel.rennen;
    if (t.ausgeschieden) return;
    t.ausgeschieden = true; t.ausscheidNr = m.n; t.ausscheidRunde = m.w; r.ausgeschiedene.push(t);
    spiel._ausgeschieden(t);
    if (m.nr === ui.du) {
      X.raus = true;
      const V = ui.vorhersage;
      if (V) { V.schritt = function () { }; V.abgleich = function () { }; }       // der Server hat den Wagen geparkt – die Vorhersage steht still
      mel(ui, '🚪 Du bist raus – schau zu!', 3000);
    }
  }
  /** Ausgeschiedene schauen dem Führenden zu (online ist die eigene Kamera die Nr. 0, das eigene Auto aber fahrzeuge[du]). */
  function zuschauer(ui) {
    const spiel = ui.spiel, r = spiel.rennen, k = spiel.kameras && spiel.kameras[0];
    if (!k) return;
    const fuehrend = r.rangliste.find((t) => !t.ausgeschieden) || r.rangliste[0], lf = fuehrend && spiel.fahrzeuge[fuehrend.nr];
    if (lf && k.ziel !== lf.vehicle) k.folge(lf.vehicle, lf.anzeige);
  }

  // ================================================================ Freie Fahrt
  function textur(zeichen, oben, unten) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, oben); v.addColorStop(1, unten);
    g.fillStyle = v; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
    g.font = '84px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6; g.fillText(zeichen, 64, 70);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 2; return t;
  }
  function freiAufbau(ui, X, info) {
    const spiel = ui.spiel, st = spiel.strecke, SF = R.SpassFrei;
    document.body.classList.add('s4-frei');
    M.stil();
    const liste = SF.plan(st);
    const tex = { frage: textur('❓', '#ffcf3a', '#e07b00'), haken: textur('✔', '#49d36b', '#1c8a3e'), warte: textur('⏳', '#9aa3b5', '#5b6477'), dein: textur('🎯', '#5ab0ff', '#1f5fb8') };
    const gruppe = new THREE.Group(); gruppe.name = 'R2Frei';
    const kisten = liste.map((e) => {
      const p = st.spline.punktBei(e.s), x = p.x + p.nx * e.q, z = p.z + p.nz * e.q, y = st.hoeheAn(x, z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex.frage }));
      m.position.set(x, y + 1.5, z); gruppe.add(m);
      return { e, x, y, z, mesh: m, st: 0, von: -1 };
    });
    spiel.szene.add(gruppe);
    X.fr = { liste, kisten, gruppe, tex, aufgabe: null, muenzen: null, tore: null, gold: 0, limit: info.limit || 300, matGut: null };
    X.fr.mats = [];
    freiHud(ui, X);
  }
  function freiAbbau(F) {
    freiAufgabeWeg(F);
    if (F.gruppe) loesen(F.gruppe);
    Object.keys(F.tex || {}).forEach((k) => F.tex[k].dispose());
    (F.mats || []).forEach((m) => m.dispose());
  }
  function freiAufgabeWeg(F) {
    if (F.muenzen) { F.muenzen.entfernen(); F.muenzen = null; }
    if (F.tore) { F.tore.forEach((t) => { if (t.mesh) { if (t.mesh.parent) t.mesh.parent.remove(t.mesh); t.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } }); F.tore = null; }
    F.aufgabe = null;
  }
  const NAMEN = () => R.SpassFrei.NAMEN;
  function freiEreignis(ui, X, m) {
    const spiel = ui.spiel, F = X.fr, st = spiel.strecke, SF = R.SpassFrei, C = R.config.spass.frei;
    if (m.art === 'frKiste') {
      const k = F.kisten.find((x) => x.e.nr === m.k);
      if (!k) return;
      k.st = m.st | 0; k.von = m.von;
      const tx = k.st === 2 ? F.tex.haken : k.st === 1 ? (k.von === ui.du ? F.tex.dein : F.tex.warte) : F.tex.frage;
      k.mesh.material.map = tx; k.mesh.material.needsUpdate = true;
    } else if (m.art === 'frAufgabe') {
      freiAufgabeWeg(F);
      const art = m.aufgabe, sp = st.spline;
      F.aufgabe = { art, k: m.k, t: 0, zaehl: 0 };
      if (art === 'muenzen') {
        F.muenzen = new M.Muenzen(spiel, K.weltPunkte(st, SF.muenzPlan(m.s + 12, st.breite || 12)), { radius: 2.8 });
        mel(ui, '🪙 Goldrausch! Sammle ' + C.goldrausch.brauche + ' in ' + C.goldrausch.zeit + ' s', 2200);
      } else if (art === 'slalom') {
        if (!F.matGut) { F.matGut = new THREE.MeshBasicMaterial({ color: 0x49d36b }); F.matSchlecht = new THREE.MeshBasicMaterial({ color: 0xd6381f }); F.matStange = new THREE.MeshBasicMaterial({ color: 0xffd23a }); F.mats.push(F.matGut, F.matSchlecht, F.matStange); }
        F.tore = SF.slalomPlan(m.s + 22, m.seite).map((tor) => {
          const g = new THREE.Group();
          [-1, 1].forEach((sg) => {
            const p = sp.punktBei(tor.s), q = tor.q + sg * C.slalom.breite / 2, x = p.x + p.nx * q, zz = p.z + p.nz * q;
            const me = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), F.matStange);
            me.position.set(x, st.hoeheAn(x, zz) + 1.3, zz); g.add(me);
          });
          spiel.szene.add(g);
          return { s: tor.s, q: tor.q, mesh: g, ok: null };
        });
        mel(ui, '🌀 Slalom! Fahr durch ' + C.slalom.brauche + ' von ' + C.slalom.tore + ' Toren', 2200);
      } else mel(ui, '🦘 Sprungweite! Spring ≥ ' + C.sprung.weite + ' m weit', 2200);
    } else if (m.art === 'frMuenze' && F.muenzen) {
      (m.ids || []).forEach((id) => { const c = F.muenzen.punkte[id]; if (c && !c.weg) { c.weg = true; F.muenzen.gesammelt++; } });
      if (F.aufgabe) F.aufgabe.zaehl = m.n | 0;
      ton('muenze');
    } else if (m.art === 'frTor' && F.tore) {
      const tor = F.tore[m.k];
      if (tor) { tor.ok = !!m.ok; tor.mesh.children.forEach((c) => { c.material = tor.ok ? F.matGut : F.matSchlecht; }); }
      if (F.aufgabe) F.aufgabe.zaehl = m.n | 0;
      mel(ui, m.ok ? '✔ Tor ' + m.n : '✖ vorbei', m.ok ? 500 : 600);
    } else if (m.art === 'frWeite') mel(ui, m.text, 900);
    else if (m.art === 'frEnde') {
      const art = m.aufgabe;
      freiAufgabeWeg(F);
      if (m.ok) {
        F.gold += m.gold | 0; garageGold(ui, m.gold | 0);
        mel(ui, '🎉 ' + (NAMEN()[art] || art) + ' geschafft: ' + m.text + ' +' + (m.gold | 0) + ' 🪙', 2800);
        try { if (spiel.spassKonfetti) { const v = spiel.fahrzeuge[ui.du].vehicle; spiel.spassKonfetti.burst(v.x, v.y + 2, v.z, 70); } } catch (e) { /* Optik */ }
        ton('ziel', 1);
      } else mel(ui, '😅 ' + (NAMEN()[art] || art) + ': ' + m.text + ' – fahr nochmal an die Kiste!', 2800);
    }
  }
  function freiSchritt(ui, X, dt, tm) {
    const F = X.fr;
    F.kisten.forEach((k, i) => { k.mesh.rotation.y = tm * 0.9 + i; k.mesh.position.y = k.y + 1.5 + Math.sin(tm * 2 + i * 1.7) * 0.18; });
    if (F.muenzen) F.muenzen.animieren(tm);
    if (F.aufgabe) F.aufgabe.t += dt;
  }
  function freiHud(ui, X) {
    const F = X.fr, r = ui.spiel.rennen, a = F.aufgabe, C = R.config.spass.frei;
    const ok = F.kisten.filter((k) => k.st === 2).length, gef = F.kisten.filter((k) => k.st >= 1).length;
    const rest = Math.max(0, F.limit - (r.zustand === 'laeuft' ? r.zeit : 0));
    let zeile;
    if (a) {
      const lim = a.art === 'muenzen' ? C.goldrausch.zeit : a.art === 'slalom' ? C.slalom.zeit : C.sprung.zeit, rs = Math.max(0, lim - a.t);
      const ziel = a.art === 'muenzen' ? `🪙 ${a.zaehl}/${C.goldrausch.brauche}` : a.art === 'slalom' ? `🌀 ${a.zaehl}/${C.slalom.brauche} Tore` : `🦘 Spring ≥ ${C.sprung.weite} m weit`;
      zeile = `<small>❓ <b>${NAMEN()[a.art]}</b>: ${ziel} · ⏱ <span${rs < 6 ? ' class="rot"' : ''}>${rs.toFixed(0)} s</span></small>`;
    } else zeile = '<small>Fahr an die bunten ❓-Kisten – wer zuerst da ist, bekommt die Aufgabe!</small>';
    const mm = Math.floor(rest / 60), ss = String(Math.floor(rest % 60)).padStart(2, '0');
    M.hud(`🗺️ <b>Freie Fahrt</b> · ✔ <b>${ok}/${F.kisten.length}</b> (❓ ${gef}) · 🪙 ${F.gold} · ⏱ ${mm}:${ss}${zeile}`);
  }

  // ================================================================ Geist (nur Client)
  function geistMesh(spiel, f) {
    try {
      const m = f.mesh.clone(true), weg = [];
      m.traverse((o) => {
        if (o.isLight) weg.push(o);
        if (o.isMesh && o.material) {
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          const neu = arr.map((x) => { const c = x.clone(); c.transparent = true; c.opacity = 0.34; c.depthWrite = false; if (c.emissive) c.emissive.setHex(0x335588); return c; });
          o.material = Array.isArray(o.material) ? neu : neu[0];
          o.renderOrder = 5;
        }
      });
      weg.forEach((o) => o.parent && o.parent.remove(o));
      m.name = 'R2Geist'; m.visible = false;
      spiel.szene.add(m);
      return m;
    } catch (e) { console.error('R2 (Geist-Mesh):', e); return null; }
  }
  function geistAufbau(ui, X, m) {
    const GE = R.SpassGeist, spiel = ui.spiel, st = spiel.strecke;
    if (!GE) return;
    const t = m.teilnehmer[ui.du], key = GE.schluessel(st.id + (st.variante ? '/' + st.variante : ''), (t && t.autoId) || 'auto') + '|online';
    const satz = GE.holen(SP(), key), g = satz ? GE.entpacken(satz) : null;
    X.geist = { key, satz, g, rec: GE.neu(), t: 0, runden: 0, mesh: g ? geistMesh(spiel, spiel.fahrzeuge[ui.du]) : null, pose: {} };
  }
  function geistSchritt(ui, X, dt) {
    const G = X.geist, GE = R.SpassGeist, spiel = ui.spiel, r = spiel.rennen, t = r.teilnehmer[ui.du], f = spiel.fahrzeuge[ui.du];
    if (r.zustand !== 'laeuft' || !t || t.imZiel || !f) { if (G.mesh) G.mesh.visible = false; return; }
    const v = f.vehicle;
    G.t += dt;
    GE.schritt(G.rec, dt, v.x, v.z, v.heading, v.y);
    if (G.mesh && G.g) {
      const p = GE.pose(G.g, G.t, G.pose);
      G.mesh.visible = !!p;
      if (p) { G.mesh.position.set(p.x, p.y, p.z); G.mesh.rotation.set(0, p.h, 0, 'YXZ'); }
    }
  }
  /** Rundenzeit kommt vom Server (Ereignis `runde`); die kleine Verspätung der Nachricht wird ausgeglichen. */
  function geistRunde(ui, X, m) {
    const G = X.geist, GE = R.SpassGeist, spiel = ui.spiel, f = spiel.fahrzeuge[ui.du], v = f.vehicle, zeit = +m.zeit;
    if (!(zeit > 0)) return;
    if (G.satz && G.g && zeit < G.satz.zeit) { mel(ui, 'Geist geschlagen! 👻🎉', 2500); ton('ziel', 1); }
    if (G.rec.n > 5 && GE.besser(G.satz, zeit)) {
      G.satz = GE.abschluss(G.rec, zeit); GE.ablegen(SP(), G.key, G.satz); G.g = GE.entpacken(G.satz);
      if (!G.mesh && G.g) G.mesh = geistMesh(spiel, f);
    }
    const spaet = Math.max(0, Math.min(0.5, G.t - zeit));
    G.rec = GE.neu(); G.t = spaet;
    if (spaet > 0) GE.schritt(G.rec, spaet, v.x, v.z, v.heading, v.y);
  }

  // ================================================================ Dino (Server-Aufgaben, Anzeige über spassWeltenUI.js)
  function dinoAufbau(ui, X, st) {
    const spiel = ui.spiel, e = X.e;
    X.dinoQ = [];
    const aktiv = e.dino === 'immer' || (e.dino === 'dino' && st && st.id === 'dino');
    const SW = R.SpassWelten, C = R.config.spass.welten.dino;
    spiel.dinoExtern = {
      aktiv,
      schritt(Lg, dt) {
        const q = X.dinoQ;
        while (q.length) {
          const m = q.shift();
          if (m.art === 'dinoGold') {
            const sp = st.spline, lst = [];
            for (let k = 0; k < C.gold.anzahl; k++) { const g = { id: m.n * 10 + k, s: sp.wrapS(m.s0 + k * C.gold.abstand), q: m.q, alter: -k * 0.12, flug: C.gold.flug, dauer: C.gold.dauer }; Lg.gold.push(g); lst.push(g); }
            Lg.ereig.push({ name: 'gold', muenzen: lst, n: m.n });
          } else if (m.art === 'dinoSammeln') {
            const i = Lg.gold.findIndex((g) => g.id === m.id);
            if (i >= 0) Lg.gold.splice(i, 1);
            Lg.gesammelt = (Lg.gesammelt || 0) + 1;
            Lg.ereig.push({ name: 'sammeln', id: m.id });
          } else if (m.art === 'dinoWett') {
            Lg.rennen = { s0: m.s0, sMark: m.sMark, weg: m.weg, vD: m.vD, t: 0, sD: m.s0 + C.rennen.vorsprung, nr: 0 };
            Lg.ereig.push({ name: 'wettrennen', weg: m.weg, vD: m.vD });
          } else if (m.art === 'dinoEnde') {
            Lg.rennen = null;
            Lg.ereig.push(m.ende === 'sieg' ? { name: 'sieg', zeit: m.zeit } : m.ende === 'verloren' ? { name: 'verloren', zeit: m.zeit } : { name: 'abbruch' });
          }
        }
        for (let i = Lg.gold.length - 1; i >= 0; i--) { const g = Lg.gold[i]; g.alter += dt; if (g.alter >= C.gold.dauer) Lg.gold.splice(i, 1); }
        if (Lg.rennen) { Lg.rennen.t += dt; Lg.rennen.sD = SW.dino.sBei(Lg.rennen, Lg.rennen.t); }
      },
    };
  }
  function dinoEreignis(ui, X, m) {
    if (m.art === 'dinoGold' || m.art === 'dinoSammeln' || m.art === 'dinoWett' || m.art === 'dinoEnde') X.dinoQ.push(m);
  }

  // ================================================================ Ergebnis
  function ergebnis(ui, X, m) {
    const e = X.e;
    if (!e.modus) return;
    try { M.hudWeg(); document.body.classList.remove('s4-frei'); } catch (err) { /* egal */ }
    const autos = R.carCatalog.waehlbare();
    let kopf, titel, hinweis = '';
    if (m.kurz) {
      const d = K.levelDef(SP(), m.kurz.level);
      titel = `⭐ Kurz-Level – ${esc(d.emoji + ' ' + d.titel)}`;
      kopf = '<th>Platz</th><th>Name</th><th>Auto</th><th>Sterne</th><th>Zeit</th>';
      hinweis = `<div class="on-info">⭐⭐⭐ bis ${m.kurz.t3} s · ⭐⭐ bis ${m.kurz.t2} s · Limit ${m.kurz.limit} s</div>`;
    } else if (m.frei) {
      titel = `🗺️ Freie Fahrt – ✔ ${m.frei.geschafft}/${m.frei.kisten} Kisten`;
      kopf = '<th>Platz</th><th>Name</th><th>Auto</th><th>✔ Aufgaben</th><th>❓ gefunden</th><th>🪙 Gold</th>';
    } else {
      titel = '🚪 K.-o.-Rallye';
      kopf = '<th>Platz</th><th>Name</th><th>Auto</th><th>Ergebnis</th><th>Zeit</th>';
    }
    const zeilen = m.zeilen.map((z) => {
      const a = autos.find((x) => x.id === z.autoId), ich = z.nr === ui.du;
      let zellen;
      if (m.kurz) {
        const k = z.kurz || {}, s = k.status === 'geschafft' ? sterneText(k.sterne) : k.status === 'zeitUm' ? '⏱️ Zeit um' : k.status === 'verpasst' ? '🚩 verpasst' : k.status === 'weg' ? '🚪 weg' : '…';
        zellen = `<td class="zeit">${s}</td><td class="zeit">${k.status === 'geschafft' && k.zeit !== null ? zeitT(k.zeit) : '–'}</td>`;
      } else if (m.frei) {
        const f = z.frei;
        zellen = f ? `<td class="zeit">${f.geschafft}</td><td class="zeit">${f.gefunden}</td><td class="zeit">${f.gold}</td>` : '<td class="zeit">–</td><td class="zeit">–</td><td class="zeit">–</td>';
      } else {
        zellen = `<td class="zeit">${z.raus ? '🚪 raus bei Wertung ' + z.w : (z.platz === 1 ? '🏆 Sieger' : 'im Finale')}</td><td class="zeit">${z.zeit !== null && z.zeit !== undefined ? zeitT(z.zeit) : '–'}</td>`;
      }
      return `<tr class="${ich ? 'spieler p1' : z.mensch ? 'spieler p2' : 'computer'}"><td class="platz">${z.platz}.</td>` +
        `<td class="name">${z.mensch ? R.fahrerEmoji(z.name) + ' ' : '🤖 '}${esc(z.name)}${z.weg ? ' <span class="on-weg">🚪 weg</span>' : ''}</td>` +
        `<td class="auto"><i style="background:${a ? HEX(a.farbe) : '#888'}"></i>${a ? esc(a.name) : ''}</td>${zellen}</tr>`;
    }).join('');
    ui.ergEl.innerHTML = `<div class="ergebnis-karte"><h1>🌐 ${titel}</h1>` + hinweis +
      `<table><thead><tr>${kopf}</tr></thead><tbody>${zeilen}</tbody></table>` +
      `<div class="knoepfe">` + (ui.istHost ? `<div class="knopf gruen" data-a="zurLobby">👥 Zur Lobby <kbd>Enter</kbd></div>`
        : `<div class="knopf" style="background:rgba(255,255,255,.2)">⏳ Warten auf den Host …</div>`) +
      `<div class="knopf blau" data-a="rennenVerlassen">🚪 Verlassen <kbd>Esc</kbd></div></div></div>`;
  }

  R.SpassOnlineR2 = { S, hinweisText, MODI_TEXT };
})();
