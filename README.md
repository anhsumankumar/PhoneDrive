# 📱 PhoneDrive — Personal Storage & Premium Cinema Platform
> **"Your Phone. Your Files. Your Personal Cinema & Drive."**

PhoneDrive transforms your Android phone into an ultra-fast personal storage and private media-streaming server accessible over local Wi-Fi / LAN by any authorized browser (laptop, PC, tablet, or smart TV) — **without uploading your files to any external cloud service and without duplicating files into hidden app storage**.

---

## 🎬 Premium Media Streaming Features (Cinema & Shows)

- 🎥 **Direct HTTP Range 206 Streaming:** Instant seeking and scrubbing of 4K UHD, 1080p FHD, and 720p HD videos directly from your phone's storage.
- 🍿 **Prime Video Inspired Media Library:**
  - **Cinematic Featured Hero Banner:** High-resolution backdrop with duration, resolution badges, and one-click playback.
  - **Continue Watching Row:** Persistent playback progress with visual progress bars and remaining time.
  - **Recently Added & Movies:** 16:9 cinematic media cards with quick play and details actions.
  - **TV Shows & Series Grouping:** Automatic regex detection of seasons and episodes (`S01E02`, `1x02`).
  - **Personal Watchlist:** Add and remove movies/shows to your private watchlist.
- 🎞️ **Cinematic Fullscreen Player (`CinematicVideoPlayer`):**
  - **Auto-Fading Controls:** Controls smoothly hide after 3 seconds of inactivity and reappear on mouse move, touch, or click.
  - **Interactive Scrubbing Timeline:** Live played progress bar, buffered data indicator, and timestamp hover previews.
  - **Multi-Track Subtitle Engine:** Supports embedded tracks and automatically detects sidecar `.srt` / `.vtt` files in the same directory, dynamically converting SubRip to WebVTT with full UTF-8 Unicode support (Hindi, English, etc.) and custom font size customization (Small, Normal, Large).
  - **Audio Language Switching:** Discovers embedded audio streams via Android `MediaExtractor` and allows seamless switching between language tracks.
  - **Variable Playback Speed:** 0.5x, 0.75x, 1x (Normal), 1.25x, 1.5x, 1.75x, 2x with real-time audio pitch preservation.
  - **Resume Playback Prompt:** Automatically remembers where you left off and prompts to resume or start from the beginning.
  - **Picture-in-Picture (PiP):** Keep watching while working on other browser tabs.
  - **Pro Keyboard Shortcuts:** Space/K (Play/Pause), Left/Right (Seek -10s / +10s), Up/Down (Volume +/-10%), M (Mute), F (Fullscreen), C (Subtitles toggle), Esc (Exit).

---

## 🌟 Core Storage Platform Highlights

- 🔒 **Zero Cloud Dependency & Zero Duplication:** Files stay in their original Android directories (DCIM, Movies, Documents, Downloads, etc.) accessed via Android's **Storage Access Framework (SAF)**.
- ⚡ **Embedded Local Web Server:** NanoHTTPD server runs directly on your phone as a **Foreground Service** with a persistent notification.
- 💻 **Standalone Web Dashboard:** A responsive, modern React + TypeScript + Tailwind CSS v4 dashboard bundled directly inside the Android APK (`assets/web/`) and served locally to any connected browser.
- 🔐 **Military-Grade Local Security:**
  - Multi-iteration salted SHA-256 password hashing.
  - Brute-force rate limiting with temporary lockout.
  - 256-bit cryptographically secure session tokens.
  - Short-lived, single-use QR pairing tokens.
- 📁 **Complete File Operations:** Directory navigation, search, high-resolution image preview, in-browser media player, file downloads, and authorized uploads.
- 🎨 **Minimal, Apple-Inspired Android UI:** Jetpack Compose interface with Dark Mode, real-time server status, live Wi-Fi IP display, and dynamic ZXing QR code pairing.

---

## 🏗️ System Architecture

```
+---------------------------------------------------------------------------------+
|                         Authorized Browser (Laptop / PC)                        |
|   +-------------------------------------------------------------------------+   |
|   |         React + TypeScript + Tailwind CSS v4 Cinema Dashboard           |   |
|   |  - Media Library (Featured Hero, Continue Watching, Movies, Series)     |   |
|   |  - Cinematic Video Player (HTTP 206 Range, Subtitles, Audio, PiP)       |   |
|   |  - WebVTT Subtitle Engine (UTF-8 Unicode, English, Hindi)               |   |
|   |  - File Manager (Photo Gallery, Downloads, Drag-and-Drop Uploads)       |   |
|   +-------------------------------------------------------------------------+   |
+----------------------------------------+----------------------------------------+
                                         | Local Wi-Fi / LAN (HTTP Range / REST)
+----------------------------------------v----------------------------------------+
|                         Android Device (PhoneDrive Server)                      |
|   +-------------------------------------------------------------------------+   |
|   |                     Jetpack Compose Native UI                           |   |
|   |   (Dashboard, Folder Permissions, Security, QR Code, Server State)      |   |
|   +-------------------------------------------------------------------------+   |
|   +-------------------------------------------------------------------------+   |
|   |                  Foreground Service + Notification                      |   |
|   |   (NanoHTTPD Engine, Network Monitor, Auto-Recovery)                    |   |
|   +-------------------------------------------------------------------------+   |
|   +-------------------------------------------------------------------------+   |
|   |               MediaManager & Metadata Extraction Engine                 |   |
|   |   (MediaMetadataRetriever, MediaExtractor, Frame Thumbnail Caching,      |   |
|   |    SRT-to-WebVTT Converter, TV Series Regex Parser, Watch Progress DB)  |   |
|   +-------------------------------------------------------------------------+   |
|   +-------------------------------------------------------------------------+   |
|   |                     Storage Access Framework (SAF)                      |   |
|   |   (Direct DocumentFile streaming, Zero Duplication Sandbox)             |   |
|   +-------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------+
```

