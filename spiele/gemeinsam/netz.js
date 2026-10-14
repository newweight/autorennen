// ============================================================
// Online-Verbindung der Brettspiele (Browser): WebSocket /ws-brett, Wiederverbinden nach Netzabbruch (Sitz im sessionStorage:
// Raumcode + Token; der Server hält den Platz 10 Minuten). Kein Framework.
//   const v = new BRETT.Verbindung(spielId, { stand(st), raum(m), fehler(m), raumZu(m), wiederNein(), status('verbunden'|'getrennt'|'zu') });
//   v.senden({ t:'zug', z:'e2e4' });  v.sitz() → { code, token } | null;  v.schliessen(vergessen)
// ============================================================
(function () {
  const BRETT = window.BRETT = window.BRETT || {};
  const K = BRETT.K;
  const SCHLUESSEL = 'brett-sitz';
  function sitzLesen(spiel) { try { const s = JSON.parse(sessionStorage.getItem(SCHLUESSEL) || 'null'); return s && s.spiel === spiel ? s : null; } catch (e) { return null; } }
  function sitzSchreiben(s) { try { if (s) sessionStorage.setItem(SCHLUESSEL, JSON.stringify(s)); else sessionStorage.removeItem(SCHLUESSEL); } catch (e) { /* privater Modus */ } }

  class Verbindung {
    constructor(spiel, cb) {
      this.spiel = spiel; this.cb = cb || {}; this.ws = null; this.zu = false; this.versuch = 0; this.timer = null; this.herz = null; this.warteschlange = [];
      this._sitz = sitzLesen(spiel);
      this.oeffnen();
    }
    url() { const l = location; return (l.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + l.host + K.PFAD; }
    sitz() { return this._sitz; }
    oeffnen() {
      if (this.zu) return;
      let ws;
      try { ws = new WebSocket(this.url()); } catch (e) { this.cb.status && this.cb.status('getrennt'); this.neuVersuch(); return; }
      this.ws = ws;
      ws.onopen = () => {
        this.versuch = 0;
        this.cb.status && this.cb.status('verbunden');
        if (this._sitz) this.roh({ t: 'wiederverbinden', code: this._sitz.code, token: this._sitz.token });
        const q = this.warteschlange; this.warteschlange = [];
        q.forEach(o => this.roh(o));
        clearInterval(this.herz);
        this.herz = setInterval(() => this.roh({ t: 'ping', z: Date.now() }), 20000);
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t === 'raum' && m.token) { this._sitz = { spiel: this.spiel, code: m.code, token: m.token }; sitzSchreiben(this._sitz); }
        if (m.t === 'wiederNein') { this._sitz = null; sitzSchreiben(null); }
        if (m.t === 'raumZu' || m.t === 'verlassen') { this._sitz = null; sitzSchreiben(null); }
        const f = this.cb[m.t]; if (f) f(m);
      };
      ws.onclose = () => { clearInterval(this.herz); this.cb.status && this.cb.status(this.zu ? 'zu' : 'getrennt'); if (!this.zu) this.neuVersuch(); };
      ws.onerror = () => {};
    }
    neuVersuch() {
      clearTimeout(this.timer);
      if (this.zu) return;
      if (!this._sitz && this.versuch >= 3) return;                         // ohne Sitz nicht ewig probieren
      const warte = Math.min(8000, 700 * Math.pow(1.7, this.versuch++));
      this.timer = setTimeout(() => this.oeffnen(), warte);
    }
    roh(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    senden(o) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
      else { this.warteschlange.push(o); if (this.warteschlange.length > 5) this.warteschlange.shift(); if (!this.ws || this.ws.readyState > 1) { this.versuch = 0; this.oeffnen(); } }
    }
    vergessen() { this._sitz = null; sitzSchreiben(null); }
    schliessen(vergessen) {
      if (vergessen) this.vergessen();
      this.zu = true; clearTimeout(this.timer); clearInterval(this.herz);
      try { this.ws && this.ws.close(); } catch (e) { /* zu */ }
    }
  }
  BRETT.Verbindung = Verbindung;
  BRETT.sitzLesen = sitzLesen;
})();
