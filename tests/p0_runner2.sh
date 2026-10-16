#!/bin/bash
# Phase 0 Fortsetzung: laeuft nacheinander, Wiederholung bei Rot. Ausgabe: tests/out/p0/<name>.txt, _ergebnis.tsv, _runner.log
cd /home/claude/v27
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
OUT=tests/out/p0
LIST="py:tests/leistung_test.py py:tests/licht_konstant_test.py py:tests/menu_test.py py:tests/oel_test.py py:tests/online5_test.py py:tests/online_polizei_test.py py:tests/online_test.py py:tests/pokal_test.py py:tests/polizei_test.py py:tests/rempeln_test.py py:tests/rennen_test.py py:tests/schach3d_test.py py:tests/schach_port_ui_test.py py:tests/schalter_ui_test.py py:tests/schalter_v26_ui_test.py py:tests/screenshot_test.py py:tests/sound_spiel_test.py py:tests/spiegel_oben_test.py py:tests/startboost_test.py py:tests/touch_test.py py:tests/tribuenen_test.py py:tests/verkehr_test.py py:tests/vier_port_ui_test.py py:tests/welten_test.py py:tests/test_sound.py sh:tests/test_schalter.sh"
n=0
for it in $LIST; do
  k=${it%%:*}; t=${it#*:}; b=$(basename $t); n=$((n+1))
  pkill -f "[s]erver/server.js --port" 2>/dev/null
  case $k in py) cmd="python3 $t";; sh) cmd="bash $t";; *) cmd="node $t";; esac
  s=$(date +%s.%N); timeout 1200 $cmd > $OUT/$b.txt 2>&1; rc=$?; d=$(echo "$(date +%s.%N) - $s" | bc)
  w="-"; d2="-"; l2="-"
  if [ $rc -ne 0 ]; then
    mv $OUT/$b.txt $OUT/$b.lauf1.txt
    pkill -f "[s]erver/server.js --port" 2>/dev/null
    s=$(date +%s.%N); timeout 1200 $cmd > $OUT/$b.txt 2>&1; w=$?; d2=$(echo "$(date +%s.%N) - $s" | bc)
  fi
  printf "%s\t%s\t%s\t%.1f\t%s\t%s\t%.1f\t%s\n" $k $t $rc $d 0 $w ${d2/-/0} 0 >> $OUT/_ergebnis2.tsv
  echo "$(date +%T) [$n] $t rc=$rc ${d}s wdh=$w" >> $OUT/_runner.log
done
echo "FERTIG $(date +%T)" >> $OUT/_runner.log
