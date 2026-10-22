# 💻 PhoneDrive PC — Personal Cloud & Cinema Server (Python)

PhoneDrive PC transforms your Windows / Mac / Linux computer into an ultra-fast local storage and media-streaming server accessible by any phone, tablet, laptop, or Android TV browser over your local Wi-Fi / LAN.

---

## 🚀 Quick Start

### 1. Launch with GUI (Recommended):
Double-click `run.bat` or run:
```bash
python app.py
```

### 2. Launch in CLI / Headless Mode:
```bash
python app.py --cli --port 8080
```

---

## ✨ Features

- 🎨 **Modern Dark Mode Desktop GUI:** Built with PySide6 (Qt) matching the PhoneDrive aesthetic.
- 📱 **Custom Gradient QR Code:** Scan directly with your phone camera or tablet to pair and access files instantly.
- 📁 **Folder Management:** Add or remove any folder on your PC (`Videos`, `Pictures`, `Downloads`, external hard drives) with a single click.
- ⚡ **Full Compatibility with PhoneDrive Web:** Seamlessly serves the React + Vite web dashboard (`web-dashboard/dist`) at `http://<PC_IP>:8080`.
- 🍿 **4K / 1080p Video Streaming (HTTP 206):** Instant scrubbing and seeking for movies and TV series.
- 🖼️ **Fast Image Thumbnails:** 2-tier caching with Pillow generates instant ~15KB thumbnails without choking your local network.
- 🔒 **Security & Pairing:** One-time pairing tokens and optional password protection.
- 🗂️ **System Tray Integration:** Minimizes cleanly to the Windows system tray.
