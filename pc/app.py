import sys
import argparse
from pathlib import Path

# Ensure pc/ directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

def run_gui():
    from PySide6.QtWidgets import QApplication
    from ui.main_window import MainWindow

    app = QApplication.instance()
    if not app:
        app = QApplication(sys.argv)
    
    app.setApplicationName("PhoneDrive PC")
    app.setOrganizationName("PhoneDrive")

    window = MainWindow()
    window.show()
    sys.exit(app.exec())

def run_cli(port: int = 8080, host: str = "0.0.0.0"):
    import uvicorn
    from config import get_local_ip
    from server import app

    # Set console encoding to UTF-8
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

    local_ip = get_local_ip()
    print("=" * 60)
    print(">> PhoneDrive PC Server (CLI Mode)")
    print(f"Local IP:      http://{local_ip}:{port}")
    print(f"Localhost:     http://127.0.0.1:{port}")
    print("=" * 60)

    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PhoneDrive PC — Personal Cloud & Cinema Server")
    parser.add_argument("--cli", "--headless", action="store_true", help="Run without GUI in CLI mode")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host address (default: 0.0.0.0)")

    args = parser.parse_args()

    if args.cli:
        run_cli(port=args.port, host=args.host)
    else:
        run_gui()
