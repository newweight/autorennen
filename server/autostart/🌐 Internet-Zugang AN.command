#!/bin/bash
# Spiel für Freunde OHNE Tailscale aus dem Internet erreichbar machen. Geht nach 4 Stunden von selbst wieder aus.
# Gleicher Weg wie der Schalter im Spiel: der root-Helfer (internet-schalter.sh) macht es – mit demselben Auto-Aus nach 4 h.
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"; H="/Library/PrivilegedHelperTools/de.newweight.autorennen.schalter"
NAME=$("$TS" status --json 2>/dev/null | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)
if [ -f "$H" ]; then
  sudo /bin/bash "$H" an || { echo "❌ Funnel ging nicht an."; read -r -p "Enter …" _; exit 1; }
else   # alte Installation ohne Helfer: wie bisher
  "$TS" funnel --bg --https=8443 http://127.0.0.1:8444 >/dev/null 2>&1 || { echo "❌ Funnel ging nicht an."; read -r -p "Enter …" _; exit 1; }
  nohup /bin/bash -c "sleep 14400; '$TS' funnel --https=8443 off; '$TS' serve --bg --https=8443 http://127.0.0.1:8444" >/dev/null 2>&1 &
fi
echo "🌐 Internet-Zugang AN für 4 Stunden: https://${NAME:-mac-mini-von-sebastian.tail39c1c2.ts.net}:8443/"
echo "   Früher aus: im Spiel (🌐 Online) oder „🔒 Internet-Zugang AUS.command“"
read -r -p "Enter zum Schließen … " _
