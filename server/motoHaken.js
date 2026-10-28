// M4 (Server, nur Motorrad-Kontext): setzt die Schräglage-/Sturz-Umhüllung von Spiel.physikSchritt – im Browser macht das src/moto/motoStart.js (braucht dort
// das Menü, das der Server nicht lädt). Läuft NACH src/main.js und VOR stuntStart.js/unfallStart.js, damit die Umhüllungen in derselben Reihenfolge liegen wie in Motorrad.html.
window.Rennspiel.Moto.haken = window.Rennspiel.Moto.schraeglage.installieren();
