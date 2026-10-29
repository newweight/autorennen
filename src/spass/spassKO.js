// ============================================================
// Spaß-Paket S4 – „🏁 K.-o.-Rallye“ (Autorennen UND Motorrad; Rechenteil ohne Three.js, kein Math.random, auch in Node testbar):
//   Rennen mit Gegnern. Auf jeder Runde liegen WERTUNGEN gleichmäßig verteilt (config.spass.ko.wertungenJeRunde, Standard 4: bei ¼, ½, ¾ und an der Ziellinie).
//   Haben alle noch fahrenden Fahrer bis auf einen die k-te Wertung passiert (oder ist einer schon bei Wertung k + 1), scheidet der Letzte aus
//   (R.RaceManager: t.ausgeschieden, Ereignis 'raus' – main.js lässt das Fahrzeug freundlich mit einem Puff in die Box verschwinden).
//   Das geht, bis zwei übrig sind: die letzten zwei fahren die restlichen Runden zu Ende, wer zuerst die Ziellinie überquert, gewinnt (der andere ist Zweiter).
//   Läuft über die vorhandene Elimination (rennen.elimination = { ko: true, … }): „Letzter fliegt raus“ bleibt unverändert; ohne ko-Option wird nichts umgeleitet.
//   R.SpassKO.runden(n)        Rundenzahl für n Fahrer (n − 2 Ausscheidungen, dann mindestens eine Runde Finale)
//   R.SpassKO.wertungen(strecke)  [{ nr: Checkpoint-Nummer, … }] je Runde (immer inklusive Ziellinie, Checkpoint 0)
//   R.SpassKO.status(rennen)   { aktive, naechste (Wertung 1..), gesamt, finale }  für die Anzeige
// Online: nicht dabei (Server-Regel müsste die Wertungen nachbauen) – siehe VERLAUF.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.RaceManager || !R.config) return;

  R.config.spass = R.config.spass || {};
  R.config.spass.ko = Object.assign({ wertungenJeRunde: 4, minGegner: 3, zuschauerSekunden: 6 }, R.config.spass.ko || {});
  const CK = () => R.config.spass.ko;

  /** Rundenzahl: n Fahrer → n − 2 Ausscheidungen, W je Runde; danach mindestens eine Finalrunde. */
  function runden(n) {
    const W = CK().wertungenJeRunde, aus = Math.max(0, n - 2);
    return Math.max(2, Math.ceil(aus / W) + 1);
  }

  /** Checkpoint-Nummern der Wertungen einer Runde (aufsteigend; die letzte ist immer 0 = Ziellinie). */
  function wertungen(strecke) {
    const C = strecke.checkpoints.length, W = Math.max(1, Math.min(CK().wertungenJeRunde, C));
    const nr = [];
    for (let j = 1; j < W; j++) {
      const k = Math.round(j * C / W);
      if (k > 0 && k < C && nr.indexOf(k) < 0) nr.push(k);
    }
    nr.sort((a, b) => a - b);
    nr.push(0);
    return nr;
  }

  const P = R.RaceManager.prototype;
  const ko = (r) => !!(r.elimination && r.elimination.ko);

  // ---------- Wertungen zählen: nach dem normalen Checkpoint-Vorgang ----------
  const checkpointErreicht = P._checkpointErreicht;
  P._checkpointErreicht = function (t, cp) {
    if (!ko(this)) return checkpointErreicht.apply(this, arguments);
    const warGestartet = t.gestartet;
    const r = checkpointErreicht.apply(this, arguments);
    if (!this._koWert) this._koWert = wertungen(this.strecke);
    if (cp.nr === 0 && !warGestartet) return r;                    // erstes Überfahren der Startlinie = keine Wertung
    if (this._koWert.indexOf(cp.nr) >= 0) {
      t.koWertung = (t.koWertung || 0) + 1;
      this._melden('wertung', t, t.koWertung);
    }
    // Finale: die Runden sind zu Ende → Ziel (die Elimination setzt das nicht von selbst)
    if (cp.nr === 0 && warGestartet && this._koFinale && !t.imZiel && !t.ausgeschieden && t.runde >= this.runden) this._koZiel(t);
    return r;
  };

  /** Erster Finalist im Ziel = Sieger; der andere wird sofort Zweiter (dann ist das Rennen aus). */
  P._koZiel = function (t) {
    if (this._elimFertig) return;
    t.imZiel = true; t.zielZeit = this.zeit; this.zieleinlaeufe++; t.zielPlatz = 1;
    this._melden('ziel', t);
    const zweiter = this.teilnehmer.find((x) => !x.ausgeschieden && x !== t);
    if (zweiter && !zweiter.imZiel) { zweiter.imZiel = true; zweiter.zielZeit = this.zeit + 0.001; this.zieleinlaeufe++; zweiter.zielPlatz = 2; }
    this._elimFertig = true;
  };

  // ---------- Ausscheiden ----------
  const eliminationPruefen = P._eliminationPruefen;
  P._eliminationPruefen = function (dt) {
    if (!ko(this)) return eliminationPruefen.apply(this, arguments);
    let aktive = this.teilnehmer.filter((t) => !t.ausgeschieden);
    while (aktive.length > 2) {
      const k = this.ausgeschiedene.length + 1;                    // k-te Wertung entscheidet
      const noch = aktive.filter((t) => (t.koWertung || 0) < k);
      if (noch.length > 1 && !aktive.some((t) => (t.koWertung || 0) >= k + 1)) break;     // warten, bis höchstens einer fehlt (außer einer ist schon eine Wertung weiter)
      const kandidaten = noch.length ? noch : aktive;
      const raus = kandidaten.slice().sort((a, b) => a.fortschritt - b.fortschritt)[0];
      raus.ausgeschieden = true;
      raus.ausscheidRunde = k;                                     // hier: Nummer der Wertung
      raus.ausscheidZeit = this.zeit;
      raus.ausscheidNr = this.ausgeschiedene.length + 1;
      this.ausgeschiedene.push(raus);
      aktive = aktive.filter((t) => t !== raus);
      this._melden('raus', raus);
    }
    if (aktive.length <= 2) {
      this._koFinale = true;
      // ein Finalist hat die Runden schon voll (z. B. Überrundete rausgeflogen, er fuhr allein weiter)? dann ist er Sieger
      const fertig = aktive.find((t) => t.runde >= this.runden && !t.imZiel);
      if (fertig) this._koZiel(fertig);
    }
    // alle Menschen raus: noch kurz zuschauen, dann Ergebnis
    const spieler = this.teilnehmer.filter((t) => t.istSpieler);
    const zs = this.elimination.zuschauerSekunden;
    if (!this._elimFertig && spieler.length && spieler.every((t) => t.ausgeschieden) && typeof zs === 'number') {
      this._zuschauZeit += dt;
      if (this._zuschauZeit >= zs) this._elimFertig = true;
    }
  };

  /** Anzeige: wie viele fahren noch, welche Wertung kommt, ist das Finale erreicht. */
  function status(rennen) {
    const aktive = rennen.teilnehmer.filter((t) => !t.ausgeschieden).length;
    const n = rennen.teilnehmer.length, gesamt = Math.max(0, n - 2);
    return { aktive, naechste: Math.min(gesamt, rennen.ausgeschiedene.length + 1), gesamt, finale: aktive <= 2, ausgeschieden: rennen.ausgeschiedene.length };
  }

  R.SpassKO = { runden, wertungen, status };
})();
