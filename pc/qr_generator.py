import io
from pathlib import Path
from PIL import Image, ImageDraw, ImageColor
import qrcode
from config import ICON_PATH

def generate_custom_qr(data: str, size: int = 500) -> Image.Image:
    """
    Generates a premium QR code with sky-blue gradient fill,
    rounded white center box, and PhoneDrive app icon.
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    
    # Base monochrome mask
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    qr_w, qr_h = qr_img.size

    # Create smooth vertical gradient: #0284c7 (sky-600) to #38bdf8 (sky-400)
    top_color = (2, 132, 199, 255)
    bottom_color = (56, 189, 248, 255)

    gradient = Image.new("RGBA", (qr_w, qr_h))
    for y in range(qr_h):
        ratio = y / max(1, qr_h - 1)
        r = int(top_color[0] + (bottom_color[0] - top_color[0]) * ratio)
        g = int(top_color[1] + (bottom_color[1] - top_color[1]) * ratio)
        b = int(top_color[2] + (bottom_color[2] - top_color[2]) * ratio)
        for x in range(qr_w):
            gradient.putpixel((x, y), (r, g, b, 255))

    # Apply QR pattern mask to gradient
    final_qr = Image.new("RGBA", (qr_w, qr_h), (255, 255, 255, 255))
    qr_data = qr_img.load()
    grad_data = gradient.load()
    out_data = final_qr.load()

    for y in range(qr_h):
        for x in range(qr_w):
            if qr_data[x, y][0] < 128:  # black module in QR
                out_data[x, y] = grad_data[x, y]
            else:
                out_data[x, y] = (255, 255, 255, 255)

    # Add rounded center icon if exists
    if ICON_PATH.exists():
        try:
            icon = Image.open(ICON_PATH).convert("RGBA")
            # Calculate center logo size (~22% of QR code width)
            logo_size = int(qr_w * 0.22)
            box_size = logo_size + 16
            
            # Rounded white box backdrop
            box_img = Image.new("RGBA", (box_size, box_size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(box_img)
            draw.rounded_rectangle([0, 0, box_size - 1, box_size - 1], radius=18, fill=(255, 255, 255, 255))

            # Resize icon
            icon_resized = icon.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
            
            # Paste icon in center of white box
            offset = (box_size - logo_size) // 2
            box_img.paste(icon_resized, (offset, offset), icon_resized)

            # Paste center box into final QR
            center_x = (qr_w - box_size) // 2
            center_y = (qr_h - box_size) // 2
            final_qr.paste(box_img, (center_x, center_y), box_img)
        except Exception as e:
            print(f"Warning: Failed to embed center logo in QR: {e}")

    # Resize to requested output size
    if final_qr.size != (size, size):
        final_qr = final_qr.resize((size, size), Image.Resampling.LANCZOS)

    return final_qr

def generate_qr_bytes(data: str, size: int = 500) -> bytes:
    img = generate_custom_qr(data, size)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
