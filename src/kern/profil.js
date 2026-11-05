// ============================================================
// Kern: Spiel-Profil mit Erlaubt-Liste (Opt-in) – PLAN_GEMEINSAMER_KERN.md, Schutzregel 1.
//   R.Profil.erlaubt('spass')   darf diese Spaß-/Zusatzfunktion in DIESEM Spiel überhaupt an sein?
//   R.Profil.name()             'radwelt' | 'motorrad' | 'autorennen' (aus window.RADWELT / window.MOTORRAD, sonst Autorennen)
//   R.Profil.setzen(name|null)  nur für Tests: Profil erzwingen (null = wieder automatisch)
//   R.Profil.NAMEN              alle Schalter-Namen, die im Kern an der Erlaubt-Liste hängen (Test prüft sie alle)
// Die Listen stehen in spiele.json (Abschnitt „profil“) und kommen über src/kern/profilDaten.js (erzeugt von werkzeuge/html_bauen.js):
//   ["*"] = alles erlaubt (Autorennen, Motorrad) · [] = nichts erlaubt (Radwelt) · ["regenbogenspur", …] = nur diese.
// Regel für neue Funktionen: im Kern hinter einer Spaß-/Zusatz-Schalterfrage immer `R.Profil.erlaubt('<name>')` mit abfragen (und den Namen in
// NAMEN eintragen) → in der Radwelt ist sie automatisch AUS, bis sie in spiele.json bewusst freigegeben wird.
// Fehlt profilDaten.js (alte Testladungen ohne Kern), ist alles erlaubt = Verhalten wie vor K1 (bitgleich).
// Ein Profilname, der in den Daten fehlt, erlaubt NICHTS (sicher).
// ============================================================
(function () {
  const R = (window.Rennspiel = window.Rennspiel || {});
  if (R.Profil) return;
  let erzwungen = null;

  const NAMEN = [
    'spass',            // Spaß-Elemente auf der Strecke (Trampolin, Kanone, Teleport-Tore, Hüpfer) – Strecken-Option spass
    'zauber',           // Fahr-Zauber (Magnet-Röhre, Schlucht, Halfpipe, Riese/Mini, Haustier/Kostüm) – Strecken-Option zauber
    'loopMag',          // Loopings als Magnet-Röhre
    'zufall',           // Zufällige Strecke (Münzen/Hindernisse jede Runde neu)
    'geist',            // Geist vom besten Lauf
    'tuning',           // Tuning mit Goldstücken
    'tricks',           // Auto-Tricks (Fassrolle/Schraube)
    'kiTricks',         // Computer-Gegner machen Tricks
    'dino',             // Dino-Begleiter
    'regenbogenspur',   // Regenbogenspur
    'modiKurz',         // Kurz-Level
    'modiFrei',         // Freie Fahrt
    'modiKO',           // K.-o.-Rallye
    'modiArena',        // Stunt-Arena
  ];

  function name() {
    if (erzwungen) return erzwungen;
    if (typeof window !== 'undefined') {
      if (window.RADWELT === true) return 'radwelt';
      if (window.MOTORRAD === true) return 'motorrad';
    }
    return 'autorennen';
  }

  function erlaubt(was) {
    const d = R.ProfilDaten;
    if (!d) return true;                                   // kein Kern geladen → wie vor K1
    const p = d[name()];
    if (!p || !Array.isArray(p.erlaubt)) return false;     // unbekanntes Profil → nichts
    return p.erlaubt.indexOf('*') >= 0 || p.erlaubt.indexOf(was) >= 0;
  }

  R.Profil = { erlaubt, name, NAMEN, setzen(n) { erzwungen = n || null; } };
})();
