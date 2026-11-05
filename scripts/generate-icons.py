"""
Icon Generator for Remaster Enhancement
Generates Android mipmap launcher icons and Web PWA icons from master 1024x1024 image.
"""

import os
from PIL import Image

def generate_icons(source_path, repo_root):
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Source icon not found: {source_path}")

    master_img = Image.open(source_path).convert("RGBA")
    print(f"Loaded master icon from {source_path} ({master_img.size})")

    # 1. Android Mipmap densities & sizes
    # Android standards:
    # mdpi: 48x48 launcher, 108x108 foreground
    # hdpi: 72x72 launcher, 162x162 foreground
    # xhdpi: 96x96 launcher, 216x216 foreground
    # xxhdpi: 144x144 launcher, 324x324 foreground
    # xxxhdpi: 192x192 launcher, 432x432 foreground
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

        # Standard Launcher Icon
        launcher_img = master_img.resize((launcher_sz, launcher_sz), Image.Resampling.LANCZOS)
        launcher_path = os.path.join(folder_path, "ic_launcher.png")
        launcher_img.save(launcher_path, format="PNG")

        # Round Launcher Icon
        round_path = os.path.join(folder_path, "ic_launcher_round.png")
        launcher_img.save(round_path, format="PNG")

        # Foreground Adaptive Icon (centered with padding standard)
        fg_canvas = Image.new("RGBA", (fg_sz, fg_sz), (0, 0, 0, 0))
        # Place master inside safe zone (approx 72/108 = ~66% scale)
        safe_size = int(fg_sz * 0.72)
        fg_scaled = master_img.resize((safe_size, safe_size), Image.Resampling.LANCZOS)
        offset = ((fg_sz - safe_size) // 2, (fg_sz - safe_size) // 2)
        fg_canvas.paste(fg_scaled, offset, fg_scaled)
        fg_path = os.path.join(folder_path, "ic_launcher_foreground.png")
        fg_canvas.save(fg_path, format="PNG")

        print(f"Generated {folder}: ic_launcher.png ({launcher_sz}x{launcher_sz}), ic_launcher_foreground.png ({fg_sz}x{fg_sz})")

    # 2. Web & PWA Icons
    icons_web_dir = os.path.join(repo_root, "icons")
    os.makedirs(icons_web_dir, exist_ok=True)

    # 512x512
    icon_512 = master_img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save(os.path.join(icons_web_dir, "icon-512.png"), format="PNG")

    # 192x192
    icon_192 = master_img.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save(os.path.join(icons_web_dir, "icon-192.png"), format="PNG")

    # Also keep icon.png at master resolution
    master_img.save(os.path.join(icons_web_dir, "icon.png"), format="PNG")

    print(f"Generated Web PWA icons in {icons_web_dir}: icon-192.png, icon-512.png, icon.png")

if __name__ == "__main__":
    SOURCE = r"C:\Users\Athavan\Desktop\Photoshop\assets\remaster_app_icon.jpg"
    REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    generate_icons(SOURCE, REPO_DIR)

