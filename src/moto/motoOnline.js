// ============================================================
// Motorrad M4: online spielen über den Spielserver – Client-Teil. Läuft ZULETZT (nach motoM3Start.js), nur mit window.MOTORRAD === true.
// Keine bestehende Datei ändert ihr Verhalten ohne diese: src/net/online.js ruft R.Moto.online.* nur auf, wenn es existiert (Autorennen.html lädt dieses Skript nicht).
//
//   Menü             „Online“-Karte wieder da (motoStart.js hatte sie bis M3 abgeschaltet); Taste O im Modus-Schritt öffnet den Online-Bildschirm.
//   Raum             Nachrichten bekommen `moto: true` (Motorrad-Räume sind von Auto-Räumen getrennt); der Server muss es im hallo melden (`moto: true`).
//   Lobby            Zeilen „Unfälle“ (aus/sanft/echt) und „Stuntrennen“ statt Polizei/Verkehr; Einladungslink → Motorrad.html?raum=…
//   Rennen           zustand.mo / ich.mu / Ereignisse stunt, sturz → Schattenzustand (spiel.stunt, spiel.unfall), den die vorhandenen Bild-Umhüllungen
//                    (stuntStart.js, unfallStart.js, schraeglage.js, motoM3Start.js) zeichnen: Pose, Punkte, Combo, Prozente, Qualm, Helfer-Fahrzeuge, Stationen.
//                    Die Vorhersage rechnet mit denselben Unfall-Faktoren wie der Server (vp._motoU aus ich.mu → Vehicle.schritt-Umhüllung in unfallStart.js).
//   Eingabe          Trick-Taste als Bit `k` in jeder eingabe-Nachricht (gehalten oder angetippt).
//   Ergebnis         Spalte „Stunt“ (beim Stuntrennen Platz- + Stuntpunkte, Rang), Meldung der Stuntpunkte an die Portal-Bestenliste.
//   Server-Adresse   window.MOTORRAD_SERVER (z. B. 'mac-mini.tailnet.ts.net' oder 'wss://…'), wenn Motorrad.html NICHT vom Spielserver kommt (Portal, Port 10002).
//   Bestenliste      R.Moto.bestenliste.melden(eintrag): POST {window.MOTORRAD_PORTAL}/api/bestenliste {spiel:'motorrad', modus, name, punkte} (Beschreibung: server/README.md, „Motorrad M4“).
// Abschalten: window.MOTORRAD_ONLINE = false (vor dem Laden) → alles wie in M3 (nur offline).
// ============================================================
(function () {
  if (window.MOTORRAD !== true || window.MOTORRAD_ONLINE === false) return;
  const R = window.Rennspiel;
  if (!R || !R.Moto || !R.Online || !R.Online.Bildschirm || !R.Netz || !R.NetzVerbindung || !R.Menue || !R.Moto.onlineOrig) return;
  const M = R.Moto, SL = M.schraeglage, St = M.stunts, U = M.unfall, W = M.unfallWelt, H = M.stuntHud;
  if (!SL || !St || !U || !W || !H || !M.stuntStart || !M.unfallStart) return;
  const CFG = () => R.config.motoStunts;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const MODI = ['aus', 'sanft', 'echt'];
  const modusGueltig = (m) => (MODI.indexOf(m) >= 0 ? m : null);
  const zahl = (n) => (H.zahl ? H.zahl(n) : String(Math.round(n)));
  const winkelDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // ================================================================ Server-Adresse (Portal-Seite ≠ Spielserver)
  // Erlaubt: host[:port] oder ws(s)://host[:port] – nur Buchstaben, Ziffern, Punkt, Minus (keine Pfade, keine Zugangsdaten). Wird vom Betreiber in Motorrad.html gesetzt, NICHT aus der Adresszeile
  // gelesen (ein Link darf Kinder nicht auf einen fremden Server schicken).
  // Standard für das Spieleportal: Motorrad.html unter Port 10002 (portal_server.py) → Spielserver am selben Rechner auf Port 10000 (wie die Autorennen-Karte im Portal),
  // mit dem Protokoll der Seite (https → wss). Ist window.MOTORRAD_SERVER gesetzt, gilt das; kommt die Seite vom Spielserver selbst (/Motorrad.html), bleibt alles wie es ist (gleiche Adresse).
  function serverUrlSetzen() {
    let roh = typeof window.MOTORRAD_SERVER === 'string' ? window.MOTORRAD_SERVER.trim() : '';
    const l = window.location;
    if (!roh && l && l.port === '10002' && l.hostname) roh = l.hostname + ':10000';
    if (!roh) return null;
    const m = /^(wss?:\/\/)?([A-Za-z0-9][A-Za-z0-9.\-]*(?::\d{1,5})?)\/?$/.exec(roh);
    if (!m) { console.error('MOTORRAD_SERVER ungültig:', roh); return null; }
    const proto = m[1] || (window.location && window.location.protocol === 'https:' ? 'wss://' : 'ws://');
    const url = proto + m[2] + R.Netz.PFAD;
    R.NetzVerbindung.url = () => url;
    return url;
  }
  const serverUrl = serverUrlSetzen();

  // ================================================================ Menü: Online-Karte wieder da
  const o = M.onlineOrig;
  M.onlineAn = true;
  if (o.verfuegbar) R.Online.verfuegbar = o.verfuegbar;
  const MP = R.Menue.prototype;
  if (o.onlineOeffnen) MP.onlineOeffnen = o.onlineOeffnen;
  if (o.htmlOnlineKarte) {
    MP.htmlOnlineKarte = function () {       // der Text steht zweimal in der Karte (title="…" und sichtbar): zuerst das Attribut (ohne <kbd>), dann den sichtbaren Text
      return o.htmlOnlineKarte.apply(this, arguments).split('title="Mit Freunden übers Internet: Raum + Code"').join('title="Mit Freunden: Motorrad-Raum + Code (Taste O)"')
        .split('Mit Freunden übers Internet: Raum + Code').join('Mit Freunden: Motorrad-Raum + Code <kbd>O</kbd>');
    };
  }
  const tasteAlt = MP.taste;
  MP.taste = function (code) {
    const frei = !(this.onlineUi && this.onlineUi.sichtbar) && !(this.garageUi && this.garageUi.sichtbar);
    if (code === 'KeyO' && frei && this.schritt === 0 && R.Online.verfuegbar()) { this.onlineGewaehlt = true; this.onlineOeffnen(); return true; }       // Taste O = Online (nur im Modus-Schritt; in „Strecke“ gehört O den Hindernissen)
    return tasteAlt.apply(this, arguments);
  };

  // ================================================================ Texte: Auto → Motorrad (nur Anzeige im Online-Bildschirm)
  function texteErsetzen(wurzel) {
    if (!wurzel || typeof document === 'undefined') return;
    const w = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT, null);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const alt = n.nodeValue;
      if (!/Auto|🚗|🏎/.test(alt)) continue;
      const neu = alt.replace(/\bAutos\b/g, 'Motorräder').replace(/\bAuto\b/g, 'Motorrad').replace(/🚗/g, '🏍️').replace(/🏎️?/g, '🏍️');
      if (neu !== alt) n.nodeValue = neu;
    }
  }
  const B = R.Online.Bildschirm.prototype;
  const zeichnenAlt = B.zeichnen;
  B.zeichnen = function () { const r = zeichnenAlt.apply(this, arguments); try { texteErsetzen(this.wurzel); } catch (e) { /* nur Optik */ } return r; };

  // ================================================================ Bestenliste (Portal)
  // Schnittstelle zum Portal (liegt nicht in diesem Repo; portal_server.py, Port 10002): POST <MOTORRAD_PORTAL>/api/bestenliste, JSON
  //   { spiel: 'motorrad', modus: 'stunt-online' | 'stuntrennen-online', name, punkte }          (wie Snake/Tetris/Air-Hockey: ganze Punkte, größer = besser)
  // Der Portal-Server muss dafür nur BESTEN_SPIELE um "motorrad": {"stunt-online", "stuntrennen-online"} ergänzen (Beschreibung: server/README.md, „Motorrad M4“).
  // window.MOTORRAD_BESTENLISTE(eintrag) ersetzt den POST (z. B. iframe-postMessage ans Portal); der Eintrag enthält dann zusätzlich platz/strecke/zeit/raum.
  // Nicht gesendete Meldungen (Portal nicht erreichbar, 5xx) merkt sich der Browser (max. 20) und holt sie beim nächsten Start nach; eine Ablehnung (4xx, z. B. Portal kennt
  // „motorrad“ noch nicht) wird verworfen, nicht ewig wiederholt. Der Server rechnet die Punkte; dieser Client meldet sie nur weiter.
  const SCHLUESSEL = 'motorrad.bestenliste.offen';
  const BL_MODI = ['stunt-online', 'stuntrennen-online'];
  function warteschlange() { try { const l = JSON.parse(window.localStorage.getItem(SCHLUESSEL) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function warteschlangeSchreiben(l) { try { window.localStorage.setItem(SCHLUESSEL, JSON.stringify(l.slice(-20))); } catch (e) { /* egal */ } }
  function eintragPruefen(e) {
    if (!e || typeof e.name !== 'string' || !e.name || e.name.length > 40) return null;
    const p = Math.floor(+e.punkte);
    if (!(p > 0) || p > 10000000) return null;
    return { spiel: 'motorrad', modus: BL_MODI.indexOf(e.modus) >= 0 ? e.modus : 'stunt-online', name: e.name, punkte: p, platz: Math.max(0, Math.min(99, Math.floor(+e.platz) || 0)),
      strecke: String(e.strecke || '').slice(0, 40), zeit: typeof e.zeit === 'number' && isFinite(e.zeit) ? Math.round(e.zeit * 100) / 100 : null, raum: String(e.raum || '').slice(0, 8) };
  }
  /** Antwort: 'ok' | 'dauerhaft' (vom Portal abgelehnt) | 'spaeter' (nicht erreichbar, nochmal versuchen). */
  function senden(eintrag) {
    if (typeof window.MOTORRAD_BESTENLISTE === 'function') { try { return Promise.resolve(window.MOTORRAD_BESTENLISTE(eintrag)).then((ok) => (ok === false ? 'spaeter' : 'ok'), () => 'spaeter'); } catch (e) { return Promise.resolve('spaeter'); } }
    if (typeof fetch !== 'function') return Promise.resolve('spaeter');
    const basis = typeof window.MOTORRAD_PORTAL === 'string' ? window.MOTORRAD_PORTAL.replace(/\/+$/, '') : '';
    const body = JSON.stringify({ spiel: eintrag.spiel, modus: eintrag.modus, name: eintrag.name, punkte: eintrag.punkte });
    return fetch(basis + '/api/bestenliste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .then((r) => (r && r.ok ? 'ok' : (r && r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429 ? 'dauerhaft' : 'spaeter')), () => 'spaeter');
  }
  function nachholen() {
    const l = warteschlange();
    if (!l.length) return;
    warteschlangeSchreiben([]);
    l.forEach((e) => { senden(e).then((a) => { if (a === 'spaeter') warteschlangeSchreiben(warteschlange().concat([e])); }); });
  }
  function melden(roh) {
    const e = eintragPruefen(roh);
    if (!e) return Promise.resolve(false);
    return senden(e).then((a) => { if (a === 'spaeter') warteschlangeSchreiben(warteschlange().concat([e])); else if (a === 'ok') nachholen(); else console.warn('Bestenliste: vom Portal abgelehnt (Spiel/Modus dort eingetragen?)'); return a === 'ok'; });
  }
  M.bestenliste = { melden, eintragPruefen, warteschlange, nachholen, senden, MODI: BL_MODI };
  try { window.addEventListener('load', () => setTimeout(nachholen, 3000)); } catch (e) { /* ohne Fenster */ }

  // ================================================================ Trick-Taste online
  let tippLauscher = false;
  function tippLauschen() {
    if (tippLauscher || typeof window === 'undefined' || !window.addEventListener) return;
    tippLauscher = true;
    window.addEventListener('keydown', (e) => { if (!e.repeat && e.code === CFG().taste[0] && R.spiel && R.spiel.zustand === 'online') M.stuntStart.tippZaehlen(e.code); }, true);
  }

  // ================================================================ Schatten-Zustand (Anzeige) aus dem Server-Zustand
  function szeneAus(spiel, u) {
    const sz = u.szene;
    if (!sz) return;
    try {
      if (sz.helfer && sz.helfer.mesh) { if (sz.helfer.art === 'abschlepp') W.freigeben(sz.helfer.mesh); else if (sz.helfer.mesh.parent) sz.helfer.mesh.parent.remove(sz.helfer.mesh); }
      if (sz.figur) W.freigeben(sz.figur);
    } catch (e) { /* aufräumen darf nie stören */ }
    u.szene = null;
  }
  function szeneSpiegeln(spiel, u, a) {
    if (!Array.isArray(a)) { if (u.szene) szeneAus(spiel, u); return; }
    const art = a[0] === 0 ? 'abschlepp' : 'krankenwagen';
    let sz = u.szene;
    if (sz && sz.art !== art) { szeneAus(spiel, u); sz = null; }
    if (!sz) sz = u.szene = { art, was: art === 'abschlepp' ? 'motorrad' : 'fahrer', phase: 'warten', warte: 0, t: 0, frei: false, tFrei: 0, plan: null, pflege: 0, helfer: null, figur: null, sB: 0, qB: 0, qH: 0, sStop: 0, zeit: 0, dir: 1 };
    sz.phase = a[1] === 1 ? 'lauf' : 'warten';
    if (Math.abs(sz.t - a[2]) > 0.25 || sz.phase === 'warten') sz.t = a[2];       // sonst läuft die Zeit zwischen den Zuständen lokal weiter (weich)
    sz.sB = a[3]; sz.qB = a[4]; sz.qH = a[5]; sz.dir = a[6]; sz.pflege = a[7]; sz.frei = a[8] === 1; sz.tFrei = a[9];
    if (sz.phase === 'lauf' && !sz.helfer) {
      const c = R.config.motoUnfall.szene;
      sz.plan = U.szenePlan(sz.pflege);
      sz.helfer = W.helferBauen(art);
      sz.sStop = sz.helfer ? sz.sB + 1.3 + c.fahrzeugLuecke + sz.helfer.laenge / 2 : sz.sB + 6;
      if (sz.helfer && spiel.szene) spiel.szene.add(sz.helfer.mesh);
    }
  }

  /** Vor jedem Bild (vor den Bild-Umhüllungen von Stunt/Unfall): Pose weich auf den Server-Wert, Szenenzeit weiterzählen. */
  function bildVor(spiel, dt) {
    const ui = spiel.online, K = ui && ui._mo;
    if (!K || ui.phase !== 'rennen' || !spiel.stunt) return;
    const k = 1 - Math.exp(-Math.max(0, dt || 0) / 0.05);
    for (let i = 0; i < K.nT; i++) {
      const z = spiel.stunt.fz[i];
      if (!z || !z.ziel) continue;
      const p = z.pose, t = z.ziel;
      p.gier += winkelDiff(t.gier, p.gier) * k; p.salto += winkelDiff(t.salto, p.salto) * k;
      p.hoehe += (t.hoehe - p.hoehe) * k; p.nick += (t.nick - p.nick) * k;
      z.jetzt += dt || 0;
      const u = spiel.unfall && spiel.unfall.fz[i];
      if (u && u.szene && u.szene.phase === 'lauf') u.szene.t += dt || 0;
    }
  }
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) { try { bildVor(spiel, dt); } catch (e) { console.error('Motorrad online (Bild):', e); } return frame.apply(this, arguments); };
  }

  // ================================================================ Hooks für src/net/online.js
  function verbindung(ui, v) {
    ui.serverMoto = null;
    ui._halloP = new Promise((ok) => { v.bei('hallo', (m) => { ui.serverMoto = m.moto === true; ok(); }); setTimeout(ok, 3000); });
  }
  /** Kann der Server Motorrad-Räume? (hallo.moto; ein alter Server schweigt dazu → nein, sonst landete der Gast in einem Auto-Raum.) */
  async function serverKannMotorrad(ui) {
    if (ui.serverMoto === null && ui._halloP) await ui._halloP;
    return ui.serverMoto === true;
  }
  /** Einladungslink: basis = Adresse laut Autorennen-Regel (…/ der eigenen Herkunft oder die öffentliche https-Adresse des Spielservers). Eigene Herkunft → genau diese Seite (auch im Portal
   *  unter /motorrad/), öffentliche Spielserver-Adresse → deren /Motorrad.html (der Spielserver liefert sie bei eingeschaltetem Motorrad-Schalter aus). */
  function einladung(basis, code) {
    const l = window.location;
    if (l && basis === l.origin + '/') return l.origin + (l.pathname || '/') + '?raum=' + code;
    return basis + 'Motorrad.html?raum=' + code;
  }
  function nachrichtAnpassen(msg, e) {
    msg.moto = true;
    if (msg.t !== 'raumErstellen' || !msg.einstellungen) return;
    const ein = msg.einstellungen;
    let unfall = null;
    try { unfall = M.unfallStart.modusLesen(); } catch (err) { unfall = null; }
    ein.unfall = modusGueltig(e && e.unfall) || modusGueltig(unfall) || 'sanft';
    ein.stuntrennen = !!(e && e.stuntrennen);
    ein.polizei = false; ein.geisterfahrer = false; ein.krankenwagen = false; ein.abschleppwagen = false; ein.nurRennautos = false; ein.verkehr = 'aus';
  }
  function zeilen(ui, z) {
    const i = z.indexOf('polizei');
    if (i >= 0) z.splice(i, 1, 'unfall', 'stuntrennen');
    return z;
  }
  function werte(ui, zeile, e) {
    if (zeile === 'unfall') return { wert: modusGueltig(e.unfall) || 'sanft', liste: [{ k: 'aus', text: 'Aus' }, { k: 'sanft', text: 'Sanft' }, { k: 'echt', text: 'Echt' }] };
    if (zeile === 'stuntrennen') return { wert: e.stuntrennen === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '⭐ An' }] };
    return null;
  }
  function wertSetzen(ui, zeile, k) {
    if (zeile === 'unfall') {
      if (!modusGueltig(k)) return true;
      try { M.unfallStart.modusSchreiben(k); } catch (e) { /* egal */ }
      ui.verb.senden({ t: 'einstellungen', einstellungen: { unfall: k } });
      return true;
    }
    if (zeile === 'stuntrennen') {
      const lok = ui.basis || ui.spiel.einstellungen;
      lok.stuntrennen = k === 'an';
      if (!ui.basis) ui.spiel.einstellungenSpeichern();
      ui.verb.senden({ t: 'einstellungen', einstellungen: { stuntrennen: k === 'an' } });
      return true;
    }
    return false;
  }
  function lobbyHost(ui, zeile, e) {
    return `<h3>⚙️ Rennen (du bist der Host)</h3>` + zeile('strecke', '🗺️ Strecke') + zeile('welt', '🌍 Welt') +
      (ui.variantenListe().length ? zeile('variante', '📏 Variante') : '') +
      zeile('hindernisMenge', ui.hindernisMengeAktiv() ? '🚧 Hindernisse' : '🚧 Hindernisse <small>(erst ab Welt „Hindernisse“)</small>') + zeile('runden', '🔁 Runden') +
      zeile('gegner', '🤖 Computer-Gegner') + zeile('schwierigkeit', '🎚️ Computer-Stärke') + zeile('tempoKlasse', '🏎️ Tempo') +
      zeile('jahreszeit', '🍂 Jahreszeit') + zeile('wetter', '🌦️ Wetter') + zeile('tageszeit', '🌗 Tageszeit') +
      zeile('unfall', '🤕 Unfälle') + zeile('stuntrennen', '⭐ Stuntrennen') + zeile('zufall', '🎲 Zufällige Strecke') +
      `<div class="on-fest">${e.kollisionen ? '💥 Rempeln an' : '👻 Geister: Motorräder fahren durcheinander durch'} · kein Chat</div>`;
  }
  function lobbyGast(ui, e, daten) {
    const c = R.config, wi = (R.weltInfo || {})[e.welt || daten.weltStandard] || {}, S = c.schwierigkeiten[e.schwierigkeit] || {};
    const J = (c.jahreszeiten || {})[e.jahreszeit], Wt = (c.wetter || {})[e.wetter], T = { tag: '☀️ Tag', daemmerung: '🌇 Dämmerung', nacht: '🌙 Nacht' };
    const un = { aus: 'aus', sanft: 'sanft', echt: 'echt' }[e.unfall] || 'sanft';
    return `<h3>⚙️ Rennen (stellt der Host ein)</h3><div class="on-zusammen">` +
      `🗺️ ${esc(daten.name)} · ${wi.emoji || '🌍'} ${esc(wi.name || e.welt || '')}${e.variante ? ' · 📏 XL' : ''}<br>` +
      `🔁 ${e.runden} Runden · 🤖 ${e.gegner} Computer (${esc(S.name || e.schwierigkeit)})<br>` +
      `🏎️ ${e.tempoKlasse === 'schnell' ? 'Schnell' : 'Normal'} · ${J ? J.emoji + ' ' + J.name : '🎲'} · ${Wt ? (Wt.emoji || '☀️') + ' ' + Wt.name : '🎲'} · ${T[e.tageszeit] || ''}<br>` +
      `🤕 Unfälle: ${un}${e.stuntrennen ? ' · ⭐ Stuntrennen' : ''}${e.zufall === true ? ' · 🎲 Zufällige Strecke' : ''} · ${e.kollisionen ? '💥 Rempeln an' : '👻 Geister'}</div>`;
  }

  /** Nach dem Aufbau des Online-Rennens (online.js rennenAufbauen): Schattenzustand, Stationen, HUD, Trick-Taste. */
  function aufbau(ui, m) {
    const spiel = ui.spiel, e = m.einstellungen, nT = m.teilnehmer.length, du = m.du, strecke = spiel.strecke;
    abbau(ui);
    const modus = modusGueltig(e.unfall) || 'sanft';
    const K = ui._mo = { nT, du, modus, tippGesehen: 0, strecke: strecke.id, raum: ui.raumCode || '' };
    const saat = 'moto|' + strecke.id + '|' + strecke.variante;
    spiel.einstellungen.unfall = modus; spiel.einstellungen.stuntrennen = e.stuntrennen === true;
    const sz = spiel.stunt = { stuntrennen: e.stuntrennen === true, zeit: 0, saat, fz: [], alle: [] };
    const un = spiel.unfall = { modus, saat, zeit: 0, fz: [] };
    for (let i = 0; i < nT; i++) {
      const f = spiel.fahrzeuge[i];
      f.motoZ = SL.zustand();
      const z = St.zNeu();
      z.ziel = { gier: 0, salto: 0, hoehe: 0, nick: 0 };
      sz.fz[i] = z;
      const u = U.zNeu(modus);
      u.purzelGesehen = 0; u.inSt = { werkstatt: false, kranken: false }; u.halteBremse = false; u.gasEingabe = 0; u.kiPflege = null; u.qualm = null; u.halt = null; u.szene = null;
      un.fz[i] = u;
    }
    // Vorhersage: derselbe Unfall-Zustand wie beim Server (Höchsttempo/Beschleunigung, Haltebremse) über die Vehicle.schritt-Umhüllung aus unfallStart.js
    if (ui.vorhersage && ui.vorhersage.vp) ui.vorhersage.vp._motoU = un.fz[du];
    // Werkstatt + Krankenstation (nur Optik; der Server rechnet Halt und Pflege). Gleiche Strecke → gleiche Plätze wie beim Server.
    try {
      const s = W.stationenBauen(strecke, spiel.szene);
      if (s) { spiel.szene.add(s.gruppe); spiel.motoStationen = s; }
    } catch (err) { console.error('Motorrad online (Stationen):', err); }
    try { H.anlegen(spiel); } catch (err) { console.error('Motorrad online (HUD):', err); }
    // Trick-Taste
    const code = CFG().taste[0];
    if (spiel.input && spiel.input.spielTasten) CFG().taste.forEach((c) => spiel.input.spielTasten.add(c));
    tippLauschen();
    K.tippGesehen = M.stuntStart.TIPP[code] || 0;
    try { M.stuntStart.touchKnopf(spiel); } catch (err) { /* ohne Touch */ }
  }
  function abbau(ui) {
    const spiel = ui.spiel;
    if (spiel.unfall && spiel.unfall.fz) spiel.unfall.fz.forEach((u) => { if (!u) return; try { if (u.stFigur) { W.freigeben(u.stFigur); u.stFigur = null; } if (u.qualm && u.qualm.parent) u.qualm.parent.remove(u.qualm); szeneAus(spiel, u); } catch (e) { /* egal */ } });
    if (spiel.motoStationen) { try { spiel.motoStationen.stub.zerstoeren(); } catch (e) { /* schon weg */ } try { if (spiel.motoStationen.gruppe && spiel.motoStationen.gruppe.parent) spiel.motoStationen.gruppe.parent.remove(spiel.motoStationen.gruppe); } catch (e) { /* egal */ } spiel.motoStationen = null; }
    spiel.stunt = null; spiel.unfall = null;
    ui._mo = null;
  }

  /** Eingabe: Trick-Taste gehalten oder seit der letzten Nachricht angetippt → Bit k. */
  function eingabe(ui, msg) {
    const K = ui._mo, inp = ui.spiel.input;
    if (!K || !inp) return;
    const code = CFG().taste[0];
    let k = !!(inp.istGedrueckt && inp.istGedrueckt(code));
    const n = M.stuntStart.TIPP[code] || 0;
    if (n > K.tippGesehen) { K.tippGesehen = n; k = true; }
    if (k) msg.k = 1;
  }

  /** zustand.mo (alle Teilnehmer) und ich.mu (eigener Wagen, ungerundet) in den Schattenzustand übernehmen. */
  function zustand(ui, z) {
    const K = ui._mo, spiel = ui.spiel;
    if (!K || !z.mo || !spiel.stunt || !spiel.unfall) return;
    const F = R.config.motoStunts.combo.fenster;
    for (let i = 0; i < K.nT && i < z.mo.length; i++) {
      const a = z.mo[i], zs = spiel.stunt.fz[i], u = spiel.unfall.fz[i];
      if (!a || !zs || !u) continue;
      const fl = a[6];
      zs.punkte = a[1]; zs.jetzt = 0; zs.combo.zaehler = a[2] > 0 ? a[2] : 0; zs.combo.letzter = a[3] - F;       // comboRest: Rest = letzter + Fenster − jetzt = a[3]
      zs.wheelie.aktiv = !!(fl & 16); zs.stoppie.aktiv = !!(fl & 32); zs.wheelie.meter = zs.wheelie.aktiv ? a[11] : 0; zs.stoppie.meter = zs.stoppie.aktiv ? a[11] : 0;
      zs.luft = !!(fl & 128); zs.trick = (fl & 64) ? (zs.trick || { art: 'trick', t: 0, dauer: 1 }) : null;
      zs.ziel.gier = a[7]; zs.ziel.salto = a[8]; zs.ziel.hoehe = a[9]; zs.ziel.nick = a[10];
      u.zustand = a[4]; u.gesundheit = a[5];
      if (fl & 2) {
        const art = (fl & 256) ? 'kranken' : 'werkstatt';
        if (!u.halt || u.halt.art !== art) u.halt = { art, t: 0, steht: false };
        u.halt.steht = !!(fl & 4);
      } else u.halt = null;
      szeneSpiegeln(spiel, u, (fl & 8) ? a[12] : null);
      u.kiPflege = null;
    }
    const u = spiel.unfall.fz[K.du], mu = z.ich && z.ich.mu;
    if (u && Array.isArray(mu)) { u.zustand = mu[0]; u.gesundheit = mu[1]; u.halteBremse = mu[2] === 1; }
    else if (u) u.halteBremse = false;
  }

  /** Ereignisse stunt / sturz. (unfall-Meldungen kommen als normale `meldung`-Ereignisse beim Betroffenen an.) */
  function ereignis(ui, m) {
    const K = ui._mo, spiel = ui.spiel;
    if (!K) return;
    if (m.art === 'stunt' && m.nr === K.du) {
      H.ereignis(spiel, K.du, { art: m.st, name: m.name, punkte: m.p, mult: m.m, meter: m.x, n: m.x });
    } else if (m.art === 'sturz') {
      const f = spiel.fahrzeuge[m.nr];
      if (f && f.motoZ && !(f.mesh && f.mesh.userData && f.mesh.userData.kippt === false)) {
        const p = f.motoZ.purzel; p.aktiv = false; p.t = 0; p.abkling = 0; SL.purzelStart(f.motoZ);       // der Server hat den Sturz entschieden: hier nur noch zeigen
      }
      if (m.nr === K.du && R.Audio && R.Audio.kollision) { try { R.Audio.kollision(5); } catch (e) { /* Ton egal */ } }
    }
  }

  /** Ergebnistafel: Spalte „Stunt“ (Stuntrennen: Platz- + Stuntpunkte und Rang) und Meldung an die Portal-Bestenliste. */
  function ergebnis(ui, m) {
    const K = ui._mo;
    if (!K || !Array.isArray(m.zeilen)) return;
    const kopf = ui.ergEl.querySelector('thead tr'), rumpf = ui.ergEl.querySelector('tbody');
    const eigene = m.zeilen.find((z) => z.nr === K.du);
    const katalog = R.carCatalog.waehlbare();
    if (m.stuntrennen === true && kopf && rumpf) {
      const w = St.stuntrennenWertung(m.zeilen.map((z) => ({ platz: z.platz, nr: z.nr, name: z.name, mensch: z.mensch, zeit: z.zeit, raus: !!z.weg, stunt: z.stunt || 0, autoId: z.autoId })));
      kopf.innerHTML = '<th>Rang</th><th>Name</th><th>Motorrad</th><th>Im Ziel</th><th>Platzpunkte</th><th>⭐ Stunt</th><th>Gesamt</th>';
      rumpf.innerHTML = w.map((z) => {
        const a = katalog.find((x) => x.id === z.autoId);
        const zeit = z.raus ? '🚪 weg' : z.zeit !== null && z.zeit !== undefined ? R.zeitText(z.zeit) : '<span class="noch">unterwegs</span>';
        return `<tr class="${z.nr === K.du ? 'spieler p1' : z.mensch ? 'spieler p2' : 'computer'}${z.rang === 1 ? ' gesamt-spitze' : ''}"><td class="platz">${z.rang}.</td>` +
          `<td class="name">${z.mensch ? R.fahrerEmoji(z.name) + ' ' : '🤖 '}${esc(z.name)}</td><td class="auto"><i style="background:${a ? HEX(a.farbe) : '#888'}"></i>${a ? esc(a.name) : ''}</td>` +
          `<td class="zeit">${z.platz}. · ${zeit}</td><td class="zeit">${zahl(z.platzPunkte)}</td><td class="zeit">⭐ ${zahl(z.stuntPunkte)}</td><td class="zeit"><b>${zahl(z.gesamt)}</b></td></tr>`;
      }).join('');
    } else if (kopf && rumpf && m.zeilen.some((z) => z.stunt > 0)) {
      const th = document.createElement('th'); th.textContent = '⭐ Stunt'; kopf.appendChild(th);
      Array.prototype.forEach.call(rumpf.querySelectorAll('tr'), (tr, i) => {
        const td = document.createElement('td'); td.className = 'zeit'; td.textContent = '⭐ ' + zahl((m.zeilen[i] && m.zeilen[i].stunt) || 0); tr.appendChild(td);
      });
    }
    try { texteErsetzen(ui.ergEl); } catch (e) { /* nur Optik */ }
    if (eigene && eigene.stunt > 0) {
      melden({ name: eigene.name, punkte: eigene.stunt, platz: eigene.platz, strecke: K.strecke, zeit: eigene.zeit, modus: m.stuntrennen === true ? 'stuntrennen-online' : 'stunt-online', raum: K.raum });
    }
  }

  M.online = { verbindung, serverKannMotorrad, einladung, nachrichtAnpassen, zeilen, werte, wertSetzen, lobbyHost, lobbyGast, aufbau, abbau, eingabe, zustand, ereignis, ergebnis, bildVor, texteErsetzen, serverUrl };
})();
