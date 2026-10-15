// ============================================================
// Sterne-Wertung (Runde 6, D3): nach jedem Rennen 1–3 ⭐ je Spieler, Summe je Fahrer in localStorage.
//   3 ⭐ = Platz 1 · 2 ⭐ = Platz 2–3 ODER beste Runde unter der KI-„mittel"-Zielzeit der Strecke · 1 ⭐ = angekommen.
// Zielzeit = zielRundenzeit der Strecke (Katalog, entspricht der KI-Stufe „mittel"), bei Tempo-Klasse „schnell" × 0,9.
// Speicher: rennspiel.sterne.v1 = { "<Fahrername>": Summe } – alle Zugriffe in try/catch (Privatmodus, gesperrter Speicher).
// ============================================================
(function () {
  const R = window.Rennspiel;
  const KEY = 'rennspiel.sterne.v1';

  function speicher() { try { return window.localStorage || null; } catch (e) { return null; } }
  let _ram = {};   // Rückfall, wenn localStorage fehlt (gilt nur bis zum Neuladen)

  const Sterne = {
    KEY,
    /** Sterne (0..3) für ein Ergebnis; 0 = nicht angekommen. */
    bewerten(platz, imZiel, beste, zielzeit) {
      if (!imZiel) return 0;
      if (platz === 1) return 3;
      if (platz === 2 || platz === 3) return 2;
      if (typeof beste === 'number' && typeof zielzeit === 'number' && beste < zielzeit) return 2;
      return 1;
    },
    /** KI-„mittel"-Zielzeit der Strecke (s) für die Sterne. */
    zielzeit(streckeDaten, tempoKlasse) {
      const z = streckeDaten && streckeDaten.zielRundenzeit;
      return typeof z === 'number' ? z * (tempoKlasse === 'schnell' ? 0.9 : 1) : null;
    },
    laden() {
      const s = speicher();
      if (!s) return Object.assign({}, _ram);
      try {
        const o = JSON.parse(s.getItem(KEY) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (e) { return {}; }
    },
    speichern(o) {
      _ram = Object.assign({}, o);
      const s = speicher();
      if (s) { try { s.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignorieren */ } }
    },
    /** Sterne-Gesamtzahl eines Fahrers. */
    summe(name) { const n = Sterne.laden()[name]; return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; },
    /** Sterne gutschreiben; gibt die neue Summe zurück. */
    gutschreiben(name, anzahl) {
      const o = Sterne.laden();
      const neu = (Number.isFinite(o[name]) ? Math.floor(o[name]) : 0) + Math.max(0, anzahl | 0);
      o[name] = neu;
      Sterne.speichern(o);
      return neu;
    },
    /** „⭐⭐⭐" für die Ergebnistafel. */
    text(n) { return n > 0 ? '⭐'.repeat(Math.min(3, n)) : ''; },
  };

  R.Sterne = Sterne;
})();
