#!/usr/bin/env python3
"""Kontaktbögen (3x3, je 427x240) aus einem Bilderordner: python3 tests/m5_bogen.py <ordner> <praefix>"""
import sys, os, glob
from PIL import Image, ImageDraw
o, pre = sys.argv[1], sys.argv[2]
fs = sorted(f for f in glob.glob(os.path.join(o, pre + '_*.png')))
for k in range(0, len(fs), 9):
    bg = Image.new('RGB', (1281, 720), 'white')
    for j, f in enumerate(fs[k:k + 9]):
        im = Image.open(f).convert('RGB').resize((427, 240)); x, y = (j % 3) * 427, (j // 3) * 240
        bg.paste(im, (x, y)); ImageDraw.Draw(bg).text((x + 4, y + 2), os.path.basename(f)[len(pre) + 1:-4], fill='yellow')
    bg.save(os.path.join(o, 'bogen_%s_%d.png' % (pre, k // 9 + 1)))
print(len(fs), 'Bilder')
