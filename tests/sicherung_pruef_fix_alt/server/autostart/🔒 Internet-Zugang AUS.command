#!/bin/bash
# Internet-Zugang aus – Spiel bleibt im eigenen Tailscale-Netz erreichbar.
# Tailscale-CLI: zuerst Homebrew-tailscaled (Systemdienst, läuft vor der Anmeldung), sonst alte App
TS=""; for _k in /opt/homebrew/bin/tailscale /usr/local/bin/tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do [ -x "$_k" ] && { TS="$_k"; break; }; done; [ -n "$TS" ] || TS="/opt/homebrew/bin/tailscale"; H="/Library/PrivilegedHelperTools/de.newweight.autorennen.schalter"
if [ -f "$H" ]; then sudo /bin/bash "$H" aus
else sudo "$TS" funnel --https=10000 off >/dev/null 2>&1; sudo "$TS" serve --bg --https=10000 http://127.0.0.1:8444 >/dev/null 2>&1; fi
echo "🔒 Internet-Zugang AUS. Nur noch deine Geräte mit Tailscale kommen ans Spiel."
read -r -p "Enter zum Schließen … " _
