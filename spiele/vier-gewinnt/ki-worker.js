// Rechnet den Computerzug im Hintergrund (wie DispatchQueue.global in der Swift-App), damit die Oberfläche bedienbar bleibt.
importScripts('../gemeinsam/vier-ki.js');
self.onmessage = function (e) {
  const m = e.data;
  self.postMessage({ id: m.id, spalte: self.BRETT.VierKI.bestMove(m.grid, m.chip, m.tiefe) });
};
