#!/bin/bash
# Autorennen-Server ganz aus (Dienst gestoppt, kein Zugang mehr). Wieder an: installieren.command
LABEL="de.newweight.autorennen"; TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
sudo launchctl bootout "system/$LABEL" 2>/dev/null; sudo rm -f /Library/LaunchDaemons/$LABEL.plist
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null; rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
"$TS" funnel --https=8443 off >/dev/null 2>&1; "$TS" serve --https=8443 off >/dev/null 2>&1
echo "👋 Server aus, kein Zugang mehr. (Benutzer „autorennen“ bleibt bestehen, stört nicht.)"
read -r -p "Enter zum Schließen … " _
