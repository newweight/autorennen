// ============================================================
// Cabrio-Verdeck auf/zu (14.10. v20) – Zustand, Animation, Tasten. Die Geometrie baut carBuilder.js (form.dach, userData.dach).
//
// Zustände: 'offen' (Standard) | 'zu'; dazwischen 'faehrt' (Animation 3 s, R.dach.DAUER = config.dachRegen.dauer). Umschalten nur im STAND
// (|Geschwindigkeit| < R.dach.STAND = 0,5 m/s); in Fahrt erscheint die Meldung „Erst anhalten!“.
// 15.10. (v24): Das Dach ist jetzt SPIELRELEVANT (Regel: src/cars/dachregel.js, Verdrahtung main.js _dachVorab/physikSchritt): bei Regen/Schnee/Hagel
// und offenem Dach −10 % alle 60 s; Schließen dauert 3 s Stillstand (Gas gesperrt). Dieses Modul ist dafür nur noch Tasten + Optik:
//   • Die Zustandsmaschine liegt in f.dachL (R.DachRegel.neu); die Geste setzt offline f.dachGeste = true (main.js wertet sie im Physikschritt aus),
//     online spiel.online.dachFlag = true (Eingabe-Bit d, der Server entscheidet) – dach.js klappt das Mesh NICHT mehr selbst, sondern folgt f.dachL.ziel.
//   • Ohne Regel (config.dachRegen.an = false oder Auto ohne Zustand) gilt das alte Verhalten (reine Optik, sofortiges Umschalten).
// Alt (v20): Keine Wirkung auf die Fahrphysik (reine Optik: Mesh-Gruppe 'dachGruppe', Überrollbügel nur bei offenem Dach).
//
// Tasten (Prüfung in src/input.js → Input.dachGeste(spielerNr); beide Tasten GLEICHZEITIG, nur die Flanke „beide neu gedrückt“ UND Stand zählt; „Erst anhalten!“ erst nach ≥ 0,3 s gemeinsamem Halten, höchstens 1× je 10 s):
//   Einzelspieler  Spieler 1 (Pfeile):  ↑ + ↓            (Touch: ▲ + ▼ gleichzeitig – steuerung(0) enthält die Touch-Tasten)
//   Zu zweit       Spieler 1 (Pfeile):  ↑ + ↓  oder  ← + →
//                  Spieler 2 (WASD):    W + S  oder  A + D      („Gegentasten“ = die beiden entgegengesetzten Tasten)
//   Während der Klappbewegung wird jede weitere Eingabe ignoriert.
// HUD: einmalig zu Rennbeginn „🚗 Dach auf/zu: ↑+↓ im Stand“ (WASD-Spieler: „A+D“).
// Online (v24): Der Server rechnet Dach, Gas-Sperre und Strafe (zustand.dz / ich.dz, Eingabe-Bit d – server/PROTOKOLL.md); die Mitspieler-Autos zeigen ihr echtes Dach.
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
    DAUER: (R.config && R.config.dachRegen && R.config.dachRegen.dauer) || 3.0,   // Sekunden für auf/zu (v24: 3 s, vorher 2 s)
    STAND: (R.config && R.config.dachRegen && R.config.dachRegen.stand) || 0.5,    // m/s: darunter gilt das Auto als stehend
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

  /** Dach-Zustand (Spiellogik) eines Fahrzeug-Eintrags, bei Bedarf anlegen; null = ohne Regel (altes Verhalten). */
  function logik(f) {
    if (f.dachL === undefined) f.dachL = R.DachRegel ? R.DachRegel.neu(f.auto) : null;
    return f.dachL;
  }

  /** Pro Bild: alle Fahrzeuge animieren; Spieler mit Verdeck: Tastenkombination auswerten. */
  D.frame = (spiel, dt) => {
    if (!spiel || !spiel.fahrzeuge) return;
    const imRennen = spiel.zustand === 'rennen' || spiel.zustand === 'online';
    if (!imRennen && spiel.input && spiel.input.dachFlankenLeeren) spiel.input.dachFlankenLeeren();
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], mesh = f && f.mesh;
      if (!info(mesh)) continue;
      const dl = logik(f);
      // v24: das Mesh folgt dem Zustand der Spiellogik. Lokal gerechnete Autos (offline, eigenes Auto online) zeigen genau die Klappzeit der Logik
      // (p aus rest: Klappen und Gas-Sperre enden im selben Bild); die Mitspieler online (Zustand mit 20 Hz) klappen lokal 3 s nach.
      const d = info(mesh);
      if (dl) {
        const z = dl.ziel ? 1 : 0;
        if (d.ziel !== z) d.ziel = z;
        if (spiel.zustand !== 'online' || !spiel.online || spiel.online.du === i) {
          const p = dl.rest > 0 ? Math.max(0, Math.min(1, z ? 1 - dl.rest / D.DAUER : dl.rest / D.DAUER)) : z;
          if (d.p !== p) R.carBuilder.setzeDach(mesh, p);
        } else D.schritt(mesh, dt);
      } else D.schritt(mesh, dt);
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
        if (flanke || (geste && !f._dachGeste)) {
          if (!dl) D.umschalten(mesh);                                    // ohne Regel: altes Verhalten (nur Optik)
          else if (!(dl.rest > 0)) {                                      // v24: Wunsch an die Spiellogik (offline: main.js; online: der Server per Bit d)
            if (spiel.zustand === 'online' && spiel.online) spiel.online.dachFlag = true; else f.dachGeste = true;
          }
        }
        f._dachHalt = geste ? (f._dachHalt || 0) + dt : 0;
      } else {
        // In Fahrt nie umschalten. „Erst anhalten!“ nur, wenn beide Tasten wirklich ≥ 0,3 s zusammen gehalten werden – und höchstens 1× je 10 s
        f._dachHalt = geste ? (f._dachHalt || 0) + dt : 0;
        if (f._dachHalt >= 0.3 && f._dachSperre <= 0 && spiel._meldung && !(dl && dl.rest > 0) && D.zustand(mesh) !== 'faehrt') {
          spiel._meldung(i, 'Erst anhalten! ✋', 1400);
          f._dachSperre = 10;
        }
      }
      f._dachGeste = geste;
    }
  };
})();
