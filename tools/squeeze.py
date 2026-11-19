"""Squeeze one screenshot into the dossier's size band: quantise the palette, keep the geometry."""
import sys
from PIL import Image

src, dst, quality = sys.argv[1], sys.argv[2], int(sys.argv[3])
img = Image.open(src).convert("RGB")
img = img.quantize(colors=quality, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
img.save(dst, "PNG", optimize=True)
