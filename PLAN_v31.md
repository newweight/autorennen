# Plan v31 (17.10.2026) – Rückmeldung nach v30. Basis v30. Nix verschlimmbessern.

H1 Looping: „Autos fahren irgendwann außen“ – KI-/Spieler-Autos verlassen den Looping seitlich bzw. fahren außen an der Röhre? Reproduzieren (Fantasie, Welt Stunt/Alles, 8 Gegner, 3 Runden, Screenshots/Positionslog je Auto im Looping), Ursache (Looping-Pose vs. Physik, Seitenversatz q beim Einstieg zu groß → Auto hängt außen, Rempeln im Looping, Tier/Verkehr-Ausweichen am Einstieg?), Fix minimal (Einstiegs-Fang: q auf ±Halbbreite klemmen, im Looping kein Ausweichen/kein seitlicher Stoß).
H2 Zweispieler (Split-Screen): Rückspiegel fehlt – je Hälfte einen Rückspiegel (oben Mitte der Hälfte), Leistung prüfen (2 Spiegel-Renderings → Auflösung halbieren).
H3 Zweispieler am gleichen Rechner: Spieler mit WASD muss die LINKE Bildhälfte haben, Pfeiltasten die RECHTE (Tastatur-Lage). Heute vertauscht? Prüfen und umdrehen (nur Zuordnung Hälfte↔Steuerung, Fahrerwahl/Namen bleiben). Menü-Hinweis „links WASD · rechts Pfeile“.
H4 Windows-Laptop mit Touchscreen über Internet: Touch-Steuerung (Handy-Modus, Pfeil-Knöpfe, Stern) erschien, obwohl Tastatur da. Erkennung heute vermutlich ontouchstart/pointer:coarse. Neu: Touch-Knöpfe nur, wenn KEINE Tastatur benutzt wird – erster Tastendruck blendet sie aus (Merken in localStorage), erste Berührung blendet sie wieder ein; zusätzlich kleiner Knopf „🎮 Touch an/aus“ im Pausemenü/HUD. Handy/iPad unverändert.
Ablauf: Agent A (Sonnet) H1 · Agent B (Sonnet) H2+H3 · Agent C (Sonnet) H4 · Gegenlesen (Opus kurz) · Tests einzeln · sichern v31 · Installer Mini.
Status: [x] H1 (+Fang ohne Ruck, Kolonne) [x] H2 [x] H3 [x] H4 [x] Gegenlesen (Mensch-Fang entfernt, Touch-Hinweis) [x] gesichert v31

## Nachträge 19.10. (Rückmeldung Mini, v31 – vorher Cache-Verdacht klären!)
N1 Auto fährt durch Abschleppwagen (offline oder online? Welche Strecke?) – reproduzieren: Teilnehmer↔Abschleppwagen-Kollision offline (collisions.js Verkehr) und online (simulation.js Z.76-79 stößt Verkehr; v28c trennen() Anzeige).
N2 Im Grünen nach Crash/Öl: Lenkung links/rechts „funktioniert nicht wirklich“ – prüfen: Gras-Grip + Öl-Status + Schaden-Lenkstufe kumuliert → Lenkung fast null? Ölfleck-Effekt endet? Mindest-Lenkwirkung im Gras sicherstellen (kindgerecht).
N3 Garage/Upgrade-Bildschirm: Karte „🔧 Garage“ unter Modus-Karten + Taste G – Sebastian findet sie nicht → sichtbarer machen (eigener Menü-Schritt oder Knopf oben), prüfen ob bei 1280×800 im Bild.
N4 Start mit Garage-Restschaden – Entscheidung Sebastian ausstehend (jeder Start 100 %?).
v31b (Zoom-Sperre) gebaut, menu+rennen grün, noch nicht gesichert/installiert.
