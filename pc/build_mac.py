#!/usr/bin/env python3
"""
PhoneDrive — macOS DMG Builder & Packager
Creates PhoneDrive.app and PhoneDrive-macOS-v1.0.0.dmg with Applications shortcut.
"""

import os
import sys
import shutil
import tempfile
from pathlib import Path
from PIL import Image
import pycdlib

def create_mac_dmg():
    pc_dir = Path(__file__).resolve().parent
    root_dir = pc_dir.parent
    release_assets_dir = root_dir / "release-assets"
    release_assets_dir.mkdir(parents=True, exist_ok=True)
    web_dist_dir = root_dir / "web-dashboard" / "dist"
    dmg_output_path = release_assets_dir / "PhoneDrive-macOS-v1.0.0.dmg"

    print("[*] Starting macOS DMG creation for PhoneDrive...")

    # 1. Ensure icon.icns exists
    icns_path = pc_dir / "icon.icns"
    if not icns_path.exists():
        print("[*] Generating icon.icns from icon.png...")
        img = Image.open(pc_dir / "icon.png")
        img.save(icns_path, format="ICNS")

    # 2. Build staging structure
    staging_dir = Path(tempfile.mkdtemp(prefix="phonedrive_mac_"))
    try:
        app_dir = staging_dir / "PhoneDrive.app"
        contents_dir = app_dir / "Contents"
        macos_dir = contents_dir / "MacOS"
        resources_dir = contents_dir / "Resources"
        app_code_dir = resources_dir / "app"
        app_web_dir = resources_dir / "web-dashboard" / "dist"

        for d in [macos_dir, resources_dir, app_code_dir, app_web_dir]:
            d.mkdir(parents=True, exist_ok=True)

        # Write Info.plist
        plist_content = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>PhoneDrive</string>
    <key>CFBundleExecutable</key>
    <string>PhoneDrive</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.anshumankumar.phonedrive</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>PhoneDrive</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © 2026 Anshuman Kumar. All rights reserved.</string>
</dict>
</plist>
"""
        with open(contents_dir / "Info.plist", "w", encoding="utf-8") as f:
            f.write(plist_content)

        # Write PkgInfo
        with open(contents_dir / "PkgInfo", "w", encoding="utf-8") as f:
            f.write("APPL????")

        # Write MacOS executable launcher script (Unix LF)
        launcher_script = """#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONTENTS_DIR="$( cd "$DIR/.." && pwd )"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
APP_DIR="$RESOURCES_DIR/app"

export PYTHONPATH="$APP_DIR:$PYTHONPATH"
export PHONEDRIVE_MAC_BUNDLE=1

PY_BIN=""
for candidate in \
    "$(which python3 2>/dev/null)" \
    "/opt/homebrew/bin/python3" \
    "/usr/local/bin/python3" \
    "/Library/Frameworks/Python.framework/Versions/Current/bin/python3" \
    "/usr/bin/python3"
do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
        PY_BIN="$candidate"
        break
    fi
done

if [ -z "$PY_BIN" ]; then
    osascript -e 'display alert "Python 3 Required" message "PhoneDrive requires Python 3. Please install Python 3 via brew (brew install python3) or from python.org to launch PhoneDrive." as critical'
    exit 1
fi

"$PY_BIN" -c "import PySide6, fastapi, uvicorn" 2>/dev/null || {
    osascript -e 'display notification "Configuring first-time packages for PhoneDrive..." with title "PhoneDrive Setup"'
    "$PY_BIN" -m pip install --quiet --user -r "$APP_DIR/requirements.txt" || true
}

