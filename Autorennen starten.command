#!/bin/bash
# Ersatz-Starter (Doppelklick), falls die App nicht startet.
cd "$(dirname "$0")"
if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "Autorennen.html"; else open "Autorennen.html"; fi