---

## 📡 REST API Reference

The phone server exposes a clean, versioned REST API at `/api/v1/*`:

### Media & Cinema Endpoints
| Endpoint | Method | Auth Required | Description |
| :--- | :---: | :---: | :--- |
| `/api/v1/media` | `GET` | Yes | Get media library (featured, continue watching, movies, series, all) |
| `/api/v1/media/{id}` | `GET` | Yes | Get detailed metadata, duration, resolution, audio & subtitle tracks |
| `/api/v1/media/{id}/stream` | `GET` | Yes | Stream video with HTTP 206 Range requests |
| `/api/v1/media/{id}/thumbnail` | `GET` | Yes | Get cached video thumbnail frame (JPEG) |
| `/api/v1/media/{id}/tracks` | `GET` | Yes | Get list of embedded and sidecar audio/subtitle tracks |
| `/api/v1/media/{id}/subtitles/{trackId}` | `GET` | Yes | Stream subtitle converted to WebVTT (`text/vtt; charset=utf-8`) |
| `/api/v1/media/{id}/playback-progress` | `GET` | Yes | Get saved playback position, duration, and completion status |
| `/api/v1/media/{id}/playback-progress` | `POST` | Yes | Save playback progress and track preferences |
| `/api/v1/media/{id}/playback-progress` | `DELETE` | Yes | Remove item from Continue Watching / History |
| `/api/v1/media/{id}/watchlist` | `POST` | Yes | Toggle movie in personal watchlist |

### Storage & Authentication Endpoints
| Endpoint | Method | Auth Required | Description |
| :--- | :---: | :---: | :--- |
| `/api/v1/health` | `GET` | No | Server status, version, and uptime |
| `/api/v1/auth/login` | `POST` | No | Authenticate with master password; returns session token |
| `/api/v1/pairing/complete` | `POST` | No | Complete QR code pairing using one-time token |
| `/api/v1/auth/logout` | `POST` | Yes | Revoke active session token |
| `/api/v1/session` | `GET` | Yes | Current session validity and device details |
| `/api/v1/storage/status` | `GET` | Yes | Device internal/external storage stats |
| `/api/v1/folders` | `GET` | Yes | List of user-authorized folders |
| `/api/v1/files` | `GET` | Yes | Browse files and directories (`?folderId=...&parentId=...`) |
| `/api/v1/files/{id}/content` | `GET` | Yes | Download or stream file content (Supports HTTP 206 Range) |
| `/api/v1/files/upload` | `POST` | Yes | Upload file to authorized destination folder |
| `/api/v1/files/{id}/rename` | `POST` | Yes | Rename an authorized file or directory |
| `/api/v1/files/{id}` | `DELETE` | Yes | Delete an authorized file with confirmation |

---

## 🛠️ Build & Installation

### 1. Web Dashboard
```bash
cd web-dashboard
npm install
npm run build
```
The compiled files in `web-dashboard/dist` are embedded directly into `android/app/src/main/assets/web/`.

### 2. Android App
```bash
cd android
./gradlew test
./gradlew assembleDebug
```
To install directly to an attached USB physical phone or emulator:
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 🔒 Security & Privacy Model

- **No Remote Cloud Relays:** All data transfers happen strictly over your local Wi-Fi or LAN connection.
- **SAF Sandbox Protection:** The app cannot access any directory on your device unless you explicitly select it in the system folder picker.
- **Brute-Force Lockout:** Failed password attempts are rate-limited per client IP with temporary lockout.
- **Constant-Time Verification:** Hash comparison uses constant-time equality checks to prevent timing attacks.
- **Single-Use QR Pairing:** QR pairing tokens expire after 2 minutes and can only be used once.

---

## 🗺️ Roadmap
- [x] Phase 1 MVP: Server Foreground Service, Web Dashboard, SAF Integration, Video/Audio Range Streaming, QR Pairing.
- [x] Phase 2 File Management: In-browser upload, delete, rename, search.
- [x] Phase 3 Premium Cinema: Prime Video inspired media library, featured hero, continue watching, series grouping, multi-track audio & WebVTT subtitle engine, 0.5x-2x playback speed, PiP, keyboard shortcuts.
- [ ] Phase 4 Remote Access: Authenticated WireGuard/Tailscale encrypted mesh tunnel for off-network remote access without opening public router ports.
