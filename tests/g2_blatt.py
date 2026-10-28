#!/usr/bin/env python3
"""Kontaktbogen: python3 tests/g2_blatt.py <aus.png> <bild1> <bild2> ... (2 Spalten, je 640 px breit, Beschriftung = Dateiname)"""
import sys, os
from PIL import Image, ImageDraw
fs = sys.argv[2:]; W = 640; H = 360; sp = 2; zl = (len(fs) + sp - 1) // sp
b = Image.new('RGB', (W * sp, (H + 14) * zl), (30, 30, 30)); d = ImageDraw.Draw(b)
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((W, H)); x, y = (i % sp) * W, (i // sp) * (H + 14); b.paste(im, (x, y + 14)); d.text((x + 3, y + 1), os.path.basename(f)[:-4], fill=(255, 255, 0))
b.save(sys.argv[1])
