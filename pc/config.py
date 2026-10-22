import os
import sys
import socket
from pathlib import Path

# Paths
if getattr(sys, "frozen", False):
    # Running in a PyInstaller bundle
    BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    ROOT_DIR = BASE_DIR
    WEB_DIST_DIR = BASE_DIR / "web-dashboard" / "dist"
    if not WEB_DIST_DIR.exists():
        WEB_DIST_DIR = Path(sys.executable).parent / "web-dashboard" / "dist"
    ICON_PATH = BASE_DIR / "icon.png"
    if not ICON_PATH.exists():
        ICON_PATH = Path(sys.executable).parent / "icon.png"
else:
    BASE_DIR = Path(__file__).resolve().parent
    ROOT_DIR = BASE_DIR.parent
    WEB_DIST_DIR = ROOT_DIR / "web-dashboard" / "dist"
    ICON_PATH = BASE_DIR / "icon.png"

# App Data Directory
APP_DATA_DIR = Path(os.path.expanduser("~")) / ".phonedrive_pc"
APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = APP_DATA_DIR / "phonedrive.db"
CACHE_DIR = APP_DATA_DIR / "cache"
THUMBNAILS_DIR = CACHE_DIR / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# Default Server Settings
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8080
FALLBACK_PORT = 8085

def get_local_ip() -> str:
    """Detects active local Wi-Fi or LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # Does not send actual packet, routes to exterior
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"
