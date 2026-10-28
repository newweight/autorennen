// Test-Hilfsdatei (M3): Attrappen für Spiel und Garage, damit src/moto/motoM3Start.js ohne Browser geladen werden kann
// (Umhüllungen von rennenStarten, physikSchritt, fahrzeugHinzufuegen, R.Garage.fahrzeugWerte). Wird NACH den Modulen und VOR motoM3Start.js geladen.
(function () {
  const R = window.Rennspiel;
  R.Spiel = class {
    constructor() { this.einstellungen = { streckeId: 'wiese', welt: 'stunt', variante: 'xl', gegner: 5, runden: 3, polizei: true, tiere: true, spielart: 'pokal', stuntrennen: true, stuntpark: false }; this.aufrufe = []; this.katalogWaehrend = null; this.gespeichert = 0; }
    rennenStarten(einst, opt) {
      this.aufrufe.push({ einst, opt });
      this.katalogWaehrend = R.trackCatalog.some((t) => t.id === 'stuntpark');
      this.rennen = { runden: einst && einst.runden !== undefined ? einst.runden : this.einstellungen.runden, zeit: 0 };
      if (einst) this.einstellungen = Object.assign({}, this.einstellungen, einst);
      return 'ok';
    }
    einstellungenSpeichern() { this.gespeichert++; }
    physikSchritt() { return 'phys'; }
    streckeSzeneBauen() { return null; }
    fahrzeugHinzufuegen(auto, x, z, heading, garage) { this.letztes = { auto, garage }; return { auto }; }
  };
  R.Garage = { fahrzeugWerte(name, autoId) { return { farbe: null, vMax: 1, grip: 1, bremsen: 1 }; } };
})();
