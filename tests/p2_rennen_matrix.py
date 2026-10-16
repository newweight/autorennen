#!/usr/bin/env python3
"""Phase 2 (offline): Aufrufhülle um tests/durchlauf_matrix.py --teil offline  (alle weiteren Optionen werden durchgereicht: --nur ID, --wiederholen, --liste, --seed N)"""
import os, sys
os.execv(sys.executable, [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'durchlauf_matrix.py'), '--teil', 'offline'] + sys.argv[1:])
