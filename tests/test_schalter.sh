#!/bin/bash
# Test des root-Helfers server/autostart/internet-schalter.sh mit Stub-Tailscale in einer TESTKOPIE (Pfade per sed, nur #TEST-Zeilen).
# Aufruf: bash tests/test_schalter.sh      (läuft als normaler Benutzer oder root; ändert nichts außerhalb eines Temp-Ordners)
cd "$(dirname "$0")/.." || exit 1
SRC="$PWD/server/autostart/internet-schalter.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ME=$(id -un); OK=0; BAD=0
ok() { if [ "$2" = 0 ]; then echo "OK   $1"; OK=$((OK+1)); else echo "FEHL $1"; BAD=$((BAD+1)); fi; }
mkdir -p "$T/steu" "$T/state"; chmod 755 "$T/steu"
cat > "$T/ts-stub" <<'EOS'
#!/bin/bash
echo "$*" >> "$(dirname "$0")/log"
[ -e "$(dirname "$0")/fail" ] && exit 1
exit 0
EOS
chmod +x "$T/ts-stub"
echo 1760000000 > "$T/zeit"
mk() {   # Testkopie mit Eigentümer $1 als „autorennen“
  sed -E -e "s|^TS=.*#TEST|TS=\"$T/ts-stub\"|" -e "s|^STEU=.*#TEST|STEU=\"$T/steu\"|" -e "s|^STATE=.*#TEST|STATE=\"$T/state\"|" \
    -e "s|^SPIELER=.*#TEST|SPIELER=\"$1\"|" -e "s|^ORDNER_EIGNER=.*#TEST|ORDNER_EIGNER=\"$ME\"|" -e "s|^JETZT_S_BEFEHL=.*#TEST|JETZT_S_BEFEHL=\"cat $T/zeit\"|" "$SRC" > "$T/h.sh"
}
lauf() { bash "$T/h.sh" "$@" 2>>"$T/err"; }
wunsch() { printf '%s' "$1" > "$T/steu/wunsch.json"; }
zeilen() { [ -f "$T/log" ] && wc -l < "$T/log" || echo 0; }
mk "$ME"
grep -c '#TEST' "$T/h.sh" >/dev/null
[ "$(grep -c '^[A-Z_]*=.*#TEST' "$SRC")" = 6 ]; ok "genau 6 #TEST-Zeilen im Original" $?

