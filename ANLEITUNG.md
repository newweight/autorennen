# 🔥 Jonas Hot Steering Wheel 🏎️ – Anleitung

(Das Autorennen für die ganze Familie.)

## Starten
- Doppelklick auf **„🚗 Autorennen starten"** (im Ordner Spiele) – öffnet das Spiel in Chrome.
- Geht das nicht: Doppelklick auf `Autorennen/Autorennen starten.command` oder `Autorennen/Autorennen.html`.
- Taste **F** = Vollbild (empfohlen). Kein Internet nötig.

## Steuerung
| | Gas | Bremse / Rückwärts | Lenken | Zurück auf die Strecke |
|---|---|---|---|---|
| Spieler 1 | ↑ | ↓ | ← → | R |
| Spieler 2 | W | S | A D | T |

Weitere Tasten: **C** Kamera (Verfolger / Cockpit / weit), **M** Ton an/aus, **Esc** Pause, **H** Leistungs-Anzeige (fps), **F** Vollbild.
Im Menü: Pfeile oder WASD bewegen, **Enter** weiter, **Esc** zurück – oder mit der Maus klicken.
Bei der Fahrer- und Autowahl bewegt Spieler 1 mit den Pfeilen, Spieler 2 mit WASD.

## Menü (5 Schritte)
1. **Modus**: Allein gegen Computer oder Zu zweit (geteilter Bildschirm: links Spieler 1, rechts Spieler 2)
2. **Strecke**: 4 Strecken, jede mit Schwierigkeits-Pille (leicht / mittel / schnell / spaß):
   - **Wiese** (leicht): Hügel, lange Start-Gerade, Steinbrücke über den Teich
   - **Wald** (mittel): viele Kurven, steil rauf und runter, Felstunnel, Baumtunnel, Holzbrücke
   - **Wüste** (schnell): lange Geraden, Tunnel unter der großen Düne, Brücke über die Schlucht
   - **Fantasie** (spaß, lila Karte): kurze Zauberland-Strecke mit 2 Loopings, Bällen und Wasserstrahl (siehe unten)
3. **Fahrer**: Jeder Spieler wählt einen Namen: Emmy, Sara, Jonas, Kerle, Opa, Oma, Elki, Basti, Schumacher, Senna, Verstappen oder Röhrl (Karte mit Emoji). Zwei Spieler können nicht denselben Fahrer wählen. Der Name erscheint im Rennen und in der Ergebnistafel; die Computer-Gegner heißen wie die nicht gewählten Fahrer (zuerst Schumacher, Senna, Verstappen, Röhrl), z. B. „🤖 Senna“.
4. **Auto**: 8 Autos als echte 3D-Modelle – VW T-Roc Cabrio, VW Multivan 6.1, VW Passat B8, Porsche 911, BMW M4, Mercedes-AMG GT, Audi RS6 Avant, Mini Cooper.
   Das gewählte Auto steht groß auf der Bühne und dreht sich langsam von selbst. **Drehen:** Spieler 1 mit **,** und **.**, Spieler 2 mit **Q** und **E**, oder mit der **Maus ziehen**. Die Pfeile/WASD wechseln das Auto.
5. **Los!**: Runden (1–10), Computer-Gegner (0–5), Computer-Stärke, Fahrhilfe je Spieler (aus / wenig / viel)

**Computer-Stärke (7 Stufen):** leicht · mittel · schwer · profi · meister · legende · 💀 unschlagbar (fährt die Ideallinie ohne Fehler – kaum zu schlagen).

Die Einstellungen werden gemerkt.

## Tempo
Alle Autos fahren **220 bis 270 km/h** Höchsttempo (Multivan 220 … Porsche 270). Runden sind dadurch kurz (ca. 75–90 s). Bergauf bremst, bergab beschleunigt das Auto.

## Auf der Strecke
- **Tunnel** (dunkle Röhre mit Lampen; die Scheinwerfer gehen im Tunnel an) und **Brücken** (mit Geländer über Teich, Bach oder Schlucht).
- **Hindernisse** (stehen auf der Fahrbahn, jede Strecke hat 3–5):
  - **Ölfleck**: rutschig – das Auto schlingert, nicht lenken-hektisch, Gas weg.
  - **Sand** auf der Straße: bremst das Auto deutlich.
  - **Baustelle**: die halbe Fahrbahn ist gesperrt – **die freie Hälfte nehmen**. Wer Pylonen trifft, wird langsamer.
  - **Ast**: Hüpfer und danach deutlich langsamer (ca. 40 % weniger Tempo).
  Die Computer-Autos weichen den Hindernissen aus.
- **Fantasie-Strecke:**
  - **Looping** (2 Stück): braucht **mindestens 90 km/h Anlauf**. Wer zu langsam ist, fällt herunter und wird zurück vor die Einfahrt gesetzt („Mehr Anlauf! 🚀“) – also vorher Vollgas.
  - **Bälle** rollen quer über die Straße, ab Runde 2 bzw. in der letzten Runde. Ein Treffer bremst stark (−60 %).
  - **Wasserstrahl**: alle ca. 20 Sekunden schießt eine Fontäne aus dem Boden (vorher blubbert es). Treffer: langsamer und Schlingern.

## Tipps
- Eine Runde dauert ungefähr 75–90 Sekunden (Fantasie kürzer). Für Kleine: 1–2 Runden, Fahrhilfe „viel", Computer „leicht".
- Abseits der Straße (Gras, Sand) ist das Auto langsam – zurück auf die Straße fahren oder **R** drücken.
- Der Zaun hält das Auto auf der Strecke. Zusammenstöße bremsen nur, es gibt keinen Schaden.
- Die Computer-Autos fahren fair: Wer hinten liegt, holt etwas auf; wer vorne liegt, wird gebremst („Gummiband"). Nur „unschlagbar" bekommt kein Gummiband nach vorne.
- Taste **H** zeigt die Leistung (fps, ms je Frame) – siehe „Bei Problemen".

## Bei Problemen
- Ruckelt es: Taste **H** zeigt die Technik-Anzeige – oben fps, darunter ms je Frame für physik / audio / hud / grafik / render,
  Draw-Calls, Dreiecke, pixelRatio und Qualitätsstufe. Ziel: ≥ 50 fps. Ein Foto davon hilft bei der Fehlersuche.
- Das Spiel senkt die Bildschärfe selbst, wenn es länger als 2 s unter 45 fps läuft (und hebt sie über 58 fps wieder an).
  Einstellungen dazu in `src/config.js` unter `grafik`:
  - `pixelRatioMax` (allein, Standard 1.5) und `pixelRatioSplit` (zu zweit, Standard 1.0): kleiner = flüssiger, etwas unschärfer.
  - `adaptiv: false` schaltet das automatische Anpassen aus; `qualitaetsStufen`, `fpsUnten`, `fpsOben` steuern es.
  - `hudHz` (Standard 20): wie oft Tacho und Minimap neu gezeichnet werden.
- Andere Programme/Tabs schließen, Mac ans Netzteil (im Akkubetrieb drosselt macOS manchmal).
- Zwei Spieler gleichzeitig: manche Tastaturen können nicht alle Tasten gleichzeitig – kurz testen (↑ + ← + W + A halten). Tasten lassen sich in `src/config.js` unter `tasten` ändern.
