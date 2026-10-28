// ============================================================
// Motorrad-Start (Stufe M1): läuft NACH src/main.js, nur mit window.MOTORRAD === true. Alle Eingriffe sind Umhüllungen zur Laufzeit,
// keine Datei im Repo wird geändert (Autorennen.html lädt dieses Skript nicht).
//
//   Spiel.rennenStarten      umhüllt: Voreinstellungen erzwingen (Schaden, Krankenwagen, Abschleppwagen, Geisterfahrer, „Nur Rennautos“ aus;
//                            Autowahl auf eine Crossmaschine, falls die gespeicherte/Standard-Autowahl ein Auto war)
//   Menue.zeigen             umhüllt: ungültige Autowahl (Standard 'troc-cabrio'/'multivan') auf Crossmaschinen setzen
//   Menue.zeichnen           umhüllt: Zeilen „Schaden“ und „Verkehr“ ausblenden (gelten im Motorradmodus nicht), Menütexte Auto → Motorrad
//   Menue.htmlOnlineKarte    ersetzt: Online-Karte ausblenden (Server kennt die Motorräder erst ab M4); onlineOeffnen/modusKarte('online') ohne Wirkung
//   R.Online.verfuegbar      ersetzt: immer false
//   Spiel.physikSchritt, R.dach.frame   umhüllt in schraeglage.js (Schräglage, Sturz-Purzelbaum)
// Zweispieler-Split am selben Rechner bleibt unverändert.
// ============================================================
(function () {
  if (window.MOTORRAD !== true) return;
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Menue) return;

  const AUS = { schaden: false, krankenwagen: false, abschleppwagen: false, geisterfahrer: false, verkehr: 'aus', nurRennautos: false };
  const STANDARD_IDS = ['crossmaschine', 'crossmaschine-rot'];

  /** Autowahl prüfen: ungültige ids (z. B. alte Standardwerte der Autos) durch Crossmaschinen ersetzen. */
  function autoWahlReparieren(e) {
    if (!e) return;
    const ok = (id) => R.carCatalog.waehlbare().some((a) => a.id === id);
    if (!Array.isArray(e.autoIds)) e.autoIds = STANDARD_IDS.slice();
    for (let i = 0; i < 2; i++) if (!ok(e.autoIds[i])) e.autoIds[i] = STANDARD_IDS[i];
    if (e.autoVorFormel) e.autoVorFormel = null;
  }

  // --- Spiel ---
  const rennenStarten = R.Spiel.prototype.rennenStarten;
  R.Spiel.prototype.rennenStarten = function (einst, opt) {
    Object.assign(this.einstellungen, AUS);
    autoWahlReparieren(this.einstellungen);
    const e2 = einst ? Object.assign({}, einst, AUS) : einst;
    if (e2 && e2.autoIds) { e2.autoIds = e2.autoIds.slice(); autoWahlReparieren(e2); }
    return rennenStarten.call(this, e2, opt);
  };

  // --- Menü ---
  const M = R.Menue.prototype;
  const zeigen = M.zeigen;
  M.zeigen = function () { autoWahlReparieren(this.spiel && this.spiel.einstellungen); return zeigen.apply(this, arguments); };

  // Texte im Menü: Auto → Motorrad (nur Anzeige; ganze Textknoten, exakt)
  const TEXTE = { 'Welches Auto fährst du?': 'Welches Motorrad fährst du?', 'Wählt eure Autos!': 'Wählt eure Motorräder!', 'Auto': 'Motorrad',
    'Du fährst gegen die Computer-Autos': 'Du fährst gegen die Computer-Motorräder', 'Garage – Auto aufmotzen': 'Garage – Motorrad aufmotzen',
    '🔧 Garage – Auto aufmotzen': '🔧 Garage – Motorrad aufmotzen', '🔥 Motorrad-Rennen 🏎️': '🔥 Motorrad-Rennen 🏍️' };
  function texteErsetzen(wurzel) {
    const w = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT, null);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.nodeValue.trim();
      if (TEXTE[t]) n.nodeValue = n.nodeValue.replace(t, TEXTE[t]);
    }
  }

  const zeichnen = M.zeichnen;
  M.zeichnen = function () {
    autoWahlReparieren(this.spiel && this.spiel.einstellungen);
    const r = zeichnen.apply(this, arguments);
    try {
      this.wurzel.querySelectorAll('[data-a^="wert:schaden:"], [data-a^="wert:geister:"], [data-a^="wert:krankenwagen:"], [data-a^="wert:abschleppwagen:"]').forEach((el) => {
        const zeile = el.closest('.zeile'); if (zeile) zeile.style.display = 'none';
      });
      texteErsetzen(this.wurzel);
    } catch (err) { /* nur Optik */ }
    return r;
  };

  M.htmlOnlineKarte = function () { return ''; };
  M.onlineOeffnen = function () { /* Online gibt es für Motorräder erst in M4 */ };
  const modusKarte = M.modusKarte;
  M.modusKarte = function (k) {
    if (k === 'online') {            // Pfeiltasten laufen über die unsichtbare 5. Karte weiter: auf die gegenüberliegende Seite springen
      const e = this.e || {};
      return modusKarte.call(this, (e.spielart || 'rennen') === 'rennen' && e.modus !== 'zwei' ? 'elimination' : 'solo');
    }
    return modusKarte.apply(this, arguments);
  };
  if (R.Online) R.Online.verfuegbar = function () { return false; };

  // --- Schräglage + Purzelbaum ---
  if (R.Moto && R.Moto.schraeglage) R.Moto.haken = R.Moto.schraeglage.installieren();
})();
