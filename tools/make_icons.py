#!/usr/bin/env python3
"""Generate the PWA icons (rounded teal square + white map pin) without any image library."""
import math, struct, zlib, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
BG = (15, 118, 110)      # --accent teal
FG = (255, 255, 255)
SS = 4                   # supersampling factor, for smooth edges


def rounded_square(x, y, size, r):
    """Signed test: is (x, y) inside a rounded square of the given size?"""
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def pin(x, y, size):
    """Classic map pin: a disc on top of a tapering tail, plus a punched-out hole."""
    s = size
    head_cx, head_cy, head_r = s * 0.5, s * 0.415, s * 0.20
    hole_r = s * 0.078
    tip_y = s * 0.775

    d2 = (x - head_cx) ** 2 + (y - head_cy) ** 2
    inside = d2 <= head_r * head_r

    # Tail: width shrinks linearly from the head's radius down to nothing at the tip.
    if not inside and head_cy <= y <= tip_y:
        t = (y - head_cy) / (tip_y - head_cy)
        half = head_r * (1 - t) ** 0.62
        inside = abs(x - head_cx) <= half

    if inside and d2 <= hole_r * hole_r:
        return False
    return inside


def render(size):
    px = bytearray()
    big = size * SS
    for py in range(size):
        px.append(0)  # PNG per-row filter byte: none
        for x in range(size):
            hits = 0
            drawn = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = (x * SS + sx + 0.5) / SS
                    fy = (py * SS + sy + 0.5) / SS
                    if rounded_square(fx, fy, size, size * 0.225):
                        hits += 1
                        if pin(fx, fy, size):
                            drawn += 1
            n = SS * SS
            alpha = hits / n
            mix = drawn / hits if hits else 0
            r = round(BG[0] * (1 - mix) + FG[0] * mix)
            g = round(BG[1] * (1 - mix) + FG[1] * mix)
            b = round(BG[2] * (1 - mix) + FG[2] * mix)
            px += bytes((r, g, b, round(alpha * 255)))
    return bytes(px)


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, size):
    raw = render(size)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    print(f"  {path.name}  {len(png):,} bytes")


SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22.5" fill="#0f766e"/>
  <path d="M50 21.5a20 20 0 0 0-20 20c0 14.5 20 36 20 36s20-21.5 20-36a20 20 0 0 0-20-20zm0 12.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6z" fill="#fff"/>
</svg>
'''

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    (OUT / "icon.svg").write_text(SVG)
    print("  icon.svg")
    for s in (180, 192, 512):
        write_png(OUT / f"icon-{s}.png", s)
    print("done")
