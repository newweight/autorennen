#!/bin/bash
# ============================================================
# Jonas Hot Steering Wheel – Mehrspieler-Server starten (Doppelklick im Finder)
#
# Startet server/server.js auf Port 8444 (Spiel + WebSocket /ws) und öffnet http://localhost:8444.
# Übers Internet erst, wenn zusätzlich Tailscale Funnel läuft (Befehl wird unten angezeigt) –
# oder gleich „Mehrspieler im Internet starten.command“ nehmen.
# Beenden: Ctrl+C oder das Terminal-Fenster schließen.
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
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
ADRESSE="https://mac-mini-von-sebastian.tail39c1c2.ts.net:$HTTPS_PORT/"

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
  [ -n "$NAME" ] && ADRESSE="https://$NAME:$HTTPS_PORT/"
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

# --- warten, bis der Server antwortet (bis zu 60 s; beim ersten Start nach iCloud-Download dauert das länger) ---
BEREIT=0; HINWEIS=0; LETZTE_MELDUNG=0
START=$SECONDS
while [ $((SECONDS - START)) -lt 60 ]; do
  if ! kill -0 "$SERVER" 2>/dev/null; then
    echo ""
    echo "❌ Server ist abgestürzt – Meldung oben lesen"
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
echo "🌐 Damit Gäste übers Internet mitspielen können, in einem ZWEITEN Terminal-Fenster:"
echo "   $TS funnel --https=$HTTPS_PORT $PORT"
echo "   Öffentliche Adresse für die Gäste:  $ADRESSE"
echo "   (Funnel danach wieder aus: $TS funnel --https=$HTTPS_PORT off)"
echo ""
wait "$SERVER"
