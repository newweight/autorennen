// ============================================================
// Z1 – Zufällige Strecke: Anbindung an das Spiel (Browser; Offline-Rennen und Online-Client).
// Die Rechnung selbst steht in track/zufall.js (auch im Server geladen). Hier nur Verdrahtung:
//   R.ZufallSpiel.seedWaehlen(spiel, opt)  Rennseed festlegen (Rennstart offline: Zufall; online: vom Server in der start-Nachricht)
//   R.ZufallSpiel.opt(spiel, daten)        → { seed } für new R.Strecke(…, { zufall }) oder undefined (aus; Stunt-Park nie)
//   R.ZufallSpiel.anwenden(spiel, ev)      Ereignis { runde, n, v } auf Strecke + KI + Dynamik + Grafik anwenden (offline selbst erzeugt, online vom Server)
//   Spiel.streckeAufbauen   umhüllt: nach dem Aufbau Werkstatt-Zonen melden und Dynamik-Stellen angleichen
//   Spiel.physikSchritt     umhüllt: nur OFFLINE – Taktgeber R.Zufall.takt (Rundenwechsel des Führenden, Nachzügler); online liefert der Server die Ereignisse
// Ohne Seed (Einstellung „Zufällige Strecke“ aus, Menühintergrund, Stunt-Park) passiert hier nichts – das Spiel läuft bitgleich wie vorher.
// ============================================================
(function () {
  'use strict';
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Zufall) return;
  const P = R.Spiel.prototype;
  const ZS = R.ZufallSpiel = {};

  function istPark(daten, spiel) {
    return !!(daten && (daten.id === 'stuntpark' || daten.motoFelder || daten.motoKisten)) || !!(spiel && spiel.einstellungen && spiel.einstellungen.stuntpark);
  }

  /** Rennseed für den nächsten streckeSzeneBauen-Aufruf merken (opt.zufall === true; opt.zufallSeed vorgegeben, sonst gewürfelt – nur beim Rennstart erlaubt). */
  ZS.seedWaehlen = function (spiel, opt) {
    spiel._zufallSeed = null;
    if (!opt || opt.zufall !== true) return;
    spiel._zufallSeed = opt.zufallSeed !== undefined && opt.zufallSeed !== null ? (opt.zufallSeed >>> 0) : (Math.floor(Math.random() * 4294967296) >>> 0);
  };

  /** Seed für die Strecke abholen (wird verbraucht: Menühintergrund danach ohne Zufall). */
  ZS.opt = function (spiel, daten) {
    const s = spiel._zufallSeed;
    spiel._zufallSeed = null;
    spiel.zufallSeed = null;
    if (s === null || s === undefined || istPark(daten, spiel)) return undefined;
    spiel.zufallSeed = s;
    return { seed: s };
  };

  function gruppeLoesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) { const m = Array.isArray(c.material) ? c.material : [c.material]; m.forEach((x) => x.dispose()); }
    });
  }

  /** Hindernis-Gruppe neu bauen und tauschen (eine Gruppe mit höchstens 4 Draw-Calls, Aufbau je Neuverteilung wenige Millisekunden). */
  function grafikErneuern(spiel) {
    const st = spiel.strecke;
    if (!st || !spiel.szene || typeof st.hindernisseBauen !== 'function') return;
    const alt = spiel.hindernisGruppe;
    const neu = R.themes.statischVorbereiten(st.hindernisseBauen(), 1);
    spiel.szene.add(neu);
    spiel.hindernisGruppe = neu;
    gruppeLoesen(alt);
  }

  /** Ereignis { runde, n, v } anwenden. → Ergebnis von R.Zufall.ereignis (oder null, wenn die Strecke nicht zufällig ist). */
  ZS.anwenden = function (spiel, ev) {
    const st = spiel.strecke;
    if (!st || !st.zufall || !ev) return null;
    R.Zufall.externAus(st, spiel);
    const erg = R.Zufall.ereignis(st, ev);
    if (!erg) return null;
    // Computerfahrer (KI, Autopilot, Polizei) kennen die neue Hindernis-Liste
    for (const f of spiel.fahrzeuge || []) for (const d of [f.driver, f.autopilot, f.polizeiFahrer]) {
      if (d && typeof d.hindernisseSetzen === 'function') d.hindernisseSetzen(st.hindernisse);
    }
    if (spiel.dynamik) R.Zufall.dynamikSetzen(st, spiel.dynamik);
    if (erg.bewegt.length) grafikErneuern(spiel);
    // Münzen: die Matrizen schreibt muenzen.animieren(zeit) jedes Bild neu (neue Lage, eingesammelte kommen wieder)
    spiel.zufallLetzte = erg;
    return erg;
  };

  // ---------- Verdrahtung ----------
  const streckeAufbauen = P.streckeAufbauen;
  P.streckeAufbauen = function () {
    const r = streckeAufbauen.apply(this, arguments);
    try {
      const st = this.strecke;
      if (st && st.zufall) {
        R.Zufall.externAus(st, this);                 // Werkstatt (Schaden an / Kulisse): Fläche samt Zu-/Ausfahrt bleibt frei (Motorrad-Stationen: unfallStart.js, siehe anwenden)
        if (this.dynamik) R.Zufall.dynamikSetzen(st, this.dynamik);
      }
    } catch (e) { console.error('Zufall (Aufbau):', e); }
    return r;
  };

  const physikSchritt = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    if (this.zustand === 'online' || this.online) return r;
    const st = this.strecke;
    if (!st || !st.zufall || !this.rennen || !this.rennen.gasErlaubt) return r;
    try {
      const ev = R.Zufall.takt(st, R.Zufall.fortschritte(this), dt, this.rennen.runden);
      if (ev) ZS.anwenden(this, ev);
    } catch (e) { console.error('Zufall (Takt):', e); }
    return r;
  };
})();
