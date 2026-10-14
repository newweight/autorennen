// ============================================================
// Cabrio-Verdeck auf/zu (14.10. v20) – Zustand, Animation, Tasten. Die Geometrie baut carBuilder.js (form.dach, userData.dach).
//
// Zustände: 'offen' (Standard) | 'zu'; dazwischen 'faehrt' (Animation ≈ 2 s, R.dach.DAUER). Umschalten nur im STAND
// (|Geschwindigkeit| < R.dach.STAND = 0,5 m/s); in Fahrt erscheint die Meldung „Erst anhalten!“. Keine Wirkung auf die Fahrphysik
// (reine Optik: Mesh-Gruppe 'dachGruppe', Überrollbügel nur bei offenem Dach).
//
// Tasten (Prüfung in src/input.js → Input.dachGeste(spielerNr); beide Tasten GLEICHZEITIG, nur die Flanke „beide neu gedrückt“ UND Stand zählt; „Erst anhalten!“ erst nach ≥ 0,3 s gemeinsamem Halten, höchstens 1× je 10 s):
//   Einzelspieler  Spieler 1 (Pfeile):  ↑ + ↓            (Touch: ▲ + ▼ gleichzeitig – steuerung(0) enthält die Touch-Tasten)
//   Zu zweit       Spieler 1 (Pfeile):  ↑ + ↓  oder  ← + →
//                  Spieler 2 (WASD):    W + S  oder  A + D      („Gegentasten“ = die beiden entgegengesetzten Tasten)
//   Während der Klappbewegung wird jede weitere Eingabe ignoriert.
// HUD: einmalig zu Rennbeginn „🚗 Dach auf/zu: ↑+↓ im Stand“ (WASD-Spieler: „A+D“).
// Online: das Dach ist nur lokale Optik – es wird nicht übertragen (Gegner/Mitspieler zeigen immer ihren Standard: offen).
//
// API (alle Funktionen tolerieren Autos ohne Verdeck):
//   R.dach.hat(mesh)                     → true bei Autos mit Verdeck (nur 'troc-cabrio')
//   R.dach.zustand(mesh)                 → 'offen' | 'zu' | 'faehrt'
//   R.dach.setze(mesh, 'offen'|'zu', sofort)   Ziel setzen; sofort = true: ohne Animation (z. B. für Gegner)
//   R.dach.umschalten(mesh)              → neues Ziel ('offen'|'zu') oder null (fährt gerade)
//   R.dach.schritt(mesh, dt)             Animation um dt Sekunden weiter (wird von frame() für alle Fahrzeuge gerufen)
//   R.dach.frame(spiel, dt)              pro Bild aus main.js: Animation, Tasten, Hinweis, „Erst anhalten!“
// Gegner mit Optionen: carBuilder.bauen(auto, { dach: 'zu', lack: 'gulf' }) oder auto.optionen = { dach, lack } (siehe carCatalog.js).
// ============================================================
(function () {
  const R = window.Rennspiel;

  const D = R.dach = {
    DAUER: 2.0,        // Sekunden für auf/zu
    STAND: 0.5,        // m/s: darunter gilt das Auto als stehend
  };

  const info = (mesh) => (mesh && mesh.userData && mesh.userData.dach) || null;

  D.hat = (mesh) => !!info(mesh);

  D.zustand = (mesh) => {
    const d = info(mesh);
    if (!d) return null;
    if (d.p >= 1 && d.ziel === 1) return 'zu';
    if (d.p <= 0 && d.ziel === 0) return 'offen';
    return 'faehrt';
  };

  D.setze = (mesh, zustand, sofort) => {
    const d = info(mesh);
    if (!d) return false;
    d.ziel = zustand === 'zu' ? 1 : 0;
    if (sofort) R.carBuilder.setzeDach(mesh, d.ziel);
    return true;
  };

  D.umschalten = (mesh) => {
    const d = info(mesh);
    if (!d || D.zustand(mesh) === 'faehrt') return null;
    d.ziel = d.ziel ? 0 : 1;
    return d.ziel ? 'zu' : 'offen';
  };

  D.schritt = (mesh, dt) => {
    const d = info(mesh);
    if (!d || d.p === d.ziel || !(dt > 0)) return;
    const s = dt / D.DAUER;
    const p = d.ziel > d.p ? Math.min(d.ziel, d.p + s) : Math.max(d.ziel, d.p - s);
    R.carBuilder.setzeDach(mesh, p);
  };

  function hinweisText(nr) {
    return nr === 0 ? '🚗 Dach auf/zu: ↑+↓ im Stand' : '🚗 Dach auf/zu: A+D im Stand';
  }

  /** Pro Bild: alle Fahrzeuge animieren; Spieler mit Verdeck: Tastenkombination auswerten. */
  D.frame = (spiel, dt) => {
    if (!spiel || !spiel.fahrzeuge) return;
    const imRennen = spiel.zustand === 'rennen' || spiel.zustand === 'online';
    if (!imRennen && spiel.input && spiel.input.dachFlankenLeeren) spiel.input.dachFlankenLeeren();
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], mesh = f && f.mesh;
      if (!info(mesh)) continue;
      D.schritt(mesh, dt);
      if (!imRennen || !f.istSpieler || !(f.spielerNr >= 0) || f.autopilot || !spiel.input || !spiel.input.dachGeste) continue;
      const zuZweit = spiel.huds ? spiel.huds.length > 1 : false;
      const geste = spiel.input.dachGeste(f.spielerNr, zuZweit);
      const flanke = spiel.input.dachFlanke(f.spielerNr, zuZweit);   // IMMER abholen (auch kurze Tastendrucke zwischen zwei Bildern bei niedrigen fps)
      if (spiel.pausiert) { f._dachGeste = geste; f._dachHalt = 0; continue; }   // Pause: Flanke verworfen, nach „Weiter“ löst nichts aus
      // einmaliger Hinweis zu Rennbeginn
      if (!f._dachHinweis && spiel.huds && spiel.huds[f.spielerNr] && spiel._meldung) {
        f._dachHinweis = true;
        spiel._meldung(i, hinweisText(f.spielerNr), 4500);
      }
      const v = f.vehicle;
      const tempo = v ? Math.abs(v.vLaengs !== undefined ? v.vLaengs : 0) : 0;
      f._dachSperre = Math.max(0, (f._dachSperre || 0) - dt);
      if (tempo < D.STAND) {
        // Umschalten NUR im Stand und nur bei neu entstandener Geste (Flanke; Touch: Geste neu gehalten)
        if (flanke || (geste && !f._dachGeste)) D.umschalten(mesh);
        f._dachHalt = geste ? (f._dachHalt || 0) + dt : 0;
      } else {
        // In Fahrt nie umschalten. „Erst anhalten!“ nur, wenn beide Tasten wirklich ≥ 0,3 s zusammen gehalten werden – und höchstens 1× je 10 s
        f._dachHalt = geste ? (f._dachHalt || 0) + dt : 0;
        if (f._dachHalt >= 0.3 && f._dachSperre <= 0 && spiel._meldung && D.zustand(mesh) !== 'faehrt') {
          spiel._meldung(i, 'Erst anhalten! ✋', 1400);
          f._dachSperre = 10;
        }
      }
      f._dachGeste = geste;
    }
  };
})();
