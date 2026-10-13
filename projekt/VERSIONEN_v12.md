# v12_2026-10-12_rempeln_online
Basis v11 (unverändert daneben). Neu:
- Online-Lobby: Host wählt „👻 Geister“ oder „💥 Rempeln“ (gemerkt für den nächsten Raum). Gäste sehen den Wert.
- Vorhersage kennt bei Rempeln die anderen Autos (Stellvertreter) → eigener Wagen springt beim Stoß kaum.
- Startskripte warten bis 60 s („⏳ Server lädt noch …“), erkennen Server-Absturz (Funnel geht dann aus).
Tests: alle 22 Node-Tests + test_welten_ki grün, test_netz 52/52, online_test 29/29, menu 175, touch 76.
Zurück zu v11: einfach den v11-Ordner starten.
