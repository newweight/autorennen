#!/bin/bash
# Internet-Zugang aus – Spiel bleibt im eigenen Tailscale-Netz erreichbar.
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"; H="/Library/PrivilegedHelperTools/de.newweight.autorennen.schalter"
if [ -f "$H" ]; then sudo /bin/bash "$H" aus
else "$TS" funnel --https=8443 off >/dev/null 2>&1; "$TS" serve --bg --https=8443 http://127.0.0.1:8444 >/dev/null 2>&1; fi
echo "🔒 Internet-Zugang AUS. Nur noch deine Geräte mit Tailscale kommen ans Spiel."
read -r -p "Enter zum Schließen … " _
