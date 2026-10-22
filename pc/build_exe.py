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
    icon_path = pc_dir / "icon.png"

    if not dist_dir.exists():
        print("[!] Web dashboard dist folder not found. Building web dashboard first...")
        subprocess.run(["npm", "run", "build"], cwd=str(root_dir / "web-dashboard"), shell=True, check=True)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=PhoneDrive-PC",
        "--noconfirm",
        "--windowed",
        f"--icon={icon_path}",
        f"--add-data={dist_dir};web-dashboard/dist",
        f"--add-data={icon_path};.",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=fastapi",
        "--hidden-import=pydantic",
        "--hidden-import=PIL",
        "--hidden-import=cv2",
        "--hidden-import=qrcode",
        "--hidden-import=PySide6",
        str(pc_dir / "app.py"),
    ]

    print("[*] Running PyInstaller command:")
    print(" ".join(cmd))
    subprocess.run(cmd, cwd=str(pc_dir), check=True)
    print("\n[+] Build Complete! Executable is located in pc/dist/PhoneDrive-PC/PhoneDrive-PC.exe")

if __name__ == "__main__":
    build()
