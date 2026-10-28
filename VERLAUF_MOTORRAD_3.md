# Verlauf Motorrad – Sitzung ab 28.10.2026

Reihenfolge laut Sebastian: 0 Schräglage smoother → M3 → M4 → G1 → G2 → G4. Sparsam, Sonnet-Agenten (Effort mittel, M4 hoch), Bildprüfung Sonnet.
Mac-Ordner ~/Desktop/Spiele war iCloud-„nur Cloud“ → Arbeit aus GitHub-Zweig `motorrad`.

- 28.10. 07:10 Start Punkt 0: Sonnet-Agent baut schraeglage.js neu (Gierrate glätten, kritisch gedämpfte Feder, Ratenbegrenzung, dt-genau), Messung vorher/nachher.
- 28.10. Werkbank auf dem M2 angelegt: ~/Desktop/Spiele/werkbank (auftrag/ → ergebnis/), Start: bash ~/Desktop/Spiele/werkbank/werkbank.command
- 28.10. Punkt 0 fertig (f53bc20): Gierrate-Tiefpass τ 0,10 s, kritisch gedämpfte Feder 90 % in 0,28 s, Rate ≤ 90°/s, Deckel 45°, Konfig über Rennspiel.Moto.lageKonfig; Cockpit-Kippung τ 0,1 s. Messung: Ruck 12–72× kleiner, Verzögerung ~120 → ~230 ms, max. Lage ~35 → ~34°. Alle Tests 0 FEHL, Regel (nur neue/Moto-Dateien) eingehalten. Sicherungszweig stand-m0.
