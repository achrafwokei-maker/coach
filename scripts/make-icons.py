# Generates the app icons as PNG with only the Python standard library.
# Design: near-black square, three ascending volt bars (push / pull / legs → progress).
import zlib, struct, sys

def png(path, size):
    SS = 4  # supersampling for anti-aliasing
    bg = (11, 11, 12); fg = (200, 240, 49)
    S = size * SS
    # bars in a 100-unit design grid
    bars = [(24, 58, 40, 76), (42, 40, 58, 76), (60, 22, 76, 76)]
    r = 4.0  # corner radius (design units)
    def inside(x, y):
        for (x0, y0, x1, y1) in bars:
            if x0 <= x <= x1 and y0 <= y <= y1:
                cx = min(max(x, x0 + r), x1 - r); cy = min(max(y, y0 + r), y1 - r)
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r: return True
        return False
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px * SS + sx + .5) / S * 100; y = (py * SS + sy + .5) / S * 100
                    hits += inside(x, y)
            a = hits / (SS * SS)
            row += bytes(round(bg[i] * (1 - a) + fg[i] * a) for i in range(3))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

for s in (180, 192, 512):
    png(f'icons/icon-{s}.png', s)
print('icons ok')
