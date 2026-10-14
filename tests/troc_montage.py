#!/usr/bin/env python3
"""Montage: python3 tests/troc_montage.py <praefix> [ansichten...] -> tests/out/troc/<praefix>_montage.png"""
import sys, os
from PIL import Image
d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'out', 'troc')
pre = sys.argv[1]; an = sys.argv[2:] or ['front35', 'seite', 'heck215']
ims = [Image.open(os.path.join(d, f'{pre}_{a}.png')) for a in an]
w, h = ims[0].size
c = Image.new('RGB', (w * len(ims) // 2, h // 2))
for i, im in enumerate(ims): c.paste(im.resize((w // 2, h // 2)), (i * w // 2, 0))
c.save(os.path.join(d, f'{pre}_montage.png'))
