# 🚗 Autorennen – Anleitung

## Starten
- Doppelklick auf **„🚗 Autorennen starten"** (im Ordner Spiele) – öffnet das Spiel in Chrome.
- Geht das nicht: Doppelklick auf `Autorennen/Autorennen starten.command` oder `Autorennen/Autorennen.html`.
- Taste **F** = Vollbild (empfohlen). Kein Internet nötig.

## Steuerung
| | Gas | Bremse / Rückwärts | Lenken | Zurück auf die Strecke |
|---|---|---|---|---|
| Spieler 1 | ↑ | ↓ | ← → | R |
| Spieler 2 | W | S | A D | T |

Weitere Tasten: **C** Kamera (Verfolger / Cockpit / weit), **M** Ton an/aus, **Esc** Pause, **H** Technik-Anzeige, **F** Vollbild.
Im Menü: Pfeile oder WASD bewegen, **Enter** weiter, **Esc** zurück – oder mit der Maus klicken.

## Menü (4 Schritte)
1. **Modus**: Allein gegen Computer oder Zu zweit (geteilter Bildschirm: links Spieler 1, rechts Spieler 2)
2. **Strecke**: Wiese (leicht, schnell) · Wald (kurvig, Baumtunnel, Brücke) · Wüste (lange Geraden, Oase)
3. **Auto**: 8 Autos – VW T-Roc Cabrio, VW Multivan 6.1, VW Passat B8, Porsche 911, BMW M4, Mercedes-AMG GT, Audi RS6 Avant, Mini Cooper
4. **Los!**: Runden (1–10), Computer-Gegner (0–5), Computer-Stärke (leicht / mittel / schwer / unfair), Fahrhilfe je Spieler (aus / wenig / viel)

Die Einstellungen werden gemerkt.

## Tipps
- Eine Runde dauert ungefähr 2 Minuten. Für Kleine: 1–2 Runden, Fahrhilfe „viel", Computer „leicht".
- Abseits der Straße (Gras, Sand) ist das Auto langsam – zurück auf die Straße fahren oder **R** drücken.
- Der Zaun hält das Auto auf der Strecke. Zusammenstöße bremsen nur, es gibt keinen Schaden.
- Die Computer-Autos fahren fair: Wer hinten liegt, holt etwas auf; wer vorne liegt, wird gebremst („Gummiband").

## Bei Problemen
- Ruckelt es: andere Programme schließen; in `src/config.js` `pixelRatioMax` auf 1 setzen.
- Zwei Spieler gleichzeitig: manche Tastaturen können nicht alle Tasten gleichzeitig – kurz testen (↑ + ← + W + A halten). Tasten lassen sich in `src/config.js` unter `tasten` ändern.
