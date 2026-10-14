#!/bin/bash
# Autorennen-Server SICHER einrichten (Version 2, Doppelklick; fragt einmal nach deinem Mac-Passwort).
# - eigener, versteckter Standard-Benutzer „autorennen“ (kein Admin, keine Daten) – der Server läuft NUR unter ihm
# - Start beim Hochfahren, auch ohne Anmeldung (LaunchDaemon), Neustart nach Absturz, verhindert Ruhezustand
# - Zugang DAUERHAFT nur im eigenen Tailscale-Netz (tailscale serve) – aus dem offenen Internet unsichtbar
# - Internet für Freunde ohne Tailscale nur bei Bedarf: „🌐 Internet-Zugang AN.command“ (geht nach 4 h von selbst aus)
# - NEU (Internet-Schalter): „🌐 Internet für Freunde“ lässt sich im Spiel (Menü 🌐 Online) von jedem Tailscale-Gerät an/aus schalten.
#   Der Spielserver darf dafür NICHTS ausführen – er schreibt nur eine Wunsch-Datei; ein winziger root-Helfer
#   (LaunchDaemon de.newweight.autorennen.schalter, Skript internet-schalter.sh) prüft sie streng und ruft Tailscale auf (Auto-Aus nach 4 h).
# Nach jeder neuen Spielversion nochmal doppelklicken.
P="$HOME/Documents/Autorennen-Projekt"; U=autorennen; UH="/Users/$U"; LABEL="de.newweight.autorennen"
SLABEL="de.newweight.autorennen.schalter"; STEU="/Users/Shared/autorennen-steuerung"; HELFER="/Library/PrivilegedHelperTools/$SLABEL"; SSTATE="/var/db/autorennen-schalter"
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
V=$(grep -o 'Autorennen-Versionen/[^"]*' "$P/🚗 Autorennen NEUESTE starten.command" | head -1)
[ -z "$V" ] && { echo "❌ Neueste Version nicht gefunden."; read -r -p "Enter …" _; exit 1; }
echo "🔑 Einmal dein Mac-Passwort (für Benutzer + Systemdienst):"; sudo -v || exit 1
# alte Version 1 (LaunchAgent unter deinem Benutzer) entfernen
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null; rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"; rm -rf "$HOME/autorennen-server"
# Benutzer anlegen (falls nicht vorhanden): Standard, versteckt, zufälliges Passwort (niemand meldet sich an)
if ! id "$U" >/dev/null 2>&1; then
  sudo sysadminctl -addUser "$U" -fullName "Autorennen Server" -password "$(openssl rand -base64 24)" -home "$UH" >/dev/null 2>&1
  sudo createhomedir -c -u "$U" >/dev/null 2>&1
  sudo dscl . create "/Users/$U" IsHidden 1
  echo "👤 Benutzer $U angelegt (versteckt, kein Admin)."
fi
id "$U" >/dev/null 2>&1 || { echo "❌ Benutzer konnte nicht angelegt werden."; read -r -p "Enter …" _; exit 1; }
echo "⏳ Lade $V aus iCloud …"; brctl download "$P/$V" 2>/dev/null; sleep 3
sudo launchctl bootout "system/$LABEL" 2>/dev/null
sudo launchctl bootout "system/$SLABEL" 2>/dev/null
# alte, von Hand gestartete Server (Port 8443) beenden
pkill -f "server/server.js --port 8443" 2>/dev/null; sleep 1
sudo rm -rf "$UH/spiel"; sudo cp -R "$P/$V" "$UH/spiel"
sudo xattr -dr com.apple.quarantine "$UH/spiel" 2>/dev/null
sudo chown -R "$U":staff "$UH/spiel"; sudo chmod -R go-w "$UH/spiel"; sudo chmod 700 "$UH"
NODE="$UH/spiel/server/bin/node-macos-arm64"; sudo chmod +x "$NODE"
# --- Internet-Schalter: Steuerungs-Ordner + root-Helfer -------------------------------------------------------
# Ordner gehört ROOT (755): „autorennen“ darf nur den INHALT von wunsch.json ändern (keine Dateien anlegen/ersetzen/verlinken),
# der Helfer schreibt status.json (alle lesen). Der Helfer-Code wird aus DEINEM Ordner kopiert (nicht aus dem Server-Ordner von „autorennen“).
HSRC="$P/$V/server/autostart/internet-schalter.sh"
if [ -f "$HSRC" ] && /bin/bash -n "$HSRC"; then
  sudo rm -rf "$SSTATE"; sudo mkdir -p "$STEU" /Library/PrivilegedHelperTools
  sudo chown root:wheel "$STEU"; sudo chmod 755 "$STEU"
  sudo rm -f "$STEU/status.json" "$STEU/wunsch.json"
  echo '{"funnel":"aus","seit":0}' | sudo tee "$STEU/wunsch.json" >/dev/null
  sudo chown "$U":staff "$STEU/wunsch.json"; sudo chmod 644 "$STEU/wunsch.json"
  sudo cp "$HSRC" "$HELFER"; sudo chown root:wheel "$HELFER"; sudo chmod 755 "$HELFER"
  sudo tee /Library/LaunchDaemons/$SLABEL.plist >/dev/null <<EOS
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$SLABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HELFER</string></array>
  <key>RunAtLoad</key><true/><key>StartInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>/var/log/autorennen-schalter.log</string><key>StandardErrorPath</key><string>/var/log/autorennen-schalter.log</string>
