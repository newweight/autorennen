// ============================================================
// Stufe R3 – Auto-Tricks online: Server-Zusatz der Simulation (Node, CommonJS; Vorbild server/motoSim.js). Wird NUR in Auto-Räumen mit dem Raum-Schalter
// `tricks` (Standard aus) benutzt; sonst bleibt `simulation.r3` null, spassTricks.js kehrt bei `sim.tricksRaum !== true` sofort zurück und alles ist bitgleich wie vorher.
//
// Der Server rechnet dieselben Tricks wie das Spiel offline (src/spass/spassTricks.js, schrittSpiel), nur mit Netz-Eingaben:
//   - Trick-Taste je Teilnehmer = Eingabe-Bit k (Code 'Trick<Nr>' statt Tastatur), Richtung aus der übertragenen Steuerung (↑ ↓ ← →)
//   - Fassrolle (Taste allein oder + ←/→) und Schraube (+ ↑/↓) in der Luft; unfertiger Trick bei der Landung = Wackeln + Abbremsen (vLaengs × 0,88), nie Schaden (online ist Schaden aus)
//   - Computer-Gegner machen Tricks (kiPlanNeu, Saat aus Strecke + Fahrer-Nr. + Flugnummer; kein Fehltrick)
// Ausgabe: zustand.at[i] = [Code 0 keiner · 4 Fassrolle · 5 Schraube, Fortschritt 0..1, Richtung ±1]; Ereignis { art:'trick', nr, st, name, p, m, g } (st 'fehl' = Wackel-Landung).
// ============================================================
'use strict';

const CODE = { fassrolle: 4, schraube: 5 };

/**
 * @param {object} simulation  die Simulation (server/simulation.js)
 * @param {object} R           Rennspiel-Namensraum des Auto-Kontexts
 * @param {object} e           geprüfte Raum-Einstellungen
 */
function einbauen(simulation, R, e) {
  const sim = simulation.sim, nT = simulation.nT, rd = R.Netz.rund;
  const trick = [];                        // Trick-Taste je Spieler-Nr gehalten?
  sim.input.istGedrueckt = (code) => { const m = /^Trick(\d+)$/.exec(String(code)); return !!(m && trick[+m[1]]); };
  sim.input.wurdeGedrueckt = () => false;
  // Rückrufe aus spassTricks.js (im Browser Meldung/Konfetti/Wackeln der Kamera): hier Ereignisse nur für Menschen
  sim.spassTrickEreignis = (i, x) => { if (i < nT) simulation.ereignisse.push({ an: null, art: 'trick', nr: i, st: x.art, name: x.name, p: x.punkte, m: x.mult, g: x.gesamt }); };
  sim.spassTrickWackeln = (i) => { if (i < nT) { const z3 = sim._t3 && sim._t3.fz[i]; simulation.ereignisse.push({ an: null, art: 'trick', nr: i, st: 'fehl', name: 'Wackel!', p: 0, m: 0, g: z3 ? z3.punkte : 0 }); } };
  return {
    trick,
    nachSchritt() { /* Ereignisse kommen als Rückruf direkt aus dem Physikschritt */ },
    /** zustand.at: je Teilnehmer [Code, Fortschritt, Richtung]. */
    zustand() {
      const S = sim._t3, liste = [];
      for (let i = 0; i < nT; i++) {
        const z3 = S && S.fz[i], t = z3 && z3.trick;
        liste.push(t && CODE[t.art] ? [CODE[t.art], rd(Math.min(1, t.t / t.dauer), 3), t.dir < 0 ? -1 : 1] : [0, 0, 1]);
      }
      return liste;
    },
  };
}

module.exports = { einbauen, CODE };
