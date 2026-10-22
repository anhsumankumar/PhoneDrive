import os
import sys
import shutil
import webbrowser
from pathlib import Path
from typing import Optional, List, Dict, Any

from PySide6.QtCore import Qt, QThread, Signal, QByteArray, QTimer, QSize
from PySide6.QtGui import QIcon, QPixmap, QImage, QClipboard, QDesktopServices, QColor
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QFrame, QStackedWidget, QListWidget, QListWidgetItem,
    QFileDialog, QMessageBox, QLineEdit, QCheckBox, QSystemTrayIcon, QMenu,
    QProgressBar, QScrollArea, QSizePolicy
)

import uvicorn
from config import ICON_PATH, get_local_ip, DEFAULT_PORT, APP_DATA_DIR, THUMBNAILS_DIR
from database import Database
from qr_generator import generate_qr_bytes
from ui.styles import DARK_STYLE

class UvicornServerThread(QThread):
    started_signal = Signal()
    stopped_signal = Signal()
    error_signal = Signal(str)

    def __init__(self, host: str, port: int):
        super().__init__()
        self.host = host
        self.port = port
        self.server: Optional[uvicorn.Server] = None

    def run(self):
        try:
            from server import app
            config = uvicorn.Config(
                app=app,
                host=self.host,
                port=self.port,
                log_level="info",
                loop="asyncio"
            )
            self.server = uvicorn.Server(config)
            self.started_signal.emit()
            self.server.run()
            self.stopped_signal.emit()
        except Exception as e:
            self.error_signal.emit(str(e))

    def stop(self):
        if self.server:
            self.server.should_exit = True


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.db = Database()
        self.server_thread: Optional[UvicornServerThread] = None
        self.is_running = False
        self.current_pair_token: Optional[str] = None
        self.local_ip = get_local_ip()
        self.port = int(self.db.get_setting("port", str(DEFAULT_PORT)))

        self._ensure_default_folders()
        self._init_ui()
        self._setup_tray()

    def _ensure_default_folders(self):
        """Adds user's standard media folders on first run if none configured."""
        existing = self.db.get_folders()
        if not existing:
            home = Path.home()
            defaults = [
                ("Pictures", home / "Pictures"),
                ("Videos", home / "Videos"),
                ("Documents", home / "Documents"),
            ]
            for name, path in defaults:
                if path.exists():
                    self.db.add_folder(name, str(path))

    def _init_ui(self):
        self.setWindowTitle("PhoneDrive PC — Personal Cloud & Cinema Server")
        self.setMinimumSize(980, 680)
        self.resize(1040, 720)
        self.setStyleSheet(DARK_STYLE)

        if ICON_PATH.exists():
            self.setWindowIcon(QIcon(str(ICON_PATH)))

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        root_layout = QHBoxLayout(central_widget)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)

        # ---------------- 1. LEFT SIDEBAR NAVIGATION ----------------
        sidebar_frame = QFrame()
        sidebar_frame.setObjectName("SidebarFrame")
        sidebar_frame.setFixedWidth(230)
        sidebar_layout = QVBoxLayout(sidebar_frame)
        sidebar_layout.setContentsMargins(16, 22, 16, 20)
        sidebar_layout.setSpacing(12)

        # Brand Logo + Title
        brand_layout = QHBoxLayout()
        brand_layout.setSpacing(12)
        if ICON_PATH.exists():
            logo_lbl = QLabel()
            pix = QPixmap(str(ICON_PATH)).scaled(38, 38, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            logo_lbl.setPixmap(pix)
            brand_layout.addWidget(logo_lbl)

        brand_text_vbox = QVBoxLayout()
        brand_text_vbox.setSpacing(1)
        app_title = QLabel("PhoneDrive")
        app_title.setStyleSheet("font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;")
        app_sub = QLabel("Personal Cloud & Cinema")
        app_sub.setStyleSheet("font-size: 11px; color: #64748b; font-weight: 500;")
        brand_text_vbox.addWidget(app_title)
        brand_text_vbox.addWidget(app_sub)
        brand_layout.addLayout(brand_text_vbox)
        brand_layout.addStretch()
        sidebar_layout.addLayout(brand_layout)

        # Subtle Divider
        sidebar_divider = QFrame()
        sidebar_divider.setFixedHeight(1)
        sidebar_divider.setStyleSheet("background-color: rgba(255, 255, 255, 0.06); margin: 6px 0px;")
        sidebar_layout.addWidget(sidebar_divider)

        # Nav Buttons
        nav_label = QLabel("NAVIGATION")
        nav_label.setStyleSheet("font-size: 10px; font-weight: 700; color: #475569; letter-spacing: 0.8px; padding-left: 6px;")
        sidebar_layout.addWidget(nav_label)

        self.nav_btns = []
        nav_items = [
            ("⚡  Dashboard", 0),
            ("📁  Shared Folders", 1),
            ("🔒  Security & Devices", 2),
            ("📋  Activity Logs", 3),
            ("⚙️  Configuration", 4),
        ]

        for text, page_idx in nav_items:
            btn = QPushButton(text)
            btn.setProperty("class", "NavBtn")
            btn.setCursor(Qt.PointingHandCursor)
            btn.clicked.connect(lambda checked=False, idx=page_idx: self._switch_page(idx))
            sidebar_layout.addWidget(btn)
            self.nav_btns.append(btn)

        sidebar_layout.addStretch()

        # Sidebar Bottom Server Status Mini-Card
        self.sidebar_status_card = QFrame()
        self.sidebar_status_card.setProperty("class", "SubCard")
        sidebar_status_layout = QVBoxLayout(self.sidebar_status_card)
        sidebar_status_layout.setContentsMargins(12, 12, 12, 12)
        sidebar_status_layout.setSpacing(8)

        self.sidebar_status_dot = QLabel("● SERVER OFFLINE")
        self.sidebar_status_dot.setProperty("class", "BadgeGrey")
        self.sidebar_status_ip = QLabel(f"{self.local_ip}:{self.port}")
        self.sidebar_status_ip.setStyleSheet("font-size: 11px; font-family: Consolas, monospace; color: #94a3b8;")

        self.sidebar_toggle_btn = QPushButton("Start Server")
        self.sidebar_toggle_btn.setProperty("class", "PrimaryBtn")
        self.sidebar_toggle_btn.setStyleSheet("font-size: 11px; padding: 7px 12px;")
        self.sidebar_toggle_btn.clicked.connect(self.toggle_server)

        sidebar_status_layout.addWidget(self.sidebar_status_dot)
        sidebar_status_layout.addWidget(self.sidebar_status_ip)
        sidebar_status_layout.addWidget(self.sidebar_toggle_btn)
        sidebar_layout.addWidget(self.sidebar_status_card)

        root_layout.addWidget(sidebar_frame)

        # ---------------- 2. RIGHT MAIN CONTENT AREA ----------------
        content_wrapper = QWidget()
        content_layout = QVBoxLayout(content_wrapper)
        content_layout.setContentsMargins(28, 20, 28, 20)
        content_layout.setSpacing(18)

        # Top Bar (Header Title + Wi-Fi Chip + Quick Web Access)
        top_bar = QHBoxLayout()
        top_bar.setSpacing(12)

        self.header_title_lbl = QLabel("Dashboard Overview")
        self.header_title_lbl.setStyleSheet("font-size: 21px; font-weight: 700; color: #ffffff;")
        top_bar.addWidget(self.header_title_lbl)

        top_bar.addStretch()

        # Wi-Fi Chip
        self.wifi_chip = QPushButton(f"🌐 Wi-Fi: {self.local_ip}")
        self.wifi_chip.setProperty("class", "SecondaryBtn")
        self.wifi_chip.setToolTip("Click to copy Wi-Fi address")
        self.wifi_chip.clicked.connect(lambda: self._copy_text(self.local_ip, "Wi-Fi IP Address"))
        top_bar.addWidget(self.wifi_chip)

        # Open Web Button
        self.top_open_web_btn = QPushButton("Open Web Dashboard")
        self.top_open_web_btn.setProperty("class", "SecondaryBtn")
        self.top_open_web_btn.clicked.connect(self.open_in_browser)
        top_bar.addWidget(self.top_open_web_btn)

        content_layout.addLayout(top_bar)

        # Stacked Pages
        self.stack = QStackedWidget()
        self.stack.addWidget(self._create_dashboard_page())
        self.stack.addWidget(self._create_folders_page())
        self.stack.addWidget(self._create_security_page())
        self.stack.addWidget(self._create_activity_page())
        self.stack.addWidget(self._create_settings_page())
        content_layout.addWidget(self.stack)

        root_layout.addWidget(content_wrapper)

        # Initial selection
        self._switch_page(0)
        self.update_qr_code()

    def _switch_page(self, index: int):
        self.stack.setCurrentIndex(index)
        titles = [
            "Dashboard Overview",
            "Shared Folders Management",
            "Security & Active Devices",
            "Real-Time Activity Audit",
            "Server Configuration",
        ]
        self.header_title_lbl.setText(titles[index])

        for i, btn in enumerate(self.nav_btns):
            is_active = (i == index)
            btn.setProperty("active", "true" if is_active else "false")
            btn.setStyle(btn.style())

        if index == 1:
            self.refresh_folders_list()
        elif index == 2:
            self.refresh_security_tab()
        elif index == 3:
            self.refresh_activity_feed()

    # =========================================================================
    # PAGE 0: DASHBOARD OVERVIEW
    # =========================================================================
    def _create_dashboard_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        # 1. Hero Server Status Card
        self.hero_card = QFrame()
        self.hero_card.setProperty("class", "HeroCard")
        hero_layout = QHBoxLayout(self.hero_card)
        hero_layout.setContentsMargins(22, 18, 22, 18)
        hero_layout.setSpacing(16)

        hero_text_vbox = QVBoxLayout()
        hero_text_vbox.setSpacing(4)
        self.hero_status_badge = QLabel("● SERVER IDLE (STOPPED)")
        self.hero_status_badge.setProperty("class", "BadgeGrey")

        self.hero_url_lbl = QLabel("Click 'Start Server' to broadcast your personal cinema and storage.")
        self.hero_url_lbl.setStyleSheet("font-size: 13px; color: #94a3b8; font-weight: 500;")

        hero_text_vbox.addWidget(self.hero_status_badge)
        hero_text_vbox.addWidget(self.hero_url_lbl)
        hero_layout.addLayout(hero_text_vbox)

        hero_layout.addStretch()

        self.hero_toggle_btn = QPushButton("▶  Start Server")
        self.hero_toggle_btn.setProperty("class", "PrimaryBtn")
        self.hero_toggle_btn.setMinimumHeight(44)
        self.hero_toggle_btn.clicked.connect(self.toggle_server)
        hero_layout.addWidget(self.hero_toggle_btn)

        layout.addWidget(self.hero_card)

        # 2. Metrics Row (3 Stat Cards)
        stats_row = QHBoxLayout()
        stats_row.setSpacing(14)

        # Metric 1: Folders
        self.stat_folders_card = self._create_metric_card("📁", "Authorized Folders", "0 Folders", "Accessible over Wi-Fi")
        stats_row.addWidget(self.stat_folders_card)

        # Metric 2: Sessions
        self.stat_sessions_card = self._create_metric_card("📱", "Paired Devices", "0 Devices", "Active browser sessions")
        stats_row.addWidget(self.stat_sessions_card)

        # Metric 3: Disk Storage
        self.stat_disk_card = self._create_disk_metric_card()
        stats_row.addWidget(self.stat_disk_card)

        layout.addLayout(stats_row)

        # 3. Connection & QR Grid
        connect_grid = QHBoxLayout()
        connect_grid.setSpacing(16)

        # Left: QR Code Card
        qr_card = QFrame()
        qr_card.setProperty("class", "Card")
        qr_card.setFixedWidth(310)
        qr_vbox = QVBoxLayout(qr_card)
        qr_vbox.setContentsMargins(20, 18, 20, 18)
        qr_vbox.setSpacing(10)

        qr_header = QLabel("Instant Phone / TV Pairing")
        qr_header.setStyleSheet("font-size: 14px; font-weight: 600; color: #ffffff;")
        qr_vbox.addWidget(qr_header)

        self.qr_label = QLabel()
        self.qr_label.setFixedSize(270, 270)
        self.qr_label.setStyleSheet("background-color: #080c14; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08);")
        self.qr_label.setAlignment(Qt.AlignCenter)
        qr_vbox.addWidget(self.qr_label)

        qr_hint = QLabel("Scan with your mobile camera to open dashboard automatically.")
        qr_hint.setStyleSheet("font-size: 11px; color: #64748b; text-align: center;")
        qr_hint.setWordWrap(True)
        qr_vbox.addWidget(qr_hint)

        qr_actions = QHBoxLayout()
        self.copy_qr_btn = QPushButton("Copy Link")
        self.copy_qr_btn.setProperty("class", "SecondaryBtn")
        self.copy_qr_btn.clicked.connect(self.copy_access_link)

        self.refresh_qr_btn = QPushButton("Refresh QR")
        self.refresh_qr_btn.setProperty("class", "SecondaryBtn")
        self.refresh_qr_btn.clicked.connect(self.update_qr_code)

        qr_actions.addWidget(self.copy_qr_btn)
        qr_actions.addWidget(self.refresh_qr_btn)
        qr_vbox.addLayout(qr_actions)

        connect_grid.addWidget(qr_card)

        # Right: Quick Connect Instructions & Feature Highlights
        guide_card = QFrame()
        guide_card.setProperty("class", "Card")
        guide_vbox = QVBoxLayout(guide_card)
        guide_vbox.setContentsMargins(22, 20, 22, 20)
        guide_vbox.setSpacing(14)

        guide_title = QLabel("Fast Local Network Access")
        guide_title.setStyleSheet("font-size: 15px; font-weight: 700; color: #ffffff;")
        guide_vbox.addWidget(guide_title)

        # URL Box Container
        url_box = QFrame()
        url_box.setProperty("class", "SubCard")
        url_box_layout = QHBoxLayout(url_box)
        url_box_layout.setContentsMargins(14, 10, 14, 10)

        self.url_display_lbl = QLabel(f"http://{self.local_ip}:{self.port}")
        self.url_display_lbl.setStyleSheet("font-size: 13px; font-weight: 600; font-family: Consolas, monospace; color: #38bdf8;")
        url_box_layout.addWidget(self.url_display_lbl)
        url_box_layout.addStretch()

        copy_url_btn = QPushButton("Copy")
        copy_url_btn.setProperty("class", "SecondaryBtn")
        copy_url_btn.setStyleSheet("font-size: 11px; padding: 4px 12px;")
        copy_url_btn.clicked.connect(self.copy_access_link)
        url_box_layout.addWidget(copy_url_btn)

        guide_vbox.addWidget(url_box)

        # Guide bullet steps
        steps = [
            ("1. Local Network", "Ensure your phone or tablet is connected to the same Wi-Fi router."),
            ("2. Zero Internet Needed", "All video transcoding and file transfers stay 100% inside your local network at ultra-fast gigabit speeds."),
            ("3. Cinema & Shows", "Access TV shows with subtitle tracks, multi-language audio switching, and quality selection (4K, 1080p, 720p)."),
        ]

        for s_title, s_desc in steps:
            s_frame = QFrame()
            s_frame.setProperty("class", "SubCard")
            s_layout = QVBoxLayout(s_frame)
            s_layout.setContentsMargins(12, 10, 12, 10)
            s_layout.setSpacing(2)

            t_lbl = QLabel(s_title)
            t_lbl.setStyleSheet("font-size: 12px; font-weight: 600; color: #f1f5f9;")
            d_lbl = QLabel(s_desc)
            d_lbl.setStyleSheet("font-size: 11px; color: #94a3b8;")
            d_lbl.setWordWrap(True)

            s_layout.addWidget(t_lbl)
            s_layout.addWidget(d_lbl)
            guide_vbox.addWidget(s_frame)

        guide_vbox.addStretch()
        connect_grid.addWidget(guide_card)

        layout.addLayout(connect_grid)
        self._update_dashboard_metrics()
        return page

    def _create_metric_card(self, icon: str, title: str, default_val: str, subtitle: str) -> QFrame:
        card = QFrame()
        card.setProperty("class", "StatCard")
        vbox = QVBoxLayout(card)
        vbox.setContentsMargins(16, 14, 16, 14)
        vbox.setSpacing(4)

        top_h = QHBoxLayout()
        lbl_title = QLabel(title)
        lbl_title.setStyleSheet("font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase;")
        lbl_icon = QLabel(icon)
        lbl_icon.setStyleSheet("font-size: 16px;")
        top_h.addWidget(lbl_title)
        top_h.addStretch()
        top_h.addWidget(lbl_icon)
        vbox.addLayout(top_h)

        val_lbl = QLabel(default_val)
        val_lbl.setObjectName("StatValue")
        val_lbl.setStyleSheet("font-size: 20px; font-weight: 700; color: #ffffff;")
        vbox.addWidget(val_lbl)

        sub_lbl = QLabel(subtitle)
        sub_lbl.setStyleSheet("font-size: 11px; color: #64748b;")
        vbox.addWidget(sub_lbl)

        return card

    def _create_disk_metric_card(self) -> QFrame:
        card = QFrame()
        card.setProperty("class", "StatCard")
        vbox = QVBoxLayout(card)
        vbox.setContentsMargins(16, 14, 16, 14)
        vbox.setSpacing(4)

        top_h = QHBoxLayout()
        lbl_title = QLabel("PC Free Storage")
        lbl_title.setStyleSheet("font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase;")
        lbl_icon = QLabel("💾")
        lbl_icon.setStyleSheet("font-size: 16px;")
        top_h.addWidget(lbl_title)
        top_h.addStretch()
        top_h.addWidget(lbl_icon)
        vbox.addLayout(top_h)

        self.disk_val_lbl = QLabel("Checking...")
        self.disk_val_lbl.setStyleSheet("font-size: 20px; font-weight: 700; color: #ffffff;")
        vbox.addWidget(self.disk_val_lbl)

        self.disk_progress = QProgressBar()
        self.disk_progress.setFixedHeight(6)
        self.disk_progress.setTextVisible(False)
        vbox.addWidget(self.disk_progress)

        self._refresh_disk_usage()
        return card

    def _refresh_disk_usage(self):
        try:
            root_drive = Path.home().drive or "C:"
            total, used, free = shutil.disk_usage(root_drive)
            free_gb = free / (1024 ** 3)
            used_pct = int((used / total) * 100) if total > 0 else 50
            self.disk_val_lbl.setText(f"{free_gb:.1f} GB Free")
            self.disk_progress.setValue(used_pct)
        except Exception:
            self.disk_val_lbl.setText("Ready")

    def _update_dashboard_metrics(self):
        # Update folders stat
        folders = self.db.get_folders()
        lbl1 = self.stat_folders_card.findChild(QLabel, "StatValue")
        if lbl1:
            lbl1.setText(f"{len(folders)} Folders")

        # Update sessions stat
        sessions = self.db.get_sessions()
        lbl2 = self.stat_sessions_card.findChild(QLabel, "StatValue")
        if lbl2:
            lbl2.setText(f"{len(sessions)} Devices")

        self._refresh_disk_usage()

    # =========================================================================
    # PAGE 1: SHARED FOLDERS
    # =========================================================================
    def _create_folders_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(14)

        top_row = QHBoxLayout()
        desc = QLabel("Manage directories shared with phones, smart TVs, and browser devices.")
        desc.setStyleSheet("color: #94a3b8; font-size: 13px;")
        top_row.addWidget(desc)
        top_row.addStretch()

        add_btn = QPushButton("+ Add Shared Folder")
        add_btn.setProperty("class", "PrimaryBtn")
        add_btn.setStyleSheet("font-size: 12px; padding: 8px 16px;")
        add_btn.clicked.connect(self.add_folder_dialog)
        top_row.addWidget(add_btn)
        layout.addLayout(top_row)

        self.folder_list = QListWidget()
        layout.addWidget(self.folder_list)

        self.refresh_folders_list()
        return page

    def refresh_folders_list(self):
        self.folder_list.clear()
        folders = self.db.get_folders()
        self._update_dashboard_metrics()

        if not folders:
            item = QListWidgetItem("No shared folders added yet. Click '+ Add Shared Folder' above.")
            item.setFlags(Qt.NoItemFlags)
            self.folder_list.addItem(item)
            return

        for f in folders:
            p = Path(f["path"])
            exists = p.exists()

            item_widget = QFrame()
            item_widget.setProperty("class", "SubCard")
            h_layout = QHBoxLayout(item_widget)
            h_layout.setContentsMargins(14, 10, 14, 10)
            h_layout.setSpacing(12)

            icon_lbl = QLabel("📁" if exists else "⚠️")
            icon_lbl.setStyleSheet("font-size: 24px;")
            h_layout.addWidget(icon_lbl)

            text_vbox = QVBoxLayout()
            text_vbox.setSpacing(2)
            name_lbl = QLabel(f["name"])
            name_lbl.setStyleSheet("font-weight: 600; color: #38bdf8; font-size: 14px;")
            path_lbl = QLabel(str(p))
            path_lbl.setStyleSheet("color: #94a3b8; font-size: 11px;")
            text_vbox.addWidget(name_lbl)
            text_vbox.addWidget(path_lbl)
            h_layout.addLayout(text_vbox)

            h_layout.addStretch()

            if exists:
                open_btn = QPushButton("Open in Explorer")
                open_btn.setProperty("class", "SecondaryBtn")
                open_btn.setStyleSheet("font-size: 11px; padding: 5px 12px;")
                open_btn.clicked.connect(lambda checked=False, target=p: os.startfile(str(target)))
                h_layout.addWidget(open_btn)

            del_btn = QPushButton("Remove")
            del_btn.setProperty("class", "SecondaryBtn")
            del_btn.setStyleSheet("color: #f87171; border-color: rgba(239, 68, 68, 0.3); font-size: 11px; padding: 5px 12px;")
            del_btn.clicked.connect(lambda checked=False, fid=f["id"]: self.remove_folder(fid))
            h_layout.addWidget(del_btn)

            list_item = QListWidgetItem()
            list_item.setSizeHint(QSize(0, 68))
            self.folder_list.addItem(list_item)
            self.folder_list.setItemWidget(list_item, item_widget)

    def add_folder_dialog(self):
        dir_path = QFileDialog.getExistingDirectory(self, "Select Folder to Share with PhoneDrive")
        if dir_path:
            p = Path(dir_path)
            self.db.add_folder(p.name, str(p))
            self.refresh_folders_list()

    def remove_folder(self, folder_id: str):
        self.db.remove_folder(folder_id)
        self.refresh_folders_list()

    # =========================================================================
    # PAGE 2: SECURITY & DEVICES
    # =========================================================================
    def _create_security_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(14)

        # 1. Status Banner Card
        self.sec_status_card = QFrame()
        self.sec_status_card.setProperty("class", "SubCard")
        sec_status_layout = QHBoxLayout(self.sec_status_card)
        sec_status_layout.setContentsMargins(18, 14, 18, 14)

        status_text_vbox = QVBoxLayout()
        status_text_vbox.setSpacing(4)
        self.sec_badge = QLabel()
        self.sec_desc = QLabel()
        self.sec_desc.setStyleSheet("color: #94a3b8; font-size: 12px;")
        status_text_vbox.addWidget(self.sec_badge)
        status_text_vbox.addWidget(self.sec_desc)
        sec_status_layout.addLayout(status_text_vbox)

        sec_status_layout.addStretch()

        self.remove_pwd_btn = QPushButton("Remove Password")
        self.remove_pwd_btn.setProperty("class", "SecondaryBtn")
        self.remove_pwd_btn.setStyleSheet("color: #f87171; border-color: rgba(239, 68, 68, 0.3); font-size: 12px; padding: 6px 16px;")
        self.remove_pwd_btn.clicked.connect(self.remove_password)
        sec_status_layout.addWidget(self.remove_pwd_btn)

        layout.addWidget(self.sec_status_card)

        # 2. Set / Change Password Card
        pwd_form_card = QFrame()
        pwd_form_card.setProperty("class", "SubCard")
        pwd_form_layout = QVBoxLayout(pwd_form_card)
        pwd_form_layout.setContentsMargins(18, 16, 18, 16)
        pwd_form_layout.setSpacing(12)

        self.pwd_form_title = QLabel("Set Master Password")
        self.pwd_form_title.setStyleSheet("font-size: 14px; font-weight: 700; color: #ffffff;")
        pwd_form_layout.addWidget(self.pwd_form_title)

        inputs_grid = QHBoxLayout()
        inputs_grid.setSpacing(14)

        v1 = QVBoxLayout()
        lbl1 = QLabel("New Password:")
        lbl1.setStyleSheet("color: #94a3b8; font-size: 11px;")
        self.new_pwd_input = QLineEdit()
        self.new_pwd_input.setPlaceholderText("Enter master password (min 4 chars)")
        self.new_pwd_input.setEchoMode(QLineEdit.Password)
        v1.addWidget(lbl1)
        v1.addWidget(self.new_pwd_input)
        inputs_grid.addLayout(v1)

        v2 = QVBoxLayout()
        lbl2 = QLabel("Confirm Password:")
        lbl2.setStyleSheet("color: #94a3b8; font-size: 11px;")
        self.confirm_pwd_input = QLineEdit()
        self.confirm_pwd_input.setPlaceholderText("Confirm master password")
        self.confirm_pwd_input.setEchoMode(QLineEdit.Password)
        v2.addWidget(lbl2)
        v2.addWidget(self.confirm_pwd_input)
        inputs_grid.addLayout(v2)

        pwd_form_layout.addLayout(inputs_grid)

        actions_row = QHBoxLayout()
        self.show_pwd_chk = QCheckBox("Show Passwords")
        self.show_pwd_chk.toggled.connect(self._toggle_show_passwords)
        actions_row.addWidget(self.show_pwd_chk)

        actions_row.addStretch()

        self.save_pwd_btn = QPushButton("Save Master Password")
        self.save_pwd_btn.setProperty("class", "PrimaryBtn")
        self.save_pwd_btn.setStyleSheet("font-size: 12px; padding: 7px 20px;")
        self.save_pwd_btn.clicked.connect(self.save_password)
        actions_row.addWidget(self.save_pwd_btn)

        pwd_form_layout.addLayout(actions_row)
        layout.addWidget(pwd_form_card)

        # 3. Active Sessions Header & List
        sessions_header = QHBoxLayout()
        self.sessions_count_lbl = QLabel("Active Paired Browser Devices")
        self.sessions_count_lbl.setStyleSheet("font-size: 14px; font-weight: 700; color: #ffffff;")
        sessions_header.addWidget(self.sessions_count_lbl)
        sessions_header.addStretch()

        disconnect_all_btn = QPushButton("Disconnect All Devices")
        disconnect_all_btn.setProperty("class", "SecondaryBtn")
        disconnect_all_btn.setStyleSheet("color: #f87171; font-size: 11px; padding: 5px 12px;")
        disconnect_all_btn.clicked.connect(self.disconnect_all_sessions)
        sessions_header.addWidget(disconnect_all_btn)
        layout.addLayout(sessions_header)

        self.sessions_list = QListWidget()
        layout.addWidget(self.sessions_list)

        self.refresh_security_tab()
        return page

    def _toggle_show_passwords(self, checked: bool):
        mode = QLineEdit.Normal if checked else QLineEdit.Password
        self.new_pwd_input.setEchoMode(mode)
        self.confirm_pwd_input.setEchoMode(mode)

    def refresh_security_tab(self):
        is_set = self.db.is_password_set()
        if is_set:
            self.sec_badge.setText("● PASSWORD PROTECTION: ACTIVE")
            self.sec_badge.setProperty("class", "BadgeGreen")
            self.sec_desc.setText("Web dashboard and TV require this master password or approved QR pairing.")
            self.remove_pwd_btn.setVisible(True)
            self.pwd_form_title.setText("Change Master Password")
        else:
            self.sec_badge.setText("⚠️ OPEN ACCESS (NO PASSWORD)")
            self.sec_badge.setProperty("class", "BadgeAmber")
            self.sec_desc.setText("Devices on your Wi-Fi network can browse authorized folders without a password.")
            self.remove_pwd_btn.setVisible(False)
            self.pwd_form_title.setText("Set Master Password")

        self.sec_badge.setStyle(self.sec_badge.style())
        self.refresh_sessions_list()

    def save_password(self):
        p1 = self.new_pwd_input.text().strip()
        p2 = self.confirm_pwd_input.text().strip()

        if not p1:
            QMessageBox.warning(self, "Invalid Password", "Password cannot be empty.")
            return

        if len(p1) < 4:
            QMessageBox.warning(self, "Password Too Short", "Password must be at least 4 characters long.")
            return

        if p1 != p2:
            QMessageBox.warning(self, "Passwords Mismatch", "Passwords do not match.")
            return

        self.db.set_password(p1)
        self.new_pwd_input.clear()
        self.confirm_pwd_input.clear()
        self.refresh_security_tab()
        QMessageBox.information(self, "Password Saved", "Master password successfully saved!")

    def remove_password(self):
        reply = QMessageBox.question(
            self,
            "Remove Password",
            "Are you sure you want to disable password protection?\n\nThis will allow open access on your local Wi-Fi.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.db.remove_password()
            self.refresh_security_tab()

    def disconnect_all_sessions(self):
        count = self.db.revoke_all_sessions()
        self.refresh_sessions_list()
        QMessageBox.information(self, "Sessions Disconnected", f"Revoked {count} active browser session(s).")

    def refresh_sessions_list(self):
        self.sessions_list.clear()
        sessions = self.db.get_sessions()
        self.sessions_count_lbl.setText(f"Active Paired Browser Devices ({len(sessions)})")
        self._update_dashboard_metrics()

        if not sessions:
            item = QListWidgetItem("No active paired browser sessions yet.")
            item.setFlags(Qt.NoItemFlags)
            self.sessions_list.addItem(item)
            return

        for s in sessions:
            item_widget = QFrame()
            item_widget.setProperty("class", "SubCard")
            h_layout = QHBoxLayout(item_widget)
            h_layout.setContentsMargins(14, 10, 14, 10)
            h_layout.setSpacing(12)

            icon_lbl = QLabel("💻")
            icon_lbl.setStyleSheet("font-size: 20px;")
            h_layout.addWidget(icon_lbl)

            text_vbox = QVBoxLayout()
            text_vbox.setSpacing(2)
            dev_lbl = QLabel(s["device_name"])
            dev_lbl.setStyleSheet("font-weight: 600; color: #f1f5f9; font-size: 13px;")
            token_preview = f"Session Token: {s['token'][:10]}... | Active Device"
            sub_lbl = QLabel(token_preview)
            sub_lbl.setStyleSheet("color: #94a3b8; font-size: 11px;")
            text_vbox.addWidget(dev_lbl)
            text_vbox.addWidget(sub_lbl)
            h_layout.addLayout(text_vbox)

            h_layout.addStretch()

            revoke_btn = QPushButton("Disconnect")
            revoke_btn.setProperty("class", "SecondaryBtn")
            revoke_btn.setStyleSheet("color: #f87171; font-size: 11px; padding: 5px 12px;")
            revoke_btn.clicked.connect(lambda checked=False, tok=s["token"]: self.revoke_session(tok))
            h_layout.addWidget(revoke_btn)

            list_item = QListWidgetItem()
            list_item.setSizeHint(QSize(0, 68))
            self.sessions_list.addItem(list_item)
            self.sessions_list.setItemWidget(list_item, item_widget)

    def revoke_session(self, token: str):
        self.db.revoke_session(token)
        self.refresh_sessions_list()

    # =========================================================================
    # PAGE 3: ACTIVITY LOGS
    # =========================================================================
    def _create_activity_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(14)

        top_row = QHBoxLayout()
        desc = QLabel("Audit trail of device connections, QR pairings, and streaming sessions:")
        desc.setStyleSheet("color: #94a3b8; font-size: 13px;")
        top_row.addWidget(desc)
        top_row.addStretch()

        refresh_btn = QPushButton("Refresh Activity")
        refresh_btn.setProperty("class", "SecondaryBtn")
        refresh_btn.clicked.connect(self.refresh_activity_feed)
        top_row.addWidget(refresh_btn)
        layout.addLayout(top_row)

        self.activity_list = QListWidget()
        layout.addWidget(self.activity_list)

        self.refresh_activity_feed()
        return page

    def refresh_activity_feed(self):
        self.activity_list.clear()
        logs = self.db.get_recent_logs(40)

        if not logs:
            item = QListWidgetItem("No connection activity logged yet.")
            item.setFlags(Qt.NoItemFlags)
            self.activity_list.addItem(item)
            return

        import datetime
        for log in logs:
            item_widget = QFrame()
            item_widget.setProperty("class", "SubCard")
            h_layout = QHBoxLayout(item_widget)
            h_layout.setContentsMargins(14, 10, 14, 10)
            h_layout.setSpacing(12)

            # Status Icon
            is_success = log["status"].upper() == "SUCCESS"
            status_chip = QLabel("SUCCESS" if is_success else log["status"])
            status_chip.setProperty("class", "BadgeGreen" if is_success else "BadgeAmber")
            status_chip.setStyle(status_chip.style())
            h_layout.addWidget(status_chip)

            text_vbox = QVBoxLayout()
            text_vbox.setSpacing(2)
            act_lbl = QLabel(log["action"])
            act_lbl.setStyleSheet("font-weight: 600; color: #f1f5f9; font-size: 13px;")
            ip_lbl = QLabel(f"Client IP: {log['client_ip']}")
            ip_lbl.setStyleSheet("color: #94a3b8; font-size: 11px;")
            text_vbox.addWidget(act_lbl)
            text_vbox.addWidget(ip_lbl)
            h_layout.addLayout(text_vbox)

            h_layout.addStretch()

            ts = log["created_at"] / 1000.0
            dt_str = datetime.datetime.fromtimestamp(ts).strftime("%b %d, %H:%M:%S")
            time_lbl = QLabel(dt_str)
            time_lbl.setStyleSheet("color: #64748b; font-size: 11px; font-family: Consolas, monospace;")
            h_layout.addWidget(time_lbl)

            list_item = QListWidgetItem()
            list_item.setSizeHint(QSize(0, 64))
            self.activity_list.addItem(list_item)
            self.activity_list.setItemWidget(list_item, item_widget)

    # =========================================================================
    # PAGE 4: CONFIGURATION & SETTINGS
    # =========================================================================
    def _create_settings_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        # Port Setting Card
        port_card = QFrame()
        port_card.setProperty("class", "SubCard")
        port_layout = QVBoxLayout(port_card)
        port_layout.setContentsMargins(18, 16, 18, 16)
        port_layout.setSpacing(12)

        port_title = QLabel("Network & HTTP Port")
        port_title.setStyleSheet("font-size: 14px; font-weight: 700; color: #ffffff;")
        port_layout.addWidget(port_title)

        port_box = QHBoxLayout()
        port_lbl = QLabel("Server HTTP Port:")
        port_lbl.setStyleSheet("color: #e2e8f0; font-size: 13px;")
        self.port_input = QLineEdit(str(self.port))
        self.port_input.setFixedWidth(120)
        port_box.addWidget(port_lbl)
        port_box.addWidget(self.port_input)
        port_box.addStretch()

        save_port_btn = QPushButton("Save Port")
        save_port_btn.setProperty("class", "PrimaryBtn")
        save_port_btn.setStyleSheet("font-size: 12px; padding: 7px 18px;")
        save_port_btn.clicked.connect(self.save_settings)
        port_box.addWidget(save_port_btn)
        port_layout.addLayout(port_box)

        layout.addWidget(port_card)

        # Storage & Cache Info
        data_card = QFrame()
        data_card.setProperty("class", "SubCard")
        data_layout = QVBoxLayout(data_card)
        data_layout.setContentsMargins(18, 16, 18, 16)
        data_layout.setSpacing(12)

        data_title = QLabel("Local Database & Cache Storage")
        data_title.setStyleSheet("font-size: 14px; font-weight: 700; color: #ffffff;")
        data_layout.addWidget(data_title)

        data_path_lbl = QLabel(f"Application Data Folder:\n{APP_DATA_DIR}")
        data_path_lbl.setStyleSheet("color: #94a3b8; font-size: 12px; font-family: Consolas, monospace;")
        data_layout.addWidget(data_path_lbl)

        btn_row = QHBoxLayout()
        open_folder_btn = QPushButton("Open App Data Folder")
        open_folder_btn.setProperty("class", "SecondaryBtn")
        open_folder_btn.clicked.connect(lambda: os.startfile(str(APP_DATA_DIR)))
        btn_row.addWidget(open_folder_btn)

        clear_cache_btn = QPushButton("Clear Thumbnail Cache")
        clear_cache_btn.setProperty("class", "SecondaryBtn")
        clear_cache_btn.setStyleSheet("color: #f87171;")
        clear_cache_btn.clicked.connect(self.clear_thumbnail_cache)
        btn_row.addWidget(clear_cache_btn)
        btn_row.addStretch()

        data_layout.addLayout(btn_row)
        layout.addWidget(data_card)

        layout.addStretch()
        return page

    def save_settings(self):
        try:
            new_port = int(self.port_input.text().strip())
            self.port = new_port
            self.db.set_setting("port", str(new_port))
            self.sidebar_status_ip.setText(f"{self.local_ip}:{self.port}")
            self.url_display_lbl.setText(f"http://{self.local_ip}:{self.port}")
            QMessageBox.information(self, "Port Saved", f"Server port set to {new_port}.\nRestart server to apply change.")
        except ValueError:
            QMessageBox.warning(self, "Invalid Port", "Please enter a valid numeric port number.")

    def clear_thumbnail_cache(self):
        try:
            if THUMBNAILS_DIR.exists():
                count = 0
                for f in THUMBNAILS_DIR.glob("*.jpg"):
                    try:
                        f.unlink()
                        count += 1
                    except Exception:
                        pass
                QMessageBox.information(self, "Cache Cleared", f"Cleared {count} thumbnail cache file(s).")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to clear cache: {e}")

    # =========================================================================
    # SERVER CONTROL
    # =========================================================================
    def toggle_server(self):
        if self.is_running:
            self.stop_server()
        else:
            self.start_server()

    def start_server(self):
        self.local_ip = get_local_ip()
        self.server_thread = UvicornServerThread("0.0.0.0", self.port)
        self.server_thread.started_signal.connect(self.on_server_started)
        self.server_thread.stopped_signal.connect(self.on_server_stopped)
        self.server_thread.error_signal.connect(self.on_server_error)
        self.server_thread.start()

    def stop_server(self):
        if self.server_thread:
            self.server_thread.stop()
            self.server_thread.wait(2000)
            self.on_server_stopped()

    def on_server_started(self):
        self.is_running = True
        self.current_pair_token = self.db.create_pairing_token()

        # Update Hero Card
        self.hero_status_badge.setText("● SERVER BROADCASTING (ACTIVE)")
        self.hero_status_badge.setProperty("class", "BadgeGreen")
        self.hero_status_badge.setStyle(self.hero_status_badge.style())

        access_url = f"http://{self.local_ip}:{self.port}"
        self.hero_url_lbl.setText(f"Live broadcast at: {access_url}")
        self.url_display_lbl.setText(access_url)
        self.wifi_chip.setText(f"🌐 Wi-Fi: {self.local_ip}:{self.port}")

        self.hero_toggle_btn.setText("■  Stop Server")
        self.hero_toggle_btn.setProperty("class", "DangerBtn")
        self.hero_toggle_btn.setStyle(self.hero_toggle_btn.style())

        # Update Sidebar
        self.sidebar_status_dot.setText("● SERVER ONLINE")
        self.sidebar_status_dot.setProperty("class", "BadgeGreen")
        self.sidebar_status_dot.setStyle(self.sidebar_status_dot.style())
        self.sidebar_status_ip.setText(f"{self.local_ip}:{self.port}")
        self.sidebar_toggle_btn.setText("Stop Server")
        self.sidebar_toggle_btn.setProperty("class", "DangerBtn")
        self.sidebar_toggle_btn.setStyle(self.sidebar_toggle_btn.style())

        self.update_qr_code()
        self._update_dashboard_metrics()

    def on_server_stopped(self):
        self.is_running = False
        self.current_pair_token = None

        # Update Hero Card
        self.hero_status_badge.setText("● SERVER IDLE (STOPPED)")
        self.hero_status_badge.setProperty("class", "BadgeGrey")
        self.hero_status_badge.setStyle(self.hero_status_badge.style())

        self.hero_url_lbl.setText("Click 'Start Server' to broadcast your personal cinema and storage.")
        self.hero_toggle_btn.setText("▶  Start Server")
        self.hero_toggle_btn.setProperty("class", "PrimaryBtn")
        self.hero_toggle_btn.setStyle(self.hero_toggle_btn.style())

        # Update Sidebar
        self.sidebar_status_dot.setText("● SERVER OFFLINE")
        self.sidebar_status_dot.setProperty("class", "BadgeGrey")
        self.sidebar_status_dot.setStyle(self.sidebar_status_dot.style())
        self.sidebar_toggle_btn.setText("Start Server")
        self.sidebar_toggle_btn.setProperty("class", "PrimaryBtn")
        self.sidebar_toggle_btn.setStyle(self.sidebar_toggle_btn.style())

        self.update_qr_code()

    def on_server_error(self, err_msg: str):
        self.on_server_stopped()
        QMessageBox.critical(self, "Server Error", f"Failed to start server on port {self.port}:\n{err_msg}")

    # =========================================================================
    # QR & ACCESS
    # =========================================================================
    def get_access_url(self) -> str:
        base = f"http://{self.local_ip}:{self.port}"
        if self.current_pair_token:
            return f"{base}/?pair={self.current_pair_token}"
        return base

    def update_qr_code(self):
        url = self.get_access_url()
        try:
            qr_bytes = generate_qr_bytes(url, size=260)
            img = QImage()
            img.loadFromData(QByteArray(qr_bytes))
            pixmap = QPixmap.fromImage(img)
            self.qr_label.setPixmap(pixmap)
        except Exception:
            self.qr_label.setText("QR Generation Error")

    def copy_access_link(self):
        url = self.get_access_url()
        self._copy_text(url, "Web Access Link")

    def _copy_text(self, text: str, label: str):
        clipboard = QApplication.clipboard()
        clipboard.setText(text)
        QMessageBox.information(self, "Copied", f"Copied {label} to clipboard:\n{text}")

    def open_in_browser(self):
        url = self.get_access_url()
        webbrowser.open(url)

    # =========================================================================
    # SYSTEM TRAY
    # =========================================================================
    def _setup_tray(self):
        if not QSystemTrayIcon.isSystemTrayAvailable():
            return

        self.tray_icon = QSystemTrayIcon(self)
        if ICON_PATH.exists():
            self.tray_icon.setIcon(QIcon(str(ICON_PATH)))

        tray_menu = QMenu()
        open_action = tray_menu.addAction("Open PhoneDrive PC")
        open_action.triggered.connect(self.showNormal)

        toggle_action = tray_menu.addAction("Start/Stop Server")
        toggle_action.triggered.connect(self.toggle_server)

        web_action = tray_menu.addAction("Open Web Dashboard")
        web_action.triggered.connect(self.open_in_browser)

        tray_menu.addSeparator()
        quit_action = tray_menu.addAction("Quit PhoneDrive")
        quit_action.triggered.connect(self._quit_application)

        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.activated.connect(self._on_tray_activated)
        self.tray_icon.show()

    def _on_tray_activated(self, reason):
        if reason == QSystemTrayIcon.Trigger:
            if self.isVisible():
                self.hide()
            else:
                self.showNormal()

    def closeEvent(self, event):
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.hide()
            self.tray_icon.showMessage(
                "PhoneDrive PC",
                "PhoneDrive is still running in the background.",
                QSystemTrayIcon.Information,
                2000
            )
            event.ignore()
        else:
            self._quit_application()

    def _quit_application(self):
        self.stop_server()
        QApplication.quit()
