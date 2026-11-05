# Ergebnis alle_pruefen.sh – GRÜN

- Datum: 05.11.2026 18:53
- Stand: 46e8900 (Zweig grafik-gemeinsam), Basis: origin/motorrad, 31 geänderte Dateien
- Stufe: Voll (Pflicht + Matrix --schnell)
- Laufzeit: Pflicht-Stufe 478 s (7 min 58 s), gesamt 1416 s
- Betroffene Spiele: autorennen motorrad
- Radwelt: bleibt eigenes Repo (/home/claude/radwelt) – hier nicht geprüft

## Je Spiel

- autorennen: GRÜN
- motorrad: GRÜN

## Schritte

| Schritt | Ergebnis | Sekunden | OK | FEHL |
|---|---|---:|---:|---:|
| html_bauen --pruefen | grün | 0 | 1 | 0 |
| node test_kern_profil.js | grün | 2 | 74 | 0 |
| node test_kern_golden.js | grün | 62 | 7 | 0 |
| node test_physik.js | grün | 0 | 60 | 0 |
| node test_strecke.js | grün | 11 | 1172 | 0 |
| node test_autos.js | grün | 2 | 333 | 0 |
| node test_kollisionen.js | grün | 1 | 71 | 0 |
| node test_wetter.js | grün | 0 | 53 | 0 |
| node test_hindernisse.js | grün | 17 | 793 | 0 |
| node test_pickups.js | grün | 8 | 63 | 0 |
| node test_schanze.js | grün | 13 | 76 | 0 |
| node test_startboost.js | grün | 0 | 34 | 0 |
| node test_schaden.js | grün | 1 | 74 | 0 |
| node test_pokal.js | grün | 0 | 48 | 0 |
| node test_looping.js | grün | 5 | 46 | 0 |
| node test_megastrecke.js | grün | 12 | 18 | 0 |
| node test_zufall.js | grün | 27 | 36 | 0 |
| node test_tribuenen.js | grün | 17 | 0 | 0 |
| node test_spass_s1.js | grün | 5 | 74 | 0 |
| node test_spass_s2.js | grün | 7 | 60 | 0 |
| node test_spass_s3.js | grün | 1 | 41 | 0 |
| node test_spass_s4.js | grün | 5 | 73 | 0 |
| node test_spass_s8.js | grün | 14 | 25 | 0 |
| node test_r4.js | grün | 18 | 58 | 0 |
| node test_netz.js | grün | 135 | 128 | 0 |
| node test_moto.js | grün | 0 | 119 | 0 |
| node test_moto_stunts.js | grün | 10 | 62 | 0 |
| node test_moto_unfall.js | grün | 20 | 39 | 0 |
| node test_moto_m3.js | grün | 1 | 120 | 0 |
| node test_moto_cockpit.js | grün | 0 | 29 | 0 |
| node test_moto_netz.js | grün | 29 | 55 | 0 |
| Rauchtest auto moto (kern_rauch.py) | grün | 55 | 4 | 0 |
| node test_spass_s5.js | grün | 38 | 62 | 0 |
| node test_spass_s6.js | grün | 49 | 69 | 0 |
| node test_spass_s7.js | grün | 41 | 67 | 0 |
| node test_r2_online.js | grün | 68 | 72 | 0 |
| node test_r3_tricks.js | grün | 64 | 98 | 0 |
| node test_schalter_v26.js | grün | 40 | 48 | 0 |
| matrix_alle.py --spiel auto --schnell | grün | 329 | 7 | 0 |
| matrix_alle.py --spiel moto --schnell | grün | 309 | 7 | 0 |
