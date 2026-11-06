#!/bin/bash
# Autorennen-Server ganz aus (Dienst gestoppt, kein Zugang mehr). Wieder an: installieren.command
# Tailscale-CLI: zuerst Homebrew-tailscaled (Systemdienst, läuft vor der Anmeldung), sonst alte App
LABEL="de.newweight.autorennen"; SLABEL="de.newweight.autorennen.schalter"; TS=""; for _k in /opt/homebrew/bin/tailscale /usr/local/bin/tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do [ -x "$_k" ] && { TS="$_k"; break; }; done; [ -n "$TS" ] || TS="/opt/homebrew/bin/tailscale"
sudo launchctl bootout "system/$SLABEL" 2>/dev/null; sudo rm -f /Library/LaunchDaemons/$SLABEL.plist /Library/PrivilegedHelperTools/$SLABEL /Library/PrivilegedHelperTools/de.newweight.autorennen.tailscale
sudo rm -rf /Users/Shared/autorennen-steuerung /var/db/autorennen-schalter
sudo launchctl bootout "system/$LABEL" 2>/dev/null; sudo rm -f /Library/LaunchDaemons/$LABEL.plist
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null; rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
sudo "$TS" funnel --https=10000 off >/dev/null 2>&1; sudo "$TS" serve --https=10000 off >/dev/null 2>&1
echo "👋 Server aus, kein Zugang mehr. (Benutzer „autorennen“ bleibt bestehen, stört nicht.)"
read -r -p "Enter zum Schließen … " _
