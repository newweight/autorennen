// ============================================================
// Spaß-Paket S1 – Stimmen-Hupe: Kinder sprechen Hupe und Jubel selbst ein (Garage), im Rennen gespielt.
//   R.SpassStimme.aufnehmen(art, opt) → Promise { ok, fehler? }   art = 'hupe' | 'jubel'; MediaRecorder, höchstens 2 s (opt.beiLaeuft(sekunden) je 0,1 s)
//   .stoppen()                  laufende Aufnahme früher beenden
//   .vorhoeren(art) / .abspielen(art) / .loeschen(art) / .hat(art)
//   .hupen() / .jubeln()        im Rennen: eigene Aufnahme, sonst eingebauter Standardklang (WebAudio). Nur lokal – es wird nichts übers Netz geschickt.
// Speicher: IndexedDB „rennspiel.spass.<spiel>“ (je Spiel getrennt: auto | motorrad), Speicher-Ausweichlösung im Arbeitsspeicher; alles in try/catch.
// Ton aus (R.Audio.an === false) → still. Ohne Mikrofon-Erlaubnis: freundlicher Hinweis (Text im Ergebnis), der Standardklang bleibt.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R) return;
  const MAX_S = 2;
  const spielName = () => (window.MOTORRAD === true ? 'motorrad' : 'auto');
  const ARTEN = ['hupe', 'jubel'];

  const S = {
    ARTEN, MAX_S,
    daten: {},          // art → { buf: ArrayBuffer, typ }
    puffer: {},         // art → AudioBuffer (dekodiert)
    ctx: null,
    rec: null,
    letzterFehler: '',
    spielName,
  };

  // ---------- Speicher (IndexedDB) ----------
  function dbOeffnen() {
    return new Promise((ok, nein) => {
      try {
        const idb = typeof indexedDB !== 'undefined' ? indexedDB : null;
        if (!idb) return nein(new Error('keine IndexedDB'));
        const q = idb.open('rennspiel.spass.' + spielName(), 1);
        q.onupgradeneeded = () => { try { q.result.createObjectStore('stimmen'); } catch (e) { /* schon da */ } };
        q.onsuccess = () => ok(q.result);
        q.onerror = () => nein(q.error || new Error('IndexedDB-Fehler'));
        q.onblocked = () => nein(new Error('IndexedDB blockiert'));
      } catch (e) { nein(e); }
    });
  }
  function dbTun(modus, fn) {
    return dbOeffnen().then((db) => new Promise((ok, nein) => {
      try {
        const tx = db.transaction('stimmen', modus), st = tx.objectStore('stimmen'), q = fn(st);
        tx.oncomplete = () => { try { db.close(); } catch (e) { /* egal */ } ok(q ? q.result : undefined); };
        tx.onerror = () => { try { db.close(); } catch (e) { /* egal */ } nein(tx.error); };
        tx.onabort = () => { try { db.close(); } catch (e) { /* egal */ } nein(tx.error); };
      } catch (e) { nein(e); }
    }));
  }
  S.speichern = (art, buf, typ) => dbTun('readwrite', (st) => st.put({ buf, typ }, art)).catch(() => { /* nur im Arbeitsspeicher */ });
  S.entfernen = (art) => dbTun('readwrite', (st) => st.delete(art)).catch(() => {});

  /** Gespeicherte Aufnahmen laden (beim Start des Spiels / Öffnen der Garage). */
  S.laden = function () {
    return Promise.all(ARTEN.map((art) => dbTun('readonly', (st) => st.get(art)).then((v) => {
      if (v && v.buf) { S.daten[art] = v; delete S.puffer[art]; }
    }).catch(() => {}))).then(() => true);
  };

  S.hat = (art) => !!S.daten[art];

  // ---------- Audio ----------
  function tonAn() { return !R.Audio || R.Audio.an !== false; }
  S.audio = function () {
    if (S.ctx) { if (S.ctx.state === 'suspended') { try { S.ctx.resume(); } catch (e) { /* egal */ } } return S.ctx; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) S.ctx = new AC();
    } catch (e) { S.ctx = null; }
    return S.ctx;
  };
  function dekodieren(art) {
    const c = S.audio(), d = S.daten[art];
    if (!c || !d) return Promise.resolve(null);
    if (S.puffer[art]) return Promise.resolve(S.puffer[art]);
    return new Promise((ok) => {
      try {
        const kopie = d.buf.slice(0);
        const p = c.decodeAudioData(kopie, (b) => { S.puffer[art] = b; ok(b); }, () => ok(null));
        if (p && p.catch) p.catch(() => ok(null));
      } catch (e) { ok(null); }
    });
  }
  function abspielenPuffer(b, lautstaerke) {
    const c = S.ctx;
    const q = c.createBufferSource(), g = c.createGain();
    q.buffer = b; g.gain.value = lautstaerke === undefined ? 1 : lautstaerke;
    q.connect(g); g.connect(c.destination); q.start();
    return q;
  }

  /** Eingebaute Klänge: Hupe = zwei Töne („Tüt-tüt“), Jubel = steigende Töne + Klatschen. */
  function standard(art) {
    const c = S.audio();
    if (!c) return false;
    const t0 = c.currentTime + 0.01;
    const ton = (f, start, dauer, typ, vol) => {
      const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = typ; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 2200;
      g.gain.setValueAtTime(0.0001, t0 + start); g.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.02);
      g.gain.setValueAtTime(vol, t0 + start + dauer - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dauer);
      o.connect(fl); fl.connect(g); g.connect(c.destination); o.start(t0 + start); o.stop(t0 + start + dauer + 0.02);
    };
    if (art === 'hupe') {
      [0, 0.30].forEach((s) => { ton(440, s, 0.22, 'square', 0.16); ton(554, s, 0.22, 'square', 0.12); });
    } else {
      [523, 659, 784, 1047].forEach((f, i) => ton(f, i * 0.10, 0.16, 'triangle', 0.22));
      const n = Math.floor(c.sampleRate * 0.9), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      let z = 12345;
      for (let i = 0; i < n; i++) { z = (Math.imul(z, 1664525) + 1013904223) >>> 0; d[i] = ((z / 4294967296) * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.35)) * (0.5 + 0.5 * Math.sin(i / 380)); }
      const q = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      q.buffer = b; bp.type = 'bandpass'; bp.frequency.value = 3200; g.gain.value = 0.35;
      q.connect(bp); bp.connect(g); g.connect(c.destination); q.start(t0 + 0.30);
    }
    return true;
  }

  /** Abspielen: eigene Aufnahme, sonst Standardklang. Liefert true, wenn etwas gestartet wurde. */
  S.abspielen = function (art, opt) {
    try {
      if (!(opt && opt.immer) && !tonAn()) return false;
      if (!S.audio()) return false;
      if (S.puffer[art]) { abspielenPuffer(S.puffer[art], art === 'hupe' ? 1 : 0.9); return true; }
      if (S.daten[art]) {
        dekodieren(art).then((b) => { if (b) abspielenPuffer(b, art === 'hupe' ? 1 : 0.9); else standard(art); });
        return true;
      }
      return standard(art);
    } catch (e) { return false; }
  };
  S.vorhoeren = (art) => S.abspielen(art, { immer: true });
  S.hupen = () => S.abspielen('hupe');
  S.jubeln = () => S.abspielen('jubel');
  S.loeschen = function (art) {
    delete S.daten[art]; delete S.puffer[art];
    return S.entfernen(art);
  };

  // ---------- Aufnehmen ----------
  const FREUNDLICH = {
    keinMikro: 'Dein Gerät hat kein Mikrofon gefunden. Du kannst trotzdem mit dem eingebauten Klang hupen! 🎺',
    verboten: 'Das Mikrofon ist nicht erlaubt. Frag einen Erwachsenen, ob du es im Browser erlauben darfst (Schloss-Symbol neben der Adresse). Bis dahin hupt das Auto mit dem Standardklang. 🎤',
    sonst: 'Das Aufnehmen hat gerade nicht geklappt. Probier es gleich nochmal – oder benutze den Standardklang. 🙂',
  };
  S.fehlerText = function (e) {
    const n = e && (e.name || e.message) || '';
    if (/NotFound|DevicesNotFound|keine/i.test(n)) return FREUNDLICH.keinMikro;
    if (/NotAllowed|Permission|Security/i.test(n)) return FREUNDLICH.verboten;
    return FREUNDLICH.sonst;
  };
  S.verfuegbar = () => !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');

  S.stoppen = function () { if (S.rec && S.rec.stoppen) S.rec.stoppen(); };
  S.nimmtAuf = () => !!S.rec;

  S.aufnehmen = function (art, opt) {
    opt = opt || {};
    if (!ARTEN.includes(art)) return Promise.resolve({ ok: false, fehler: FREUNDLICH.sonst });
    if (S.rec) return Promise.resolve({ ok: false, fehler: 'Es läuft schon eine Aufnahme.' });
    if (!S.verfuegbar()) return Promise.resolve({ ok: false, fehler: S.fehlerText({ name: 'NotFoundError' }) });
    S.audio();      // Audio-Kontext in der Klick-Geste anlegen (Vorhören danach ohne Sperre)
    return navigator.mediaDevices.getUserMedia({ audio: true }).then((strom) => new Promise((ok) => {
      let rec, teile = [], fertig = false, t0 = Date.now(), uhr = null, timer = null;
      const ende = (res) => {
        if (fertig) return; fertig = true;
        clearInterval(uhr); clearTimeout(timer); S.rec = null;
        try { strom.getTracks().forEach((t) => t.stop()); } catch (e) { /* egal */ }
        ok(res);
      };
      try {
        rec = new MediaRecorder(strom);
      } catch (e) { return ende({ ok: false, fehler: S.fehlerText(e) }); }
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) teile.push(ev.data); };
      rec.onerror = (ev) => ende({ ok: false, fehler: S.fehlerText(ev && ev.error) });
      rec.onstop = () => {
        const blob = new Blob(teile, { type: rec.mimeType || 'audio/webm' });
        if (!blob.size) return ende({ ok: false, fehler: 'Ich habe nichts gehört – sprich etwas lauter! 🙂' });
        const lese = blob.arrayBuffer ? blob.arrayBuffer() : new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsArrayBuffer(blob); });
        lese.then((buf) => {
          S.daten[art] = { buf, typ: blob.type }; delete S.puffer[art];
          S.speichern(art, buf, blob.type);
          dekodieren(art).then((b) => ende(b ? { ok: true, sekunden: b.duration } : { ok: true }));
        }).catch((e) => ende({ ok: false, fehler: S.fehlerText(e) }));
      };
      S.rec = { stoppen: () => { try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { ende({ ok: false, fehler: FREUNDLICH.sonst }); } } };
      rec.start();
      if (opt.beiStart) try { opt.beiStart(); } catch (e) { /* egal */ }
      uhr = setInterval(() => { if (opt.beiLaeuft) try { opt.beiLaeuft(Math.min(MAX_S, (Date.now() - t0) / 1000)); } catch (e) { /* egal */ } }, 100);
      timer = setTimeout(() => S.stoppen(), MAX_S * 1000);
    })).catch((e) => ({ ok: false, fehler: S.fehlerText(e) }));
  };

  R.SpassStimme = S;
})();
