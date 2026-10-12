#!/bin/bash
# ============================================================
# Jonas Hot Steering Wheel – Mehrspieler-Server starten (Doppelklick im Finder)
#
# Startet server/server.js auf Port 8443 (Spiel + WebSocket /ws) und öffnet http://localhost:8443.
# Übers Internet erst, wenn zusätzlich Tailscale Funnel läuft (Befehl wird unten angezeigt) –
# oder gleich „Mehrspieler im Internet starten.command“ nehmen.
# Beenden: Ctrl+C oder das Terminal-Fenster schließen.
# ============================================================
cd "$(dirname "$0")" || exit 1
PORT=8443
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
ADRESSE="https://mac-mini-von-sebastian.tail39c1c2.ts.net:$PORT/"

# --- Node: aus dem PATH (ab Version 18), sonst die mitgelieferte Datei ---
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

# --- öffentliche Adresse aus Tailscale lesen (falls vorhanden) ---
if [ -x "$TS" ]; then
  NAME=$("$TS" status --json 2>/dev/null | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const n=JSON.parse(s).Self.DNSName.replace(/\.$/,"");if(n)console.log(n)}catch(e){}})' 2>/dev/null)
  [ -n "$NAME" ] && ADRESSE="https://$NAME:$PORT/"
fi

# --- läuft schon ein Server? ---
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ℹ️  Auf Port $PORT läuft schon etwas (vermutlich der Mehrspieler-Server) – öffne nur das Spiel."
  open "http://localhost:$PORT/"
  read -r -p "Enter zum Schließen … " _; exit 0
fi

"$NODE" server/server.js --port $PORT --oeffentlich "$ADRESSE" &
SERVER=$!
aufraeumen() { kill "$SERVER" 2>/dev/null; wait "$SERVER" 2>/dev/null; echo "👋 Server beendet."; exit 0; }
trap aufraeumen INT TERM HUP

# warten, bis der Server antwortet, dann das Spiel öffnen
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.2
done
if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "http://localhost:$PORT/"; else open "http://localhost:$PORT/"; fi

echo ""
echo "🌐 Damit Gäste übers Internet mitspielen können, in einem ZWEITEN Terminal-Fenster:"
echo "   $TS funnel --https=$PORT $PORT"
echo "   Öffentliche Adresse für die Gäste:  $ADRESSE"
echo "   (Funnel danach wieder aus: $TS funnel --https=$PORT off)"
echo ""
wait "$SERVER"
