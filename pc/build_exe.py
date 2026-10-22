"""
PhoneDrive PC — Standalone Executable Builder
Uses PyInstaller to package the PC Python daemon, UI, and Web Dashboard into a single portable binary.

Usage:
    pip install pyinstaller
    python build_exe.py
"""

import sys
import subprocess
from pathlib import Path

def build():
    pc_dir = Path(__file__).resolve().parent
    root_dir = pc_dir.parent
    dist_dir = root_dir / "web-dashboard" / "dist"
    icon_ico = pc_dir / "icon.ico"
    icon_png = pc_dir / "icon.png"
    icon_to_use = icon_ico if icon_ico.exists() else icon_png

    if not dist_dir.exists():
        print("[!] Web dashboard dist folder not found. Building web dashboard first...")
        subprocess.run(["npm", "run", "build"], cwd=str(root_dir / "web-dashboard"), shell=True, check=True)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=PhoneDrive-PC",
        "--noconfirm",
        "--windowed",
        f"--icon={icon_to_use}",
        f"--add-data={dist_dir};web-dashboard/dist",
        f"--add-data={icon_png};.",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=fastapi",
        "--hidden-import=pydantic",
        "--hidden-import=starlette",
        "--hidden-import=multipart",
        "--hidden-import=PIL",
        "--hidden-import=PIL.Image",
        "--hidden-import=qrcode",
        "--hidden-import=PySide6",
        "--hidden-import=PySide6.QtCore",
        "--hidden-import=PySide6.QtGui",
        "--hidden-import=PySide6.QtWidgets",
        str(pc_dir / "app.py"),
    ]

    print("[*] Running PyInstaller command:")
    print(" ".join(cmd))
    subprocess.run(cmd, cwd=str(pc_dir), check=True)
    print("\n[+] Build Complete! Executable is located in pc/dist/PhoneDrive-PC/PhoneDrive-PC.exe")

if __name__ == "__main__":
    build()
