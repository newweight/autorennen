// ============================================================
// Gemeinsamer Rahmen der Brettspiele (Browser): Menü, Computer-Stufe, Online-Lobby (Raum erstellen/beitreten, Code, Link, QR),
// Spielfenster (Kopf, Status, Knöpfe, Ende-Tafel mit Revanche). Das Brett selbst kommt vom Spiel-Adapter (vier-ui.js / schach-ui.js).
//
//   BRETT.Rahmen.start({ id: 'vier'|'schach', adapter })
//
// Adapter-Schnittstelle (Objekt):
//   seiten:   [{ id:'w'|'b'|'z', text }]   Auswahl „Ich bin …“ (gegen Computer / beim Raum erstellen)
//   bauen(host, ctx)       Brett-DOM einmal bauen
//   neu(cfg)               neue Partie: cfg = { modus:'lokal'|'computer'|'online', stufe, ich:'w'|'b'|'z' (online: Rolle) }
//   stand(st)              (online) Server-Zustand anwenden
//   serverFehler(m)        (online) Fehlermeldung des Servers (z. B. unlegaler Zug)
//   rueckgaengig() / kannRueck()          nur offline
//   drehen()  (optional)   Brett drehen
//   taste(e)  (optional)   Tastatur
//   stop()                 laufende Berechnungen abbrechen
// ctx (vom Rahmen): { status(text, art), spieler([{ klasse, text, aktiv, weg }]), ende({ emoji, text }), senden(obj), aktionen() }
// ============================================================
(function () {
  const BRETT = window.BRETT = window.BRETT || {};
  const K = BRETT.K, T = K.TEXTE;
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privat */ } };
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function farbenSetzen() { for (const k of Object.keys(K.FARBEN)) document.documentElement.style.setProperty('--c-' + k, K.FARBEN[k]); }

  function start(cfg) {
    farbenSetzen();
    const id = cfg.id, A = cfg.adapter, TS = T[id];
    document.title = TS.emoji + ' ' + TS.titel;
    const app = document.getElementById('app');
    app.innerHTML = '';
    const S = { modus: null, stufe: +lesen('brett-stufe', 2) || 2, seite: lesen('brett-seite-' + id, 'z'), name: lesen('brett-name', K.NAMEN[Math.floor(Math.random() * K.NAMEN.length)].id),
      v: null, verb: 'zu', stand: null, runde: -1, endeInfo: null, startCfg: null, wartend: false };

    // ---------------------------------------------------------- Bildschirme
    const sMenue = h('div', 'bildschirm mitte'), sStufe = h('div', 'bildschirm mitte hidden'), sLobby = h('div', 'bildschirm mitte hidden'), sSpiel = h('div', 'bildschirm hidden');
    app.append(sMenue, sStufe, sLobby, sSpiel);
    const alle = { menue: sMenue, stufe: sStufe, lobby: sLobby, spiel: sSpiel };
    function zeige(n) { for (const k in alle) alle[k].classList.toggle('hidden', k !== n); S.schirm = n; window.scrollTo(0, 0); }

    // ---- Menü
    function menueZeichnen(hinweis) {
      sMenue.innerHTML =
        `<div class="kopfzeile"><a class="zurueck" href="../">◀ ${T.alleSpiele}</a><span></span></div>` +
        `<h1>${TS.emoji} ${esc(TS.titel)}</h1><p class="unter">${esc(TS.untertitel)}</p>` +
        `<div class="karten">` +
        `<button class="karte" data-a="lokal"><span class="em">👫</span><b>${T.zuZweit}</b><small>${T.zuZweitSub}</small></button>` +
        `<button class="karte" data-a="computer"><span class="em">🤖</span><b>${T.computer}</b><small>${T.computerSub}</small></button>` +
        `<button class="karte" data-a="online"><span class="em">🌐</span><b>${T.online}</b><small>${T.onlineSub}</small></button></div>` +
        `<p class="regeln">${esc(TS.regeln)}</p><div class="hinweis fehler" id="menue-hinweis">${hinweis ? esc(hinweis) : ''}</div>`;
    }

    // ---- Computer-Stufe
    function stufeZeichnen() {
      const seiten = A.seiten;
      sStufe.innerHTML =
        `<div class="kopfzeile"><button class="zurueck" data-a="menue">◀ ${T.zurueck}</button><span></span></div>` +
        `<h2>🤖 ${T.computer}</h2>` +
        `<div class="gruppe"><div class="etikett">Wie stark?</div><div class="chips">` +
        T.stufen.map(s => `<button class="chip${S.stufe === s.id ? ' an' : ''}" data-stufe="${s.id}">${s.emoji} ${s.text}</button>`).join('') + `</div></div>` +
        `<div class="gruppe"><div class="etikett">Ich spiele …</div><div class="chips">` +
        seiten.map(s => `<button class="chip${S.seite === s.id ? ' an' : ''}" data-seite="${s.id}">${s.text}</button>`).join('') + `</div></div>` +
        `<button class="knopf gelb gross" data-a="los">▶ Los geht's!</button>`;
    }

    // ---- Online
    const verbindungsText = () => S.verb === 'verbunden' ? '' : S.verb === 'getrennt' ? T.getrennt : '';
    function lobbyWahl(hinweis, code) {
      S.lobbyArt = 'wahl';
      sLobby.innerHTML =
        `<div class="kopfzeile"><button class="zurueck" data-a="menue">◀ ${T.zurueck}</button><span></span></div>` +
        `<h2>🌐 ${T.online} – ${esc(TS.titel)}</h2>` +
        `<div class="gruppe"><div class="etikett">Wer bist du?</div><div class="chips" id="namen">` +
        K.NAMEN.map(n => `<button class="chip tier${S.name === n.id ? ' an' : ''}" data-name="${n.id}">${n.emoji} ${n.text}</button>`).join('') + `</div></div>` +
        `<div class="gruppe"><div class="etikett">Neuen Raum aufmachen – ich spiele …</div><div class="chips">` +
        A.seiten.map(s => `<button class="chip${S.seite === s.id ? ' an' : ''}" data-seite="${s.id}">${s.text}</button>`).join('') + `</div>` +
        `<button class="knopf gruen" data-a="erstellen">➕ ${T.raumErstellen}</button></div>` +
        `<div class="gruppe"><div class="etikett">… oder einem Raum beitreten</div><div class="reihe">` +
        `<input class="code" id="codefeld" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${code ? esc(code) : ''}">` +
        `<button class="knopf" data-a="beitreten">➡ ${T.beitreten}</button><button class="knopf-klein" data-a="zuschauen">👀 ${T.zuschauer}</button></div></div>` +
        `<div class="hinweis fehler" id="lobby-hinweis">${hinweis ? esc(hinweis) : ''}</div>`;
      const f = sLobby.querySelector('#codefeld');
      f.addEventListener('input', () => { f.value = f.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
      f.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') beitreten(false); });
    }
    function einladungsLink(code) { return location.origin + location.pathname + '?raum=' + code; }
    function lobbyWarte(st) {
      if (S.lobbyArt === 'warte' && S.lobbyCode === st.code) { const n = sLobby.querySelector('#warte-spieler'); if (n) n.innerHTML = spielerHtml(st); return; }
      S.lobbyArt = 'warte'; S.lobbyCode = st.code;
      const link = einladungsLink(st.code);
      let qr = '';
      try { qr = window.Rennspiel && window.Rennspiel.QR ? window.Rennspiel.QR.svg(link, { modul: 4, rand: 2 }) : ''; } catch (e) { qr = ''; }
      sLobby.innerHTML =
        `<div class="kopfzeile"><button class="zurueck" data-a="abbrechen">✖ Abbrechen</button><span></span></div>` +
        `<h2>${T.raumCode}</h2><div class="codegross">${st.code}</div>` +
        `<div class="unter">Gib den Code ein – oder scanne den QR-Code:</div>` +
        (qr ? `<div class="qr">${qr}</div>` : '') +
        `<div class="link" id="linktext">${esc(link)}</div><button class="knopf-klein" data-a="kopieren">📋 Link kopieren</button>` +
        `<div id="warte-spieler" class="reihe">${spielerHtml(st)}</div>` +
        `<div class="hinweis" id="lobby-hinweis">${T.warten.replace(' …', '')}<span class="punkte"></span></div>`;
    }
    function spielerHtml(st) { return st.spieler.filter(Boolean).map(s => `<span class="spieler${s.online ? '' : ' weg'}">${esc(s.name)}</span>`).join(''); }
    function lobbyHinweis(t, fehler) { const n = sLobby.querySelector('#lobby-hinweis'); if (n) { n.textContent = t || ''; n.classList.toggle('fehler', !!fehler); } }

    function verbinden() {
      if (S.v) return S.v;
      S.v = new BRETT.Verbindung(id, {
        status(s) { S.verb = s; banner(); },
        raum(m) { if (m.rolle) S.rolle = m.rolle; S.code = m.code; },
        stand: standEmpfangen,
        fehler(m) {
          if (S.schirm === 'spiel') { A.serverFehler && A.serverFehler(m); }
          else lobbyHinweis(m.text || 'Fehler', true);
        },
        raumZu(m) { S.endeInfo = null; ueberlayZu(); onlineAus(); menue(T.raumZu); },
        wiederNein() { onlineAus(); if (S.schirm !== 'menue') menue(''); },
        verlassen() {},
      });
      return S.v;
    }
    function onlineAus() { if (S.v) { S.v.schliessen(true); S.v = null; } S.stand = null; S.runde = -1; S.lobbyArt = null; if (S.modus === 'online') { A.stop && A.stop(); S.modus = null; } }

    function erstellen() {
      const v = verbinden();
      let farbe = S.seite === 'z' ? undefined : S.seite;
      lobbyHinweis('Raum wird gemacht …');
      v.senden({ t: 'raumErstellen', spiel: id, name: S.name, farbe });
    }
    function beitreten(zuschauer) {
      const f = sLobby.querySelector('#codefeld'); const code = f ? f.value.trim() : '';
      if (code.length !== K.CODE_LAENGE) { lobbyHinweis('Der Code hat ' + K.CODE_LAENGE + ' Zeichen.', true); return; }
      lobbyHinweis('Suche den Raum …');
      verbinden().senden({ t: 'raumBeitreten', code, spiel: id, name: S.name, zuschauer: !!zuschauer });
    }

    function standEmpfangen(st) {
      S.stand = st;
      if (st.zustand === 'warten') {
        if (S.modus !== 'online' || S.schirm === 'spiel') { /* Revanche-Rückfall o. Ä.: Lobby zeigen */ }
        S.modus = 'online'; zeige('lobby'); lobbyWarte(st); return;
      }
      if (S.modus !== 'online' || S.runde !== st.runde || S.schirm !== 'spiel') {
        S.modus = 'online'; S.runde = st.runde; S.endeInfo = null; ueberlayZu();
        zeige('spiel'); kopfAufbau();
        A.neu({ modus: 'online', ich: st.du.rolle });
      }
      A.stand(st);
      if (st.zustand === 'spiel') { S.endeInfo = null; ueberlayZu(); }
      else if (S.endeInfo) endeZeichnen();
      aktionenAktualisieren(); banner();
    }

    // ---------------------------------------------------------- Spielfenster
    sSpiel.innerHTML =
      `<div class="spielkopf"><button class="zurueck" data-a="menue" title="Menü (Esc)">🏠 ${T.menue}</button><div class="spielerleiste" id="spielerleiste"></div><span class="roomtag hidden" id="roomtag"></span></div>` +
      `<div class="banner hidden" id="banner"></div><div class="statuszeile" id="status"></div><div class="host" id="host"></div><div class="aktionen" id="aktionen"></div>`;
    const elStatus = sSpiel.querySelector('#status'), elLeiste = sSpiel.querySelector('#spielerleiste'), elHost = sSpiel.querySelector('#host'),
      elAkt = sSpiel.querySelector('#aktionen'), elBanner = sSpiel.querySelector('#banner'), elTag = sSpiel.querySelector('#roomtag');
    const ctx = {
      status(text, art) { elStatus.textContent = text || ''; elStatus.className = 'statuszeile' + (art ? ' ' + art : ''); },
      spieler(liste) { elLeiste.innerHTML = (liste || []).map(s => `<span class="spieler ${s.klasse || ''}${s.aktiv ? ' aktiv' : ''}${s.weg ? ' weg' : ''}">${esc(s.text)}</span>`).join(''); },
      ende(info) { S.endeInfo = info; endeZeichnen(); },
      senden(o) { if (S.v) S.v.senden(o); },
      aktionen() { aktionenAktualisieren(); },
    };
    function kopfAufbau() {
      elTag.classList.toggle('hidden', S.modus !== 'online');
      elTag.textContent = S.stand ? 'Raum ' + S.stand.code : '';
      ctx.status(''); ctx.spieler([]);
    }
    function banner() {
      const t = S.modus === 'online' ? (S.verb !== 'verbunden' ? T.getrennt : (S.stand && S.stand.zustand === 'spiel' && S.stand.spieler.some(s => s && !s.online) ? T.gegnerWeg : '')) : '';
      elBanner.textContent = t; elBanner.classList.toggle('hidden', !t);
    }
    function aktionenAktualisieren() {
      const online = S.modus === 'online', st = S.stand;
      const teile = [];
      if (!online) {
        teile.push(`<button class="knopf-klein" data-a="rueck" ${A.kannRueck && A.kannRueck() ? '' : 'disabled'}>↶ ${T.zurueck}</button>`);
        teile.push(`<button class="knopf-klein" data-a="neu">🔁 Neu</button>`);
      } else if (st && st.du.rolle !== 'z' && st.zustand === 'spiel') teile.push(`<button class="knopf-klein" data-a="aufgeben">🏳 ${T.aufgeben}</button>`);
      if (A.drehen) teile.push(`<button class="knopf-klein" data-a="drehen">🔄 ${T.drehen}</button>`);
      elAkt.innerHTML = teile.join('');
      const r = elAkt.querySelector('[data-a=rueck]'); if (r && !(A.kannRueck && A.kannRueck())) r.style.opacity = .4;
    }

    // ---- Overlay (Ende, Fragen)
    let overlay = null;
    function ueberlayZu() { if (overlay) { overlay.remove(); overlay = null; } }
    function overlayZeigen(html, klasse) { ueberlayZu(); overlay = h('div', 'overlay'); overlay.innerHTML = `<div class="tafel ${klasse || ''}">${html}</div>`; document.body.append(overlay); return overlay; }
    function endeZeichnen() {
      const info = S.endeInfo; if (!info) return;
      const online = S.modus === 'online', st = S.stand, spieler = online && st && st.du.rolle !== 'z';
      let knoepfe, klein = '';
      if (!online) knoepfe = `<button class="knopf gruen" data-a="neu">🔁 ${T.nochmal}</button><button class="knopf" data-a="menue">🏠 ${T.menue}</button>`;
      else {
        const ich = spieler ? st.du.rolle : null, ander = ich === 'w' ? 'b' : 'w';
        if (spieler) {
          const meins = st.revanche[ich], seins = st.revanche[ander];
          knoepfe = `<button class="knopf gruen" data-a="revanche" ${meins ? 'disabled' : ''}>🔁 ${meins ? T.revancheWarte : T.revanche}</button>`;
          if (seins && !meins) klein = '<div class="klein">Der andere möchte eine Revanche!</div>';
        } else knoepfe = '';
        knoepfe += `<button class="knopf" data-a="menue">🏠 ${online ? 'Verlassen' : T.menue}</button>`;
      }
      overlayZeigen(`<div class="gross">${info.emoji}</div><div class="text">${esc(info.text)}</div>${klein}<div class="reihe">${knoepfe}</div>` +
        `<button class="knopf-klein" data-a="ansehen">👁 Brett ansehen</button>`);
    }
    function frage(text, ja, jaText) {
      overlayZeigen(`<div class="text">${esc(text)}</div><div class="reihe"><button class="knopf rot" data-a="frage-ja">${jaText || 'Ja'}</button><button class="knopf" data-a="frage-nein">Nein</button></div>`);
      overlay.__ja = ja;
    }

    // ---------------------------------------------------------- Aktionen
    function menue(hinweis) {
      A.stop && A.stop(); ueberlayZu();
      if (S.modus === 'online' || S.v) { if (S.v) { try { S.v.senden({ t: 'verlassen' }); } catch (e) { /* */ } } onlineAus(); }
      S.modus = null; S.endeInfo = null;
      menueZeichnen(hinweis); zeige('menue');
    }
    function offlineStarten(modus) {
      let ich = 'w';
      if (modus === 'computer') ich = S.seite === 'z' ? (Math.random() < 0.5 ? 'w' : 'b') : S.seite;
      S.modus = modus; S.startCfg = { modus, stufe: S.stufe, ich }; S.endeInfo = null; ueberlayZu();
      zeige('spiel'); kopfAufbau(); elTag.classList.add('hidden');
      A.neu(S.startCfg); aktionenAktualisieren(); banner();
    }
    function onlineOeffnen(code) {
      S.modus = null; lobbyWahl('', code); zeige('lobby');
    }

    app.addEventListener('click', (e) => {
      const chipStufe = e.target.closest('[data-stufe]');
      if (chipStufe) { S.stufe = +chipStufe.dataset.stufe; schreiben('brett-stufe', S.stufe); stufeZeichnen(); return; }
      const chipSeite = e.target.closest('[data-seite]');
      if (chipSeite) { S.seite = chipSeite.dataset.seite; schreiben('brett-seite-' + id, S.seite); S.schirm === 'stufe' ? stufeZeichnen() : (lobbyWahl('', (sLobby.querySelector('#codefeld') || {}).value)); return; }
      const chipName = e.target.closest('[data-name]');
      if (chipName) { S.name = chipName.dataset.name; schreiben('brett-name', S.name); sLobby.querySelectorAll('[data-name]').forEach(b => b.classList.toggle('an', b === chipName)); return; }
      const a = e.target.closest('[data-a]');
      if (a) aktion(a.dataset.a);
    });
    document.addEventListener('click', (e) => {          // Overlay hängt am body
      if (!overlay || !overlay.contains(e.target)) return;
      const a = e.target.closest('[data-a]'); if (a) aktion(a.dataset.a);
    });

    function aktion(a) {
      switch (a) {
        case 'lokal': return offlineStarten('lokal');
        case 'computer': stufeZeichnen(); return zeige('stufe');
        case 'los': return offlineStarten('computer');
        case 'online': return onlineOeffnen();
        case 'menue': {
          if (S.modus === 'online' && S.stand && S.stand.du.rolle !== 'z' && S.stand.zustand === 'spiel') return frage('Das Spiel verlassen? Dann ist es für beide vorbei.', () => menue(), 'Verlassen');
          return menue();
        }
        case 'abbrechen': return menue();
        case 'erstellen': return erstellen();
        case 'beitreten': return beitreten(false);
        case 'zuschauen': return beitreten(true);
        case 'kopieren': {
          const t = (sLobby.querySelector('#linktext') || {}).textContent || '';
          try { navigator.clipboard.writeText(t).then(() => lobbyHinweis('Link kopiert!'), () => lobbyHinweis('Kopieren geht hier nicht – bitte den Link markieren.')); } catch (e) { lobbyHinweis('Kopieren geht hier nicht – bitte den Link markieren.'); }
          return;
        }
        case 'rueck': if (A.rueckgaengig && A.rueckgaengig()) { S.endeInfo = null; ueberlayZu(); } return aktionenAktualisieren();
        case 'neu': ueberlayZu(); return offlineStarten(S.modus === 'computer' ? 'computer' : 'lokal');
        case 'drehen': return A.drehen && A.drehen();
        case 'aufgeben': return frage('Wirklich aufgeben?', () => ctx.senden({ t: 'aufgeben' }), T.aufgeben);
        case 'revanche': ctx.senden({ t: 'revanche' }); return;
        case 'ansehen': return ueberlayZu();
        case 'frage-ja': { const f = overlay && overlay.__ja; ueberlayZu(); if (f) f(); return; }
        case 'frage-nein': return ueberlayZu();
      }
    }

    document.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        if (overlay) return ueberlayZu();
        if (S.schirm === 'spiel' || S.schirm === 'stufe' || S.schirm === 'lobby') return aktion('menue');
        return;
      }
      if (S.schirm === 'spiel' && !overlay && A.taste) A.taste(e);
    });

    // ---------------------------------------------------------- Start
    A.bauen(elHost, ctx);
    menueZeichnen();
    const raumParam = (new URLSearchParams(location.search).get('raum') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (BRETT.sitzLesen(id)) {                                // Seite neu geladen / Netz weg: Platz zurückholen
      S.modus = null; zeige('lobby'); sLobby.innerHTML = `<h2>Verbinde wieder<span class="punkte"></span></h2><button class="knopf-klein" data-a="abbrechen">✖ Abbrechen</button>`;
      verbinden();
      setTimeout(() => { if (S.schirm === 'lobby' && S.lobbyArt !== 'warte' && !S.stand) menue(''); }, 8000);
    } else if (raumParam) onlineOeffnen(raumParam);
    else zeige('menue');
    BRETT.__rahmen = { S, ctx, aktion };        // für Tests
  }

  BRETT.Rahmen = { start };
})();
