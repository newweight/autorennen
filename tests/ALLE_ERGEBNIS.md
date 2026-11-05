# Ergebnis alle_pruefen.sh – GRÜN

- Datum: 05.11.2026 17:10
- Stand: 82e55bb (Zweig grafik-gemeinsam), Basis: origin/motorrad, 30 geänderte Dateien
- Stufe: Pflicht
- Laufzeit: Pflicht-Stufe 499 s (8 min 19 s), gesamt 499 s
- Betroffene Spiele: autorennen motorrad
- Radwelt: noch nicht umgezogen (Eintrag in spiele.json, Radwelt-Repo: /home/claude/radwelt) – hier NICHT geprüft

## Je Spiel

- autorennen: GRÜN
- motorrad: GRÜN

## Schritte

| Schritt | Ergebnis | Sekunden | OK | FEHL |
|---|---|---:|---:|---:|
| html_bauen --pruefen | grün | 0 | 1 | 0 |
| node test_kern_profil.js | grün | 3 | 74 | 0 |
| node test_kern_golden.js | grün | 67 | 7 | 0 |
| node test_physik.js | grün | 0 | 60 | 0 |
| node test_strecke.js | grün | 12 | 1172 | 0 |
| node test_autos.js | grün | 2 | 333 | 0 |
| node test_kollisionen.js | grün | 1 | 71 | 0 |
| node test_wetter.js | grün | 0 | 53 | 0 |
| node test_hindernisse.js | grün | 18 | 793 | 0 |
| node test_pickups.js | grün | 9 | 63 | 0 |
| node test_schanze.js | grün | 11 | 76 | 0 |
| node test_startboost.js | grün | 0 | 34 | 0 |
| node test_schaden.js | grün | 1 | 74 | 0 |
| node test_pokal.js | grün | 1 | 48 | 0 |
| node test_looping.js | grün | 4 | 46 | 0 |
| node test_megastrecke.js | grün | 14 | 18 | 0 |
| node test_zufall.js | grün | 30 | 36 | 0 |
| node test_tribuenen.js | grün | 18 | 0 | 0 |
| node test_spass_s1.js | grün | 5 | 74 | 0 |
| node test_spass_s2.js | grün | 7 | 60 | 0 |
| node test_spass_s3.js | grün | 2 | 41 | 0 |
| node test_spass_s4.js | grün | 5 | 73 | 0 |
| node test_spass_s8.js | grün | 14 | 25 | 0 |
| node test_r4.js | grün | 20 | 58 | 0 |
| node test_netz.js | grün | 140 | 128 | 0 |
| node test_moto.js | grün | 0 | 119 | 0 |
| node test_moto_stunts.js | grün | 11 | 62 | 0 |
| node test_moto_unfall.js | grün | 19 | 39 | 0 |
| node test_moto_m3.js | grün | 1 | 120 | 0 |
| node test_moto_cockpit.js | grün | 0 | 29 | 0 |
| node test_moto_netz.js | grün | 29 | 55 | 0 |
| Rauchtest auto moto (kern_rauch.py) | grün | 55 | 4 | 0 |
