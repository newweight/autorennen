#!/bin/bash
# ============================================================
# Jonas Hot Steering Wheel – Mehrspieler-Server + Tailscale Funnel (Doppelklick im Finder)
#
# Wie „Mehrspieler starten.command“, startet zusätzlich den öffentlichen Zugang:
#   Tailscale funnel --https=8443 8443  →  https://<mac>.<tailnet>.ts.net:8443/
# Beim Beenden (Ctrl+C oder Fenster schließen) wird der Funnel wieder abgeschaltet
# (funnel --https=8443 off) – das Spiel ist dann nicht mehr aus dem Internet erreichbar.
# ============================================================
cd "$(dirname "$0")" || exit 1
PORT=8443
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
ADRESSE="https://mac-mini-von-sebastian.tail39c1c2.ts.net:$PORT/"

NODE=""
if command -v node >/dev/null 2>&1 && node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' 2>/dev/null; then
  NODE="node"
elif [ -f "server/bin/node-macos-arm64" ]; then
  NODE="./server/bin/node-macos-arm64"
  chmod +x "$NODE" 2>/dev/null
  xattr -d com.apple.quarantine "$NODE" 2>/dev/null
else
  echo "❌ Node.js fehlt (weder im PATH noch server/bin/node-macos-arm64)."
  read -r -p "Enter zum Schließen … " _; exit 1
fi

if [ ! -x "$TS" ]; then
  echo "❌ Tailscale nicht gefunden ($TS)."
  echo "   Ohne Internet-Zugang starten: „Mehrspieler starten.command“ (nur Heimnetz/dieser Mac)."
  read -r -p "Enter zum Schließen … " _; exit 1
fi
NAME=$("$TS" status --json 2>/dev/null | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const n=JSON.parse(s).Self.DNSName.replace(/\.$/,"");if(n)console.log(n)}catch(e){}})' 2>/dev/null)
[ -n "$NAME" ] && ADRESSE="https://$NAME:$PORT/"

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "❌ Port $PORT ist schon belegt – läuft der Server schon in einem anderen Fenster? Dort beenden und nochmal starten."
  read -r -p "Enter zum Schließen … " _; exit 1
fi

"$NODE" server/server.js --port $PORT --oeffentlich "$ADRESSE" &
SERVER=$!
"$TS" funnel --https=$PORT $PORT &
FUNNEL=$!

aufraeumen() {
  trap - INT TERM HUP
  echo ""
  echo "⏹  Beende Funnel und Server …"
  kill "$FUNNEL" 2>/dev/null
  "$TS" funnel --https=$PORT off >/dev/null 2>&1
  kill "$SERVER" 2>/dev/null
  wait 2>/dev/null
  echo "👋 Fertig – das Spiel ist nicht mehr aus dem Internet erreichbar."
  exit 0
}
trap aufraeumen INT TERM HUP

for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.2
done
if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "http://localhost:$PORT/"; else open "http://localhost:$PORT/"; fi

echo ""
echo "🌐 Öffentliche Adresse für die Gäste:  $ADRESSE"
echo "   (Im Spiel: 🌐 Online → Raum erstellen → Link/QR-Code zeigt diese Adresse, wenn du das Spiel über sie öffnest.)"
echo "   Beenden: Ctrl+C oder dieses Fenster schließen (Funnel geht dabei aus)."
echo ""
wait "$SERVER"
aufraeumen
