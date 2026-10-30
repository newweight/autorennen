// ============================================================
// W5-2 Mehrspieler: Online-Modus im Browser – Bildschirme (Start, Code, Lobby, Ergebnis) und das Online-Rennen.
//
// Ablauf: Menü-Karte „🌐 Online“ → R.Online.Bildschirm.oeffnen() → „Raum erstellen“ (Host) oder „Raum beitreten“
// (4 Felder, nur Zeichen ohne 0/O/1/I; Link ?raum=ABCD füllt vor) → Lobby (Code groß, Link, QR, Spielerliste,
// eigene Wahl Fahrer/Auto/Fahrhilfe, Host: Einstellungen + Start; Gäste: Bereit mit Leertaste/Enter) → Rennen.
//
// Rennen: main.js bekommt den Zustand 'online' (spiel.online = dieser Bildschirm). physikSchritt() rechnet dann
// NICHT die lokale Rennleitung, sondern: Eingabe lesen (input.steuerung – Tastatur und Touch), quantisiert an den
// Server schicken (60 Hz, Folge-Nr), eigenen Wagen vorhersagen (R.NetzVorhersage), andere Autos 100 ms hinter dem
// Server interpolieren (R.NetzPuffer), Rennleitung/HUD aus den Server-Zuständen setzen (Puppen-RaceManager).
// Szene, Autos, Kamera, HUD, Minimap, Ton: die bestehenden Teile aus main.js (streckeSzeneBauen, fahrzeugHinzufuegen,
// kameraHinzufuegen, R.Hud). Stufe 1 = Geister: alle anderen Autos halbtransparent (0,6), Durchfahren.
// Lokal/Split-Screen bleiben unverändert (alle Haken in main.js fragen zustand === 'online').
// ============================================================
(function () {
  const R = window.Rennspiel;
  const N = R.Netz;

  /** Online geht nur, wenn die Seite vom Server kommt (http/https), nicht von der Festplatte (file://). */
  function verfuegbar() { return /^https?:$/.test(window.location.protocol) && typeof WebSocket !== 'undefined'; }

  function el(tag, klasse, parent) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (parent) parent.appendChild(e);
    return e;
  }
  /** M4: Motorrad-Modus (Motorrad.html setzt window.MOTORRAD, src/moto/motoOnline.js stellt R.Moto.online bereit). Im Autorennen immer null → alles wie bisher. */
  const MO = () => (window.MOTORRAD === true && R.Moto && R.Moto.online ? R.Moto.online : null);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  /**
   * Basis-Adresse für Link/QR: die Adresse, über die die Seite geöffnet wurde (location.origin + '/'). Hat der Host
   * das Spiel lokal geöffnet (localhost/127.0.0.1/Heimnetz-IP) und kennt der Server eine öffentliche Adresse
   * (Tailscale Funnel, Startskript), wird diese genommen – sonst könnten Gäste den Link nicht öffnen.
   */
  function einladungsBasis(oeffentlich) {
    const h = window.location.hostname;
    const lokal = h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.local$/.test(h);
    if (lokal && typeof oeffentlich === 'string' && /^https:\/\//.test(oeffentlich)) return oeffentlich.replace(/\/?$/, '/');
    return window.location.origin + '/';
  }

  // Eigene Stile (styles.css bleibt unverändert; nur Klassen mit Präfix on-)
  const STIL = `
.online .on-wahl { gap: 2em; }
.online .on-wahl .karte.gross { width: 13em; }
.online .on-hinweis { margin-top: 1em; background: rgba(214,40,40,.75); border: .12em solid #fff; padding: .35em 1em; border-radius: 1em; font-size: .85em; }
.online .on-info { margin-top: .8em; font-size: .75em; opacity: .9; max-width: 34em; text-align: center; }
.online .on-schalter { margin-top: .9em; display: flex; gap: .8em; align-items: center; justify-content: center; flex-wrap: wrap; font-size: .9em;
  background: rgba(0,0,0,.38); border: .1em solid rgba(255,255,255,.35); border-radius: 1em; padding: .35em 1em; }
.online .on-schalter b.an { color: #7dff8a; } .online .on-schalter b.aus { color: #ffd23a; }
.online .on-schalter .knopf.warn { background: #d62828; }
.online .on-schalter-lobby { margin-top: .4em; font-size: .72em; gap: .4em; padding: .3em .6em; max-width: 17em; }
.online .on-frage { margin-top: .7em; font-size: .78em; font-weight: 700; max-width: 17em; text-align: center; }
.online .on-einladung .on-schalter-grund { font-size: .68em; max-width: 17em; margin-top: .3em; }
.online .on-codefelder { display: flex; gap: .5em; margin: .2em 0 .6em; }
.online .on-codefelder span { width: 1.6em; height: 1.9em; line-height: 1.9em; text-align: center; font-size: 2.4em; font-weight: 900; border-radius: .25em;
  background: rgba(14,24,58,.8); border: .1em solid rgba(255,255,255,.45); color: #fff; font-family: ui-monospace, Menlo, monospace; }
.online .on-codefelder span.cursor { border-color: var(--gelb); box-shadow: 0 0 .5em rgba(255,210,58,.8); }
.online .on-tasten { display: grid; grid-template-columns: repeat(11, 2.1em); gap: .25em; margin-bottom: .7em; }
.online .on-tasten span { background: rgba(255,255,255,.18); border-radius: .4em; text-align: center; padding: .2em 0; cursor: pointer; font-size: .9em; user-select: none; }
.online .on-tasten span:hover { background: rgba(255,255,255,.35); }
.online .on-lobby { display: grid; grid-template-columns: 15.5em 1fr 1fr; gap: 1em; width: 100%; height: 100%; min-height: 0; padding-top: .4em; box-sizing: border-box; }
.online .on-spalte { background: var(--tafel); border-radius: 1em; padding: .55em .7em; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: .3em; }
.online .on-spalte h3 { margin: .1em 0 .1em; font-size: .8em; color: var(--gelb); }
.online .on-einladung { align-items: center; text-align: center; }
.online .on-code { font-size: 2.6em; font-weight: 900; letter-spacing: .12em; color: var(--gelb); font-family: ui-monospace, Menlo, monospace; line-height: 1.1;
  text-shadow: 0 .06em 0 #8f2412; }
.online .on-qr { background: #fff; border-radius: .4em; padding: .2em; line-height: 0; }
.online .on-qr svg { width: 9.5em; height: 9.5em; }
.online .on-link { font-size: .55em; word-break: break-all; opacity: .95; background: rgba(0,0,0,.25); padding: .25em .5em; border-radius: .5em; user-select: all; }
.online .on-klein { font-size: .6em; opacity: .85; }
.online .on-spieler { display: flex; flex-direction: column; gap: .2em; }
.online .on-sp { display: flex; align-items: center; gap: .4em; background: rgba(255,255,255,.1); border-radius: .6em; padding: .15em .5em; font-size: .78em; }
.online .on-sp.ich { background: rgba(47,139,255,.45); }
.online .on-sp .on-emoji { font-size: 1.4em; }
.online .on-sp .on-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.online .on-sp .on-auto { font-size: .75em; opacity: .85; white-space: nowrap; }
.online .on-sp .on-auto i { display: inline-block; width: .8em; height: .8em; border-radius: 50%; border: .1em solid #fff; margin-right: .3em; vertical-align: -.1em; }
.online .on-zeile { border-radius: .6em; padding: .06em .3em; border: .1em solid transparent; }
.online .on-zeile.fokus { border-color: var(--gelb); background: rgba(255,210,58,.12); }
.online .on-zeile .on-label { font-size: .62em; opacity: .9; margin-bottom: .1em; }
.online .on-zeile .on-werte { display: flex; flex-wrap: wrap; gap: .2em; }
.online .on-einst { gap: .2em; }
.online .on-zeile .pille { font-size: .6em; padding: .1em .45em; }
.online .on-zeile .pille.aus { opacity: .35; cursor: default; }
.online .on-zeile .pille.emoji { font-size: .85em; padding: .02em .25em; }
.online .on-zeile .pille.tod { }
.online .on-fest { font-size: .62em; opacity: .9; padding: .1em .3em; }
.online .on-aktion { display: flex; gap: .8em; align-items: center; }
.online .on-aktion .knopf.aus { filter: grayscale(.8); opacity: .6; }
.online .on-mitte .on-wahl-block { margin-top: .2em; display: flex; flex-direction: column; gap: .15em; }
.online .on-zusammen { font-size: .7em; line-height: 1.5; }
.on-ergebnis .on-weg { opacity: .7; font-size: .8em; }
.hud-netz { font-size: .8em; opacity: .95; white-space: nowrap; }
.karte.online-karte { display: flex; align-items: center; gap: .6em; padding: .45em 1.2em; text-align: left; }
.karte.online-karte .emoji { font-size: 2.2em; line-height: 1; }
.karte.online-karte .karten-name { font-size: 1.15em; color: #9fd4ff; }
.karte.online-karte .karten-sub { font-size: .7em; opacity: .9; max-width: 15em; }
.karte.online-karte.aus { filter: grayscale(1); opacity: .6; cursor: not-allowed; }
.karte.online-karte.aus:hover { transform: none; }
/* Niedrige Fenster (z. B. Handy quer, 400x225): kleinere Schrift, Online-Bildschirm scrollt, Lobby wächst mit dem Inhalt – große Fenster unverändert */
@media (max-height: 520px) {
  .menue.online { font-size: clamp(9px, 3.4vh, 18px); overflow-y: auto; padding-top: .6vh; padding-bottom: .6vh; }
  .online .on-wahl { gap: 1em; }
  .online .on-wahl .karte.gross { width: 10em; padding: .5em .5em; }
  .online .on-wahl .karte.gross .emoji { font-size: 2.2em; }
  .online .on-codefelder span { font-size: 1.6em; }
  .online .on-tasten { margin-bottom: .3em; }
  .online .on-info, .online .on-schalter { margin-top: .4em; }
  .online .on-lobby { height: auto; min-height: 100%; }
  .online .on-spalte { overflow: visible; }
  .online .on-qr svg { width: 6em; height: 6em; }
  .online .on-code { font-size: 1.8em; }
}
`;
  function stilEinfuegen() {
    if (document.getElementById('online-stil')) return;
    const s = document.createElement('style');
    s.id = 'online-stil';
    s.textContent = STIL;
    document.head.appendChild(s);
  }

  class OnlineBildschirm {
    /**
     * @param {Spiel} spiel
     * @param {HTMLElement} ui
     * @param {Function} zurueck Aufruf beim Verlassen (Menü wieder zeigen)
     */
    constructor(spiel, ui, zurueck) {
      stilEinfuegen();
      this.spiel = spiel;
      this.ui = ui;
      this.zurueckFn = zurueck;
      this.wurzel = el('div', 'overlay menue online', ui);
      this.wurzel.id = 'online';
      this.wurzel.style.display = 'none';
      this.ergEl = el('div', 'overlay ergebnis on-ergebnis', ui);
      this.ergEl.style.display = 'none';
      this.dialogEl = el('div', 'overlay pause', ui);
      this.dialogEl.style.display = 'none';
      this.sichtbar = false;
      this.ansicht = 'start';       // start | code | verbinden | lobby | laden
      this.phase = null;            // null | 'laden' | 'rennen' | 'ergebnis' (Online-Rennen)
      this.wahl = 0;                // Start-Bildschirm: 0 erstellen, 1 beitreten
      this.code = ['', '', '', ''];
      this.hinweis = '';
      this.fokus = 0;
      this.lobby = null;
      this.verb = null;
      this.dialog = false;
      this.statistik = { korrekturen: null };
      this.schalter = null;         // letzte Antwort des Servers zum Internet-Schalter (nur mit Recht), sonst null
      this.schalterGrund = '';      // v26: Grund, warum es keinen Knopf gibt (vom Server, nur für Tailnet-/lokale Geräte)
      this.schalterSicher = 0;      // Zeit des ersten Tipps auf „AN“ (zweiter Tipp nötig)
      this.schalterTimer = null;
      [this.wurzel, this.ergEl, this.dialogEl].forEach((w) => w.addEventListener('click', (e) => {
        const t = e.target.closest('[data-a]');
        if (t) this.aktion(t.dataset.a);
      }));
      // Code-Eingabe: Buchstaben abfangen, bevor die Spiel-Tasten (F Vollbild, H Debug, M Ton) greifen
      this._tastenFang = (e) => {
        if (!this.sichtbar || this.ansicht !== 'code') return;
        const z = e.code && /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(e.code) ? e.code.slice(-1) : null;
        if (z || e.code === 'Backspace' || e.code === 'Delete') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (z) this.codeZeichen(z); else this.codeLoeschen();
        }
      };
      window.addEventListener('keydown', this._tastenFang, true);
    }

    // ================================================================ Bildschirm
    oeffnen(opt) {
      this.sichtbar = true;
      this.wurzel.style.display = '';
      this.hinweis = '';
      if (opt && opt.code) {
        const c = N.codeNormal(opt.code);
        if (c) { this.code = c.split(''); this.ansicht = 'code'; }
        else this.ansicht = 'start';
      } else if (this.lobby && this.verb && this.verb.offen) this.ansicht = 'lobby';
      else this.ansicht = 'start';
      this.zeichnen();
      if (this.ansicht === 'start' || this.ansicht === 'lobby') this.schalterStart();
    }
    verstecken() { this.sichtbar = false; this.wurzel.style.display = 'none'; }

    /** Ganz raus aus dem Online-Modus (zurück ins Hauptmenü). */
    schliessen() {
      if (this.phase) this.rennenAbbauen();
      clearInterval(this.schalterTimer); this.schalterTimer = null; this.schalter = null; this.schalterGrund = '';
      if (this.verb) { this.verb.senden({ t: 'verlassen' }); const v = this.verb; this.verb = null; setTimeout(() => v.schliessen(), 50); }
      this.lobby = null;
      this.einstellungenZurueck();
      this.verstecken();
      this.ergEl.style.display = 'none';
      this.dialogEl.style.display = 'none';
      if (this.zurueckFn) this.zurueckFn();
    }

    einstellungenZurueck() {
      if (this.basis) { this.spiel.einstellungen = this.basis; this.basis = null; }
    }

    // ---------- Verbindung ----------
    verbindung() {
      if (this.verb && this.verb.offen) return Promise.resolve(this.verb);
      if (!this._verbP) this._verbP = this._verbinden().finally(() => { this._verbP = null; });   // nie zwei Verbindungen gleichzeitig (Schalter-Abfrage + Raum erstellen)
      return this._verbP;
    }
    async _verbinden() {
      const v = new R.NetzVerbindung();
      v.bei('raum', (m) => { this.istHost = !!m.host; this.ichId = m.du; this.raumCode = m.code; });
      v.bei('hallo', (m) => { if (m.v >= 3) v.senden({ t: 'schalterFrage' }); });          // Protokoll 3: Internet-Schalter (alter Server → keine Abfrage)
      if (MO()) MO().verbindung(this, v);          // M4: merkt sich, ob der Server Motorrad-Räume kann (hallo.moto)
      v.bei('schalter', (m) => this.schalterEmpfangen(m));
      v.bei('lobby', (m) => this.lobbyEmpfangen(m));
      v.bei('fehler', (m) => this.fehlerEmpfangen(m));
      v.bei('raumZu', () => this.raumZu('Der Raum wurde geschlossen – der Host ist gegangen.'));
      v.bei('start', (m) => this.startEmpfangen(m));
      v.bei('zustand', (m) => this.zustandEmpfangen(m));
      v.bei('ereignis', (m) => this.ereignisEmpfangen(m));
      v.bei('ergebnis', (m) => this.ergebnisEmpfangen(m));
      v.bei('zu', () => { if (this.verb === v) { this.verb = null; this.raumZu('Die Verbindung zum Server ist weg.'); } });
      await v.verbinden();
      this.verb = v;
      return v;
    }

    /** Meine Wahl aus den lokalen Einstellungen (Fahrer/Auto/Fahrhilfe von Spieler 1). */
    meineWahl() {
      const e = this.spiel.einstellungen;
      return { fahrer: e.fahrer[0], auto: e.autoIds[0], hilfe: e.fahrhilfe[0] };
    }

    async erstellen() {
      this.ansicht = 'verbinden'; this.hinweis = ''; this.zeichnen();
      try {
        const v = await this.verbindung();
        if (MO() && !(await MO().serverKannMotorrad(this))) { this.ansicht = 'start'; this.hinweis = 'Dieser Server kann noch kein Motorrad online 😕'; this.zeichnen(); return; }
        const e = this.spiel.einstellungen;
        const msg = Object.assign({ t: 'raumErstellen', einstellungen: { streckeId: e.streckeId, welt: e.welt, variante: e.variante, runden: e.runden,
          gegner: e.gegner, schwierigkeit: e.schwierigkeit, tempoKlasse: e.tempoKlasse, jahreszeit: e.jahreszeit, wetter: e.wetter,
          tageszeit: e.tageszeit, kollisionen: e.kollisionen !== false, hindernisMenge: e.hindernisMenge, polizei: e.polizei === true,
          geisterfahrer: e.geisterfahrer === true, krankenwagen: e.krankenwagen === true, abschleppwagen: e.abschleppwagen === true, tiere: e.tiere !== false,      // v28 (W10): Tiere queren die Straße (Standard an)
          spass: e.spass !== false,      // S1 (additiv): Spaß-Elemente (Trampolin/Kanone) – Wert aus dem Menü des Gastgebers
          zauber: !!(R.SpassZauber && R.SpassZauber.an()),   // S6: Fahr-Zauber (Menü „✨ Fahr-Zauber“)
          zufall: e.zufall !== false,      // Z1 (additiv): Zufällige Strecke – Münzen/Hindernisse jede Runde neu (Standard an; alter Server ignoriert das Feld)
          nurRennautos: R.carCatalog.nurRennautos(e, R.trackCatalog.find(t => t.id === e.streckeId)),      // v29 (F3): alle Computer-Gegner fahren den Formel-Renner (bei der Formel-1-Strecke Standard an)
          verkehr: e.krankenwagen === true || e.abschleppwagen === true ? 'wenig' : 'aus' } }, this.meineWahl());      // v25: Verkehr (additiv); v28 W1: Krankenwagen/Abschleppwagen je einzeln, `verkehr` nur noch abgeleitet für alte Server   // Stufe 2: zuletzt gewählt (Standard Geister)
        if (MO()) MO().nachrichtAnpassen(msg, e);          // M4: moto:true, Unfälle, Stuntrennen
        v.senden(msg);
      } catch (err) { this.ansicht = 'start'; this.hinweis = 'Keine Verbindung zum Server 😕'; this.zeichnen(); }
    }

    async beitreten() {
      const code = N.codeNormal(this.code.join(''));
      if (!code) { this.hinweis = 'Bitte alle 4 Zeichen eingeben'; this.zeichnen(); return; }
      this.ansicht = 'verbinden'; this.hinweis = ''; this.zeichnen();
      try {
        const v = await this.verbindung();
        if (MO() && !(await MO().serverKannMotorrad(this))) { this.ansicht = 'code'; this.hinweis = 'Dieser Server kann noch kein Motorrad online 😕'; this.zeichnen(); return; }
        const msg = Object.assign({ t: 'raumBeitreten', code }, this.meineWahl());
        if (MO()) MO().nachrichtAnpassen(msg, this.spiel.einstellungen);          // M4: moto:true (Motorrad-Räume getrennt von Auto-Räumen)
        v.senden(msg);
      } catch (err) { this.ansicht = 'code'; this.hinweis = 'Keine Verbindung zum Server 😕'; this.zeichnen(); }
    }

    lobbyEmpfangen(m) {
      const neu = !this.lobby;
      this.lobby = m;
      this.istHost = m.spieler.some(s => s.id === m.du && s.istHost);
      // Meine bestätigte Wahl in die lokalen Einstellungen übernehmen (nächstes Mal vorausgewählt)
      const ich = m.spieler.find(s => s.id === m.du);
      if (ich) {
        const e = this.basis || this.spiel.einstellungen;
        e.fahrer[0] = ich.fahrer; e.autoIds[0] = ich.auto; e.fahrhilfe[0] = ich.hilfe;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      // 14.10. (v22): Geht ein Gast im Rennen oder in der Ergebnistafel, schickt der Server allen die neue Spielerliste (zustand 'rennen'/'ergebnis').
      // Das darf Rennen/Tafel der anderen NICHT beenden – nur bei zustand 'lobby' (Host hat „Zur Lobby“ gedrückt) wird abgebaut. Ältere Server ohne zustand: wie bisher.
      if (this.phase && m.zustand && m.zustand !== 'lobby') return;
      if (this.phase) this.rennenAbbauen();        // Host hat „Zur Lobby“ gedrückt
      if (neu) this.fokus = 0;
      this.ansicht = 'lobby';
      this.schalterStart();                      // v26: Status des Internet-Schalters auch hier regelmäßig abfragen
      this.sichtbar = true; this.wurzel.style.display = '';
      this.ergEl.style.display = 'none';
      if (this.spiel.zustand === 'menue' && this.spiel.strecke && this.spiel.strecke.id !== m.einstellungen.streckeId) {
        try { this.spiel.menueHintergrund(m.einstellungen.streckeId); } catch (e) { /* nur Deko */ }
      }
      this.zeichnen();
    }

    fehlerEmpfangen(m) {
      if (m.grund === 'keinRaum' && !this.lobby && !this.phase) return;   // Nachzügler einer Eingabe nach „Raum zu“: Hinweis des Hosts nicht überschreiben
      if (this.phase === 'rennen') { const hd = this.spiel.huds[0]; if (hd) hd.meldung(m.text || 'Fehler', 1800); return; }
      this.hinweis = m.text || 'Fehler';
      if (this.ansicht === 'verbinden') this.ansicht = this.lobby ? 'lobby' : (m.grund === 'unbekannt' || m.grund === 'voll' || m.grund === 'laeuft' || m.grund === 'falscheArt' ? 'code' : 'start');
      this.zeichnen();
    }

    raumZu(text) {
      if (this.phase) this.rennenAbbauen();
      this.lobby = null;
      this.ergEl.style.display = 'none';
      this.dialogEl.style.display = 'none'; this.dialog = false;
      this.hinweis = text;
      this.ansicht = 'start';
      this.sichtbar = true; this.wurzel.style.display = '';
      if (this.spiel.menue) this.spiel.menue.sichtbar = false;
      this.zeichnen();
    }

// ---------- Internet-Schalter (Protokoll 3) ----------
    /** Beim Öffnen der Startansicht: Verbindung aufbauen (wird später für den Raum weiterverwendet) und den Schalter-Status abfragen. */
    schalterStart() {
      if (!verfuegbar()) return;
      this.verbindung().catch(() => { /* ohne Server: kein Schalter, Fehler zeigt „Raum erstellen“ */ });
      if (!this.schalterTimer) {
        // v26: auch in der Lobby (Einladung) und alle 3 s – der Status kommt vom Helfer (status.json), nicht aus dem Gedächtnis
        this.schalterTimer = setInterval(() => {
          if (this.sichtbar && (this.ansicht === 'start' || this.ansicht === 'lobby') && this.verb && this.verb.offen) this.verb.senden({ t: 'schalterFrage' });
        }, 3000);
      }
    }
    schalterEmpfangen(m) {
      const vorher = !!this.schalter, grundVorher = this.schalterGrund || '';
      this.schalter = m && m.recht === true ? Object.assign({ empfangen: performance.now() }, m) : null;
      this.schalterGrund = m && m.recht !== true && typeof m.grund === 'string' ? m.grund : '';     // v26: warum KEIN Knopf (nur für Tailnet-/lokale Geräte; Funnel-Gäste: leer)
      if (m && m.fehler === 'zuSchnell') this.schalterHinweis = 'Nicht so schnell – gleich nochmal 😉';
      else if (m && m.fehler === 'schreiben') this.schalterHinweis = '❌ Wunsch konnte nicht gespeichert werden (Rechte' + (m.code ? ' ' + m.code : '') + ') – installieren.command erneut ausführen';
      else if (m && m.fehler) this.schalterHinweis = 'Das hat nicht geklappt 😕';
      else this.schalterHinweis = '';
      if (this.schalter && this.schalter.wartet) setTimeout(() => { if (this.verb && this.verb.offen && (this.ansicht === 'start' || this.ansicht === 'lobby')) this.verb.senden({ t: 'schalterFrage' }); }, 2000);
      this.schalterZeigen(vorher !== !!this.schalter || grundVorher !== this.schalterGrund);
    }
    /** Schalter-Zeile(n) auffrischen (Start- und Lobby-Ansicht); nur bei geänderter Struktur ganz neu zeichnen. */
    schalterZeigen(neuZeichnen) {
      if (!this.sichtbar || (this.ansicht !== 'start' && this.ansicht !== 'lobby')) return;
      if (neuZeichnen) return this.zeichnen();
      const el = this.wurzel.querySelector('.on-schalter-box');
      if (el) el.innerHTML = this.schalterHtml();
    }
    /** Erklärung, warum es keinen Knopf gibt (leer für Funnel-Gäste/Fremde und wenn alles in Ordnung ist). */
    schalterGrundText() {
      if (this.schalter) return '';
      if (this.schalterGrund === 'ohneSteuerung') return '🔧 Internet-Schalter: Server ohne Schalter eingerichtet – installieren.command ausführen';
      if (this.schalterGrund === 'keinTailnet') return '🔧 Internet-Schalter: nur von Tailscale-Geräten – dieser Zugang kommt nicht über dein Tailnet';
      return '';
    }
    /** „noch 3:42 h“ / „noch 42 min“ aus den Rest-Sekunden. */
    static restText(sek) {
      if (sek === null || sek === undefined) return '';
      if (sek >= 3600) return 'noch ' + Math.floor(sek / 3600) + ':' + String(Math.floor(sek % 3600 / 60)).padStart(2, '0') + ' h';
      if (sek >= 60) return 'noch ' + Math.floor(sek / 60) + ' min';
      return 'gleich aus';
    }
    /** Inhalt der Schalter-Zeile (leer, wenn der Server dieser Verbindung kein Recht gibt). Status kommt echt vom Helfer. */
    schalterHtml() {
      const s = this.schalter;
      if (!s) return '';
      const rest = s.rest === null || s.rest === undefined ? null : Math.max(0, s.rest - (performance.now() - s.empfangen) / 1000);
      const sicher = performance.now() - this.schalterSicher < 5000 && this.schalterSicher > 0;
      const uhr = rest === null ? '' : new Date(Date.now() + rest * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      let text, knopf = '';
      if (s.funnel === 'an') {
        text = `🌐 Internet für Freunde: <b class="an">AN</b> – offen${uhr ? ' bis ' + uhr : ''} (${esc(OnlineBildschirm.restText(rest))})`;
        knopf = `<div class="knopf klein" data-a="schalter">🔒 Ausschalten <kbd>I</kbd></div>`;
      } else if (s.funnel === 'aus') {
        text = `🔒 Internet für Freunde: <b class="aus">AUS</b> – nur Tailnet`;
        knopf = sicher
          ? `<div class="knopf klein warn" data-a="schalter">⚠️ Sicher? Dann kann jeder mit dem Link mitspielen – nochmal tippen</div>`
          : `<div class="knopf klein gruen" data-a="schalter">🌐 Einschalten <kbd>I</kbd></div>`;
      }
      if (s.funnel === 'unbekannt') {
        const wie = { fehlt: 'keine Status-Datei – Systemdienst „Schalter-Helfer“ fehlt, installieren.command ausführen', alt: 'Status veraltet – läuft der Systemdienst? (installieren.command erneut ausführen)',
          kaputt: 'Status unlesbar – installieren.command erneut ausführen' }[s.helfer] || 'keine Antwort';
        text = `❔ Internet für Freunde: Helfer antwortet nicht (${wie})`;
        knopf = '';
      } else if (s.wartet) {
        text = '⏳ Internet für Freunde: schaltet … (wird umgeschaltet …)';
        knopf = '';
      } else if (s.haengt) {
        text = `❌ Internet für Freunde: Tailscale hat nicht auf „${s.haengt === 'an' ? 'AN' : 'AUS'}“ umgeschaltet – ist Funnel im Tailscale-Admin erlaubt? Helfer-Log: /var/log/autorennen-schalter.log`;
      }
      const hin = this.schalterHinweis ? ` <span class="on-hinweis" style="margin:0">${esc(this.schalterHinweis)}</span>` : '';
      return `<span>${text}</span>${knopf}${hin}`;
    }
    schalterUmschalten() {
      const s = this.schalter;
      if (!s || s.wartet || s.funnel === 'unbekannt' || !this.verb || !this.verb.offen) return;      // (bei „unbekannt“ erklärt die Zeile selbst, warum nichts geht)
      if (s.funnel === 'an') { this.schalterSicher = 0; this.verb.senden({ t: 'schalterUmschalten', an: false }); }
      else if (performance.now() - this.schalterSicher < 5000 && this.schalterSicher > 0) { this.schalterSicher = 0; this.verb.senden({ t: 'schalterUmschalten', an: true }); }
      else { this.schalterSicher = performance.now(); setTimeout(() => { if (this.ansicht === 'start' || this.ansicht === 'lobby') this.schalterEmpfangen(this.schalter); }, 5100); }   // erster Tipp: nachfragen
      this.schalterEmpfangen(this.schalter);
    }

    // ---------- Eingabe ----------
    codeZeichen(z) {
      if (!N.codeZeichenOk(z)) { this.hinweis = '„' + z + '“ gibt es im Code nicht (kein 0, O, 1, I)'; this.zeichnen(); return; }
      const i = this.code.findIndex(c => !c);
      if (i < 0) return;
      this.code[i] = z.toUpperCase(); this.hinweis = '';
      this.zeichnen();
    }
    codeLoeschen() {
      let i = this.code.length - 1;
      while (i >= 0 && !this.code[i]) i--;
      if (i >= 0) this.code[i] = '';
      this.hinweis = '';
      this.zeichnen();
    }

    /** Taste im Menü-Zustand (Menue.taste leitet weiter, solange dieser Bildschirm offen ist). */
    taste(code) {
      const T = R.config.tasten, P1 = T.spieler[0], P2 = T.spieler[1];
      const dx = code === P1.links || code === P2.links ? -1 : code === P1.rechts || code === P2.rechts ? 1 : 0;
      const dy = code === P1.gas || code === P2.gas ? -1 : code === P1.bremse || code === P2.bremse ? 1 : 0;
      const ok = T.bestaetigen.includes(code);
      if (this.ansicht === 'start') {
        if (code === T.pause) return this.schliessen();
        if (code === 'KeyI' && this.schalter) { this.schalterUmschalten(); return true; }
        if (dx) { this.wahl = (this.wahl + dx + 2) % 2; this.zeichnen(); }
        if (ok) this.aktion(this.wahl === 0 ? 'erstellen' : 'beitretenAnsicht');
        return true;
      }
      if (this.ansicht === 'code') {
        if (code === T.pause) { this.ansicht = 'start'; this.hinweis = ''; this.zeichnen(); }
        else if (code === 'Enter') this.beitreten();
        return true;
      }
      if (this.ansicht === 'verbinden') { if (code === T.pause) { this.ansicht = 'start'; this.zeichnen(); } return true; }
      if (this.ansicht === 'lobby') {
        if (code === T.pause) { this.raumVerlassen(); return true; }
        if (code === 'KeyI' && this.schalter && this.istHost) { this.schalterUmschalten(); return true; }
        const z = this.zeilen();
        if (dy) { this.fokus = (this.fokus + dy + z.length) % z.length; this.zeichnen(); }
        else if (dx) this.zeileWert(z[this.fokus], dx);
        else if (ok) {
          if (this.istHost) this.aktion('start');
          else this.aktion('bereit');
        }
        return true;
      }
      return true;
    }

    raumVerlassen() {
      if (this.verb) this.verb.senden({ t: 'verlassen' });
      this.lobby = null;
      this.ansicht = 'start'; this.hinweis = '';
      this.zeichnen();
    }

    aktion(a) {
      const [art, p1, p2] = a.split(':');
      if (R.Audio && R.Audio.menueKlick) R.Audio.menueKlick();
      if (art === 'zurueck') return this.schliessen();
      if (art === 'schalter') return this.schalterUmschalten();
      if (art === 'erstellen') return this.erstellen();
      if (art === 'beitretenAnsicht') { this.ansicht = 'code'; this.hinweis = ''; return this.zeichnen(); }
      if (art === 'zumStart') { this.ansicht = 'start'; this.hinweis = ''; return this.zeichnen(); }
      if (art === 'zeichen') return this.codeZeichen(p1);
      if (art === 'loeschen') return this.codeLoeschen();
      if (art === 'beitreten') return this.beitreten();
      if (art === 'verlassen') return this.raumVerlassen();
      if (art === 'bereit') {
        const ich = this.ichLobby();
        if (ich && !this.istHost && this.verb) this.verb.senden({ t: 'bereit', an: !ich.bereit });
        return;
      }
      if (art === 'start') {
        if (!this.istHost || !this.verb) return;
        if (!this.alleBereit()) { this.hinweis = 'Warte, bis alle bereit sind ✋'; this.zeichnen(); return; }
        this.verb.senden({ t: 'start' });
        return;
      }
      if (art === 'wert') return this.wertSetzen(p1, p2);
      if (art === 'fokus') { this.fokus = +p1; return this.zeichnen(); }
      if (art === 'zurLobby') { if (this.verb && this.istHost) this.verb.senden({ t: 'zurLobby' }); return; }
      if (art === 'rennenVerlassen') return this.rennenVerlassen();
      if (art === 'weiterfahren') { this.dialog = false; this.dialogEl.style.display = 'none'; return; }
    }

    ichLobby() { return this.lobby ? this.lobby.spieler.find(s => s.id === this.lobby.du) : null; }
    alleBereit() { return !!this.lobby && this.lobby.spieler.every(s => s.bereit || s.istHost); }

    // ---------- Lobby-Zeilen (Tastatur: ↑↓ Zeile, ←→ Wert) ----------
    zeilen() {
      const z = ['fahrer', 'auto', 'hilfe'];
      if (this.istHost) {
        z.push('strecke', 'welt');
        if (this.variantenListe().length) z.push('variante');
        z.push('hindernisMenge');      // 12.10.: Viele / Sehr viele Hindernisse (nur wirksam in Welten mit Hindernissen)
        z.push('runden', 'gegner', 'schwierigkeit', 'tempoKlasse', 'jahreszeit', 'wetter', 'tageszeit', 'kollisionen', 'polizei', 'zufall');      // Z1: zufall hinten (Fokus-Nummern bleiben)
      }
      return MO() ? MO().zeilen(this, z) : z;          // M4: Polizei weg, dafür Unfälle + Stuntrennen
    }
    streckeDaten() {
      const id = this.lobby ? this.lobby.einstellungen.streckeId : this.spiel.einstellungen.streckeId;
      return R.trackCatalog.find(t => t.id === id) || R.trackCatalog[0];
    }
    /** 12.10.: Hat die gewählte Welt Hindernis-Schichten (sonst wirkt „Hindernisse: Viele" nicht)? */
    hindernisMengeAktiv() {
      const e = this.lobby ? this.lobby.einstellungen : {};
      return !R.Strecke || !R.Strecke.weltHatHindernisse || R.Strecke.weltHatHindernisse(this.streckeDaten(), e.welt);
    }
    variantenListe() {
      const v = this.streckeDaten().varianten || {};
      const ks = Object.keys(v);
      return ks.length ? [{ k: '', text: 'Normal' }].concat(ks.map(k => ({ k, text: '📏 ' + (v[k].name || k) }))) : [];
    }
    /** Werte einer Zeile: [{ k, text, aus, tod }] und der aktuelle Wert. */
    werte(zeile) {
      const c = R.config, L = this.lobby, e = L ? L.einstellungen : {}, ich = this.ichLobby() || {};
      if (MO()) { const w = MO().werte(this, zeile, e); if (w) return w; }          // M4: Zeilen Unfälle / Stuntrennen
      if (zeile === 'fahrer') {
        const belegt = new Set(L ? L.spieler.filter(s => s.id !== L.du).map(s => s.fahrer) : []);
        return { wert: ich.fahrer, liste: c.fahrer.map(f => ({ k: f.name, text: f.emoji, titel: f.name, aus: belegt.has(f.name), emoji: true })) };
      }
      if (zeile === 'auto') return { wert: ich.auto, liste: R.carCatalog.waehlbare().map(a => ({ k: a.id, text: a.name.replace(/^(VW|Mercedes-AMG|Porsche|BMW|Audi) /, '') })) };
      if (zeile === 'hilfe') return { wert: ich.hilfe, liste: Object.keys(c.fahrhilfen).map(k => ({ k, text: c.fahrhilfen[k].name })) };
      if (zeile === 'strecke') return { wert: e.streckeId, liste: R.trackCatalog.map(t => ({ k: t.id, text: t.name })) };
      if (zeile === 'welt') {
        const d = this.streckeDaten(), info = R.weltInfo || {};
        return { wert: e.welt || d.weltStandard, liste: Object.keys(d.welten || {}).map(k => ({ k, text: ((info[k] && info[k].emoji) || '🌍') + ' ' + ((info[k] && info[k].name) || k) })) };
      }
      if (zeile === 'variante') return { wert: e.variante || '', liste: this.variantenListe() };
      if (zeile === 'hindernisMenge') {
        const S = (c.hindernisMenge && c.hindernisMenge.stufen) || {}, an = this.hindernisMengeAktiv();
        return { wert: e.hindernisMenge || 'normal', liste: Object.keys(S).map(k => ({ k, text: S[k].name, aus: !an })) };
      }
      if (zeile === 'runden') {
        const l = [];
        for (let r = c.rennen.rundenMin; r <= c.rennen.rundenMax; r++) l.push({ k: String(r), text: String(r) });
        return { wert: String(e.runden), liste: l };
      }
      if (zeile === 'gegner') {
        const max = Math.max(0, Math.min(c.rennen.gegnerMax, N.MAX_AUTOS - (L ? L.spieler.length : 1))), l = [];
        for (let g = 0; g <= max; g++) l.push({ k: String(g), text: String(g) });
        return { wert: String(e.gegner), liste: l };
      }
      if (zeile === 'schwierigkeit') {
        const S = c.schwierigkeiten;
        return { wert: e.schwierigkeit, liste: Object.keys(S).sort((a, b) => (S[a].rang || 0) - (S[b].rang || 0)).map(k => ({ k, text: (k === 'unschlagbar' ? '💀 ' : '') + S[k].name, tod: k === 'unschlagbar' })) };
      }
      if (zeile === 'tempoKlasse') return { wert: e.tempoKlasse, liste: [{ k: 'normal', text: 'Normal' }, { k: 'schnell', text: 'Schnell' }] };
      if (zeile === 'jahreszeit') {
        const thema = this.streckeDaten().thema, J = c.jahreszeiten || {};
        const l = Object.keys(J).filter(k => !R.Wetter || !R.Wetter.erlaubt || R.Wetter.erlaubt(thema, k).length > 0)
          .map(k => ({ k, text: (thema === 'wueste' && k === 'winter') ? '🌪️ Sandsturm' : J[k].emoji + ' ' + J[k].name }));
        l.push({ k: 'zufall', text: '🎲' });
        return { wert: e.jahreszeit, liste: l };
      }
      if (zeile === 'wetter') {
        const thema = this.streckeDaten().thema, W = c.wetter || {};
        let ks = ['klar'];
        if (e.jahreszeit !== 'zufall' && R.Wetter && R.Wetter.erlaubt) ks = R.Wetter.erlaubt(thema, e.jahreszeit);
        const l = ks.map(k => ({ k, text: (W[k].emoji || '☀️') + ' ' + W[k].name }));
        l.push({ k: 'zufall', text: '🎲' });
        return { wert: e.wetter, liste: l };
      }
      if (zeile === 'kollisionen') return { wert: e.kollisionen ? 'an' : 'aus', liste: [{ k: 'an', text: '🚗💥 Rempeln (normal)' }, { k: 'aus', text: '👻 Geister – durchfahren' }] };   // v28 W5: Rempeln zuerst (Standard)
      if (zeile === 'polizei') return { wert: e.polizei ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🚨 An' }] };   // v4 (14.10.)
      if (zeile === 'geisterfahrer') return { wert: e.geisterfahrer ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '👻 An' }] };   // v25 (15.10.)
      if (zeile === 'krankenwagen') return { wert: R.Verkehr.ausEinstellung(e).krankenwagen ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🚑 An' }] };      // v28 (W1)
      if (zeile === 'abschleppwagen') return { wert: R.Verkehr.ausEinstellung(e).abschleppwagen ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🛻 An' }] };
      if (zeile === 'tiere') return { wert: e.tiere === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🐄 An' }] };      // v28 (W10)
      if (zeile === 'rennautos') return { wert: e.nurRennautos === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🏎 An' }] };      // v29 (F3)
      if (zeile === 'zufall') return { wert: e.zufall === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🎲 An' }] };      // Z1
      if (zeile === 'tageszeit') return { wert: e.tageszeit, liste: [{ k: 'tag', text: '☀️ Tag' }, { k: 'daemmerung', text: '🌇 Dämmerung' }, { k: 'nacht', text: '🌙 Nacht' }] };
      return { wert: null, liste: [] };
    }
    zeileWert(zeile, dx) {
      const w = this.werte(zeile), l = w.liste;
      if (!l.length || l.every(x => x.aus)) return;      // 12.10.: Zeile ausgegraut (z. B. Hindernisse in Welt ohne Hindernisse)
      let i = l.findIndex(x => x.k === w.wert);
      for (let k = 0; k < l.length; k++) {
        i = (i + dx + l.length) % l.length;
        if (!l[i].aus) break;
      }
      this.wertSetzen(zeile, l[i].k);
    }
    wertSetzen(zeile, k) {
      if (!this.verb || !this.lobby) return;
      if (MO() && this.istHost && MO().wertSetzen(this, zeile, k)) return;          // M4: Stuntrennen (bool) / Unfälle
      if (zeile === 'fahrer' || zeile === 'auto' || zeile === 'hilfe') { this.verb.senden({ t: 'wahl', [zeile]: k }); return; }
      if (!this.istHost) return;
      const e = {};
      if (zeile === 'strecke') {
        e.streckeId = k; e.welt = ''; e.variante = '';
        // v29 (F3): Formel-1-Strecke → „Nur Rennautos“ an (außer der Host hat es selbst ausgeschaltet); andere Strecke → aus, wenn es nur der Standard war
        const nd = R.trackCatalog.find(t => t.id === k), lok0 = this.basis || this.spiel.einstellungen;
        e.nurRennautos = lok0.nurRennautos === false ? false : lok0.nurRennautos === true ? true : !!(nd && nd.nurRennautosStandard);
      }
      else if (zeile === 'welt') e.welt = k === this.streckeDaten().weltStandard ? '' : k;
      else if (zeile === 'runden' || zeile === 'gegner') e[zeile] = +k;
      else if (zeile === 'jahreszeit') { e.jahreszeit = k; e.wetter = 'klar'; }
      else if (zeile === 'hindernisMenge') {
        e.hindernisMenge = k;
        // zuletzt gewählten Wert merken (wie bei Rempeln)
        const lok = this.basis || this.spiel.einstellungen;
        lok.hindernisMenge = k;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'kollisionen') {
        e.kollisionen = k === 'an';
        // zuletzt gewählten Wert merken (nächster „Raum erstellen“ startet damit)
        const lok = this.basis || this.spiel.einstellungen;
        lok.kollisionen = e.kollisionen; lok.kollisionenGewaehlt = true;     // v28 W5: selbst gewählt → wird beim Laden respektiert
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'polizei') {
        e.polizei = k === 'an';
        const lok = this.basis || this.spiel.einstellungen;     // zuletzt gewählten Wert merken (wie Rempeln)
        lok.polizei = e.polizei;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'geisterfahrer') {
        e.geisterfahrer = k === 'an';
        const lok = this.basis || this.spiel.einstellungen;
        lok.geisterfahrer = e.geisterfahrer;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'rennautos') {      // v29 (F3): Modus „Nur Rennautos“
        e.nurRennautos = k === 'an';
        const lok = this.basis || this.spiel.einstellungen;
        lok.nurRennautos = e.nurRennautos;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'zufall') {      // Z1: Zufällige Strecke
        e.zufall = k === 'an';
        const lok = this.basis || this.spiel.einstellungen;
        lok.zufall = e.zufall;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'tiere') {      // v28 (W10): Tiere queren die Straße
        e.tiere = k === 'an';
        const lok = this.basis || this.spiel.einstellungen;
        lok.tiere = e.tiere;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'krankenwagen' || zeile === 'abschleppwagen') {      // v28 (W1): je Fahrzeugart einzeln An/Aus
        const lob = this.lobby.einstellungen, nun = R.Verkehr.ausEinstellung(lob);
        e.krankenwagen = zeile === 'krankenwagen' ? k === 'an' : nun.krankenwagen;
        e.abschleppwagen = zeile === 'abschleppwagen' ? k === 'an' : nun.abschleppwagen;     // beide senden: so bleibt die Lobby auch gegen alte `verkehr`-Werte eindeutig
        e.verkehr = e.krankenwagen || e.abschleppwagen ? 'wenig' : 'aus';
        const lok = this.basis || this.spiel.einstellungen;
        lok.krankenwagen = e.krankenwagen; lok.abschleppwagen = e.abschleppwagen; lok.verkehr = e.verkehr;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else e[zeile] = k;
      this.verb.senden({ t: 'einstellungen', einstellungen: e });
    }

    // ---------- Zeichnen ----------
    zeichnen() {
      if (!this.sichtbar) return;
      const kopf = `<div class="m-kopf"><div class="m-logo"><div class="m-titel">🔥 ${R.config.titel} 🏎️</div>` +
        `<div class="m-untertitel">${R.config.untertitel}</div></div><div class="m-schritte"><div class="m-schritt aktiv"><b>🌐</b> Online</div></div></div>`;
      let inhalt = '', fuss = '', hinweis = '';
      const hw = this.hinweis ? `<div class="on-hinweis">${esc(this.hinweis)}</div>` : '';
      if (this.ansicht === 'start') {
        inhalt = `<h1>Online spielen</h1><div class="reihe on-wahl">` +
          `<div class="karte gross${this.wahl === 0 ? ' gewaehlt' : ''}" data-a="erstellen"><div class="emoji">🏠</div><div class="karten-name">Raum erstellen</div>` +
          `<div class="karten-sub">Du bist der Host und bekommst einen Code für die anderen</div></div>` +
          `<div class="karte gross${this.wahl === 1 ? ' gewaehlt' : ''}" data-a="beitretenAnsicht"><div class="emoji">🔑</div><div class="karten-name">Raum beitreten</div>` +
          `<div class="karten-sub">Gib den Code ein, den du bekommen hast</div></div></div>${hw}` +
          `<div class="on-schalter-box on-schalter"${this.schalter ? '' : ' style="display:none"'}>${this.schalterHtml()}</div>` +
          (this.schalter ? `<div class="on-info">🌐 Freunde ohne Tailscale können mitspielen, solange der Internet-Schalter AN ist. Nach 4 Stunden geht er von selbst aus.</div>` : '') +
          (this.schalterGrundText() ? `<div class="on-info on-schalter-grund">${esc(this.schalterGrundText())}</div>` : '') +
          `<div class="on-info">💥 Online rempeln die Autos (Standard), der Host kann auf 👻 Geister (durchfahren) umschalten · Schaden ist online aus · kein Chat</div>`;
        fuss = `<div class="knopf klein" data-a="zurueck">◀ Zurück</div>`;
        hinweis = '<kbd>←</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück' + (this.schalter ? ' · <kbd>I</kbd> Internet für Freunde' : '');
      } else if (this.ansicht === 'code') {
        const cur = this.code.findIndex(c => !c);
        inhalt = `<h1>Raumcode eingeben</h1><div class="on-codefelder">` +
          this.code.map((c, i) => `<span class="${i === cur ? 'cursor' : ''}">${c || ''}</span>`).join('') + `</div>` +
          `<div class="on-tasten">` + N.CODE_ZEICHEN.split('').map(z => `<span data-a="zeichen:${z}">${z}</span>`).join('') +
          `<span data-a="loeschen" title="löschen">⌫</span></div>` +
          `<div class="knopf gruen" data-a="beitreten">Beitreten ▶ <kbd>Enter</kbd></div>${hw}`;
        fuss = `<div class="knopf klein" data-a="zumStart">◀ Zurück</div>`;
        hinweis = 'Buchstaben/Ziffern tippen · <kbd>⌫</kbd> löschen · <kbd>Enter</kbd> beitreten';
      } else if (this.ansicht === 'verbinden') {
        inhalt = `<h1>Verbinde … 🌐</h1>${hw}`;
        fuss = `<div class="knopf klein" data-a="zumStart">◀ Zurück</div>`;
      } else if (this.ansicht === 'laden') {
        inhalt = `<h1>Rennen wird geladen … 🏁</h1>`;
      } else if (this.ansicht === 'lobby' && this.lobby) {
        inhalt = this.htmlLobby(hw);
        const alle = this.alleBereit(), ich = this.ichLobby() || {};
        fuss = `<div class="on-aktion"><div class="knopf klein" data-a="verlassen">🚪 Verlassen <kbd>Esc</kbd></div>` +
          (this.istHost
            ? `<div class="knopf gruen${alle ? '' : ' aus'}" data-a="start">🏁 Start <kbd>Enter</kbd></div>`
            : `<div class="knopf ${ich.bereit ? 'gruen' : 'blau'}" data-a="bereit">${ich.bereit ? '✅ Bereit!' : '✋ Bereit?'} <kbd>Leertaste</kbd></div>`) + `</div>`;
        hinweis = '<kbd>↑</kbd><kbd>↓</kbd> Zeile · <kbd>←</kbd><kbd>→</kbd> ändern' + (this.istHost ? ' · <kbd>Enter</kbd> Start' : ' · <kbd>Leertaste</kbd> bereit');
      }
      this.wurzel.innerHTML = kopf + `<div class="m-inhalt">${inhalt}</div>` +
        `<div class="m-fuss"><div class="m-nav">${fuss}</div><div class="m-hinweis">${hinweis}</div></div>`;
    }

    htmlLobby(hw) {
      const L = this.lobby, e = L.einstellungen, c = R.config;
      const link = MO() ? MO().einladung(einladungsBasis(L.oeffentlich), L.code) : einladungsBasis(L.oeffentlich) + '?raum=' + L.code;          // M4: Motorrad-Gäste öffnen die Motorrad-Seite (nicht Autorennen.html)
      let qr = '';
      try { qr = R.QR ? R.QR.svg(link, { modul: 3, rand: 2 }) : ''; } catch (err) { qr = ''; }
      const autoName = (id) => { const a = R.carCatalog.waehlbare().find(x => x.id === id); return a ? a.name : id; };
      const autoFarbe = (id) => { const a = R.carCatalog.waehlbare().find(x => x.id === id); return a ? HEX(a.farbe) : '#888'; };
      const spieler = L.spieler.map(s => `<div class="on-sp${s.id === L.du ? ' ich' : ''}"><span class="on-emoji">${R.fahrerEmoji(s.fahrer)}</span>` +
        `<span class="on-name">${esc(s.fahrer)}${s.istHost ? ' 👑' : ''}</span><span class="on-auto"><i style="background:${autoFarbe(s.auto)}"></i>${esc(autoName(s.auto))}</span>` +
        `<span>${s.istHost ? '🏁' : s.bereit ? '✅' : '⏳'}</span></div>`).join('');
      const z = this.zeilen();
      const zeile = (id, label) => {
        const w = this.werte(id), i = z.indexOf(id);
        return `<div class="on-zeile${i === this.fokus ? ' fokus' : ''}" data-a="fokus:${i}"><div class="on-label">${label}</div><div class="on-werte">` +
          w.liste.map(x => `<span class="pille${x.k === w.wert ? ' aktiv' : ''}${x.aus ? ' aus' : ''}${x.emoji ? ' emoji' : ''}${x.tod ? ' tod' : ''}"` +
            `${x.aus ? '' : ` data-a="wert:${id}:${x.k}"`}${x.titel ? ` title="${esc(x.titel)}"` : ''}>${esc(x.text)}</span>`).join('') + `</div></div>`;
      };
      // v28 (W1): EINE Zeile „Verkehr“ mit drei Schaltern (Klick = An/Aus): 👻 Geisterfahrer, 🚑 Krankenwagen, 🛻 Abschleppwagen (je einzeln; spart Platz in der Lobby)
      const verkehrZeile = () => {
        const w = R.Verkehr.ausEinstellung(this.lobby.einstellungen);
        const sch = (id, an, text, titel) => `<span class="pille${an ? ' aktiv' : ''}" data-a="wert:${id}:${an ? 'aus' : 'an'}" title="${titel}: ${an ? 'an – Klick = aus' : 'aus – Klick = an'}">${text}</span>`;
        return `<div class="on-zeile"><div class="on-label">🚦 Verkehr</div><div class="on-werte">` +
          sch('geisterfahrer', w.geister, '👻 Geister', 'Geisterfahrer') + sch('krankenwagen', w.krankenwagen, '🚑 Kranken', 'Krankenwagen') + sch('abschleppwagen', w.abschleppwagen, '🛻 Abschlepp', 'Abschleppwagen') +
          sch('tiere', this.lobby.einstellungen.tiere === true, '🐄 Tiere', 'Tiere queren die Straße') + `</div></div>`;      // v28 (W10)
      };
      // v29 (F3): Zeile „Nur Rennautos“ (Computer-Gegner = Formel-Renner in eigenen Farben); Klick = An/Aus
      const rennautosZeile = () => {
        const an = this.lobby.einstellungen.nurRennautos === true;
        return `<div class="on-zeile"><div class="on-label">🏎 Nur Rennautos</div><div class="on-werte">` +
          `<span class="pille${an ? '' : ' aktiv'}" data-a="wert:rennautos:aus" title="Aus: Computer-Gegner fahren verschiedene Autos">Aus</span>` +
          `<span class="pille${an ? ' aktiv' : ''}" data-a="wert:rennautos:an" title="An: alle Computer-Gegner fahren den Formel-Renner, jeder in einer eigenen Farbe">🏎 An</span></div></div>`;
      };
      const meine = zeile('fahrer', '🧑 Fahrer') + zeile('auto', '🚗 Auto') + zeile('hilfe', '🛟 Fahrhilfe');
      let rechts;
      const daten = this.streckeDaten();
      if (this.istHost && MO() && MO().lobbyHost) {
        rechts = MO().lobbyHost(this, zeile, e);          // M4: ohne Polizei/Verkehr/Rennautos, mit Unfällen + Stuntrennen
      } else if (this.istHost) {
        rechts = `<h3>⚙️ Rennen (du bist der Host)</h3>` + zeile('strecke', '🗺️ Strecke') + zeile('welt', '🌍 Welt') +
          (this.variantenListe().length ? zeile('variante', '📏 Variante') : '') +
          zeile('hindernisMenge', this.hindernisMengeAktiv() ? '🚧 Hindernisse' : '🚧 Hindernisse <small>(erst ab Welt „Hindernisse“)</small>') + zeile('runden', '🔁 Runden') +
          zeile('gegner', '🤖 Computer-Gegner') + zeile('schwierigkeit', '🎚️ Computer-Stärke') + zeile('tempoKlasse', '🏎️ Tempo') +
          zeile('jahreszeit', '🍂 Jahreszeit') + zeile('wetter', '🌦️ Wetter') + zeile('tageszeit', '🌗 Tageszeit') + zeile('polizei', '🚨 Polizei') + verkehrZeile() + rennautosZeile() + zeile('zufall', '🎲 Zufällige Strecke') +
          `<div class="on-fest">💥 Schaden: aus (online) · ${e.kollisionen ? '💥 Rempeln an' : '👻 Geister: Autos fahren durcheinander durch'}</div>`;
      } else if (MO() && MO().lobbyGast) {
        rechts = MO().lobbyGast(this, e, daten);
      } else {
        const wi = (R.weltInfo || {})[e.welt || daten.weltStandard] || {};
        const S = c.schwierigkeiten[e.schwierigkeit] || {};
        const J = (c.jahreszeiten || {})[e.jahreszeit], W = (c.wetter || {})[e.wetter], T = { tag: '☀️ Tag', daemmerung: '🌇 Dämmerung', nacht: '🌙 Nacht' };
        rechts = `<h3>⚙️ Rennen (stellt der Host ein)</h3><div class="on-zusammen">` +
          `🗺️ ${esc(daten.name)} · ${wi.emoji || '🌍'} ${esc(wi.name || e.welt || '')}${e.variante ? ' · 📏 XL' : ''}<br>` +
          `🔁 ${e.runden} Runden · 🤖 ${e.gegner} Computer (${esc(S.name || e.schwierigkeit)})<br>` +
          (e.hindernisMenge && e.hindernisMenge !== 'normal' && this.hindernisMengeAktiv() ? `🚧 Hindernisse: ${esc(((c.hindernisMenge.stufen[e.hindernisMenge]) || {}).name || e.hindernisMenge)}<br>` : '') +
          `🏎️ ${e.tempoKlasse === 'schnell' ? 'Schnell' : 'Normal'} · ${J ? J.emoji + ' ' + J.name : '🎲'} · ${W ? (W.emoji || '☀️') + ' ' + W.name : '🎲'} · ${T[e.tageszeit] || ''}${e.polizei ? ' · 🚨 Polizei' : ''}${e.nurRennautos ? ' · 🏎 Nur Rennautos' : ''}${e.geisterfahrer ? ' · 👻 Geisterfahrer' : ''}${R.Verkehr.ausEinstellung(e).krankenwagen ? ' · 🚑 Krankenwagen' : ''}${R.Verkehr.ausEinstellung(e).abschleppwagen ? ' · 🛻 Abschleppwagen' : ''}${e.tiere === true ? ' · 🐄 Tiere' : ''}${e.zufall === true ? ' · 🎲 Zufällige Strecke' : ''}<br>` +
          `💥 Schaden: aus (online) · ${e.kollisionen ? '💥 Rempeln an' : '👻 Geister'}</div>`;
      }
      return `<div class="on-lobby">` +
        `<div class="on-spalte on-einladung"><div class="on-klein">Raumcode</div><div class="on-code">${esc(L.code)}</div>` +
        (qr ? `<div class="on-qr" title="QR-Code mit dem Handy scannen">${qr}</div>` : '') +
        `<div class="on-link">${esc(link)}</div><div class="on-klein">Code eingeben, Link öffnen oder QR scannen</div>` + this.schalterLobbyHtml() + `</div>` +
        `<div class="on-spalte on-mitte"><h3>👥 Spieler (${L.spieler.length}/${L.max || N.MAX_SPIELER})</h3><div class="on-spieler">${spieler}</div>` +
        `<div class="on-wahl-block"><h3>Deine Wahl</h3>${meine}</div>` +
        // W5 Stufe 2: Geister/Rempeln (nur der Host stellt es ein; Gäste sehen den Wert rechts in der Zusammenfassung)
        (this.istHost ? `<div class="on-wahl-block"><h3>🚗💥 Autos untereinander (Host)</h3>${zeile('kollisionen', 'Stoßen die Autos zusammen? 💥 Rempeln (gut bei Ping unter 100 ms)')}</div>` : '') +
        `${hw}</div>` +
        `<div class="on-spalte on-einst">${rechts}</div></div>`;
    }

    /** v26: Hinweis + Knopf direkt bei Link/QR (nur der Host): „Freund ohne Tailscale?“ → Internet für Freunde einschalten. */
    schalterLobbyHtml() {
      if (!this.istHost) return '';
      if (this.schalter) {
        return `<div class="on-frage">👥 Freund ohne Tailscale? → <b>🌐 Internet für Freunde</b> einschalten</div>` +
          `<div class="on-schalter-box on-schalter on-schalter-lobby">${this.schalterHtml()}</div>`;
      }
      const g = this.schalterGrundText();
      return g ? `<div class="on-frage">👥 Freund ohne Tailscale?</div><div class="on-info on-schalter-grund">${esc(g)}</div>` : '';
    }

    // ================================================================ Online-Rennen
    startEmpfangen(m) {
      this.ansicht = 'laden'; this.zeichnen();
      // kurz warten, damit „wird geladen“ sichtbar ist (der Aufbau blockiert den Browser einen Moment)
      setTimeout(() => {
        try { this.rennenAufbauen(m); } catch (err) {
          console.error(err);
          this.raumZu('Das Rennen konnte nicht geladen werden 😕');
          if (this.verb) this.verb.senden({ t: 'verlassen' });
        }
      }, 40);
    }

    rennenAufbauen(m) {
      const spiel = this.spiel, e = m.einstellungen, du = m.du;
      if (!this.basis) this.basis = spiel.einstellungen;
      spiel.einstellungen = Object.assign({}, this.basis, {
        streckeId: e.streckeId, welt: e.welt, variante: e.variante, jahreszeit: e.jahreszeit, wetter: e.wetter, windStaerke: e.windStaerke,
        windRichtung: e.windRichtung, tageszeit: e.tageszeit, hindernisMenge: e.hindernisMenge, tempoKlasse: e.tempoKlasse, runden: e.runden, gegner: e.gegner,
        spass: e.spass === true,    // S1: Trampolin/Kanone wie im Server (fehlt = aus)
        zauber: e.zauber === true,  // S6: Fahr-Zauber wie im Server (fehlt = aus)
        wetterSeed: m.wetterSeed,   // v22: Megastrecke – gleicher Seed wie der Server → gleiche Zonen
        schaden: false, tiere: e.tiere === true, polizei: e.polizei === true, geisterfahrer: e.geisterfahrer === true, krankenwagen: R.Verkehr.ausEinstellung(e).krankenwagen, abschleppwagen: R.Verkehr.ausEinstellung(e).abschleppwagen, verkehr: e.krankenwagen === true || e.abschleppwagen === true || e.verkehr === 'wenig' || e.verkehr === 'viel' ? 'wenig' : 'aus', rempeln: 'sanft', modus: 'solo', spielart: 'rennen',
      });
      if (spiel.menue) spiel.menue.verstecken();
      spiel.ergebnisAnzeige.verstecken(); spiel.pauseAnzeige.verstecken();
      if (spiel.pokalAnzeige) spiel.pokalAnzeige.verstecken();
      this.verstecken();
      this.ergEl.style.display = 'none';
      spiel.szeneAbbauen();
      spiel.pausiert = false;
      spiel.tempoKlasse = e.tempoKlasse;
      // Z1: Zufällige Strecke – Seed vom Server (start.zufallSeed); fehlt er (alter Server/aus), bleibt die Strecke fest wie bisher
      if (R.ZufallSpiel) R.ZufallSpiel.seedWaehlen(spiel, { zufall: e.zufall === true && Number.isFinite(m.zufallSeed), zufallSeed: m.zufallSeed });
      const strecke = spiel.streckeSzeneBauen(e.streckeId);
      const katalog = R.carCatalog.waehlbare();
      const plaetze = strecke.startpositionen(m.teilnehmer.length);
      const tl = [];
      this.geisterMat = [];
      m.teilnehmer.forEach((t, i) => {
        const p = plaetze[i], basis = katalog.find(a => a.id === t.autoId) || katalog[0];
        const auto = t.optionen ? Object.assign({}, basis, { optionen: Object.assign({}, basis.optionen || {}, t.optionen) }) : basis;   // v20: Lack/Dach der Computer-Füller
        const f = spiel.fahrzeugHinzufuegen(auto, p.x, p.z, p.heading, null);
        f.dachL = R.DachRegel ? R.DachRegel.neu(auto) : null;     // v24 (15.10.): Dach-Zustand je Cabrio – der Server rechnet, hier nur Anzeige (zustand.dz / ich.dz)
        f.vehicle.y = strecke.hoeheAn(p.x, p.z);
        spiel._vorherAngleichen(f);
        f.istSpieler = i === du; f.spielerNr = i === du ? 0 : -1;
        f.fahrhilfe = t.hilfe; f.index = -1; f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0;
        f.netRs = 0; f.netWinkel = null;
        f.schatten = new R.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
        if (R.SpassTuning && t.tuning && e.tuning === true) { R.SpassTuning.anwenden(f.vehicle, R.SpassTuning.saeubern(t.tuning)); R.SpassTuning.anwenden(f.schatten, R.SpassTuning.saeubern(t.tuning)); if (f.mesh) R.SpassTuning.teileAnbauen(f.mesh, auto, R.SpassTuning.saeubern(t.tuning)); }   // S2: Tuning wie im Server (nur wenn der Raum es erlaubt)
        if (i !== du && !e.kollisionen) this.geist(f.mesh);          // Stufe 1: Geister; Stufe 2 (kollisionen) deckend
        tl.push({ vehicle: f.vehicle, name: t.name, istSpieler: !!t.mensch });
      });
      const rennen = new R.RaceManager(strecke, tl, { runden: e.runden, countdown: m.countdown });
      spiel.rennen = rennen;
      spiel.startBoost = null; spiel.schaden = null; spiel.polizei = null; spiel.muenzen = null;
      this.nT = m.teilnehmer.length;                    // Teilnehmer = fahrzeuge[0 … nT−1]; dahinter ggf. die Streifenwagen
      // v4 (14.10.): Polizei online – der Server rechnet, hier nur Streifenwagen (Mesh + Blaulicht + Sirene) und die Anzeige (HUD-Countdown, Minimap)
      if (e.polizei === true && R.Polizei) {
        spiel.polizei = new R.Polizei(spiel);
        spiel.polizei.einsetzen(strecke, this.nT, e.gegner);
        try { spiel.polizei.vorkompilieren(spiel.renderer, spiel.szene, spiel.menueKamera); } catch (err) { /* nur Optik */ }
      }
      // v25 (15.10.): Verkehr online – der Server rechnet (Geisterfahrer, Krankenwagen, Abschleppwagen), hier nur Anzeige (Mesh, Blaulicht, Sirene, HUD-Warnung)
      spiel.verkehr = null;
      const vw = R.Verkehr ? R.Verkehr.ausEinstellung(e) : null;      // v28 (W1): Krankenwagen/Abschleppwagen je einzeln (alter Server: verkehr wenig/viel → beide an)
      if (vw && (vw.geister || vw.krankenwagen || vw.abschleppwagen)) {
        spiel.verkehr = new R.Verkehr(spiel);
        spiel.verkehr.nurAnzeige = true;
        spiel.verkehr.einsetzen(strecke, this.nT, vw);
        try { spiel.verkehr.vorkompilieren(spiel.renderer, spiel.szene, spiel.menueKamera); } catch (err) { /* nur Optik */ }
      }
      // v28 (W10): Tiere online – der Server rechnet (Erscheinen, Pfad, Kontakt), hier nur Anzeige (Slots aus zustand.ti, Glättung wie Verkehr)
      spiel.tiere = null;
      if (e.tiere === true && R.Tiere) {
        spiel.tiere = new R.Tiere(spiel);
        spiel.tiere.nurAnzeige = true;
        spiel.tiere.einsetzen(strecke, this.nT, {});
        const tg = spiel.tiere.bauen();
        if (tg) spiel.szene.add(tg);
      }
      spiel._blauPoolAnlegen(1);      // v26c: fester Blaulicht-Licht-Pool (Lichtzahl bleibt nach dem Rennstart konstant)
      const mein = spiel.fahrzeuge[du];
      spiel.kameraHinzufuegen(mein);
      const hud = new R.Hud(spiel.hudWurzel, { rennen, teilnehmer: rennen.teilnehmer[du], fahrzeug: mein, nr: 0, split: false });
      spiel.huds = [hud];
      if (spiel.wetter) { spiel.wetter.partikelBauen(1); if (hud.wetterSetzen) hud.wetterSetzen(spiel.wetter); }
      if (hud.schadenSetzen) hud.schadenSetzen(null, du);
      if (hud.itemSetzen) hud.itemSetzen(spiel.pickups, du, 0);
      if (hud.polizeiSetzen) hud.polizeiSetzen(spiel.polizei, du);
      if (hud.verkehrSetzen) hud.verkehrSetzen(spiel.verkehr, du);
      if (hud.muenzenSetzen) hud.muenzenSetzen(null);
      // Ping + 🌐 in der Namens-Karte oben links
      const links = hud.el.querySelector('.hud-links');
      this.pingEl = el('div', 'hud-netz', links || hud.el);
      this.pingEl.textContent = '🌐 … ms';
      if (R.Feuerwerk) R.Feuerwerk.verbinden(spiel);   // v28 W8: Feuerwerk, wenn ein Mensch Erster wird (Server-Ergebnis → 'ziel'-Ereignis), nur Client-Optik
      if (R.Audio) {
        const A = R.Audio; spiel._tonCd = -1;
        spiel.fahrzeuge.forEach((f, i) => A.motorAnlegen(i, { spieler: f.istSpieler, auto: f.auto }));   // 14.10. (v21): Klangprofil je Auto
      }
      // Netz-Zustand
      this.du = du;
      this.teilnehmer = m.teilnehmer;
      this.kollisionen = e.kollisionen === true;        // Stufe 2 (Rempeln): Vorhersage kennt die anderen Autos
      const andere = this.kollisionen ? m.teilnehmer.map((t, i) => (i === du ? null : { nr: i, auto: katalog.find(a => a.id === t.autoId) || katalog[0] })).filter(Boolean) : [];
      this.vorhersage = new R.NetzVorhersage({ strecke, auto: mein.auto, tempoKlasse: e.tempoKlasse, fahrhilfe: m.teilnehmer[du].hilfe,
        umwelt: () => (spiel.wetter ? spiel.wetter.umwelt() : undefined), kollisionen: this.kollisionen, andere, rempeln: 'sanft',
        tuning: R.SpassTuning && e.tuning === true && m.teilnehmer[du].tuning ? R.SpassTuning.saeubern(m.teilnehmer[du].tuning) : null });
      if (this.vorhersage.dz) mein.dachL = this.vorhersage.dz;     // v24: der eigene Dach-Zustand IST der der Vorhersage (Klappzeit/Gas-Sperre), HUD und Optik lesen ihn
      const vp = this.vorhersage.vp, p0 = plaetze[du];
      vp.setzen(p0.x, p0.z, p0.heading); vp.y = strecke.hoeheAn(p0.x, p0.z);
      this.puffer = new R.NetzPuffer();
      if (this.verb) this.verb.uhrNeu();
      this.anz = new R.NetzAnzeige(this.verb, this.puffer);      // v23: gleichmäßiger Anzeige-Tick für die anderen Autos
      this.takt = new R.NetzEingabeTakt();                       // v23: Eingabe-Schritte 1:1 zum Physikschritt
      this._bildZeit = performance.now(); this._hintergrund = false; this._versteckt = 0;
      this._wachpostenAn();
      this.n = 0; this.t0 = null; this.empfangen = false; this._letzteS = null; this.itemFlag = false; this.resetFlag = false; this.freikaufFlag = false; this.dachFlag = false;
      this.startTick = null; this.dynTick = 0; this._gestartet = false; this.warSonder = false;
      this.schattenListe = spiel.fahrzeuge.slice(0, this.nT).map(f => ({ vehicle: f.schatten, istSpieler: false }));
      this._pingZeit = 0;
      this.dialog = false; this.dialogEl.style.display = 'none';
      this.phase = 'rennen';
      spiel.online = this;
      spiel.zustand = 'online';
      spiel.uhr.rest = 0;
      spiel.qualitaet.stufe = 0; spiel.qualitaet.unten = spiel.qualitaet.oben = 0; spiel.qualitaet.fpsGlatt = 60;
      spiel._hudZeit = -1e9;
      spiel._physikZeit = 0;
      if (spiel.tunnelLichter) spiel._tunnelLichterVorkompilieren();
      spiel.groesse();
      try { if (spiel._vorwaermen) spiel._vorwaermen(); } catch (e) { }
      if (MO()) { try { MO().aufbau(this, m); } catch (err) { console.error('Motorrad online (Aufbau):', err); } }          // M4: Stunt-/Unfall-Anzeige, Stationen, Trick-Taste
      if (this.verb) {
        // v22 (additiv, Protokoll-Version bleibt 4): Münzen-Guthaben des eigenen Fahrers (Garage-Konto) melden – der Server braucht es nur zum Freikaufen bei der Polizei
        let k = 0;
        try { const nm = spiel.rennen.teilnehmer[du].name; if (R.Garage && nm) k = R.Garage.konto(nm); } catch (err) { k = 0; }
        this.verb.senden({ t: 'geladen', k: Math.max(0, Math.min(99999, Math.floor(k) || 0)) });
      }
    }

    /** Geister-Darstellung: alle Materialien des Autos als Kopie halbtransparent (Cache-Materialien bleiben unberührt). */
    geist(mesh) {
      const kopien = new Map(), istKopie = new Set(), ud = mesh.userData || {};
      const ein = (m) => {
        if (istKopie.has(m)) return m;     // v27 F6b: schon eine Geister-Kopie (setzeLicht ruft ein() erneut auf) – unverändert zurück, keine Kopie der Kopie
        if (m === ud.bremslichtMaterial) { m.transparent = true; m.opacity = 0.6; return m; }
        if (!kopien.has(m)) {
          const k = m.clone();
          k.transparent = true; k.opacity = (m.opacity === undefined ? 1 : m.opacity) * 0.6;
          kopien.set(m, k); istKopie.add(k); this.geisterMat.push(k);
        }
        return kopien.get(m);
      };
      mesh.traverse((o) => {
        if (!o.material) return;
        o.material = Array.isArray(o.material) ? o.material.map(ein) : ein(o.material);
      });
      ud.geistKopie = ein;     // v27 F6: carBuilder.setzeLicht wendet die Geister-Kopie nach dem Licht-Schalten erneut an (gleiche Kopien, werden mit geisterMat freigegeben)
    }

    rennenAbbauen() {
      const spiel = this.spiel;
      if (MO()) { try { MO().abbau(this); } catch (err) { console.error('Motorrad online (Abbau):', err); } }          // M4
      this.phase = null;
      this._wachpostenAus();
      spiel.online = null;
      this.dialog = false; this.dialogEl.style.display = 'none';
      spiel.szeneAbbauen();
      (this.geisterMat || []).forEach(m => m.dispose());
      this.geisterMat = [];
      spiel.zustand = 'menue';
      spiel.ui.classList.remove('split');
      this.vorhersage = null; this.puffer = null; this.pingEl = null;
      const id = this.lobby ? this.lobby.einstellungen.streckeId : spiel.einstellungen.streckeId;
      this.einstellungenZurueck();
      try { spiel.menueHintergrund(id); } catch (e) { /* nur Deko */ }
    }

    rennenVerlassen() {
      this.raumVerlassen();
      this.rennenAbbauen();
      this.ergEl.style.display = 'none';
      this.sichtbar = true; this.wurzel.style.display = '';
      this.zeichnen();
    }

    /** Spiel-Taste im Zustand 'online' (main.js taste). */
    rennTaste(code, wiederholt) {
      const T = R.config.tasten;
      if (this.dialog) {
        if (wiederholt) return;
        if (code === T.pause) this.aktion('weiterfahren');
        else if (T.bestaetigen.includes(code)) this.aktion('rennenVerlassen');
        return;
      }
      if (this.phase === 'ergebnis') {
        if (wiederholt) return;
        if (code === 'Enter' && this.istHost) this.aktion('zurLobby');
        else if (code === T.pause) this.aktion('rennenVerlassen');
        return;
      }
      if (this.phase !== 'rennen' || wiederholt) return;
      if (code === T.pause) {
        this.dialog = true;
        this.dialogEl.innerHTML = `<div class="pause-karte"><h1>🌐 Rennen verlassen?</h1>` +
          `<div class="knopf gruen" data-a="weiterfahren">▶ Weiterfahren <kbd>Esc</kbd></div>` +
          `<div class="knopf blau" data-a="rennenVerlassen">🚪 Verlassen <kbd>Enter</kbd></div>` +
          `<div class="on-klein" style="text-align:center;font-size:.6em">Das Rennen läuft weiter – online gibt es keine Pause</div></div>`;
        this.dialogEl.style.display = '';
      } else if (code === T.kamera) this.spiel.kameras.forEach(k => k.naechsterModus());
      else if (code === T.resetSpieler1 || code === T.resetSpieler2) this.reset();
      else if (code === T.item1 || code === T.item2) this.item();
    }
    item() { if (this.phase === 'rennen') this.itemFlag = true; }
    reset() { if (this.phase === 'rennen') this.resetFlag = true; }

    // ---------- Server-Nachrichten im Rennen ----------
    zustandEmpfangen(z) {
      if (this.phase !== 'rennen') return;
      const spiel = this.spiel, r = spiel.rennen;
      this.empfangen = true;
      this.puffer.rein(z);
      // Rennleitung (Puppe): Zustand, Zeit, Plätze, Runden
      if (r.zustand === 'countdown' && z.rz !== 'countdown') this._start(z.k);
      r.zustand = z.rz;
      r.countdown = z.cd;
      if (Math.abs(r.zeit - z.zt) > 0.15 || z.rz !== 'laeuft') r.zeit = z.zt;
      for (let i = 0; i < z.a.length && i < r.teilnehmer.length; i++) {
        const a = z.a[i], t = r.teilnehmer[i];
        t.runde = a[9]; t.platz = a[10]; t.naechsterCheckpoint = a[11]; t.fortschritt = a[12];
        t.istSpieler = !!(a[6] & 128);
        if (a[6] & 16) t.imZiel = true;
      }
      r.rangliste = r.teilnehmer.slice().sort((x, y) => x.platz - y.platz);
      this._polizeiZustand(z);
      // eigener Wagen
      if (z.ich) {
        const ich = z.ich, f = spiel.fahrzeuge[this.du], t = r.teilnehmer[this.du];
        const v = f.vehicle, tr = this.vorhersage.trenn || { x: 0, z: 0 };
        const anzeige = { x: v.x - tr.x, z: v.z - tr.z, y: v.y, heading: v.heading };     // v28c: ohne den Trenn-Versatz (der gehört nur der Anzeige, nicht in korr)
        this.vorhersage.abgleich(ich, anzeige, this.kollisionen === true ? z.a : undefined, z.k);
        f.resetHinweis = !!ich.rh; f.falschHerum = !!ich.fh;
        t.rundenStart = ich.rs; t.rundenzeiten = ich.rzn || []; t.bestzeit = ich.bz;
        if (ich.zz !== null && ich.zz !== undefined) t.zielZeit = ich.zz;
        if (ich.zp) t.zielPlatz = ich.zp;
        if (this.vorhersage.hart) { this.vorhersage.anzeigen(v); spiel._vorherAngleichen(f); this.vorhersage.hart = false; }
      }
      if (MO()) { try { MO().zustand(this, z); } catch (err) { console.error('Motorrad online (Zustand):', err); } }          // M4: zustand.mo / ich.mu
      // v24 (15.10., additiv): Dach der anderen Cabrios (zustand.dz = [[Nr, ziel, Rest]]) – dach.js klappt das Mesh passend; das eigene Dach kommt aus ich.dz (Vorhersage)
      if (z.dz) {
        for (const e of z.dz) {
          const g = spiel.fahrzeuge[e[0]];
          if (!g || e[0] === this.du || !g.dachL) continue;
          g.dachL.ziel = e[1] ? 1 : 0; g.dachL.rest = e[2] > 0 ? e[2] : 0;
        }
      }
      // Pickups (Turbo, Schild, Ölfässer, Ölflecken) für die Anzeige übernehmen
      const pu = spiel.pickups;
      if (pu && z.pu) {
        pu.kugeln.forEach((k, i) => { const da = z.pu.k[i] === '1'; if (da && !k.da) k.erschienen = 0; k.da = da; });
        pu.faesser.forEach((k, i) => { const da = z.pu.f[i] === '1'; if (da && !k.da) k.erschienen = 0; k.da = da; });
        pu.oel.length = 0;
        for (const o of z.pu.o) pu.oel.push({ x: o[0], z: o[1], heading: o[2], alter: o[3], owner: o[4], geschuetzt: new Set() });
        z.a.forEach((a, i) => {
          const s = pu._auto(i), w = z.pu.v[i];
          s.v = spiel.fahrzeuge[i] ? spiel.fahrzeuge[i].vehicle : null;
          if (w) { s.turbo = w[0]; s.vFaktor = w[1]; s.bFaktor = w[2]; }
          s.schild = !!(a[6] & 4); s.item = (a[6] & 8) ? 1 : 0;
          if ((a[6] & 64) && !(s.platzt > 0)) s.platzt = 0.4;
        });
      }
    }

    /** v4: Anhaltungen (z.ps, für den eigenen Wagen ich.ps genauer) und Ziele der Streifenwagen in die Anzeige-Logik übernehmen. */
    _polizeiZustand(z) {
      const po = this.spiel.polizei;
      if (!po) return;
      const L = po.logik, du = this.du;
      const warDu = L.gesperrt(du);
      for (let i = 0; i < this.nT; i++) L._a(i).stopp = 0;
      (z.ps || []).forEach((p) => { if (p[0] < this.nT) L._a(p[0]).stopp = p[1]; });
      if (z.ich) L._a(du).stopp = z.ich.ps > 0 ? z.ich.ps : 0;
      (z.pz || []).forEach((zi, k) => { L._s(k).ziel = zi; });
      if (!warDu && L.gesperrt(du) && R.Audio && R.Audio.polizeiStopp) R.Audio.polizeiStopp();
    }

    _start(k) {
      if (this._gestartet) return;
      this._gestartet = true;
      const r = this.spiel.rennen;
      this.startTick = k;
      r.zustand = 'laeuft'; r.zeit = 0;
      r._melden('start');
      if (R.Audio) R.Audio.countdown(0);
    }

    ereignisEmpfangen(m) {
      if (this.phase !== 'rennen') return;
      const spiel = this.spiel, r = spiel.rennen, hud = spiel.huds[0];
      const t = r.teilnehmer[m.nr];
      if (MO()) { try { MO().ereignis(this, m); } catch (err) { console.error('Motorrad online (Ereignis):', err); } }          // M4: stunt / sturz / unfall
      if (m.art === 'start') this._start(m.k);
      else if (m.art === 'freikauf') {         // v22 (additiv, Protokoll-Version bleibt 4): Server hat den Stopp gegen Münzen beendet → Garage-Konto abbuchen
        try { const nm = r.teilnehmer[this.du].name; if (R.Garage && nm) R.Garage.abbuchen(nm, m.kosten); } catch (err) { /* egal */ }
      }
      else if (m.art === 'zufall') { try { if (R.ZufallSpiel) R.ZufallSpiel.anwenden(spiel, { runde: m.runde, n: m.n, v: m.v }); } catch (err) { console.error('Zufall (online):', err); } }      // Z1: Neuverteilung wie der Server (gleiche Eingaben → gleiche Lage)
      else if (m.art === 'meldung') { if (hud) hud.meldung(m.text, String(m.text).indexOf('\n') >= 0 ? 3200 : 1500); }
      else if (m.art === 'runde' && t) {
        t.runde = m.runde;
        if (m.nr === this.du) t.rundenzeiten = t.rundenzeiten.concat([m.zeit]);
        r._melden('runde', t, m.zeit);
        spiel.strecke.pylonenZurueck(m.nr);
        if (R.Audio && m.nr === this.du && t.runde < r.runden) R.Audio.runde();
      } else if (m.art === 'ziel' && t) {
        t.imZiel = true; t.zielPlatz = m.platz; t.zielZeit = m.zeit;
        r._melden('ziel', t);
        if (R.Audio && m.nr === this.du) R.Audio.ziel(m.platz);
      } else if (m.art === 'weg') {
        if (t) t.istSpieler = false;
        if (hud) hud.meldung(m.text, 2500);
      }
    }

    ergebnisEmpfangen(m) {
      if (this.phase !== 'rennen') return;
      this.phase = 'ergebnis';
      this.dialog = false; this.dialogEl.style.display = 'none';
      const autos = R.carCatalog.waehlbare();
      const zeilen = m.zeilen.map((z) => {
        const a = autos.find(x => x.id === z.autoId);
        const ich = z.nr === this.du;
        const zeit = z.zeit !== null ? R.zeitText(z.zeit) : '<span class="noch">unterwegs</span>';
        return `<tr class="${ich ? 'spieler p1' : z.mensch ? 'spieler p2' : 'computer'}"><td class="platz">${z.platz}.</td>` +
          `<td class="name">${z.mensch ? R.fahrerEmoji(z.name) + ' ' : '🤖 '}${esc(z.name)}${z.weg ? ' <span class="on-weg">🚪 weg</span>' : ''}</td>` +
          `<td class="auto"><i style="background:${a ? HEX(a.farbe) : '#888'}"></i>${a ? esc(a.name) : ''}</td>` +
          `<td class="zeit">${zeit}</td><td class="zeit">${z.beste !== null ? R.zeitText(z.beste) : '–'}</td></tr>`;
      }).join('');
      this.ergEl.innerHTML = `<div class="ergebnis-karte"><h1>🌐 Ergebnis</h1>` +
        `<table><thead><tr><th>Platz</th><th>Name</th><th>Auto</th><th>Gesamtzeit</th><th>Beste Runde</th></tr></thead><tbody>${zeilen}</tbody></table>` +
        `<div class="knoepfe">` + (this.istHost ? `<div class="knopf gruen" data-a="zurLobby">👥 Zur Lobby <kbd>Enter</kbd></div>`
          : `<div class="knopf" style="background:rgba(255,255,255,.2)">⏳ Warten auf den Host …</div>`) +
        `<div class="knopf blau" data-a="rennenVerlassen">🚪 Verlassen <kbd>Esc</kbd></div></div></div>`;
      // v29 F5: läuft das Feuerwerk (ein Mensch wurde Erster), erscheint die Tafel erst nach config.feuerwerk.tafelNach (main.js ruft ergebnisFreigeben je Bild)
      this.ergEl.style.display = (R.Feuerwerk && R.Feuerwerk.tafelWartezeit && R.Feuerwerk.tafelWartezeit(this.spiel) > 0) ? 'none' : '';
      this._ergWarten = this.ergEl.style.display === 'none';
      this.statistik.korrekturen = this.vorhersage ? Object.assign({}, this.vorhersage.stat) : null;
      if (MO()) { try { MO().ergebnis(this, m); } catch (err) { console.error('Motorrad online (Ergebnis):', err); } }          // M4: Stuntpunkte-Spalte, Bestenliste
    }

    /** v29 F5: Ergebnistafel nachträglich zeigen, sobald das Feuerwerk den Auftakt hinter sich hat (je Bild von main.js). */
    ergebnisFreigeben() {
      if (!this._ergWarten) return;
      if (this.phase !== 'ergebnis') { this._ergWarten = false; return; }
      if (R.Feuerwerk.tafelWartezeit(this.spiel) > 0) return;
      this._ergWarten = false; this.ergEl.style.display = '';
    }

    // ---------- fester Schritt (main.js physikSchritt im Zustand 'online') ----------
    physikSchritt(dt) {
      if (this.phase !== 'rennen') return;
      const spiel = this.spiel, fz = spiel.fahrzeuge, r = spiel.rennen, st = spiel.strecke, V = this.vorhersage;
      this._bildZeit = performance.now();
      if (this._hintergrund) this._zurueck(performance.now());
      spiel._physikZeit = (spiel._physikZeit || 0) + dt;
      for (let i = 0; i < fz.length; i++) {
        const v = fz[i].vehicle, a = fz[i].vorher;
        a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung;
      }
      const mein = fz[this.du], meinT = r.teilnehmer[this.du];
      let sd = this._letzteS || { gas: 0, bremse: 0, lenkung: 0 };
      // v22 (additiv, Protokoll-Version bleibt 4): Doppeltipp Rückwärts (↓ oder S, Touch ▼) während des Polizei-Stopps → Wunsch „freikaufen“ (Bit f), der Server prüft und zieht ab
      if (spiel.input && spiel.input.rueckwaertsDoppel && !this.dialog) {
        const d0 = spiel.input.rueckwaertsDoppel(0), d1 = spiel.input.rueckwaertsDoppel(1);
        if ((d0 || d1) && spiel.polizei && spiel.polizei.gesperrt(this.du)) this.freikaufFlag = true;
      }
      const DT = R.config.physik.schritt;
      if (this.empfangen && this.verb) {
        // Eingaben im Echtzeit-Takt (60 je Sekunde), unabhängig von der Bildrate: langsame Geräte schicken pro
        // Bild mehrere Schritte nach, damit der Server (der in Echtzeit rechnet) nie ohne Eingabe dasteht.
        // v23: je Physikschritt genau EIN Eingabe-Schritt (NetzEingabeTakt); mehr nur zum Aufholen nach verworfener Zeit (langes Bild, Hintergrund).
        const anzahl = this.takt.anzahl(performance.now() / 1000, DT, this.n);
        for (let k = 0; k < anzahl; k++) {
          // Eingabe je Schritt: Pfeile ODER WASD (online fährt jeder allein); Touch mischt input.steuerung selbst ein
          let s = { gas: 0, bremse: 0, lenkung: 0 };
          if (!this.dialog) {
            const a = spiel.input.steuerung(0), b = spiel.input.steuerung(1);
            s = { gas: Math.max(a.gas || 0, b.gas || 0), bremse: Math.max(a.bremse || 0, b.bremse || 0),
              lenkung: Math.max(-1, Math.min(1, (a.lenkung || 0) + (b.lenkung || 0))) };
          }
          const kod = N.eingabeKodieren(s);
          sd = N.eingabeDekodieren(kod);
          this._letzteS = sd;
          this.n++;
          const msg = { t: 'eingabe', n: this.n, g: kod.g, b: kod.b, l: kod.l };
          if (this.itemFlag) msg.i = 1;
          if (this.resetFlag) msg.r = 1;
          if (this.freikaufFlag) msg.f = 1;
          if (this.dachFlag) msg.d = 1;                      // v24: Dach-Geste (↑+↓ im Stand) – der Server entscheidet, die Vorhersage rechnet mit
          if (MO() && !this.dialog) MO().eingabe(this, msg);          // M4: Trick-Taste (Bit k)
          const dachGeste = this.dachFlag;
          this.itemFlag = this.resetFlag = this.freikaufFlag = this.dachFlag = false;
          this.verb.senden(msg);
          V.schritt(this.n, sd, { countdown: r.zustand === 'countdown', imZiel: meinT.imZiel, dach: dachGeste });
        }
      }
      const tick = this.verb ? this.verb.serverTick() : null;
      // v23: Anzeige-Tick der anderen Autos (gleichmäßig, adaptiver Verzug) – Akkumulator-Rest nach diesem Schritt = spiel.uhr.rest − dt
      const anzTick = this.anz && tick !== null ? this.anz.schritt(Math.max(0, (spiel.uhr.rest || 0) - dt)) : null;
      // --- eigener Wagen ---
      if (!V.sonder) {
        if (this.warSonder) { this.warSonder = false; }
        V.abklingen(dt);
        V.anzeigen(mein.vehicle);
        mein.bremst = V.bremst;
        // v16: Looping/Flug stammen aus der Vorhersage (V.lp / V.fz, wenn eingeschaltet), sonst wie v15 aus
        if (mein.looping) {
          const lp = V.lp;
          if (lp && lp.aktiv && lp.looping) {
            const idx = st.loopings.indexOf(lp.looping);
            this._looping(mein, [idx, lp.winkel + V.korr.w, lp.qEin]);
            mein.looping.winkelVorher = lp.winkelVorher + V.korr.w;
          } else if (lp && lp.fallen && lp.looping) {          // Fall-Animation nach zu langsamem Looping (Startpose fallVon aus der Vorhersage)
            const m = mein.looping;
            m.aktiv = false; m.fallen = true; m.looping = lp.looping; m.qEin = lp.qEin; m.fallZeit = lp.fallZeit; m.fallVon = lp.fallVon;
            mein.vehicle.imLooping = true;
          } else { mein.looping.aktiv = false; mein.looping.fallen = false; }
        }
        if (mein.flug) {
          const fz = V.fz;
          mein.flug.aktiv = !!(fz && fz.aktiv);
          if (fz) { mein.flug.nicken = fz.nicken; mein.flug.nickenVorher = fz.nickenVorher; }
        }
        mein.index = V.idx;
      } else if (tick !== null) {
        const ziel = this._tmp || (this._tmp = { x: 0, z: 0, y: 0, heading: 0, vLaengs: 0, lenkung: 0, nicken: 0, neigung: 0 });
        const um = this.puffer.um(tick - 0.05 / DT);
        if (um) {
          const lp = R.NetzPuffer.interpolieren(um.a.a[this.du], um.b.a[this.du], um.t, ziel);
          if (!this.warSonder) { this.warSonder = true; V.uebergang(mein.vehicle, ziel); }
          V.abklingen(dt);
          const v = mein.vehicle, c = V.korr;
          v.x = ziel.x + c.x; v.z = ziel.z + c.z; v.y = ziel.y + c.y; v.heading = ziel.heading + c.h;
          v.vLaengs = ziel.vLaengs; v.lenkung = ziel.lenkung; v.nicken = ziel.nicken; v.neigung = ziel.neigung;
          this._looping(mein, lp);
          this._flags(mein, um.b.a[this.du]);
          if (V.hart) { spiel._vorherAngleichen(mein); V.hart = false; }
        }
      }
      // v24: Strafuhr (nur Anzeige) zwischen den Server-Zuständen mitzählen; Wert und Strafe kommen vom Server (ich.dz, Meldung)
      const dz = V.dz;
      if (dz && dz.nass && dz.ziel === 0 && !(dz.rest > 0) && r.zustand === 'laeuft' && !meinT.imZiel) dz.uhr = Math.max(0, dz.uhr - dt);
      v_letzte(mein.vehicle, sd);       // Motorton/Bremslicht
      // --- andere Autos: hinter dem Server interpolieren (Verzug adaptiv ≥ 100 ms, hinter dem neuesten Zustand begrenzt extrapolieren) ---
      if (tick !== null && anzTick !== null) {
        const um = this.anz.um();
        if (um) {
          for (let i = 0; i < this.nT; i++) {
            if (i === this.du) continue;
            const f = fz[i], a0 = um.a.a[i], a1 = um.b.a[i];
            if (!a0 || !a1) continue;
            const lp = this.anz.pose(i, f.vehicle);
            const rs = um.t > 0.5 ? a1[13] : a0[13];
            if (f.netRs !== rs) { f.netRs = rs; spiel._vorherAngleichen(f); }
            this._looping(f, lp);
            this._flags(f, a1);
          }
          // v25: Verkehr (vk) – Geisterfahrer/Krankenwagen/Abschleppwagen; geparkte Einträge (Flag 2 aus) sind unsichtbar, beim Auftauchen KEIN Interpolieren aus dem Nichts
          const vkw = spiel.verkehr;
          if (vkw && um.a.vk && um.b.vk) {
            vkw.zustandAnwenden(um.a.vk, um.t > 0.5 ? um.b.vk : um.a.vk);
            for (let k = 0; k < vkw.idx.length; k++) {
              const f = fz[vkw.idx[k]], a0 = um.a.vk[k], a1 = um.b.vk[k];
              if (!f || !a0 || !a1 || !vkw.eintraege[k].aktiv) continue;
              if ((a0[6] & 2) && (a1[6] & 2) && a0[13] === a1[13]) this.anz.pose(k, f.vehicle, 'vk');
              else { const w = f.vehicle; w.x = a1[0]; w.z = a1[1]; w.y = a1[2]; w.heading = a1[3]; w.vLaengs = a1[4]; w.lenkung = a1[5]; w.nicken = a1[7]; w.neigung = a1[8]; }
              if (f.netRs !== a1[13]) { f.netRs = a1[13]; spiel._vorherAngleichen(f); }
            }
          }
          // v28 (W10): Tiere (ti) – Plätze im Format von `a`; dieselbe Glättung (NetzAnzeige.pose), beim Auftauchen/anderem Reset-Zähler KEIN Interpolieren aus dem Nichts
          const tw = spiel.tiere;
          if (tw) {
            const ta = um.a.ti || [], tb = um.b.ti || [], tn = um.t > 0.5 ? tb : ta;
            tw.zustandAnwenden(tn);
            for (let k = 0; k < tw.slots.length; k++) {
              if (!tw.slots[k].aktiv) continue;
              const a0 = ta[k], a1 = tb[k];
              if (a0 && a1 && (a0[6] & 2) && (a1[6] & 2) && a0[13] === a1[13]) this.anz.pose(k, tw.slots[k], 'ti');
              else tw.poseAus(k, tn[k] || a1 || a0);
            }
          }
          // v4: Streifenwagen (po) – gleiche Interpolation wie die anderen Autos
          const po = spiel.polizei;
          if (po && um.a.po && um.b.po) {
            for (let k = 0; k < po.idx.length; k++) {
              const f = fz[po.idx[k]], a0 = um.a.po[k], a1 = um.b.po[k];
              if (!f || !a0 || !a1) continue;
              this.anz.pose(k, f.vehicle, 'po');
              const rs = um.t > 0.5 ? a1[13] : a0[13];
              if (f.netRs !== rs) { f.netRs = rs; spiel._vorherAngleichen(f); }
              f.bremst = !!(a1[6] & 1);
            }
          }
        }
      }
      // v28c: eigenes Auto (vorhergesagt = „jetzt“) nicht optisch in die angezeigten anderen Autos (≈ 0,1 s + Ping hinter dem Server) schieben –
      // nur die Anzeige wird getrennt (NetzVorhersage.trennen), Vorhersage und Server bleiben unberührt. Teilnehmer nur bei Rempeln, Verkehrswagen immer
      // (der Server stößt mit ihnen auch im Geister-Modus).
      if (!V.sonder && V.trennen) {
        const liste = this._trennListe || (this._trennListe = []);
        liste.length = 0;
        if (this.kollisionen === true) for (let i = 0; i < this.nT; i++) if (i !== this.du && fz[i]) liste.push(fz[i].vehicle);
        const vkw = spiel.verkehr;
        if (vkw && vkw.eintraege) for (let k = 0; k < vkw.idx.length; k++) if (vkw.eintraege[k].aktiv && fz[vkw.idx[k]]) liste.push(fz[vkw.idx[k]].vehicle);
        // v28c Gegenlesen: Streifenwagen (Server stößt mit ihnen beim Rempeln) ebenfalls trennen
        const pol = spiel.polizei;
        if (this.kollisionen === true && pol && pol.idx) for (const i of pol.idx) if (i !== this.du && fz[i] && liste.indexOf(fz[i].vehicle) < 0) liste.push(fz[i].vehicle);
        V.trennen(mein.vehicle, liste, dt);
      }
      // Anhaltung zwischen den Zuständen herunterzählen (HUD „Anhalten… N s")
      if (spiel.polizei) { const L = spiel.polizei.logik; for (let i = 0; i < this.nT; i++) { const a = L.autos[i]; if (a && a.stopp > 0) a.stopp = Math.max(0, a.stopp - dt); } }
      // Streckenindex/Nähe (Kamera-Höhe, Scheinwerfer im Tunnel)
      for (let i = 0; i < fz.length; i++) {
        const f = fz[i];
        // v26c: GEPARKTE Verkehrswagen (Krankenwagen/Geisterfahrer/Abschleppwagen warten bei x = 100000 + 60·n, z = 100000) NICHT abfragen: ohne gültigen Index
        // suchte naechster() global über ein riesiges Raster (~4000 Ringe × Umfang, je Wagen, je Physikschritt) → Sekunden bis Minuten Stillstand
        // („Seite reagiert nicht“), vor allem online mit Verkehr „viel“. Wie offline (Verkehr._parken): nah = null, index = −1.
        if (f.verkehr && !f.verkehr.aktiv) { f.nah = null; f.index = -1; continue; }
        const n = st.spline.naechster(f.vehicle.x, f.vehicle.z, f.index >= 0 ? f.index : undefined);
        if (i !== this.du || V.sonder) f.index = n.index;
        f.nah = n;
      }
      // --- Rennuhr zwischen den Zuständen weiterlaufen lassen ---
      if (r.zustand === 'laeuft') r.zeit += dt;
      else if (r.zustand === 'countdown') r.countdown = Math.max(0, r.countdown - dt);
      // --- Optik: Bälle/Dinos/Strohballen und Pylonen wie beim Server (eigene Rechnung, nur Anzeige) ---
      this._weltOptik(anzTick === null ? tick : anzTick + N.INTERP_VERZUG / DT, dt);       // v23: Dynamik im Takt der Anzeige (Ziel unten: tick − 0,1 s)
      // Ping-Anzeige (2× je Sekunde)
      this._pingZeit -= dt;
      if (this._pingZeit <= 0 && this.pingEl && this.verb) {
        this._pingZeit = 0.5;
        const p = this.verb.ping;
        const text = '🌐 ' + (p === null ? '…' : Math.round(p)) + ' ms';
        if (this.pingEl._t !== text) { this.pingEl._t = text; this.pingEl.textContent = text; }
      }
    }

    // ---------- v23 (e): verdecktes / im Hintergrund laufendes Fenster ----------
    // Chrome hält requestAnimationFrame an, sobald das Fenster verdeckt ist (macOS-Okklusion, anderer Tab, minimiert) und drosselt Timer des Fensters auf
    // ca. 1 Hz. Die Eingaben werden aber im Physikschritt gesendet, der an requestAnimationFrame hängt → der Server bekäme keine Eingaben mehr (nach 0,3 s: Gas
    // aus; beim Zurückkehren ein Burst). Ein Worker-Takt (Worker-Timer werden nicht gedrosselt) schickt dann im 60-Hz-Takt weiter NEUTRALE Eingaben (das
    // Auto rollt gleichmäßig aus, wie es der Server ohnehin täte), und beim Zurückkehren erscheint ein Hinweis. Läuft requestAnimationFrame normal, tut der Takt nichts.
    _wachpostenAn() {
      if (this._wpWorker || typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
      try {
        const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},16)'], { type: 'text/javascript' }));
        this._wpWorker = new Worker(url);
        URL.revokeObjectURL(url);
        this._wpWorker.onmessage = () => this._hintergrundTakt();
      } catch (e) { this._wpWorker = null; }       // ohne Worker (file://, Sandbox): wie bisher
    }
    _wachpostenAus() {
      if (this._wpWorker) { try { this._wpWorker.terminate(); } catch (e) { /* egal */ } this._wpWorker = null; }
      this._hintergrund = false;
    }
    _hintergrundTakt() {
      if (this.phase !== 'rennen' || !this.empfangen || !this.verb || !this.vorhersage) return;
      const jetzt = performance.now();
      if (jetzt - this._bildZeit < (document.hidden ? 120 : 1500)) return;       // Bilder laufen normal (verdecktes Fenster: sofort einspringen; sichtbar: nur bei > 1,5 s Stillstand)
      const N = R.Netz, DT = R.config.physik.schritt, r = this.spiel.rennen, meinT = r.teilnehmer[this.du];
      if (!this._hintergrund) { this._hintergrund = true; this._versteckt = jetzt; }
      const anzahl = this.takt.anzahl(jetzt / 1000, DT, this.n);
      for (let k = 0; k < anzahl; k++) {
        const sd = N.eingabeDekodieren(N.eingabeKodieren({ gas: 0, bremse: 0, lenkung: 0 }));
        this._letzteS = sd;
        this.n++;
        const msg = { t: 'eingabe', n: this.n, g: 0, b: 0, l: 0 };
        if (this.itemFlag) msg.i = 1;
        if (this.resetFlag) msg.r = 1;
        this.itemFlag = this.resetFlag = false;
        this.verb.senden(msg);
        this.vorhersage.schritt(this.n, sd, { countdown: r.zustand === 'countdown', imZiel: meinT.imZiel });
      }
    }
    /** Erstes Bild nach dem Hintergrund: Posen angleichen, Hinweis zeigen. */
    _zurueck(jetzt) {
      this._hintergrund = false;
      for (const f of this.spiel.fahrzeuge) this.spiel._vorherAngleichen(f);
      if (this.anz) this.anz.neu();
      if (jetzt - this._versteckt > 1000) { const hd = this.spiel.huds[0]; if (hd) hd.meldung('💤 Dieses Fenster war im Hintergrund – das Auto ist ausgerollt', 3000); }
    }

    /** Looping-Pose aus dem Server-Zustand (anzeigePose in main.js zeichnet dann den Kreis). */
    _looping(f, lp) {
      if (!f.looping) return;
      const L = lp && this.spiel.strecke.loopings[lp[0]];
      if (L) {
        const alt = f.looping.aktiv && f.looping.looping === L ? f.looping.winkel : lp[1];
        f.looping.aktiv = true; f.looping.fallen = false; f.looping.looping = L;
        f.looping.winkelVorher = alt; f.looping.winkel = lp[1]; f.looping.qEin = lp[2];
        f.vehicle.imLooping = true;
      } else if (f.looping.aktiv) { f.looping.aktiv = false; f.vehicle.imLooping = false; }
    }
    _flags(f, a) {
      const fl = a[6];
      f.bremst = !!(fl & 1);
      if (f.flug) { f.flug.aktiv = !!(fl & 32); f.flug.nicken = f.flug.nickenVorher = 0; }
      f.vehicle.imFlug = !!(fl & 32);
    }

    /** Dynamik (Bälle, Strohballen, Dinos …) im Takt des Servers rechnen, Pylonen umfahren lassen – nur Anzeige. */
    _weltOptik(tick, dt) {
      const spiel = this.spiel, r = spiel.rennen, fz = spiel.fahrzeuge, st = spiel.strecke;
      for (let i = 0; i < this.nT; i++) {
        const v = fz[i].vehicle, s = fz[i].schatten;
        s.x = v.x; s.z = v.z; s.y = v.y; s.heading = v.heading; s.vLaengs = v.vLaengs; s.vQuer = 0; s.imLooping = !!v.imLooping; s.imFlug = !!v.imFlug;
        s.huepfer = 0;
      }
      try { R.Kollisionen.hindernisse(this.schattenListe, st, { dt, zeit: spiel._physikZeit, countdown: r.zustand === 'countdown' }); } catch (e) { /* nur Optik */ }
      const d = spiel.dynamik;
      if (!d || tick === null || this.startTick === null) return;
      const ziel = Math.floor(tick - N.INTERP_VERZUG / R.config.physik.schritt) - this.startTick;
      let n = 0;
      const autos = this._dynAutos || (this._dynAutos = []);
      while (this.dynTick < ziel && n < 6) {
        let fuehrend = null;
        autos.length = this.nT;
        for (let i = 0; i < this.nT; i++) {
          const t = r.teilnehmer[i];
          autos[i] = { vehicle: fz[i].schatten, istSpieler: !!t.istSpieler, fortschritt: t.fortschritt };
          if (t.istSpieler && (fuehrend === null || t.fortschritt > fuehrend)) fuehrend = t.fortschritt;
        }
        const e = d.schritt(R.config.physik.schritt, { fortschritt: fuehrend === null ? 0 : fuehrend, runden: r.runden, autos });
        if (e && e.ereignisse && e.ereignisse.length) {
          const m = spiel._meldung; spiel._meldung = () => {};       // Meldungen schickt der Server
          try { spiel._dinoEreignisse(e.ereignisse); } finally { spiel._meldung = m; }
        }
        try { d.kollisionen(this.schattenListe); } catch (err) { /* nur Optik */ }
        this.dynTick++; n++;
      }
      if (ziel - this.dynTick > 60) this.dynTick = ziel;   // weit zurück (Tab im Hintergrund): springen
    }
  }

  /** Letzte Steuerung für Motorton/Bremslicht des eigenen Wagens. */
  function v_letzte(v, s) { v.letzteSteuerung = s; }

  R.Online = { verfuegbar, Bildschirm: OnlineBildschirm };
  try { stilEinfuegen(); } catch (e) { /* ohne DOM (Node-Tests) */ }

  // Link mit ?raum=ABCD: nach dem Start direkt in die Code-Eingabe (vorausgefüllt)
  window.addEventListener('load', () => {
    try {
      const code = new URLSearchParams(window.location.search).get('raum');
      if (code && verfuegbar() && R.spiel && R.spiel.menue && R.spiel.menue.onlineOeffnen) R.spiel.menue.onlineOeffnen({ code });
    } catch (e) { /* ohne Parameter */ }
  });
})();