</dict></plist>
EOS
  sudo chown root:wheel /Library/LaunchDaemons/$SLABEL.plist; sudo chmod 644 /Library/LaunchDaemons/$SLABEL.plist
  STEUARG="--steuerung $STEU"
  echo "🛡️  Internet-Schalter eingerichtet (Helfer: $HELFER)."
  # Annahme prüfen: kann root die Tailscale-CLI der GUI-App benutzen?
  sudo "$TS" status >/dev/null 2>&1 && echo "   ✔ Tailscale-CLI funktioniert als root." || echo "   ⚠️  Tailscale-CLI als root geht NICHT – der Schalter im Spiel würde nichts bewirken. An Claude melden (Fallback: LaunchAgent)."
else
  STEUARG=""; echo "⚠️  Helfer-Skript nicht gefunden/fehlerhaft ($HSRC) – Internet-Schalter im Spiel bleibt aus (Doppelklick-Dateien gehen weiter)."
fi
NAME=$("$TS" status --json 2>/dev/null | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)
ADRESSE="https://${NAME:-mac-mini-von-sebastian.tail39c1c2.ts.net}:8443/"
sudo tee /Library/LaunchDaemons/$LABEL.plist >/dev/null <<EOP
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>UserName</key><string>$U</string>
  <key>WorkingDirectory</key><string>$UH/spiel</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>$NODE</string><string>server/server.js</string><string>--port</string><string>8444</string>
    <string>--oeffentlich</string><string>$ADRESSE</string>$( [ -n "$STEUARG" ] && echo "<string>--steuerung</string><string>$STEU</string>" )</array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$UH/server.log</string><key>StandardErrorPath</key><string>$UH/server.log</string>
</dict></plist>
EOP
sudo chown root:wheel /Library/LaunchDaemons/$LABEL.plist; sudo chmod 644 /Library/LaunchDaemons/$LABEL.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/$LABEL.plist
[ -n "$STEUARG" ] && sudo launchctl bootstrap system /Library/LaunchDaemons/$SLABEL.plist
# Server intern auf 8444 (8443 gehört Tailscale), Tailscale leitet :8443 → 127.0.0.1:8444
# Tailscale: Internet (Funnel) AUS, nur eigenes Tailnet (Serve) AN
"$TS" funnel --https=8443 off >/dev/null 2>&1
"$TS" serve --bg --https=8443 http://127.0.0.1:8444 >/dev/null 2>&1 && echo "🔒 Zugang nur im eigenen Tailscale-Netz." || echo "⚠️ tailscale serve fehlgeschlagen"
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:8444/ && break; sleep 1; done
echo ""
if curl -s -o /dev/null http://localhost:8444/; then
  echo "✅ Fertig. Server läuft als Benutzer „$U“ und startet nach jedem Neustart von selbst (auch ohne Anmeldung)."
  echo "   Adresse (nur Geräte mit Tailscale): $ADRESSE"
  echo "   Freunde ohne Tailscale: im Spiel 🌐 Online → „Internet für Freunde“ (jedes Tailscale-Gerät) oder „🌐 Internet-Zugang AN.command“"
else
  echo "❌ Server antwortet nicht – Protokoll:"; sudo tail -20 "$UH/server.log"
fi
echo ""; echo "🔎 Prüfung: Ordner in deinem Benutzerordner, die andere Benutzer lesen könnten:"
ls -ld "$HOME" | awk '{print "   " $1 "  " $NF}'
for d in "$HOME"/*; do [ -d "$d" ] || continue; m=$(stat -f %Sp "$d"); case "$m" in d???r*|d??????r*) echo "   ⚠️  $m  $d";; esac; done
echo "   (Steht dort ⚠️ bei nw-aios oder NWES2: an Claude melden, dann sperren wir das.)"
read -r -p "Enter zum Schließen … " _
