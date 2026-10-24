# PLAN Motorrad – Stufe M1 (24.10.2026, sparsam)
Zweig `motorrad` im Repo newweight/autorennen (Basis v34). Regel: NUR neue Dateien, keine bestehende Datei ändern.
- [ ] Motorrad.html (Kopie Autorennen.html + window.MOTORRAD + src/moto/*.js)
- [ ] src/moto/: Katalog Crossmaschine (Spieler + KI), Modell + Fahrer (aus Radwelt fahrer.js abgeleitet), automatische Schräglage (nur Anzeige), Sturz = Purzelbaum, Motorklang, Menü-Anpassung (Online aus, Schaden/Abschleppwagen aus)
- [ ] tests/test_moto.js (Node) + 1 Browser-Rauchtest mit Bild
- [ ] Prüfung (Hauptmodell): git diff nur neue Dateien, Tests, Bild ansehen
- [ ] Sichern: Commit + Tag m1 auf Zweig motorrad, Mac-Ordner

# Stufe M2 Stunts (beauftragt 24.10., nach M1-Prüfung, sparsam: 1 Sonnet-Agent, nur neue Dateien)
- [ ] Schanzen im Motorrad-Modus an (vorhandene track/schanze.js nutzen), Salto/Drehung per Taste in der Luft (gelingt fast immer)
- [ ] Feuerring über Schanzen (Treffer-Bonus), Bus-/Autoreihe hinter einer Schanze
- [ ] Wheelie-/Stoppie-Zonen (markierte Abschnitte, Taste)
- [ ] Stuntpunkte + Combo im HUD, Modus „Stuntrennen“ (Platz + Punkte)
- [ ] KI macht einfache Stunts
- [ ] Prüfung + Tag m2
