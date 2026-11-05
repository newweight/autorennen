#!/usr/bin/env bash
# ============================================================
# werkzeuge/alle_pruefen.sh – EINE Prüfung für alle Spiele (Plan gemeinsamer Kern, §4).
#   Regel: Kern/Strecke/Server geändert → dieses Skript muss grün sein, sonst nicht einspielen. Das Skript prüft – nicht Sebastian.
#
# Aufruf (im Repo-Wurzelordner oder von überall):
#   werkzeuge/alle_pruefen.sh                 Pflicht-Stufe (Ziel < 10 Min): geänderte Dateien (git diff gegen die Basis) → betroffene Spiele →
#                                             html_bauen --pruefen, test_kern_profil, test_kern_golden, Node-Tests der betroffenen Spiele, Start-Rauchtest je HTML
#   werkzeuge/alle_pruefen.sh --voll          zusätzlich die längeren Node-Tests je Spiel (spiele.json → tests.voll) und matrix_alle.py je betroffenem Spiel (lang – vor dem Einspielen, gern nachts)
#   Optionen: --basis <git-ref>   Vergleichsstand (Standard origin/motorrad, siehe spiele.json → pruefung.basis)
#             --alles             alle Spiele gelten als betroffen (Gesamtlauf, unabhängig vom git diff)
#             --spiel a,b         bestimmte Spiele erzwingen (Namen aus spiele.json)
#             --node-alle         ALLE Node-Tests tests/test_*.js (nicht nur die Auswahl je Spiel)
#             --matrix-schnell    bei --voll: matrix_alle.py mit --schnell (kleine Teilmenge, ca. 10 Min je Spiel) statt der vollen Matrix
#             --ohne-browser      Rauchtest/Matrix überspringen (nur Node)
#             --trocken           nur den Plan zeigen
# Ausgabe: tests/ALLE_ERGEBNIS.md (Datum, Stand, je Schritt und je Spiel grün/rot, Laufzeiten); Einzelprotokolle in tests/out/alle/. Exit-Code 0 nur bei „grün“.
# ============================================================
set -u
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WURZEL" || exit 2

VOLL=0; MATRIX_SCHNELL=0; ALLES=0; NODE_ALLE=0; OHNE_BROWSER=0; TROCKEN=0; BASIS=""; SPIEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --voll) VOLL=1 ;;
    --alles) ALLES=1 ;;
    --matrix-schnell) MATRIX_SCHNELL=1 ;;
    --node-alle) NODE_ALLE=1 ;;
    --ohne-browser) OHNE_BROWSER=1 ;;
    --trocken) TROCKEN=1 ;;
    --basis) BASIS="$2"; shift ;;
    --spiel) SPIEL="$2"; shift ;;
    -h|--help) sed -n 2,20p "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done

PLANARGS=()
[ -n "$BASIS" ] && PLANARGS+=(--basis "$BASIS")
[ -n "$SPIEL" ] && PLANARGS+=(--spiel "$SPIEL")
[ "$ALLES" = 1 ] && PLANARGS+=(--alles)
PLAN="$(node werkzeuge/alle_plan.js "${PLANARGS[@]+"${PLANARGS[@]}"}")" || { echo "Plan nicht erstellbar"; exit 2; }
plan() { printf '%s' "$PLAN" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));const f=new Function("p","return "+process.argv[1]);const r=f(p);console.log(Array.isArray(r)?r.join(" "):r)' "$1"; }

BASIS_ECHT="$(plan 'p.basis')"
GEAENDERT_N="$(plan 'p.geaendert===null?"?":p.geaendert.length')"
BETROFFEN="$(plan 'p.betroffen')"
read -r -a NODE_IMMER <<< "$(plan 'p.immer.node')"
if [ "$NODE_ALLE" = 1 ]; then read -r -a NODE_SPIELE <<< "$(plan 'p.nodeAlle')"; else read -r -a NODE_SPIELE <<< "$(plan 'p.node')"; fi
read -r -a NODE_VOLL <<< "$(plan 'p.voll')"
read -r -a RAUCH <<< "$(plan 'p.rauch')"
read -r -a MATRIX <<< "$(plan 'p.matrix')"
RADWELT="$(plan 'p.radwelt?"noch nicht umgezogen (Eintrag in spiele.json, Radwelt-Repo: "+p.radwelt.pfad+") – hier NICHT geprüft":"geprüft"')"
KERNGETEILT="$(plan 'p.kernGeteilt.length')"
STAND="$(git rev-parse --short HEAD 2>/dev/null)$( [ -n "$(git status --porcelain 2>/dev/null)" ] && echo '+Änderungen')"

echo "== alle_pruefen: Stand $STAND, Basis $BASIS_ECHT, $GEAENDERT_N geänderte Dateien"
echo "   betroffene Spiele: ${BETROFFEN:-keine}"
echo "   Radwelt: $RADWELT"
[ "$KERNGETEILT" != 0 ] && echo "   Hinweis: $KERNGETEILT geteilte Kern-Dateien (Strecke/Grafik/Welt/Config/main) geändert – Radwelt-Golden beim Umzug (K3) gegenprüfen: node tests/test_kern_golden.js --radwelt-pruefen ."
if [ "$TROCKEN" = 1 ]; then
  echo "   Pflicht: html_bauen --pruefen, ${NODE_IMMER[*]}, Node: ${NODE_SPIELE[*]}, Rauchtest: ${RAUCH[*]}"
  [ "$VOLL" = 1 ] && echo "   Voll: matrix_alle ${MATRIX[*]}"
  exit 0
