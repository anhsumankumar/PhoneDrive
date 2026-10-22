"""
PhoneDrive PC — Ultra-Premium Glassmorphic Dark Design System
Inspired by modern macOS / Windows 11 Fluent & Cosmic Acrylic aesthetics.
"""

PREMIUM_STYLE = """
/* ================= GLOBAL RESETS & TYPOGRAPHY ================= */
QMainWindow {
    background-color: #070a12;
    color: #f8fafc;
}

QWidget {
    font-family: 'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #cbd5e1;
    font-size: 13px;
}

/* ================= SCROLLBARS ================= */
QScrollBar:vertical {
    border: none;
    background: transparent;
    width: 6px;
    margin: 4px 0px 4px 0px;
}
QScrollBar::handle:vertical {
    background: rgba(255, 255, 255, 0.15);
    min-height: 30px;
    border-radius: 3px;
}
QScrollBar::handle:vertical:hover {
    background: rgba(56, 189, 248, 0.5);
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}
QScrollBar:horizontal {
    height: 0px;
}

/* ================= SIDEBAR NAVIGATION ================= */
QFrame#SidebarFrame {
    background-color: #090e18;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
}

QPushButton.NavBtn {
    text-align: left;
    padding: 12px 16px;
    border: none;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    color: #94a3b8;
    background-color: transparent;
}
QPushButton.NavBtn:hover {
    background-color: rgba(255, 255, 255, 0.05);
    color: #f1f5f9;
}
QPushButton.NavBtn[active="true"] {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 rgba(56, 189, 248, 0.16), stop:1 rgba(56, 189, 248, 0.04));
    color: #38bdf8;
    font-weight: 600;
    border-left: 3px solid #38bdf8;
}

/* ================= CARDS & CONTAINERS ================= */
QFrame.Card {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #0f1626, stop:1 #0c121e);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
}

QFrame.HeroCard {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #111a2e, stop:1 #0b1120);
    border: 1px solid rgba(56, 189, 248, 0.22);
    border-radius: 20px;
}

QFrame.SubCard {
    background-color: #0b1120;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
}

QFrame.StatCard {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0f172a, stop:1 #090e18);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 16px;
}

/* ================= BUTTONS ================= */
QPushButton.PrimaryBtn {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0284c7, stop:1 #38bdf8);
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    border: none;
    border-radius: 12px;
    padding: 10px 22px;
}
QPushButton.PrimaryBtn:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0369a1, stop:1 #0ea5e9);
}
QPushButton.PrimaryBtn:pressed {
    background: #0284c7;
}

QPushButton.SuccessBtn {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #059669, stop:1 #10b981);
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    border: none;
    border-radius: 12px;
    padding: 10px 22px;
}
QPushButton.SuccessBtn:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #047857, stop:1 #059669);
}

QPushButton.DangerBtn {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #e11d48, stop:1 #f43f5e);
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    border: none;
    border-radius: 12px;
    padding: 10px 22px;
}
QPushButton.DangerBtn:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #be123c, stop:1 #e11d48);
}

QPushButton.SecondaryBtn {
    background-color: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
    font-weight: 500;
    font-size: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 8px 16px;
}
QPushButton.SecondaryBtn:hover {
    background-color: rgba(255, 255, 255, 0.12);
    border-color: rgba(56, 189, 248, 0.4);
    color: #ffffff;
}
QPushButton.SecondaryBtn:pressed {
    background-color: rgba(255, 255, 255, 0.04);
}

/* ================= INPUTS & FORMS ================= */
QLineEdit {
    background-color: #090e18;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    color: #f8fafc;
    padding: 9px 14px;
    font-size: 13px;
    selection-background-color: #0284c7;
}
QLineEdit:focus {
    border-color: #38bdf8;
    background-color: #0d1526;
}

QCheckBox {
    color: #cbd5e1;
    font-size: 12px;
    spacing: 8px;
}
QCheckBox::indicator {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background-color: #090e18;
}
QCheckBox::indicator:checked {
    background-color: #0284c7;
    border-color: #38bdf8;
}

/* ================= LISTS & FEEDS ================= */
QListWidget {
    background-color: transparent;
    border: none;
    outline: none;
}
QListWidget::item {
    background-color: transparent;
    border: none;
    padding: 0px;
    margin-bottom: 8px;
}
QListWidget::item:hover {
    background-color: transparent;
}
QListWidget::item:selected {
    background-color: transparent;
}

/* ================= PROGRESS BARS ================= */
QProgressBar {
    border: none;
    background-color: rgba(255, 255, 255, 0.07);
    border-radius: 4px;
    height: 8px;
    text-align: right;
}
QProgressBar::chunk {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0284c7, stop:1 #38bdf8);
    border-radius: 4px;
}

/* ================= STATUS BADGES & CHIPS ================= */
QLabel.BadgeGreen {
    background-color: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 8px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
}

QLabel.BadgeGrey {
    background-color: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
}

QLabel.BadgeAmber {
    background-color: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
}

QLabel.BadgeSky {
    background-color: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
    border-radius: 8px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
}

/* ================= MENUS ================= */
QMenu {
    background-color: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 6px;
    color: #f1f5f9;
}
QMenu::item {
    padding: 8px 24px;
    border-radius: 8px;
}
QMenu::item:selected {
    background-color: #1e293b;
    color: #38bdf8;
}
"""

DARK_STYLE = PREMIUM_STYLE
