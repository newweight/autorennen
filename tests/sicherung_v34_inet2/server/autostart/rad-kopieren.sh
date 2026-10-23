#!/bin/bash
# ============================================================================================================
# R6 „Internet für Freunde“: eigene Kopie der Radwelt für den Spielserver (Ordner <Spielordner>/rad, ausgeliefert unter /rad/…).
#
#   bash rad-kopieren.sh <Radwelt-Ordner> <Ziel-Ordner>
#
# Kopiert NUR, was die Radwelt-Seite im Browser braucht: Radwelt.html, src/**, vendor/** – und dort nur echte Dateien (keine Links)
# mit den Endungen, die der Server ausliefert (.js .css .html .jpg .jpeg .png .svg .json .mp3 .ogg .woff2 .ico), ohne versteckte
# Dateien (.*) und ohne Entwicklungsdateien (_*). Kein server/, keine Daten, keine .command-Dateien.
# Das Ziel wird NEU angelegt (vorher leer/nicht vorhanden) – Autorennen-Dateien (src/track, src/world …) im Spielordner bleiben unberührt,
# die Radwelt hat ihre eigenen Kopien unter rad/src/… .
# Benutzt von installieren.command (läuft als dein Benutzer, ohne sudo; die Kopie wird danach mit sudo in den Spielordner gelegt).
# Exit 0 = ok, 1 = Aufruf falsch / Radwelt.html fehlt / Ziel nicht leer.
# ============================================================================================================
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
Q="${1:-}"; Z="${2:-}"
[ -n "$Q" ] && [ -n "$Z" ] || { echo "Aufruf: $0 <Radwelt-Ordner> <Ziel-Ordner>" >&2; exit 1; }
[ -f "$Q/Radwelt.html" ] && [ ! -L "$Q/Radwelt.html" ] && [ -d "$Q/src/rad" ] || { echo "❌ Keine Radwelt in $Q (Radwelt.html / src/rad fehlt)" >&2; exit 1; }
if [ -e "$Z" ] && [ -n "$(ls -A "$Z" 2>/dev/null)" ]; then echo "❌ Ziel $Z ist nicht leer" >&2; exit 1; fi
mkdir -p "$Z" || exit 1
n=0
while IFS= read -r -d '' f; do
  f="${f#./}"
  case "/$f" in */.*|*/_*) continue ;; esac
  case "$f" in
    *.js|*.css|*.html|*.jpg|*.jpeg|*.png|*.svg|*.json|*.mp3|*.ogg|*.woff2|*.ico) ;;
    *) continue ;;
  esac
  mkdir -p "$Z/$(dirname "$f")" && cp "$Q/$f" "$Z/$f" || { echo "❌ Kopieren fehlgeschlagen: $f" >&2; exit 1; }
  n=$((n + 1))
done < <(cd "$Q" && { [ -f Radwelt.html ] && printf '%s\0' Radwelt.html; find src vendor -type f -print0 2>/dev/null; })
[ -f "$Z/Radwelt.html" ] || { echo "❌ Radwelt.html nicht kopiert" >&2; exit 1; }
echo "🚴 Radwelt für Freunde kopiert: $n Dateien → $Z"
exit 0