# 1 gültiger Wunsch AN
NOW=1760000000; wunsch "{\"funnel\":\"an\",\"seit\":${NOW}000}"; lauf
grep -qx 'funnel --bg --https=10000 http://127.0.0.1:8444' "$T/log"; ok "AN: Funnel-Befehl exakt" $?
grep -q '"funnel":"an","bis":1760014400000,"zeit":1760000000000' "$T/steu/status.json"; ok "AN: status.json an, bis = +4 h" $?
# 2 gleicher Wunsch nochmal → nichts
n=$(zeilen); echo 1760000005 > "$T/zeit"; lauf; lauf; [ "$(zeilen)" = "$n" ]; ok "gleicher Wunsch wird nur einmal bearbeitet" $?
# 3 AUS
echo 1760000100 > "$T/zeit"; wunsch '{"funnel":"aus","seit":1760000100000}'; lauf
tail -2 "$T/log" | tr '\n' '|' | grep -q 'funnel --https=10000 off|serve --bg --https=10000 http://127.0.0.1:8444|'; ok "AUS: funnel off + serve" $?
grep -q '"funnel":"aus","bis":null' "$T/steu/status.json"; ok "AUS: status.json aus, bis null" $?
# 4 bösartige Inhalte
: > "$T/log"; B=("{\"funnel\":\"an; touch $T/pwn\",\"seit\":1760000200000}" "{\"funnel\":\"an\",\"seit\":1760000201000}\$(touch $T/pwn)"
  "{\"funnel\":\"an\",\"seit\":1760000202000};touch $T/pwn" "{\"funnel\":\"AN\",\"seit\":1760000203000}" "{\"funnel\":\"an\",\"seit\":\"1760000204000\"}"
  "{ \"funnel\":\"an\",\"seit\":1760000205000}" "{\"funnel\":\"an\",\"seit\":1760000206000,\"x\":\"\`touch $T/pwn\`\"}" "an" "" "{\"funnel\":\"an\",\"seit\":99999999999999999}"
  "{\"funnel\":\"an\",\"seit\":1760000207000}
{\"funnel\":\"an\"}")
i=0; for w in "${B[@]}"; do i=$((i+1)); echo 1760000250 > "$T/zeit"; wunsch "$w"; lauf; done
[ ! -e "$T/pwn" ]; ok "bösartige Wünsche: nichts ausgeführt (pwn fehlt)" $?
[ "$(zeilen)" = 0 ]; ok "bösartige/ungültige Wünsche: Tailscale nie aufgerufen ($i Fälle)" $?
# 5 riesige Datei mit gültigem Anfang
{ printf '{"funnel":"an","seit":1760000250000}'; head -c 5000 /dev/zero | tr '\0' ' '; } > "$T/steu/wunsch.json"; lauf
[ "$(zeilen)" = 0 ]; ok "Datei > 200 Byte ignoriert" $?
# 6 falscher Eigentümer
if id nobody >/dev/null 2>&1; then mk nobody; wunsch '{"funnel":"an","seit":1760000250000}'; lauf; [ "$(zeilen)" = 0 ]; ok "falscher Eigentümer ignoriert" $?; mk "$ME"
else ok "falscher Eigentümer (übersprungen: kein Benutzer nobody)" 0; fi
# 7 Symlink als wunsch.json
echo '{"funnel":"an","seit":1760000250000}' > "$T/echt.json"; rm -f "$T/steu/wunsch.json"; ln -s "$T/echt.json" "$T/steu/wunsch.json"; lauf
[ "$(zeilen)" = 0 ]; ok "wunsch.json als Symlink ignoriert" $?; rm -f "$T/steu/wunsch.json"
# 8 alter / zukünftiger Wunsch
echo 1760001000 > "$T/zeit"; wunsch '{"funnel":"an","seit":1760000000000}'; lauf; [ "$(zeilen)" = 0 ]; ok "zu alter Wunsch ignoriert" $?
wunsch '{"funnel":"an","seit":1760009000000}'; lauf; [ "$(zeilen)" = 0 ]; ok "Wunsch aus der Zukunft ignoriert" $?
# 9 führende Nullen (Oktal-Falle)
wunsch '{"funnel":"an","seit":0001760001000000}'; lauf 2>/dev/null; grep -q '"funnel":"an"' "$T/steu/status.json"; ok "führende Nullen (Oktal-Falle): wird als Dezimalzahl gelesen, Wunsch ausgeführt" $?
lauf aus; grep -q '"funnel":"aus"' "$T/steu/status.json"; ok "zurück auf AUS (Handaufruf)" $?
# 10 AN, Auto-Aus nach 4 h, kein Wiederabspielen
: > "$T/log"; echo 1760002000 > "$T/zeit"; wunsch '{"funnel":"an","seit":1760002000000}'; lauf
grep -q 'funnel --bg' "$T/log"; ok "AN (zweiter Durchlauf)" $?
echo $((1760002000+14399)) > "$T/zeit"; lauf; grep -q '"funnel":"an"' "$T/steu/status.json"; ok "nach 3:59:59 h noch AN" $?
echo $((1760002000+14400)) > "$T/zeit"; lauf; grep -q '"funnel":"aus","bis":null' "$T/steu/status.json"; ok "nach 4:00 h AUS (Auto-Aus)" $?
n=$(zeilen); echo $((1760002000+14410)) > "$T/zeit"; lauf; lauf; [ "$(zeilen)" = "$n" ]; ok "altes AN-Wunsch-Datei schaltet nach Auto-Aus nicht wieder ein" $?
# 11 Wunsch in der Datei kann bis nicht verlängern: neuer AN-Wunsch → neue 4 h ab jetzt
Z=$((1760002000+20000)); echo $Z > "$T/zeit"; wunsch "{\"funnel\":\"an\",\"seit\":${Z}000}"; lauf
grep -q "\"bis\":$(( (Z+14400)*1000 ))" "$T/steu/status.json"; ok "bis kommt aus der root-Uhr, nicht aus der Datei" $?
# 12 AUS schlägt fehl → wird wiederholt
: > "$T/log"; Z=$((Z+100)); echo $Z > "$T/zeit"; touch "$T/fail"; wunsch "{\"funnel\":\"aus\",\"seit\":${Z}000}"; lauf
grep -q '"funnel":"an"' "$T/steu/status.json"; ok "AUS fehlgeschlagen: Status bleibt ehrlich AN" $?
rm "$T/fail"; Z=$((Z+5)); echo $Z > "$T/zeit"; lauf; grep -q '"funnel":"aus"' "$T/steu/status.json"; ok "AUS wird beim nächsten Durchlauf wiederholt" $?
# 13 AN schlägt fehl → bleibt AUS, keine Wiederholung
: > "$T/log"; Z=$((Z+100)); echo $Z > "$T/zeit"; touch "$T/fail"; wunsch "{\"funnel\":\"an\",\"seit\":${Z}000}"; lauf; rm "$T/fail"; n=$(zeilen)
Z=$((Z+5)); echo $Z > "$T/zeit"; lauf; [ "$(zeilen)" = "$n" ] && grep -q '"funnel":"aus"' "$T/steu/status.json"; ok "AN fehlgeschlagen: bleibt AUS, keine Dauerschleife" $?
# 14 Ordner für andere beschreibbar → kein Status
chmod 777 "$T/steu"; rm -f "$T/steu/status.json"; Z=$((Z+5)); echo $Z > "$T/zeit"; lauf; [ ! -e "$T/steu/status.json" ]; ok "Ordner 777: kein status.json geschrieben" $?; chmod 755 "$T/steu"
# 15 status.json als Symlink wird nicht verfolgt
ln -s "$T/ziel" "$T/steu/status.json"; Z=$((Z+5)); echo $Z > "$T/zeit"; lauf; [ ! -e "$T/ziel" ]; ok "status.json als Symlink: nichts durchgeschrieben" $?; rm -f "$T/steu/status.json"
# 16 Handaufruf
: > "$T/log"; Z=$((Z+5)); echo $Z > "$T/zeit"; lauf an; grep -q 'funnel --bg' "$T/log"; ok "Handaufruf 'an'" $?
lauf aus; grep -q 'funnel --https=10000 off' "$T/log"; ok "Handaufruf 'aus'" $?
n=$(zeilen); lauf 'an; touch '"$T/pwn" 2>/dev/null; r=$?; [ "$r" = 2 ] && [ ! -e "$T/pwn" ] && [ "$(zeilen)" = "$n" ]; ok "Handaufruf mit anderem Argument: Fehler 2, nichts passiert" $?
# 16b Exit-Codes Handaufruf
: > "$T/log"; Z=$((Z+5)); echo $Z > "$T/zeit"; lauf aus >/dev/null 2>&1; lauf an >/dev/null 2>&1; r=$?; [ "$r" = 0 ]; ok "Handaufruf an: Exit 0 bei Erfolg" $?
Z=$((Z+5)); echo $Z > "$T/zeit"; touch "$T/fail"; lauf aus >/dev/null 2>&1; r=$?; rm "$T/fail"; [ "$r" = 1 ]; ok "Handaufruf aus bei Fehlschlag: Exit 1" $?
Z=$((Z+5)); echo $Z > "$T/zeit"; lauf aus >/dev/null 2>&1; lauf aus >/dev/null 2>&1; r=$?; [ "$r" = 0 ]; ok "Handaufruf aus bei Erfolg: Exit 0" $?
Z=$((Z+5)); echo $Z > "$T/zeit"; touch "$T/fail"; lauf an >/dev/null 2>&1; r=$?; rm "$T/fail"; [ "$r" = 1 ]; ok "Handaufruf an bei Fehlschlag: Exit 1" $?
mkdir "$T/state/sperre"; lauf an >/dev/null 2>&1; r=$?; lauf >/dev/null 2>&1; r2=$?; rmdir "$T/state/sperre"; [ "$r" = 3 ] && [ "$r2" = 0 ]; ok "Sperre belegt: Handaufruf Exit 3, Dienst-Modus Exit 0" $?
# 17 Sperre
mkdir "$T/state/sperre"; n=$(zeilen); lauf an; [ "$(zeilen)" = "$n" ]; ok "aktive Sperre: zweiter Lauf tut nichts" $?; rmdir "$T/state/sperre"
# 18 Syntax
bash -n "$SRC"; ok "bash -n internet-schalter.sh" $?
for f in server/autostart/*.command; do bash -n "$f"; ok "bash -n $(basename "$f")" $?; done
echo; echo "$OK OK, $BAD FEHL"; [ "$BAD" = 0 ] && echo "ALLE SCHALTER-TESTS OK"; exit $BAD
