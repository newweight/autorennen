// Schach-Computergegner im Web Worker (damit die Oberfläche nicht hängt). Nachricht: { id, zuege: ['e2e4', …], stufe } → { id, zug: 'e7e5' | null }
importScripts('../../gemeinsam/schach-regeln.js', '../../gemeinsam/schach-ki.js');
self.onmessage = function (e) {
  const d = e.data;
  let zug = null;
  try {
    const p = self.BRETT.Schach.Partie.ausTexten(d.zuege);
    const r = p && self.BRETT.SchachKI.waehle(p, d.stufe);
    zug = r ? r.text : null;
  } catch (err) { zug = null; }
  self.postMessage({ id: d.id, zug });
};
