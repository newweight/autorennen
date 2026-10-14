#!/bin/bash
# ============================================================================================================
# Autorennen Internet-Schalter – kleiner root-Helfer (LaunchDaemon de.newweight.autorennen.schalter, alle 5 s)
#
# WAS: Der Spielserver (Benutzer „autorennen“, ohne Rechte) schreibt nur eine WUNSCH-DATEI:
#        /Users/Shared/autorennen-steuerung/wunsch.json   =  {"funnel":"an","seit":1760000000000}   (an | aus, Zeit in ms)
#      Dieses Skript liest sie STRENG, schaltet per Tailscale-CLI den Funnel (Internet für Freunde) an/aus,
#      schaltet nach 4 Stunden von selbst aus und schreibt  status.json = {"funnel":"an","bis":<ms>|null,"zeit":<ms>}.
#
# SICHERHEIT (bitte nicht aufweichen):
#  - Der Inhalt von wunsch.json wird NIE in einen Befehl eingesetzt, nie eval. Er wird nur gegen EINE feste Regex geprüft;
#    die Befehle sind feste Texte, gewählt per `case` über die zwei erlaubten Wörter an|aus.
#  - Wunsch-Datei: reguläre Datei (kein Link), Eigentümer = autorennen, Größe ≤ 200 Byte, Inhalt exakt wie oben,
#    „seit“ höchstens 120 s alt/neu (kein Wiederabspielen alter Wünsche), jeden Wunsch nur EINMAL (merkt sich das letzte „seit“).
#  - Der Ordner gehört ROOT (755): autorennen darf nur den Inhalt von wunsch.json ändern, keine Dateien anlegen, ersetzen oder
#    verlinken → root schreibt status.json nie durch einen untergeschobenen Link. Ist der Ordner für andere beschreibbar, schreibt
#    der Helfer nichts und handelt nicht.
#  - Auto-Aus-Zeit und letzter Wunsch liegen in /var/db/autorennen-schalter (root, 700) – nicht aus der Wunsch-Datei.
#  - Aufruf mit Argument (von Hand mit sudo, für die Doppelklick-Dateien):  … an | aus   (nur diese zwei Wörter).
#
# TAILSCALE-ANNAHME (bitte auf dem Mac einmal prüfen): Die CLI der GUI-App  /Applications/Tailscale.app/Contents/MacOS/Tailscale
#  spricht mit dem laufenden Tailscale-Hintergrunddienst über einen lokalen Socket. Als root (LaunchDaemon) sollte das gehen; die
#  GUI-App-CLI hat aber manchmal einen anderen Socket-Pfad. Prüfen:  sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale status
#  Meldet das einen Fehler → Fallback: den Helfer als LaunchAgent des Admin-Benutzers laufen lassen (siehe server/README.md).
# ============================================================================================================
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
umask 077

# --- Einstellungen (Zeilen mit #TEST werden NUR in der Testkopie ersetzt, tests/test_schalter.sh) ---
TS="AUTO"                                                   #TEST
STEU="/Users/Shared/autorennen-steuerung"                   #TEST
STATE="/var/db/autorennen-schalter"                         #TEST
SPIELER="autorennen"                                        #TEST
ORDNER_EIGNER="root"                                        #TEST
JETZT_S_BEFEHL="date +%s"                                   #TEST
AUTO_AUS_S=14400                                            # 4 Stunden
LOKAL="http://127.0.0.1:8444"
PORT_HTTPS="10000"

# Tailscale-CLI suchen: zuerst Homebrew-tailscaled (Systemdienst, läuft schon vor der Anmeldung), sonst alte App
if [ "$TS" = "AUTO" ]; then
  TS=""
  for _k in /opt/homebrew/bin/tailscale /usr/local/bin/tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
    [ -x "$_k" ] && { TS="$_k"; break; }
  done
