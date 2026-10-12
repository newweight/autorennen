// ============================================================
// W5-2 Mehrspieler: Verbindung zum Server (WebSocket /ws) – Nachrichten, Ping, Server-Uhr.
//
//   const v = new R.NetzVerbindung();  v.bei('lobby', fn);  await v.verbinden();  v.senden({ t: 'raumErstellen', … })
//
// URL: gleiche Herkunft wie die Seite (relativ), wss: unter https (Tailscale Funnel / cloudflared), ws: sonst.
// Uhr: aus jedem Zustand (Tick k) wird die Server-Zeit geschätzt (schnellster Weg der letzten 2 s, weich
// nachgeführt) → serverTick() = geschätzter aktueller Server-Tick (Bruchzahl) für die Interpolation.
// Protokoll: server/PROTOKOLL.md
// ============================================================
(function () {
  const R = window.Rennspiel;

  class NetzVerbindung {
    constructor() {
      this.ws = null;
      this.offen = false;
      this._fn = {};
      this.ping = null;            // ms (geglättet)
      this.pingRoh = null;
      this._pingTimer = null;
      this._proben = [];           // [{ lokal (s), wert (s) }] Server-Zeit − lokale Zeit
      this.versatz = null;         // s: Server-Zeit ≈ lokale Zeit + versatz
      this.gesendet = 0; this.empfangen = 0;
    }

    static url() {
      const l = window.location;
      return (l.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + l.host + R.Netz.PFAD;
    }

    /** Handler für Nachrichtentyp t ('*' = alle, 'zu' = Verbindung geschlossen). */
    bei(t, fn) { (this._fn[t] = this._fn[t] || []).push(fn); }
    _melden(t, m) { (this._fn[t] || []).forEach(fn => { try { fn(m); } catch (e) { console.error(e); } }); }

    verbinden(url) {
      return new Promise((ok, nein) => {
        let ws;
        try { ws = new WebSocket(url || NetzVerbindung.url()); } catch (e) { nein(e); return; }
        this.ws = ws;
        const zeit = setTimeout(() => { if (!this.offen) { try { ws.close(); } catch (e) { /* egal */ } nein(new Error('Zeitüberschreitung')); } }, 8000);
        ws.onopen = () => {
          clearTimeout(zeit);
          this.offen = true;
          this.senden({ t: 'hallo', v: R.Netz.VERSION });
          this._pingTimer = setInterval(() => this.senden({ t: 'ping', z: performance.now() }), 1000);
          ok(this);
        };
        ws.onerror = () => { if (!this.offen) { clearTimeout(zeit); nein(new Error('Keine Verbindung zum Server')); } };
        ws.onclose = () => {
          const war = this.offen;
          this.offen = false;
          clearInterval(this._pingTimer);
          if (war) this._melden('zu', {});
        };
        ws.onmessage = (ev) => {
          let m;
          try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (!m || typeof m.t !== 'string') return;
          this.empfangen++;
          if (m.t === 'pong') {
            const rtt = performance.now() - m.z;
            if (rtt >= 0 && rtt < 10000) { this.pingRoh = rtt; this.ping = this.ping === null ? rtt : this.ping + (rtt - this.ping) * 0.3; }
          } else if (m.t === 'zustand') this._uhr(m.k);
          this._melden(m.t, m);
          this._melden('*', m);
        };
      });
    }

    senden(obj) {
      if (!this.ws || this.ws.readyState !== 1) return false;
      this.ws.send(JSON.stringify(obj));
      this.gesendet++;
      return true;
    }

    schliessen() {
      clearInterval(this._pingTimer);
      this.offen = false;
      this._fn = {};
      if (this.ws) { try { this.ws.close(); } catch (e) { /* egal */ } }
      this.ws = null;
    }

    // ---------- Server-Uhr ----------
    _uhr(k) {
      const DT = R.config.physik.schritt, jetzt = performance.now() / 1000;
      const wert = k * DT - jetzt;               // je kleiner die Laufzeit, desto größer der Wert
      const p = this._proben;
      p.push({ lokal: jetzt, wert });
      while (p.length && p[0].lokal < jetzt - 2) p.shift();
      let best = -Infinity;
      for (let i = 0; i < p.length; i++) if (p[i].wert > best) best = p[i].wert;
      if (this.versatz === null || Math.abs(best - this.versatz) > 0.5) this.versatz = best;    // erster Wert / großer Sprung
      else this.versatz += (best - this.versatz) * 0.1;
    }
    /** Uhr zurücksetzen (neues Rennen: Tick fängt wieder bei 0 an). */
    uhrNeu() { this._proben = []; this.versatz = null; }
    /** Geschätzter aktueller Server-Tick (Bruchzahl) oder null. */
    serverTick() {
      if (this.versatz === null) return null;
      return (performance.now() / 1000 + this.versatz) / R.config.physik.schritt;
    }
  }

  R.NetzVerbindung = NetzVerbindung;
})();
