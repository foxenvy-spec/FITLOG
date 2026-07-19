from PIL import Image, ImageDraw

BG = (20, 22, 26, 255)       # bg
AMBER = (232, 163, 61, 255)  # amber
STEEL = (108, 140, 168, 255) # steel
INK = (243, 240, 232, 255)   # ink


def draw_mark(size, padding_ratio):
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    cx, cy = size // 2, size // 2

    # Barbell mark: a horizontal bar with plates on each end, tilted slightly
    # via simple geometry (no rotation needed for a clean flat icon).
    bar_h = max(int(size * 0.07), 4)
    bar_w = size - pad * 2
    bar_x0 = pad
    bar_x1 = pad + bar_w
    bar_y0 = cy - bar_h // 2
    bar_y1 = cy + bar_h // 2
    d.rounded_rectangle([bar_x0, bar_y0, bar_x1, bar_y1], radius=bar_h // 2, fill=INK)

    plate_w = max(int(size * 0.09), 6)
    plate_h = int(size * 0.46)
    gap = int(size * 0.03)

    # left plates (two, amber outer + steel inner)
    d.rounded_rectangle(
        [bar_x0 - plate_w - gap, cy - plate_h // 2, bar_x0 - gap, cy + plate_h // 2],
        radius=plate_w // 3, fill=AMBER,
    )
    d.rounded_rectangle(
        [bar_x0 - int(plate_w * 0.55), cy - int(plate_h * 0.72) // 2, bar_x0 + int(plate_w*0.1), cy + int(plate_h * 0.72) // 2],
        radius=plate_w // 3, fill=STEEL,
    )

    # right plates
    d.rounded_rectangle(
        [bar_x1 + gap, cy - plate_h // 2, bar_x1 + plate_w + gap, cy + plate_h // 2],
        radius=plate_w // 3, fill=AMBER,
    )
    d.rounded_rectangle(
        [bar_x1 - int(plate_w*0.1), cy - int(plate_h * 0.72) // 2, bar_x1 + int(plate_w * 0.55), cy + int(plate_h * 0.72) // 2],
        radius=plate_w // 3, fill=STEEL,
    )

    return img


# Standard "any" icons — content fills most of the canvas
for size in (192, 512):
    img = draw_mark(size, padding_ratio=0.22)
    img.save(f"public/icons/icon-{size}.png")

# Maskable icon — keep the mark within the safe zone (inner ~80%)
maskable = draw_mark(512, padding_ratio=0.30)
maskable.save("public/icons/icon-maskable-512.png")

print("done")
