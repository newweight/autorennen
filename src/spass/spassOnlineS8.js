// ============================================================
// Spaß-Paket S8 – Online-Lobby (Browser; läuft ganz am Ende, nur Umhüllungen von R.Online.Bildschirm; Autorennen UND Motorrad):
//   „🎪 Spaß-Elemente“   An/Aus (Trampolin, Kanone, Tore, Schlamm/Wasser/Kisten …) – Host, sendet einstellungen.spass
//   „✨ Fahr-Zauber“     An/Aus (S6) – braucht Spaß-Elemente (ausgegraut, solange die aus sind), sendet einstellungen.zauber
//   „🌀 Loopings“       Klassisch | Magnet-Röhre (R4 P5, nur Autorennen) – braucht Spaß-Elemente + Fahr-Zauber, sendet einstellungen.loopMag (nur echtes true wirkt)
//   „✏️ eigene Strecke“  Host wählt eine seiner gespeicherten Strecken (S7). Der Streckencode (R.Editor.code) geht in Teilen { t:'strecke', i, n, d } an den Server
//                        (eine Nachricht darf höchstens 4096 Byte haben), der prüft ihn mit R.Editor.ausCode/pruefen und trägt die Strecke ein; Gäste und Host
//                        bekommen den Code in lobby/start.einstellungen.eigen und tragen die Strecke aus demselben Code ein (gleiche id = Hash der Punkte → bitgleich).
//                        „Aus“ = normale Streckenwahl (sendet eigen:'').
// Alles additiv: ein alter Server ignoriert die Felder/Nachricht (Fehler „unbekannt“ wird ignoriert), ein alter Browser sieht nur eine normale Strecke.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Online || !R.Online.Bildschirm) return;
  const B = R.Online.Bildschirm.prototype;
  if (B._spassS8) return;
  B._spassS8 = true;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  const TEIL = 3000;     // Zeichen je Nachricht (Server: ≤ 3200, Nachricht ≤ 4096 Byte)
  const E = () => R.Editor || null;

  /** Eigene Strecke aus dem Code des Servers lokal eintragen (Lobby und Start). */
  function eintragen(einst) {
    try {
      if (!einst || !einst.eigen || !E()) return;
      const hat = R.trackCatalog.some((t) => t.id === einst.streckeId && t.eigen && t._s8Code === einst.eigen);
      if (hat) return;
      const d = E().ausCode(einst.eigen);
      if (!d) return;
      const e = E().registrieren(d);
      e._s8Code = einst.eigen;
      e.online = true;
    } catch (err) { console.error('Online (eigene Strecke):', err); }
  }
  const lobbyEmpfangen = B.lobbyEmpfangen;
  B.lobbyEmpfangen = function (m) { if (m && m.einstellungen) eintragen(m.einstellungen); return lobbyEmpfangen.apply(this, arguments); };
  const startEmpfangen = B.startEmpfangen;
  B.startEmpfangen = function (m) { if (m && m.einstellungen) eintragen(m.einstellungen); return startEmpfangen.apply(this, arguments); };

  function eigeneListe() {
    try { return E() ? E().Speicher.liste().slice(0, 5).map((x) => ({ id: x.daten.id, name: E().sauber(x.daten.name) || 'Meine Strecke', daten: x.daten })) : []; } catch (e) { return []; }
  }
  const einst = (ui) => (ui.lobby && ui.lobby.einstellungen) || {};

  /** R4 P5: Zeile „🌀 Loopings“ nur im Autorennen (das Motorrad hat keine Fantasie-Loopings). */
  const loopMagDa = () => window.MOTORRAD !== true && !!(R.SpassZauber && R.SpassZauber.loopMagSetzen);
  /** R4-FIX: Zeilen-HTML direkt VOR die Zeile „Strecke“ setzen (Host-Spalte oben); ohne diese Zeile (fremdes Layout) wie früher vor `on-fest`. */
  function vorStrecke(h, html) {
    const m = /<div class="on-zeile[^"]*" data-a="fokus:\d+"><div class="on-label">(?:🗺️ Strecke|👻 Geist|🦖 Dino-Freund)<\/div>/.exec(h);      // erste dieser Zeilen (Geist/Dino setzt R2 vor „Strecke“)
    if (m) return h.slice(0, m.index) + html + h.slice(m.index);
    return h.replace('<div class="on-fest">', html + '<div class="on-fest">');
  }
  // R4-FIX: Die Spalten der Lobby waren `overflow: hidden` – in kleinen Fenstern (844×390) kam man an die unteren Zeilen weder mit Rad noch mit der Tastatur heran.
  // Jetzt scrollen sie senkrecht (dünne Leiste), die Zeichnung merkt sich die Scroll-Lage, und ↑/↓ holen die Fokus-Zeile in die Spalte.
  try {
    if (typeof document !== 'undefined' && !document.getElementById('r4-lobby-scroll')) {
      const st = document.createElement('style'); st.id = 'r4-lobby-scroll';
      st.textContent = '.online .on-einst, .online .on-mitte { overflow-x: hidden; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.35) transparent; overscroll-behavior: contain; }';
      document.head.appendChild(st);
    }
  } catch (err) { /* nur Optik */ }
  const zeichnen = B.zeichnen;
  B.zeichnen = function () {
    const lage = {};
    try { if (this.wurzel) ['.on-einst', '.on-mitte'].forEach((s) => { const e = this.wurzel.querySelector(s); if (e) lage[s] = e.scrollTop; }); } catch (err) { /* egal */ }
    const r = zeichnen.apply(this, arguments);
    try {
      if (this.wurzel && this.ansicht === 'lobby') {
        Object.keys(lage).forEach((s) => { const e = this.wurzel.querySelector(s); if (e) e.scrollTop = lage[s]; });
        if (this._r4Fokus === undefined) this._r4Fokus = this.fokus;      // erste Zeichnung der Lobby: nichts verschieben
        if (this._r4Fokus !== this.fokus) {       // Fokus hat sich geändert (Pfeiltaste/Klick): Zeile ganz in die Spalte holen
          this._r4Fokus = this.fokus;
          const f = this.wurzel.querySelector('.on-zeile.fokus'), sp = f && f.closest('.on-spalte');
          if (f && sp) { const a = sp.getBoundingClientRect(), b = f.getBoundingClientRect(); if (b.bottom > a.bottom - 2) sp.scrollTop += b.bottom - a.bottom + 6; else if (b.top < a.top + 2) sp.scrollTop -= a.top - b.top + 6; }
        }
      }
      else this._r4Fokus = undefined;
    } catch (err) { /* egal */ }
    return r;
  };
  const zeilen = B.zeilen;
  B.zeilen = function () {
    const z = zeilen.apply(this, arguments);
    if (this.istHost) {
      // R4-FIX: die Spaß-Zeilen stehen oben direkt vor „Strecke“ (Spaß-Elemente, Fahr-Zauber, R4 Loopings); R2 setzt „Spielart“ davor, R3 „Tricks“ dahinter; „eigene Strecke“ bleibt hinten
      const neu = ['spass', 'zauber']; if (loopMagDa()) neu.push('loopmag');
      let i = z.indexOf('strecke'); if (i < 0) i = z.length;
      neu.forEach((k) => { if (z.indexOf(k) < 0) { z.splice(i, 0, k); i++; } });
      if (E() && z.indexOf('eigen') < 0) z.push('eigen');
    }
    return z;
  };
  const werte = B.werte;
  B.werte = function (zeile) {
    if (zeile === 'spass') return { wert: einst(this).spass === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🎪 An' }] };
    if (zeile === 'zauber') { const sp = einst(this).spass === true; return { wert: einst(this).zauber === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '✨ An', aus: !sp }] }; }
    if (zeile === 'eigen') {
      const l = [{ k: 'aus', text: 'Aus' }].concat(eigeneListe().map((x) => ({ k: x.id, text: '✏️ ' + x.name })));
      return { wert: einst(this).eigen ? (this._s8Wahl && l.some((x) => x.k === this._s8Wahl) ? this._s8Wahl : (l[1] ? l[1].k : 'aus')) : 'aus', liste: l };
    }
    if (zeile === 'loopmag') { const za = einst(this).spass === true && einst(this).zauber === true; return { wert: einst(this).loopMag === true ? 'mag' : 'klassisch', liste: [{ k: 'klassisch', text: 'Klassisch' }, { k: 'mag', text: '🌀 Magnet-Röhre', aus: !za }] }; }
    const w = werte.apply(this, arguments);
    if (zeile === 'strecke' && w && w.liste) w.liste = w.liste.filter((x) => { const t = R.trackCatalog.find((q) => q.id === x.k); return !(t && t.eigen); });     // eigene Strecken wählt man in der Zeile „✏️ eigene Strecke“
    return w;
  };

  function codeSenden(ui, daten) {
    const code = E().code(daten), n = Math.ceil(code.length / TEIL);
    if (n > 6) { ui.hinweis = 'Diese Strecke ist zu groß für online 😕'; ui.zeichnen(); return false; }
    for (let i = 0; i < n; i++) ui.verb.senden({ t: 'strecke', i, n, d: code.slice(i * TEIL, (i + 1) * TEIL) });
    return true;
  }
  const wertSetzen = B.wertSetzen;
  B.wertSetzen = function (zeile, k) {
    if (zeile === 'loopmag') {       // R4 P5: Loopings als Magnet-Röhre (braucht Spaß-Elemente + Fahr-Zauber)
      if (!this.verb || !this.lobby || !this.istHost || !loopMagDa()) return;
      if (k === 'mag' && !(einst(this).spass === true && einst(this).zauber === true)) return;
      try { R.SpassZauber.loopMagSetzen(k === 'mag'); } catch (err) { /* nur merken */ }
      this.verb.senden({ t: 'einstellungen', einstellungen: { loopMag: k === 'mag' } });
      return;
    }
    if (zeile === 'spass' || zeile === 'zauber') {
      if (!this.verb || !this.lobby || !this.istHost) return;
      const e = {};
      if (zeile === 'spass') { e.spass = k === 'an'; if (!e.spass) e.zauber = false; } else { if (k === 'an' && einst(this).spass !== true) return; e.zauber = k === 'an'; }
      const lok = this.basis || this.spiel.einstellungen;
      try {          // zuletzt gewählten Wert merken (nächster „Raum erstellen“ startet damit)
        if (zeile === 'spass') { lok.spass = e.spass; if (!this.basis) this.spiel.einstellungenSpeichern(); } else if (R.SpassZauber && R.SpassZauber.anSetzen) R.SpassZauber.anSetzen(e.zauber);
      } catch (err) { /* nur merken */ }
      if (e.zauber === false && einst(this).loopMag === true) e.loopMag = false;      // R4 P5: ohne Fahr-Zauber keine Magnet-Röhren
      this.verb.senden({ t: 'einstellungen', einstellungen: e });
      return;
    }
    if (zeile === 'eigen') {
      if (!this.verb || !this.lobby || !this.istHost || !E()) return;
      if (k === 'aus') { this._s8Wahl = null; this.verb.senden({ t: 'einstellungen', einstellungen: { eigen: '' } }); return; }
      const x = eigeneListe().find((q) => q.id === k);
      if (!x) return;
      this._s8Wahl = k;
      if (codeSenden(this, x.daten)) { this.hinweis = ''; }
      return;
    }
    if (zeile === 'strecke' && this.verb && this.lobby && this.istHost && einst(this).eigen) {       // normale Strecke gewählt → eigene Strecke aus
      this._s8Wahl = null;
      this.verb.senden({ t: 'einstellungen', einstellungen: { eigen: '' } });
    }
    return wertSetzen.apply(this, arguments);
  };

  const htmlLobby = B.htmlLobby;
  B.htmlLobby = function () {
    let h = htmlLobby.apply(this, arguments);
    try {
      const e = einst(this), sp = e.spass === true, za = e.zauber === true, ei = !!e.eigen;
      if (this.istHost) {
        const z = this.zeilen();
        const reihe = (id, label, w) => `<div class="on-zeile${z.indexOf(id) === this.fokus ? ' fokus' : ''}" data-a="fokus:${z.indexOf(id)}"><div class="on-label">${label}</div><div class="on-werte">` +
          w.liste.map((x) => `<span class="pille${x.k === w.wert ? ' aktiv' : ''}${x.aus ? ' aus' : ''}"${x.aus ? '' : ` data-a="wert:${id}:${esc(x.k)}"`}>${esc(x.text)}</span>`).join('') + `</div></div>`;
        let t = reihe('spass', '🎪 Spaß-Elemente', this.werte('spass')) + reihe('zauber', '✨ Fahr-Zauber', this.werte('zauber'));
        if (loopMagDa()) t += reihe('loopmag', '🌀 Loopings', this.werte('loopmag'));
        h = vorStrecke(h, t);          // R4-FIX: oben, direkt vor „Strecke“
        if (E()) h = h.replace('<div class="on-fest">', reihe('eigen', '✏️ eigene Strecke', this.werte('eigen')) + '<div class="on-fest">');
      } else {
        h = h.replace(/(<div class="on-zusammen">[\s\S]*?)(<\/div>)/, `$1<br>🎪 Spaß-Elemente: ${sp ? 'an' : 'aus'}${sp ? ' · ✨ Fahr-Zauber: ' + (za ? 'an' : 'aus') : ''}${sp && za && e.loopMag === true ? ' · 🌀 Loopings: Magnet-Röhre' : ''}${ei ? ' · ✏️ eigene Strecke' : ''}$2`);
      }
    } catch (err) { console.error('Spaß (Lobby S8):', err); }
    return h;
  };
  R.SpassOnlineS8 = { eintragen, TEIL, vorStrecke };
})();
