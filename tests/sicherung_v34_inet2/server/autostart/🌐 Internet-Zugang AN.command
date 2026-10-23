#!/bin/bash
# Spiel für Freunde OHNE Tailscale aus dem Internet erreichbar machen. Geht nach 4 Stunden von selbst wieder aus.
# Gleicher Weg wie der Schalter im Spiel: der root-Helfer (internet-schalter.sh) macht es – mit demselben Auto-Aus nach 4 h.
# Tailscale-CLI: zuerst Homebrew-tailscaled (Systemdienst, läuft vor der Anmeldung), sonst alte App
TS=""; for _k in /opt/homebrew/bin/tailscale /usr/local/bin/tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do [ -x "$_k" ] && { TS="$_k"; break; }; done; [ -n "$TS" ] || TS="/opt/homebrew/bin/tailscale"; H="/Library/PrivilegedHelperTools/de.newweight.autorennen.schalter"
NAME=$(sudo "$TS" status --json 2>/dev/null | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)
if [ -f "$H" ]; then
  sudo /bin/bash "$H" an; r=$?
  if [ $r -ne 0 ]; then
    if [ $r -eq 3 ]; then echo "⏳ Der Schalter ist gerade beschäftigt. Bitte in ein paar Sekunden nochmal doppelklicken."
    else echo "❌ Funnel ging nicht an (Tailscale-Freigabe für Funnel prüfen)."; fi
    read -r -p "Enter …" _; exit 1
  fi
else   # alte Installation ohne Helfer: kein sicheres Auto-Aus möglich (Tailscale-Änderungen brauchen root) – darum nicht einschalten
  echo "❌ Der Internet-Schalter ist noch nicht installiert. Bitte erst „installieren.command“ ausführen (Ordner server/autostart)."
  read -r -p "Enter …" _; exit 1
fi
echo "🌐 Internet-Zugang AN für 4 Stunden: https://${NAME:-mac-mini-von-sebastian.tail39c1c2.ts.net}:10000/"
echo "   Radwelt für Freunde: https://${NAME:-mac-mini-von-sebastian.tail39c1c2.ts.net}:10000/rad/Radwelt.html  (Raum-Code vom Gastgeber eingeben)"
echo "   Früher aus: im Spiel (🌐 Online) oder „🔒 Internet-Zugang AUS.command“"
read -r -p "Enter zum Schließen … " _
