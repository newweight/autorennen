# Ergebnis alle_pruefen.sh – GRÜN

- Datum: 05.11.2026 21:53
- Stand: 8b03615 (HEAD-Commit, Zweig grafik-gemeinsam), Basis: origin/motorrad, 33 geänderte Dateien
- Stufe: Pflicht
- Laufzeit: Pflicht-Stufe 572 s (9 min 32 s), gesamt 572 s
- Betroffene Spiele: autorennen motorrad
- Radwelt: bleibt eigenes Repo (/home/claude/radwelt) – hier nicht geprüft

## Je Spiel

- autorennen: GRÜN
- motorrad: GRÜN

## Schritte

| Schritt | Ergebnis | Sekunden | OK | FEHL |
|---|---|---:|---:|---:|
| html_bauen --pruefen | grün | 1 | 1 | 0 |
| node test_kern_profil.js | grün | 3 | 76 | 0 |
| node test_kern_golden.js | grün | 77 | 7 | 0 |
| node test_html_bauen.js | grün | 0 | 10 | 0 |
| node test_physik.js | grün | 1 | 60 | 0 |
| node test_strecke.js | grün | 13 | 1172 | 0 |
| node test_autos.js | grün | 2 | 333 | 0 |
| node test_kollisionen.js | grün | 1 | 71 | 0 |
| node test_wetter.js | grün | 0 | 53 | 0 |
| node test_hindernisse.js | grün | 19 | 793 | 0 |
| node test_pickups.js | grün | 10 | 63 | 0 |
| node test_schanze.js | grün | 14 | 76 | 0 |
| node test_startboost.js | grün | 0 | 34 | 0 |
| node test_schaden.js | grün | 0 | 74 | 0 |
| node test_pokal.js | grün | 2 | 48 | 0 |
| node test_looping.js | grün | 5 | 46 | 0 |
| node test_megastrecke.js | grün | 14 | 18 | 0 |
| node test_zufall.js | grün | 37 | 36 | 0 |
| node test_tribuenen.js | grün | 19 | 0 | 0 |
| node test_spass_s1.js | grün | 7 | 74 | 0 |
| node test_spass_s2.js | grün | 9 | 60 | 0 |
| node test_spass_s3.js | grün | 3 | 41 | 0 |
| node test_spass_s4.js | grün | 5 | 73 | 0 |
| node test_spass_s8.js | grün | 17 | 25 | 0 |
| node test_r4.js | grün | 24 | 58 | 0 |
| node test_netz.js | grün | 151 | 128 | 0 |
| node test_moto.js | grün | 0 | 119 | 0 |
| node test_moto_stunts.js | grün | 11 | 62 | 0 |
| node test_moto_unfall.js | grün | 24 | 39 | 0 |
| node test_moto_m3.js | grün | 0 | 120 | 0 |
| node test_moto_cockpit.js | grün | 1 | 29 | 0 |
| node test_moto_netz.js | grün | 30 | 55 | 0 |
| Rauchtest auto moto (kern_rauch.py) | grün | 72 | 4 | 0 |
