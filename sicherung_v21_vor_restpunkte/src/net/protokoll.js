// ============================================================
// W5 Mehrspieler: gemeinsame Konstanten und Helfer für Browser UND Server (server/simulation.js lädt diese
// Datei über denselben vm-Lader wie die Physik-Module). Kein DOM, kein THREE.
// Protokoll-Beschreibung: server/PROTOKOLL.md
// ============================================================
(function () {
  const R = window.Rennspiel;

  // Raumcode: 4 Zeichen aus Großbuchstaben und Ziffern OHNE 0/O/1/I (Verwechslungsgefahr für Kinder)
  const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const Netz = {
    VERSION: 3,              // 3 (14.10.): schalterFrage/schalterUmschalten/schalter (Internet-Schalter, additiv) · 2 (13.10.): ich.sz (Zustände für die Sonder-Vorhersage) – rein additiv, Version-1-Browser ignorieren das Feld
    CODE_ZEICHEN,
    CODE_LAENGE: 4,
    MAX_SPIELER: 6,          // Menschen je Raum
    MAX_AUTOS: 12,           // Menschen + Computer zusammen (wie lokal: 2 Spieler + 10 Gegner)
    TICK_HZ: 60,             // Server-Simulation (= config.physik.schritt)
    ZUSTAND_JE_TICKS: 3,     // Zustand an alle alle 3 Ticks = 20 Hz
    INTERP_VERZUG: 0.1,      // s – andere Autos werden 100 ms hinter dem Server-Zeitstempel gezeigt
    HART_KORREKTUR: 3,       // m – größere Abweichung der Vorhersage → sofort springen statt weich angleichen
    HERZSCHLAG_MS: 5000,     // ws-Ping vom Server; wer zwei Herzschläge nicht antwortet, fliegt raus
    PFAD: '/ws',

    /** Raumcode prüfen/normalisieren ('abcd' → 'ABCD'); ungültig → null. */
    codeNormal(text) {
      const c = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length !== 4) return null;
      for (let i = 0; i < 4; i++) if (CODE_ZEICHEN.indexOf(c[i]) < 0) return null;
      return c;
    },

    /** Erlaubtes Zeichen für die Code-Eingabe? (Großbuchstabe/Ziffer aus CODE_ZEICHEN) */
    codeZeichenOk(z) { return typeof z === 'string' && z.length === 1 && CODE_ZEICHEN.indexOf(z.toUpperCase()) >= 0; },

    /**
     * Steuerung → ganze Zahlen (gas/bremse 0..100, lenkung −100..100). Browser UND Server rechnen danach mit
     * genau denselben Werten (wert / 100), damit die Vorhersage bitgleich zur Server-Physik bleibt.
     */
    eingabeKodieren(s) {
      const k = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round((+x || 0) * 100)));
      return { g: k(s && s.gas, 0, 100), b: k(s && s.bremse, 0, 100), l: k(s && s.lenkung, -100, 100) };
    },
    /** Ganze Zahlen → Steuerung { gas, bremse, lenkung } (gleiche Rechnung auf beiden Seiten). */
    eingabeDekodieren(e, ziel) {
      const s = ziel || {};
      const z = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+x || 0))) / 100;
      s.gas = z(e && e.g, 0, 100); s.bremse = z(e && e.b, 0, 100); s.lenkung = z(e && e.l, -100, 100);
      return s;
    },

    /**
     * Felder des Fahrzeug-Zustands, die für den Neuabgleich (Vorhersage) vollständig übertragen werden.
     * Reihenfolge = Reihenfolge im Array `ich.v` der Zustand-Nachricht.
     */
    FAHRZEUG_FELDER: ['x', 'z', 'y', 'heading', 'vLaengs', 'vQuer', 'lenkung', 'drehImpuls', 'neigung', 'nicken', '_querBeschl', '_ueberBeschl'],

    fahrzeugLesen(v) { return Netz.FAHRZEUG_FELDER.map(k => (typeof v[k] === 'number' && isFinite(v[k]) ? v[k] : 0)); },
    fahrzeugSchreiben(v, a) {
      const F = Netz.FAHRZEUG_FELDER;
      for (let i = 0; i < F.length; i++) if (typeof a[i] === 'number') v[F[i]] = a[i];
    },

    /** Gerundete Zahl für die kompakten Zustandslisten (n Nachkommastellen). */
    rund(x, n) { const f = Math.pow(10, n); return Math.round(x * f) / f; },
  };

  R.Netz = Netz;
})();