cd "$APP_DIR"
exec "$PY_BIN" app.py "$@"
"""
        launcher_path = macos_dir / "PhoneDrive"
        with open(launcher_path, "wb") as f:
            f.write(launcher_script.replace("\r\n", "\n").encode("utf-8"))

        # Copy icons
        shutil.copy2(icns_path, resources_dir / "icon.icns")
        shutil.copy2(pc_dir / "icon.png", resources_dir / "icon.png")

        # Copy Python app code
        python_files = [
            "app.py", "server.py", "config.py", "database.py",
            "media_engine.py", "thumbnail_engine.py", "qr_generator.py",
            "requirements.txt"
        ]
        for pf in python_files:
            src = pc_dir / pf
            if src.exists():
                shutil.copy2(src, app_code_dir / pf)

        # Copy ui folder
        ui_src = pc_dir / "ui"
        if ui_src.exists():
            shutil.copytree(ui_src, app_code_dir / "ui", dirs_exist_ok=True)

        # Copy web-dashboard dist
        if web_dist_dir.exists():
            shutil.copytree(web_dist_dir, app_web_dir, dirs_exist_ok=True)

        # Create quickstart guide in root of DMG
        readme_txt = """PhoneDrive for macOS (MacBook & Mac)
Created by Anshuman Kumar
---------------------------------------------

INSTALLATION:
1. Drag the 'PhoneDrive.app' icon into your 'Applications' folder.
2. Launch PhoneDrive from your Applications folder or Spotlight.
3. On first launch, macOS may ask to confirm opening PhoneDrive. Click 'Open'.

FEATURES:
- Turn your MacBook / Mac into a high-speed personal local cloud.
- 4K cinema media streaming with HTTP 206 range requests.
- Bi-directional file transfer with your Android phone and Windows PC over Wi-Fi.
- Zero subscriptions. 100% private.

Documentation: https://github.com/anhsumankumar/PhoneDrive
"""
        with open(staging_dir / "README.txt", "wb") as f:
            f.write(readme_txt.replace("\r\n", "\n").encode("utf-8"))

        print(f"[+] Staged PhoneDrive.app in {staging_dir}")

        # 3. Build DMG image using pycdlib
        print(f"[*] Compiling disk image into {dmg_output_path}...")
        iso = pycdlib.PyCdlib()
        iso.new(interchange_level=3, rock_ridge="1.09", joliet=3, vol_ident="PhoneDrive")

        # Add Applications symlink
        iso.add_symlink(
            rr_path="/APPS",
            symlink_path="/Applications",
            rr_symlink_name="Applications",
            joliet_path="/Applications"
        )

        # Add README.txt
        iso.add_file(
            str(staging_dir / "README.txt"),
            iso_path="/README.TXT;1",
            rr_name="README.txt",
            joliet_path="/README.txt"
        )

        # Add PhoneDrive.app root directory
        iso.add_directory(
            iso_path="/APP",
            rr_name="PhoneDrive.app",
            joliet_path="/PhoneDrive.app"
        )

        dir_counter = 0
        file_counter = 0

        # Helper to recursively add directory contents
        def add_dir_contents(local_dir: Path, iso_parent: str, joliet_parent: str):
            nonlocal dir_counter, file_counter
            for item in sorted(local_dir.iterdir()):
                if item.is_dir():
                    dir_counter += 1
                    iso_child = f"{iso_parent}/D{dir_counter:04d}"
                    joliet_child = f"{joliet_parent}/{item.name}"
                    iso.add_directory(
                        iso_path=iso_child,
                        rr_name=item.name,
                        joliet_path=joliet_child
                    )
                    add_dir_contents(item, iso_child, joliet_child)
                else:
                    file_counter += 1
                    iso_child = f"{iso_parent}/F{file_counter:04d}.DAT;1"
                    joliet_child = f"{joliet_parent}/{item.name}"
                    iso.add_file(
                        str(item),
                        iso_path=iso_child,
                        rr_name=item.name,
                        joliet_path=joliet_child
                    )

        add_dir_contents(app_dir, "/APP", "/PhoneDrive.app")

        # Write DMG output
        if dmg_output_path.exists():
            dmg_output_path.unlink()

        iso.write(str(dmg_output_path))
        iso.close()

        size_mb = dmg_output_path.stat().st_size / (1024 * 1024)
        print(f"\n[SUCCESS] PhoneDrive-macOS-v1.0.0.dmg built successfully! ({size_mb:.2f} MB)")
        print(f"File location: {dmg_output_path}")

    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)

if __name__ == "__main__":
    create_mac_dmg()