fi
OS=$(uname)
st_eigner() { if [ "$OS" = Darwin ]; then stat -f '%Su' "$1"; else stat -c '%U' "$1"; fi; }
st_groesse() { if [ "$OS" = Darwin ]; then stat -f '%z' "$1"; else stat -c '%s' "$1"; fi; }
st_modus()   { if [ "$OS" = Darwin ]; then stat -f '%Lp' "$1"; else stat -c '%a' "$1"; fi; }
jetzt_s() { $JETZT_S_BEFEHL; }
protokoll() { echo "$(date '+%F %T') $*" >&2; }

# Tailscale-CLI mit Zeitlimit (20 s), feste Argumente
ts() { /usr/bin/perl -e 'alarm 20; exec @ARGV or exit 127' "$TS" "$@" >/dev/null 2>&1; }
funnel_an()  { ts funnel --bg --https="$PORT_HTTPS" "$LOKAL"; }
funnel_aus() { ts funnel --https="$PORT_HTTPS" off; local a=$?; ts serve --bg --https="$PORT_HTTPS" "$LOKAL" || a=1; return $a; }

# --- Zustand (root-eigene Dateien, nur feste Wörter/Ziffern) ---
mkdir -p "$STATE" 2>/dev/null; chmod 700 "$STATE" 2>/dev/null
lies_wort() {   # Datei, erlaubte-Regex, Standard
  local v=""; [ -f "$1" ] && [ ! -L "$1" ] && v=$(head -c 40 "$1" 2>/dev/null | tr -d '\n')
  if [[ $v =~ $2 ]]; then echo "$v"; else echo "$3"; fi
}
schreibe() { printf '%s' "$2" > "$STATE/$1.neu" && mv -f "$STATE/$1.neu" "$STATE/$1"; }
ZUSTAND=$(lies_wort "$STATE/zustand" '^(an|aus)$' aus)     # was Tailscale gerade tut (nach Erfolg)
SOLL=$(lies_wort "$STATE/soll" '^(an|aus)$' "$ZUSTAND")   # was gewünscht ist
BIS=$(lies_wort "$STATE/bis" '^[0-9]{1,12}$' 0); BIS=$((10#$BIS))   # Auto-Aus (Unix-Sekunden), 0 = keins
LETZTE=$(lies_wort "$STATE/seit" '^[0-9]{1,16}$' 0)       # zuletzt verarbeitetes „seit“

# --- Sperre gegen gleichzeitige Läufe (launchd + Handaufruf) ---
ARG="${1:-}"
SPERRE="$STATE/sperre"
# Dienst-Modus (ohne Argument): still beenden. Handaufruf (mit Argument): Exit 3, damit die .command-Datei es melden kann.
sperre_belegt() { if [ -n "$ARG" ]; then echo "Sperre belegt (anderer Lauf aktiv) – bitte in ein paar Sekunden nochmal." >&2; exit 3; fi; exit 0; }
if ! mkdir "$SPERRE" 2>/dev/null; then
  # veraltete Sperre (> 2 min) wegräumen
  if [ -n "$(find "$SPERRE" -maxdepth 0 -mmin +2 2>/dev/null)" ]; then rmdir "$SPERRE" 2>/dev/null; mkdir "$SPERRE" 2>/dev/null || sperre_belegt; else sperre_belegt; fi
fi
trap 'rmdir "$SPERRE" 2>/dev/null' EXIT

JETZT=$(jetzt_s)
[[ $JETZT =~ ^[1-9][0-9]{8,11}$ ]] || exit 1

# --- 1) Wunsch lesen (Handaufruf mit Argument ODER Wunsch-Datei) ---
neu=""
case "${1:-}" in
  an)  neu=an ;;
  aus) neu=aus ;;
  "")  ;;
  *)   echo "Aufruf: $0 [an|aus]" >&2; exit 2 ;;
esac

