// ============================================================
// Spaß-Paket S2 – Tuning online (Browser; läuft ganz am Ende, alles Umhüllungen von R.Online.Bildschirm):
//   meineWahl()   hängt die eigenen Tuning-Stufen [Motor, Reifen, Bremsen] an raumErstellen / raumBeitreten (der Server klemmt sie auf 0..5)
//   Lobby         Host: Zeile „🔧 Tuning“ (An/Aus, Standard AUS = fair, Klick sendet einstellungen.tuning); Gäste: Hinweiszeile
//   wertSetzen    'tuning' → { t: 'einstellungen', einstellungen: { tuning: bool } } (nur Host)
// Wirkung nur, wenn der Raum Tuning erlaubt: der Server rechnet die Fahrwerte (server/simulation.js), der Browser dieselben (online.js, vorhersage.js).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Online || !R.Online.Bildschirm || !R.SpassTuning) return;
  const B = R.Online.Bildschirm.prototype, T = R.SpassTuning;
  if (B._spassTuning) return;
  B._spassTuning = true;
  const moto = () => window.MOTORRAD === true;

  const meineWahl = B.meineWahl;
  B.meineWahl = function () {
    const w = meineWahl.apply(this, arguments);
    try {
      const e = this.spiel.einstellungen, s = T.stufen(e.fahrer[0], e.autoIds[0]);
      w.tuning = T.alsListe(s);
    } catch (err) { /* ohne Tuning */ }
    return w;
  };

  // S3: Zeile „Tuning“ auch per Tastatur (↑↓ Zeile, ←→ Wert): hinten an die Host-Zeilen angehängt (bestehende Fokus-Nummern bleiben)
  const zeilen = B.zeilen;
  B.zeilen = function () {
    const z = zeilen.apply(this, arguments);
    if (this.istHost && z.indexOf('tuning') < 0) z.push('tuning');
    return z;
  };
  const werte = B.werte;
  B.werte = function (zeile) {
    if (zeile === 'tuning') {
      const an = !!(this.lobby && this.lobby.einstellungen && this.lobby.einstellungen.tuning === true);
      return { wert: an ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🔧 An' }] };
    }
    return werte.apply(this, arguments);
  };

  const wertSetzen = B.wertSetzen;
  B.wertSetzen = function (zeile, k) {
    if (zeile === 'tuning') {
      if (!this.verb || !this.lobby || !this.istHost) return;
      this.verb.senden({ t: 'einstellungen', einstellungen: { tuning: k === 'an' } });
      return;
    }
    return wertSetzen.apply(this, arguments);
  };

  const htmlLobby = B.htmlLobby;
  B.htmlLobby = function () {
    let h = htmlLobby.apply(this, arguments);
    try {
      const an = !!(this.lobby && this.lobby.einstellungen && this.lobby.einstellungen.tuning === true);
      if (this.istHost) {
        const fi = this.zeilen().indexOf('tuning');
        const zeile = `<div class="on-zeile${fi === this.fokus ? ' fokus' : ''}" data-a="fokus:${fi}"><div class="on-label">🔧 Tuning</div><div class="on-werte">` +
          `<span class="pille${an ? '' : ' aktiv'}" data-a="wert:tuning:aus" title="Aus: alle fahren mit denselben Werten (fair)">Aus</span>` +
          `<span class="pille${an ? ' aktiv' : ''}" data-a="wert:tuning:an" title="An: das Tuning aus der Garage zählt, auch für die Computer-Gegner">🔧 An</span></div></div>`;
        h = h.replace('<div class="on-fest">', zeile + '<div class="on-fest">');
      } else {
        h = h.replace(/(<div class="on-zusammen">[\s\S]*?)(<\/div>)/, `$1<br>🔧 Tuning: ${an ? 'an – dein Garage-Tuning zählt' : 'aus (alle gleich)'}$2`);
      }
    } catch (err) { console.error('Spaß (Tuning online):', err); }
    return h;
  };

  R.SpassTuningOnline = { moto };
})();
