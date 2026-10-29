// ============================================================
// Spaß-Paket S1 – Physik-Umhüllung (Browser UND Server, läuft nach src/main.js): nach jedem Physikschritt prüft sie je Fahrzeug, ob es die Auslöselinie eines
// Trampolins oder einer Kanone überquert hat (R.Spass.nachSchritt in spassKern.js) und leert die Ereignis-Listen (fz.spassE → spiel.spassEreignis, falls vorhanden).
// Ohne Elemente (Strecke ohne `spass`, „Spaß-Elemente: aus“) ruft sie sofort den ursprünglichen physikSchritt auf: bitgleich der alte Weg.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Spass) return;
  const P = R.Spiel.prototype;
  if (P._spassPhysik) return;
  P._spassPhysik = true;
  const orig = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const st = this.strecke, sa = st && st.spass, fahr = this.fahrzeuge;
    if (!sa || !sa.liste.length || !fahr || !fahr.length) return orig.apply(this, arguments);
    const vor = this._spassVor || (this._spassVor = []);
    for (let i = 0; i < fahr.length; i++) {
      const f = fahr[i], v = f.vehicle, fz = f.flug, lp = f.looping;
      const e = vor[i] || (vor[i] = {});
      e.x = v.x; e.z = v.z; e.aus = !fz || fz.aktiv || !!(lp && (lp.aktiv || lp.fallen)) || !!v.verkehr;
    }
    const r = orig.apply(this, arguments);
    for (let i = 0; i < fahr.length; i++) {
      const f = fahr[i], e = vor[i], fz = f.flug;
      if (!fz) continue;
      if (e && !e.aus && !f.ausgeschieden && !fz.aktiv && f.nah) R.Spass.nachSchritt(fz, f.vehicle, st, f.nah, e.x, e.z, dt);
      const q = fz.spassE;
      if (q && q.length) {
        if (typeof this.spassEreignis === 'function') { while (q.length) this.spassEreignis(i, q.shift()); } else q.length = 0;
      }
    }
    return r;
  };
})();
