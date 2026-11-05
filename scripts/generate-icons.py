"""
Icon Generator for Remaster Enhancement
Generates Android mipmap launcher icons, adaptive icons, and Web PWA icons
from master 1024x1024 image with custom dark adaptive background.
"""

import os
from PIL import Image

def generate_icons(source_path, repo_root):
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Source icon not found: {source_path}")

    master_img = Image.open(source_path).convert("RGBA")
    print(f"Loaded master icon from {source_path} ({master_img.size})")

    # Sample ambient dark background from top-left corner
    corner_pixel = master_img.getpixel((10, 10))
    dark_bg_rgb = (corner_pixel[0], corner_pixel[1], corner_pixel[2])
    dark_bg_hex = f"#{dark_bg_rgb[0]:02x}{dark_bg_rgb[1]:02x}{dark_bg_rgb[2]:02x}"
    print(f"Sampled ambient dark background color: {dark_bg_hex} {dark_bg_rgb}")

    # 1. Android Mipmap densities & sizes
    densities = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    res_root = os.path.join(repo_root, "resources", "android", "res")
    os.makedirs(res_root, exist_ok=True)

    for folder, (launcher_sz, fg_sz) in densities.items():
        folder_path = os.path.join(res_root, folder)
        os.makedirs(folder_path, exist_ok=True)

        # Standard Launcher Icon (Square)
        launcher_img = master_img.resize((launcher_sz, launcher_sz), Image.Resampling.LANCZOS)
        launcher_path = os.path.join(folder_path, "ic_launcher.png")
        launcher_img.save(launcher_path, format="PNG")

        # Round Launcher Icon
        round_path = os.path.join(folder_path, "ic_launcher_round.png")
        launcher_img.save(round_path, format="PNG")

        # Foreground Adaptive Icon:
        # Instead of transparent holes that reveal Android's default white background,
        # we pre-fill the canvas with the logo's ambient dark background color!
        fg_canvas = Image.new("RGBA", (fg_sz, fg_sz), (dark_bg_rgb[0], dark_bg_rgb[1], dark_bg_rgb[2], 255))
        
        # Center the master symbol inside standard Android adaptive icon safe zone (~72%)
        safe_size = int(fg_sz * 0.72)
        fg_scaled = master_img.resize((safe_size, safe_size), Image.Resampling.LANCZOS)
        offset = ((fg_sz - safe_size) // 2, (fg_sz - safe_size) // 2)
        fg_canvas.paste(fg_scaled, offset, fg_scaled)
        
        fg_path = os.path.join(folder_path, "ic_launcher_foreground.png")
        fg_canvas.save(fg_path, format="PNG")

        print(f"Generated {folder}: ic_launcher.png ({launcher_sz}x{launcher_sz}), ic_launcher_foreground.png ({fg_sz}x{fg_sz})")

    # 2. Generate values/ic_launcher_background.xml with matching dark hex color
    values_dir = os.path.join(res_root, "values")
    os.makedirs(values_dir, exist_ok=True)
    bg_xml_path = os.path.join(values_dir, "ic_launcher_background.xml")
    with open(bg_xml_path, "w", encoding="utf-8") as f:
        f.write(f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">{dark_bg_hex}</color>
</resources>
""")
    print(f"Generated {bg_xml_path} with dark background {dark_bg_hex} (eliminates white background!)")

    # 3. Web & PWA Icons
    icons_web_dir = os.path.join(repo_root, "icons")
    os.makedirs(icons_web_dir, exist_ok=True)

    icon_512 = master_img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save(os.path.join(icons_web_dir, "icon-512.png"), format="PNG")

    icon_192 = master_img.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save(os.path.join(icons_web_dir, "icon-192.png"), format="PNG")

    master_img.save(os.path.join(icons_web_dir, "icon.png"), format="PNG")
    print(f"Generated Web PWA icons in {icons_web_dir}: icon-192.png, icon-512.png, icon.png")

if __name__ == "__main__":
    SOURCE = r"C:\Users\Athavan\Desktop\Photoshop\assets\remaster_app_icon.jpg"
    REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    generate_icons(SOURCE, REPO_DIR)
