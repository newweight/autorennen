// ============================================================
// Motorrad-Klang (Stufe M1, klein): hochdrehendes Einzylinder-Profil für die Crossmaschinen.
// Laufzeit-Erweiterung der Profil-Tabelle R.MotorProfile.profile (src/audio/motorProfile.js bleibt unverändert; fuer(id) schlägt dort
// zur Laufzeit nach). Gilt für alle Crossmaschinen-Varianten (ids „crossmaschine…“). Nur im MOTORRAD-Modus.
// Annahmen (Klangdaten, nicht aus einer Quelle): 450-cm³-Einzylinder-Viertakter, Leerlauf 1600, Begrenzer 11500 /min, 5 Gänge,
// Zündfrequenz = Drehzahl/60 × 1/2 (nur ein Zylinder), „bellend“: kräftige halbe Ordnung, viel Obertöne, kein Nageln, kein Turbo.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  if (window.MOTORRAD !== true || !R.MotorProfile || !R.MotorProfile.profile) return;
  const P = R.MotorProfile.profile;
  const basis = P['mini-cooper'] || P.passat;          // vorhandene Profile liefern alle Pflichtfelder (kurve, lp, formant …)
  const gaenge = (n, r1, rn) => { const a = [], q = Math.pow(rn / r1, 1 / (n - 1)); for (let i = 0; i < n; i++) a.push(r1 * Math.pow(q, i)); return a; };

  const einzylinder = Object.assign({}, basis, {
    id: 'crossmaschine', name: 'Crossmaschine 450 Einzylinder', bauart: 'Einzylinder-Viertakter', zyl: 1, hubraum: 450, ps: 60,
    leerlauf: 1600, rpmMax: 11500, rpmVmax: 9800, startRpm: 5200, hoch: 7200, hochVoll: 10600, runter: 4200,
    gaenge: gaenge(5, 3.4, 0.95), schaltZeit: 0.06, steigK: 26, fallK: 20,
    wave: { slope: 0.7, odd: 1.3, bump: [4, 3, 1.2] }, halb: 0.62, beat: 0.01, wobble: 12,
    klopf: 0, klopfHz: 2200, klopfQ: 0.8, klopfDuty: 0.2,
    formant: { hz: 850, db: 5, q: 1.4 }, cut0: 900, cut1: 2800, cutGas: 1300,
    turbo: 0, knallen: 0.5, pegel: 1.0, sub: 0.12, ansaug: 0.5, det: 0.004, saege: 0.89, tonK: 0,
  });
  delete einzylinder.tonK;
  P.crossmaschine = einzylinder;
  ['rot', 'blau', 'gruen', 'gelb', 'lila', 'tuerkis', 'pink'].forEach((f) => {
    P['crossmaschine-' + f] = Object.assign({}, einzylinder, { id: 'crossmaschine-' + f });
  });
})();