wunsch_pruefen() {   # setzt WUNSCH (an|aus) und WSEIT oder gibt 1 zurück
  local f="$STEU/wunsch.json"
  WUNSCH=""; WSEIT=""
  [ -d "$STEU" ] && [ ! -L "$STEU" ] || return 1
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  [ "$(st_eigner "$f")" = "$SPIELER" ] || return 1
  local gr; gr=$(st_groesse "$f"); [[ $gr =~ ^[0-9]+$ ]] && [ "$gr" -le 200 ] && [ "$gr" -gt 0 ] || return 1
  local inh; inh=$(head -c 201 "$f" 2>/dev/null | tr -d '\n')
  [[ $inh =~ ^\{\"funnel\":\"(an|aus)\",\"seit\":([0-9]{1,16})\}$ ]] || return 1
  WUNSCH="${BASH_REMATCH[1]}"; WSEIT="${BASH_REMATCH[2]}"
  [ "$WUNSCH" = an ] || [ "$WUNSCH" = aus ] || return 1
  return 0
}

if [ -z "$neu" ] && wunsch_pruefen; then
  if [ "$WSEIT" != "$LETZTE" ]; then
    schreibe seit "$WSEIT"; LETZTE="$WSEIT"                       # jeden Wunsch nur einmal bearbeiten (auch wenn ungültig)
    JETZT_MS=$((JETZT * 1000))
    diff=$((JETZT_MS - 10#$WSEIT)); [ $diff -lt 0 ] && diff=$((-diff))
    if [ "$diff" -le 120000 ]; then neu="$WUNSCH"; else protokoll "Wunsch zu alt/neu – ignoriert"; fi
  fi
fi

[ -n "$neu" ] && SOLL="$neu"

# --- 2) Auto-Aus ---
if [ "$ZUSTAND" = an ] && [ "$BIS" -gt 0 ] && [ "$JETZT" -ge "$BIS" ]; then SOLL=aus; protokoll "Auto-Aus nach 4 h"; fi

# --- 3) Umsetzen (feste Befehle) ---
if [ "$SOLL" != "$ZUSTAND" ]; then
  case "$SOLL" in
    an)
      if funnel_an; then ZUSTAND=an; BIS=$((JETZT + AUTO_AUS_S)); schreibe bis "$BIS"; protokoll "Funnel AN bis $BIS"
      else SOLL="$ZUSTAND"; protokoll "Funnel AN fehlgeschlagen"; fi ;;
    aus)
      if funnel_aus; then ZUSTAND=aus; BIS=0; schreibe bis 0; protokoll "Funnel AUS"
      else protokoll "Funnel AUS fehlgeschlagen – nächster Versuch in 5 s"; fi ;;   # AUS wird wiederholt, AN nicht
  esac
  schreibe zustand "$ZUSTAND"
fi
schreibe soll "$SOLL"

# --- 4) Status schreiben (nur in einen root-eigenen, nicht von anderen beschreibbaren Ordner) ---
if [ -d "$STEU" ] && [ ! -L "$STEU" ] && [ "$(st_eigner "$STEU")" = "$ORDNER_EIGNER" ]; then
  modus=$(st_modus "$STEU"); modus=${modus: -2}
  if [[ $modus =~ ^[0-7][0-7]$ ]] && [[ ${modus:0:1} != [2367] ]] && [[ ${modus:1:1} != [2367] ]]; then
    if [ "$ZUSTAND" = an ] && [ "$BIS" -gt 0 ]; then B=$((BIS * 1000)); else B=null; fi
    tmp="$STEU/.status.neu"
    if [ ! -L "$STEU/status.json" ] && printf '{"funnel":"%s","bis":%s,"zeit":%s}' "$ZUSTAND" "$B" "$((JETZT * 1000))" > "$tmp"; then
      chmod 644 "$tmp"; mv -f "$tmp" "$STEU/status.json"
    fi
  else
    protokoll "Ordner $STEU ist für andere beschreibbar – kein Status geschrieben"
  fi
fi
# Handaufruf mit Argument: Exit ≠ 0, wenn der Zielzustand nicht erreicht wurde (Dienst-Modus bleibt immer 0)
if [ -n "$ARG" ] && [ "$ZUSTAND" != "$neu" ]; then protokoll "Zielzustand $neu nicht erreicht (ist: $ZUSTAND)"; exit 1; fi
exit 0
