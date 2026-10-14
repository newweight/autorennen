#!/bin/bash
# Spiel für Freunde OHNE Tailscale aus dem Internet erreichbar machen. Geht nach 4 Stunden von selbst wieder aus.
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
"$TS" funnel --bg --https=8443 http://127.0.0.1:8444 >/dev/null 2>&1 || { echo "❌ Funnel ging nicht an."; read -r -p "Enter …" _; exit 1; }
NAME=$("$TS" status --json 2>/dev/null | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)
nohup /bin/bash -c "sleep 14400; '$TS' funnel --https=8443 off; '$TS' serve --bg --https=8443 http://127.0.0.1:8444" >/dev/null 2>&1 &
echo "🌐 Internet-Zugang AN für 4 Stunden: https://${NAME:-mac-mini-von-sebastian.tail39c1c2.ts.net}:8443/"
echo "   Früher aus: „🔒 Internet-Zugang AUS.command“"
read -r -p "Enter zum Schließen … " _
