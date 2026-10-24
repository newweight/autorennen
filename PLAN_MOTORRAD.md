# PLAN Motorrad – Stufe M1 (24.10.2026, sparsam)
Zweig `motorrad` im Repo newweight/autorennen (Basis v34). Regel: NUR neue Dateien, keine bestehende Datei ändern.
- [x] Motorrad.html (Kopie Autorennen.html + window.MOTORRAD + src/moto/*.js)
- [x] src/moto/: Katalog Crossmaschine (Spieler + KI), Modell + Fahrer (aus Radwelt fahrer.js abgeleitet), automatische Schräglage (nur Anzeige), Sturz = Purzelbaum, Motorklang, Menü-Anpassung (Online aus, Schaden/Abschleppwagen aus)
- [x] tests/test_moto.js (Node) + 1 Browser-Rauchtest mit Bild
- [x] Prüfung (Hauptmodell): git diff nur neue Dateien, Tests, Bild ansehen
- [x] Sichern: Commit + Tag m1 auf Zweig motorrad, Mac-Ordner

# Stufe M2 Stunts (beauftragt 24.10., nach M1-Prüfung, sparsam: 1 Sonnet-Agent, nur neue Dateien)
- [x] Schanzen im Motorrad-Modus an (vorhandene track/schanze.js nutzen), Salto/Drehung per Taste in der Luft (gelingt fast immer)
- [x] Feuerring über Schanzen (Treffer-Bonus), Bus-/Autoreihe hinter einer Schanze
- [x] Wheelie-/Stoppie-Zonen (markierte Abschnitte, Taste)
- [x] Stuntpunkte + Combo im HUD, Modus „Stuntrennen“ (Platz + Punkte)
- [x] KI macht einfache Stunts
- [x] Prüfung + Sicherung stand-m2

# M2b Feinschliff (fertig 24.10., nicht committet)
- [x] Busse erkennbar (Fenster, Räder) · Touch-Trick-Knopf beschriften · Menü-Karte links angeschnitten · Alpen-Ring tief (Ring bleibt tief, Unterkante 0,31 m; Autorennen-Menü 844×390 ebenfalls angeschnitten, nur notiert)

# M2c Unfall-Status + M2d Cockpit/Spiegel (fertig 24.10., nicht committet; beauftragt 24.10.) – zusammen mit M2b, 1 Sonnet-Agent, nur Moto-/neue Dateien
- [x] Sturz-Folgen deterministisch verteilt: Motorrad-Schaden ODER Fahrer verletzt (leicht/selten schwer)
- [x] Motorrad-Zustand % im HUD, Qualm, weniger Tempo; Reparatur in der Werkstatt an der Strecke
- [x] Fahrer leicht verletzt: Pflaster, etwas langsamer, Sanitäter-Station heilt; schwer: kurz Krankenstation (~3 s, Einblendung), danach Verband
- [x] Menü-Schalter „Unfälle: aus / sanft / echt“ (Standard sanft); KI gleich behandelt; kindgerecht, kein Blut
- [x] Zusatz 24.10.: jede Strecke genau 1 Werkstatt + 1 Krankenstation; schwerer Unfall zwischendurch → Krankenwagen holt Fahrer zur Krankenstation bzw. Abschleppwagen bringt Motorrad zur Werkstatt
- [x] Korrektur 24.10.: Werkstatt aus dem Autospiel nutzen; Motorrad-Zustand + Fahrer-Gesundheit in %; schwerer Unfall → Krankenwagen/Abschleppwagen versorgen VOR ORT (1,5 s je 10 %); an Station 0,5 s je 10 %; ab 30 % (beide Werte) darf man mit Gas weiterfahren
- [x] Zusatz 24.10.: Motorrad-Cockpit (Lenker, Tacho, Schräglage gedämpft) + zwei Rückspiegel links/rechts statt einem oben