fi

LOGDIR="tests/out/alle"; mkdir -p "$LOGDIR"; rm -f "$LOGDIR"/*.log
ERG="tests/ALLE_ERGEBNIS.md"
SCHRITTE=()      # "Name|Ergebnis|Sekunden|OK|FEHL|Log"
ROT=0
T_START=$(date +%s)
N=0

# schritt "Name" befehl…  – führt aus, misst Zeit, zählt OK/FEHL-Zeilen, merkt das Ergebnis
schritt() {
  local name="$1"; shift
  N=$((N+1)); local log; log="$LOGDIR/$(printf '%02d' $N)_$(echo "$name" | tr -c 'A-Za-z0-9._-' '_').log"
  local t0 t1 rc ok fehl erg
  t0=$(date +%s)
  "$@" > "$log" 2>&1; rc=$?
  t1=$(date +%s)
  ok=$(grep -c '^OK ' "$log"); fehl=$(grep -c '^FEHL' "$log")
  if [ $rc -eq 0 ] && [ "$fehl" -eq 0 ]; then erg="grün"; else erg="ROT"; ROT=1; fi
  printf '%-6s %-44s %5ss  (OK %s, FEHL %s)\n' "$erg" "$name" "$((t1-t0))" "$ok" "$fehl"
  [ "$erg" = ROT ] && { grep -m8 '^FEHL\|Error\|rc=' "$log" | sed 's/^/         /'; echo "         Protokoll: $log"; }
  SCHRITTE+=("$name|$erg|$((t1-t0))|$ok|$fehl|$log")
}

# ---------------- Pflicht-Stufe ----------------
schritt "html_bauen --pruefen" node werkzeuge/html_bauen.js --pruefen
for t in "${NODE_IMMER[@]}"; do schritt "node $t" node "tests/$t"; done
for t in "${NODE_SPIELE[@]}"; do
  case " ${NODE_IMMER[*]} " in *" $t "*) continue ;; esac
  schritt "node $t" node "tests/$t"
done
T_PFLICHT=$(( $(date +%s) - T_START ))
if [ "$OHNE_BROWSER" = 0 ] && [ "${#RAUCH[@]}" -gt 0 ]; then
  schritt "Rauchtest ${RAUCH[*]} (kern_rauch.py)" python3 tests/kern_rauch.py --spiel "$(IFS=,; echo "${RAUCH[*]}")"
fi
T_PFLICHT=$(( $(date +%s) - T_START ))

# ---------------- Voll-Stufe ----------------
if [ "$VOLL" = 1 ]; then
  for t in "${NODE_VOLL[@]}"; do
    case " ${NODE_IMMER[*]} ${NODE_SPIELE[*]} " in *" $t "*) continue ;; esac
    schritt "node $t" node "tests/$t"
  done
fi
if [ "$VOLL" = 1 ] && [ "$OHNE_BROWSER" = 0 ]; then
  for m in "${MATRIX[@]}"; do
    if [ "$MATRIX_SCHNELL" = 1 ]; then schritt "matrix_alle.py --spiel $m --schnell" python3 tests/matrix_alle.py --spiel "$m" --schnell
    else schritt "matrix_alle.py --spiel $m" python3 tests/matrix_alle.py --spiel "$m"; fi
  done
fi
T_GESAMT=$(( $(date +%s) - T_START ))

# ---------------- Ergebnis ----------------
[ "$ROT" = 0 ] && URTEIL="GRÜN" || URTEIL="ROT"
{
  echo "# Ergebnis alle_pruefen.sh – $URTEIL"
  echo
  echo "- Datum: $(date '+%d.%m.%Y %H:%M')"
  echo "- Stand: $STAND (Zweig $(git rev-parse --abbrev-ref HEAD 2>/dev/null)), Basis: $BASIS_ECHT, $GEAENDERT_N geänderte Dateien"
  echo "- Stufe: $([ "$VOLL" = 1 ] && echo "Voll (Pflicht + Matrix$([ "$MATRIX_SCHNELL" = 1 ] && echo ' --schnell')" || echo 'Pflicht')$([ "$NODE_ALLE" = 1 ] && echo ', alle Node-Tests')$([ "$ALLES" = 1 ] && echo ', Gesamtlauf (--alles)')"
  echo "- Laufzeit: Pflicht-Stufe ${T_PFLICHT} s ($((T_PFLICHT/60)) min $((T_PFLICHT%60)) s), gesamt ${T_GESAMT} s"
  echo "- Betroffene Spiele: ${BETROFFEN:-keine}"
  echo "- Radwelt: $RADWELT"
  echo
  echo "## Je Spiel"
  echo
  for s in $BETROFFEN; do echo "- $s: $URTEIL"; done
  echo
  echo "## Schritte"
  echo
  echo "| Schritt | Ergebnis | Sekunden | OK | FEHL |"
  echo "|---|---|---:|---:|---:|"
  for z in "${SCHRITTE[@]}"; do IFS='|' read -r a b c d e f <<< "$z"; echo "| $a | $b | $c | $d | $e |"; done
} > "$ERG"
echo
echo "== $URTEIL – Pflicht-Stufe ${T_PFLICHT} s, gesamt ${T_GESAMT} s – Ergebnis: $ERG"
exit $ROT
