#!/bin/bash
# MINI_HOLEN.command – holt/aktualisiert das Spiele-Repo auf den Mac.
# Ziel: ~/Desktop/Spiele/Motorrad-Projekt   Zweig: motorrad (oder als 1. Argument, z. B. ./MINI_HOLEN.command integration)
# Löscht nichts. Lokale Änderungen werden vorher mit "git stash push" gesichert.
ZIEL="$HOME/Desktop/Spiele/Motorrad-Projekt"
REPO="${REPO_URL:-https://github.com/newweight/autorennen}"
ZWEIG="${1:-motorrad}"
DATUM="$(date +%Y-%m-%d_%H%M)"

echo "== Motorrad-Projekt holen =="
echo "Ziel:  $ZIEL"
echo "Zweig: $ZWEIG"
mkdir -p "$(dirname "$ZIEL")" || { echo "FEHLER: Ordner $(dirname "$ZIEL") nicht anlegbar"; read -p "Enter zum Schließen"; exit 1; }

if [ ! -d "$ZIEL/.git" ]; then
  if [ -e "$ZIEL" ] && [ -n "$(ls -A "$ZIEL" 2>/dev/null)" ]; then
    echo "FEHLER: $ZIEL existiert, ist aber kein Git-Ordner und nicht leer. Nichts verändert."
    echo "Bitte Ordner umbenennen (z. B. Motorrad-Projekt_alt) und das Skript nochmal starten."
    read -p "Enter zum Schließen"; exit 1
  fi
  echo "Ordner fehlt -> git clone"
  git clone "$REPO" "$ZIEL" || { echo "FEHLER: clone fehlgeschlagen (Netz/Zugang?)"; read -p "Enter zum Schließen"; exit 1; }
  cd "$ZIEL" || exit 1
else
  cd "$ZIEL" || exit 1
  if [ -n "$(git status --porcelain)" ]; then
    echo "Lokale Änderungen gefunden -> Sicherung: git stash push -m sicherung-$DATUM"
    git stash push -u -m "sicherung-$DATUM" || { echo "FEHLER: Sicherung fehlgeschlagen – nichts weiter getan."; read -p "Enter zum Schließen"; exit 1; }
    echo "(wieder holen mit: cd \"$ZIEL\" && git stash list && git stash apply)"
  fi
  git fetch origin || { echo "FEHLER: fetch fehlgeschlagen (Netz/Zugang?)"; read -p "Enter zum Schließen"; exit 1; }
fi

git checkout "$ZWEIG" 2>/dev/null || git checkout -b "$ZWEIG" "origin/$ZWEIG" || { echo "FEHLER: Zweig $ZWEIG nicht gefunden"; read -p "Enter zum Schließen"; exit 1; }
git pull --ff-only origin "$ZWEIG" || { echo "FEHLER: pull nicht möglich (Zweig weicht ab?). Nichts überschrieben."; read -p "Enter zum Schließen"; exit 1; }

echo
echo "== Fertig. Aktueller Stand =="
git log -1 --format='Commit: %h  %ad%n%s' --date=format:'%d.%m.%Y %H:%M'
echo
echo "NÄCHSTER SCHRITT: danach ~/Desktop/Spiele/ALLES_AUF_DEN_MINI.command starten"
echo "(Doppelklick, oder im Terminal:  bash ~/Desktop/Spiele/ALLES_AUF_DEN_MINI.command )"
read -p "Enter zum Schließen"
