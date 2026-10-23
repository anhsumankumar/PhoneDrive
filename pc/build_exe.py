"""
PhoneDrive PC — Standalone Executable & Package Builder
Uses PyInstaller to package the PC Python daemon, UI, and Web Dashboard.

Modes:
    python build_exe.py --onefile   # Standalone all-in-one PhoneDrive-PC.exe (no zip needed)
    python build_exe.py --onedir    # Folder package (for portable zip)
    python build_exe.py --all       # Builds both standalone EXE and portable ZIP
"""

import sys
import shutil
import argparse
import subprocess
from pathlib import Path

def build_executable(onefile: bool = True):
    pc_dir = Path(__file__).resolve().parent
    root_dir = pc_dir.parent
    dist_dir = root_dir / "web-dashboard" / "dist"
    release_assets_dir = root_dir / "release-assets"
    release_assets_dir.mkdir(parents=True, exist_ok=True)

    icon_ico = pc_dir / "icon.ico"
    icon_png = pc_dir / "icon.png"
    icon_to_use = icon_ico if icon_ico.exists() else icon_png

    if not dist_dir.exists():
        print("[*] Web dashboard dist folder not found. Building web dashboard first...")
        subprocess.run(["npm", "run", "build"], cwd=str(root_dir / "web-dashboard"), shell=True, check=True)

    mode_flag = "--onefile" if onefile else "--onedir"
    exe_name = "PhoneDrive-PC" if not onefile else "PhoneDrive-PC-Standalone"

    cmd = [
        sys.executable, "-m", "PyInstaller",
        f"--name={exe_name}",
        "--noconfirm",
        "--windowed",
        mode_flag,
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

    print(f"[*] Running PyInstaller ({mode_flag})...")
    subprocess.run(cmd, cwd=str(pc_dir), check=True)

    if onefile:
        built_exe = pc_dir / "dist" / f"{exe_name}.exe"
        if not built_exe.exists():
            raise RuntimeError(f"Expected binary {built_exe} not found!")
        
        target_release_exe = release_assets_dir / "PhoneDrive-PC-v1.0.0.exe"
        shutil.copy2(built_exe, target_release_exe)
        size_mb = target_release_exe.stat().st_size / (1024 * 1024)
        print(f"\n[+] Standalone One-File EXE created: {target_release_exe} ({size_mb:.2f} MB)")
        return target_release_exe
    else:
        built_dir = pc_dir / "dist" / exe_name
        if not built_dir.exists():
            raise RuntimeError(f"Expected folder {built_dir} not found!")

        target_zip = release_assets_dir / "PhoneDrive-PC-v1.0.0.zip"
        print(f"[*] Creating portable zip: {target_zip}...")
        shutil.make_archive(
            base_name=str(release_assets_dir / "PhoneDrive-PC-v1.0.0"),
            format="zip",
            root_dir=str(pc_dir / "dist"),
            base_dir=exe_name
        )
        size_mb = target_zip.stat().st_size / (1024 * 1024)
        print(f"\n[+] Portable ZIP created: {target_zip} ({size_mb:.2f} MB)")
        return target_zip

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build PhoneDrive PC binaries")
    parser.add_argument("--onedir", action="store_true", help="Build portable onedir package and zip")
    parser.add_argument("--onefile", action="store_true", help="Build single standalone executable")
    parser.add_argument("--all", action="store_true", help="Build both standalone exe and portable zip")

    args = parser.parse_args()

    if args.onedir:
        build_executable(onefile=False)
    elif args.all:
        build_executable(onefile=True)
        build_executable(onefile=False)
    else:
        # Default: build true standalone single-file EXE
        build_executable(onefile=True)
