#!/bin/bash
# ============================================================
# Jonas Hot Steering Wheel – Mehrspieler-Server + Tailscale Funnel (Doppelklick im Finder)
#
# Wie „Mehrspieler starten.command“, startet zusätzlich den öffentlichen Zugang:
#   Tailscale funnel --https=10000 8444  →  https://<mac>.<tailnet>.ts.net:10000/
# Beim Beenden (Ctrl+C oder Fenster schließen) wird der Funnel wieder abgeschaltet
# (funnel --https=10000 off) – das Spiel ist dann nicht mehr aus dem Internet erreichbar.
# ============================================================
cd "$(dirname "$0")" || exit 1
# Läuft der Autostart-Server (installieren.command)? Dann nicht doppelt starten.
if launchctl print system/de.newweight.autorennen >/dev/null 2>&1 || curl -s -o /dev/null --max-time 2 http://127.0.0.1:8444/; then
  echo "ℹ️  Der Autorennen-Server läuft schon automatisch (Autostart)."
  echo "   Spielen: https://mac-mini-von-sebastian.tail39c1c2.ts.net:10000/  (oder hier: http://localhost:8444/)"
  open "http://localhost:8444/" 2>/dev/null
  read -r -p "Enter zum Schließen … " _; exit 0
fi

PORT=8444
HTTPS_PORT=10000   # Tailscale-Port (8443 gehört seit 14.10. einem anderen Projekt)
# Tailscale-CLI: zuerst Homebrew-tailscaled (Systemdienst, läuft vor der Anmeldung), sonst alte App
TS=""; for _k in /opt/homebrew/bin/tailscale /usr/local/bin/tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do [ -x "$_k" ] && { TS="$_k"; break; }; done; [ -n "$TS" ] || TS="/opt/homebrew/bin/tailscale"
ADRESSE="https://mac-mini-von-sebastian.tail39c1c2.ts.net:$HTTPS_PORT/"

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
[ -n "$NAME" ] && ADRESSE="https://$NAME:$HTTPS_PORT/"

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "❌ Port $PORT ist schon belegt – läuft der Server schon in einem anderen Fenster? Dort beenden und nochmal starten."
  read -r -p "Enter zum Schließen … " _; exit 1
fi

"$NODE" server/server.js --port $PORT --oeffentlich "$ADRESSE" &
SERVER=$!
"$TS" funnel --https=$HTTPS_PORT $PORT &
FUNNEL=$!

aufraeumen() {
  trap - INT TERM HUP
  echo ""
  echo "⏹  Beende Funnel und Server …"
  kill "$FUNNEL" 2>/dev/null
  "$TS" funnel --https=$HTTPS_PORT off >/dev/null 2>&1
  kill "$SERVER" 2>/dev/null
  wait 2>/dev/null
  echo "👋 Fertig – das Spiel ist nicht mehr aus dem Internet erreichbar."
  exit 0
}
trap aufraeumen INT TERM HUP

# --- warten, bis der Server antwortet (bis zu 60 s; beim ersten Start nach iCloud-Download dauert das länger) ---
BEREIT=0; HINWEIS=0; LETZTE_MELDUNG=0
START=$SECONDS
while [ $((SECONDS - START)) -lt 60 ]; do
  if ! kill -0 "$SERVER" 2>/dev/null; then
    echo ""
    echo "❌ Server ist abgestürzt – Meldung oben lesen"
    trap - INT TERM HUP
    echo "⏹  Schalte Funnel wieder ab …"
    kill "$FUNNEL" 2>/dev/null
    "$TS" funnel --https=$HTTPS_PORT off >/dev/null 2>&1
    wait 2>/dev/null
    echo "   Funnel ist aus – das Spiel ist nicht mehr aus dem Internet erreichbar."
    read -r -p "Enter zum Schließen … " _; exit 1
  fi
  if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then BEREIT=1; break; fi
  VERGANGEN=$((SECONDS - START))
  if [ "$HINWEIS" -eq 0 ] && [ "$VERGANGEN" -ge 3 ]; then
    echo "⏳ Server lädt noch (beim ersten Start nach iCloud-Download kann das bis zu einer Minute dauern) …"
    HINWEIS=1; LETZTE_MELDUNG=$VERGANGEN
  elif [ "$HINWEIS" -eq 1 ] && [ $((VERGANGEN - LETZTE_MELDUNG)) -ge 10 ]; then
    echo "   … $VERGANGEN s"
    LETZTE_MELDUNG=$VERGANGEN
  fi
  sleep 0.2
done
if [ "$BEREIT" -eq 0 ]; then
  echo "⚠️  Server antwortet nach 60 s noch nicht – ich öffne den Browser trotzdem."
  echo "   Der Server läuft weiter; falls die Seite nicht lädt, in einigen Sekunden neu laden (Cmd+R)."
fi
if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "http://localhost:$PORT/"; else open "http://localhost:$PORT/"; fi

echo ""
if [ "$BEREIT" -eq 1 ]; then
  echo "🌐 Öffentliche Adresse für die Gäste:  $ADRESSE"
else
  echo "🌐 Öffentliche Adresse (sobald der Server antwortet):  $ADRESSE"
fi
echo "   (Im Spiel: 🌐 Online → Raum erstellen → Link/QR-Code zeigt diese Adresse, wenn du das Spiel über sie öffnest.)"
echo "   Beenden: Ctrl+C oder dieses Fenster schließen (Funnel geht dabei aus)."
echo ""
wait "$SERVER"
aufraeumen
