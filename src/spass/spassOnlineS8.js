// ============================================================
// Spaß-Paket S8 – Online-Lobby (Browser; läuft ganz am Ende, nur Umhüllungen von R.Online.Bildschirm; Autorennen UND Motorrad):
//   „🎪 Spaß-Elemente“   An/Aus (Trampolin, Kanone, Tore, Schlamm/Wasser/Kisten …) – Host, sendet einstellungen.spass
//   „✨ Fahr-Zauber“     An/Aus (S6) – braucht Spaß-Elemente (ausgegraut, solange die aus sind), sendet einstellungen.zauber
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

  const zeilen = B.zeilen;
  B.zeilen = function () {
    const z = zeilen.apply(this, arguments);
    if (this.istHost) { ['spass', 'zauber'].forEach((k) => { if (z.indexOf(k) < 0) z.push(k); }); if (E() && z.indexOf('eigen') < 0) z.push('eigen'); }
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
    if (zeile === 'spass' || zeile === 'zauber') {
      if (!this.verb || !this.lobby || !this.istHost) return;
      const e = {};
      if (zeile === 'spass') { e.spass = k === 'an'; if (!e.spass) e.zauber = false; } else { if (k === 'an' && einst(this).spass !== true) return; e.zauber = k === 'an'; }
      const lok = this.basis || this.spiel.einstellungen;
      try {          // zuletzt gewählten Wert merken (nächster „Raum erstellen“ startet damit)
        if (zeile === 'spass') { lok.spass = e.spass; if (!this.basis) this.spiel.einstellungenSpeichern(); } else if (R.SpassZauber && R.SpassZauber.anSetzen) R.SpassZauber.anSetzen(e.zauber);
      } catch (err) { /* nur merken */ }
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
        if (E()) t += reihe('eigen', '✏️ eigene Strecke', this.werte('eigen'));
        h = h.replace('<div class="on-fest">', t + '<div class="on-fest">');
      } else {
        h = h.replace(/(<div class="on-zusammen">[\s\S]*?)(<\/div>)/, `$1<br>🎪 Spaß-Elemente: ${sp ? 'an' : 'aus'}${sp ? ' · ✨ Fahr-Zauber: ' + (za ? 'an' : 'aus') : ''}${ei ? ' · ✏️ eigene Strecke' : ''}$2`);
      }
    } catch (err) { console.error('Spaß (Lobby S8):', err); }
    return h;
  };
  R.SpassOnlineS8 = { eintragen, TEIL };
})();
