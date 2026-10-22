#!/bin/bash
# Ersatz-Starter (Doppelklick), falls die App nicht startet.
cd "$(dirname "$0")"
xattr -cr . 2>/dev/null   # macOS-Download-Markierung entfernen (Node hing sonst stumm)
if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "Autorennen.html"; else open "Autorennen.html"; fi
