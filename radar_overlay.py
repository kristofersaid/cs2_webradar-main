import json
import os
import re
import sys
import threading
import time
# Przy segfault (Qt/C++) wypisz traceback na stderr zamiast głuchego zniknięcia.
try:
    import faulthandler
    faulthandler.enable()
except Exception:
    pass
from urllib.parse import urlencode
from PyQt5.QtCore import Qt, QUrl, pyqtSignal, QObject, QTimer
from PyQt5.QtGui import QColor
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QLabel, QPushButton, QCheckBox,
                             QComboBox, QScrollArea, QColorDialog, QSpinBox)
from PyQt5.QtWebEngineWidgets import QWebEngineView

# ============ USTAWIENIA ============
WINDOW_X = 0
WINDOW_Y = 0
WINDOW_WIDTH = 420
WINDOW_HEIGHT = 420
BASE_URL = "http://localhost:5173"
WS_URL = "ws://localhost:22006/cs2_webradar"
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "overlay_config.json")
# Okno z samą listą (otwierane na prawo od radaru komendą lista on/panel)
LIST_WIDTH = 250
LIST_HEIGHT = 480
LIST_GAP = 12
# Panel sterowania (zwykłe okno z pickerami i przełącznikami, pod radarem)
PANEL_X = WINDOW_X
PANEL_Y = WINDOW_Y + WINDOW_HEIGHT + 12
PANEL_W = 300
PANEL_H = 430
# ====================================

STEAM_ID_RE = re.compile(r"^765\d{14}$")
HEX_RE = re.compile(r"^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$")


def pick_base_url(timeout=0.7):
    """Wybierz żywy frontend: najpierw dev :5173 (vite), potem combo :22006.
    Dzięki temu overlay (i okno listy) działa w KAŻDYM przepływie —
    z tunelem i bez — bez zmiany kodu. Zwraca np. 'http://localhost:5173'."""
    import socket
    for port in (5173, 22006):
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=timeout)
            s.close()
            return f"http://localhost:{port}"
        except OSError:
            continue
    return BASE_URL


def base_of(state):
    """Baza linków: wykryty żywy frontend (5173/22006) albo domyślna."""
    return state.get("base_url") or BASE_URL
PFP_SIZES = ("icon", "medium", "full", "mega")


def normalize_pfp_size(raw):
    """Rozmiar awatara: preset (icon/medium/full/mega) albo ręczne px 16..512.
    Zwraca znormalizowany string. Błędne wejście -> 'full'."""
    s = str(raw or "").strip().lower()
    if s in PFP_SIZES:
        return s
    if s.isdigit():
        return str(max(16, min(512, int(s))))
    return "full"
# Tryby listy: both (numerki + panel), badges (same numerki, lista tylko w konsoli),
# panel (sam panel), off (wył.).
LIST_MODES = ("off", "badges", "panel", "both")
# Polskie etykiety do GUI (muszą pokrywać wszystkie tryby/rozmiary).
LISTA_LABELS = {"off": "Wyłączona", "badges": "Same numerki", "panel": "Sam panel", "both": "Numerki + panel"}
PFP_SIZE_LABELS = {"icon": "Małe (32px)", "medium": "Średnie (64px)", "full": "Duże (184px)", "mega": "MEGA (256px)"}


def combine_lista_modes(badges, panel):
    """Dwa osobne toggles GUI -> jeden tryb linku/konsoli."""
    badges, panel = bool(badges), bool(panel)
    if badges and panel:
        return "both"
    if badges:
        return "badges"
    if panel:
        return "panel"
    return "off"


def normalize_hex(raw):
    """Z 'ff00ff' / '#ff00ff' / 'f0f' robi '#rrggbb'. Zwraca None gdy zły format."""
    if raw is None:
        return None
    h = str(raw).strip()
    if h.startswith("#"):
        h = h[1:]
    if not HEX_RE.match(h):
        return None
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return "#" + h.lower()


def build_overlay_url(base_url, colors, pfp, pfp_size="full", lista="off"):
    """Składa link radaru z ustawień konsoli. Zawsze poprawnie koduje # jako %23."""
    params = {}
    if colors:
        params["colors"] = ",".join(f"{sid}:{hexcol}" for sid, hexcol in sorted(colors.items()))
    if pfp:
        params["pfp"] = "1"
        if pfp_size and pfp_size != "full":
            params["pfpsize"] = pfp_size
    if lista == "both":
        params["lista"] = "1"
    elif lista in ("badges", "panel"):
        params["lista"] = lista
    if not params:
        return base_url
    return base_url + "?" + urlencode(params)


def load_config():
    """Wczytuje zapisane kolory/pfp (żeby zostały po restarcie)."""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {"colors": {}, "pfp": False, "pfp_size": "full", "lista": "off"}
    colors = {}
    pfp_size = "full"
    if isinstance(data, dict):
        raw_colors = data.get("colors") or {}
        if isinstance(raw_colors, dict):
            for sid, hexcol in raw_colors.items():
                sid = str(sid).strip()
                norm = normalize_hex(hexcol)
                if STEAM_ID_RE.match(sid) and norm:
                    colors[sid] = norm
        pfp_size = normalize_pfp_size(data.get("pfp_size", "full"))
        # wsteczna zgodność zapisu true/false -> both/off
        raw_lista = data.get("lista", "off")
        if raw_lista is True:
            lista = "both"
        elif raw_lista is False or raw_lista is None:
            lista = "off"
        else:
            lista = str(raw_lista).lower()
            if lista not in LIST_MODES:
                lista = "off"
        return {"colors": colors, "pfp": bool(data.get("pfp", False)), "pfp_size": pfp_size, "lista": lista}
    return {"colors": {}, "pfp": False, "pfp_size": "full", "lista": "off"}


def save_config(colors, pfp, pfp_size="full", lista="off"):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump({"colors": colors, "pfp": bool(pfp), "pfp_size": pfp_size, "lista": lista}, f, indent=2)
    except OSError as e:
        print(f"[config] nie zapisano: {e}")


class SignalEmitter(QObject):
    """Klasa do przekazywania sygnałów z wątków (keyboard/konsola) do Qt"""
    toggle_visibility = pyqtSignal()
    quit_app = pyqtSignal()
    sync_views = pyqtSignal()


class RadarOverlay(QMainWindow):
    def __init__(self, start_url):
        super().__init__()
        self.setWindowTitle("CS2 Radar Overlay")
        self.setGeometry(WINDOW_X, WINDOW_Y, WINDOW_WIDTH, WINDOW_HEIGHT)

        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.Tool |
            Qt.WindowTransparentForInput
        )

        self.setAttribute(Qt.WA_TranslucentBackground)

        self.browser = QWebEngineView()
        self.browser.page().setBackgroundColor(QColor(0, 0, 0, 0))
        self.browser.setUrl(QUrl(start_url))
        self.setCentralWidget(self.browser)

        self.visible = True
        self.show()

    def toggle_visibility(self):
        """Przełącza widoczność okna"""
        self.visible = not self.visible
        if self.visible:
            self.show()
            print("[F8] Radar POKAZANY")
        else:
            self.hide()
            print("[F8] Radar UKRYTY")

    def set_url(self, url):
        """Przeładuj radar pod nowym linkiem (kolory/pfp/reset)."""
        self.browser.setUrl(QUrl(url))
        print(f"[overlay] załadowano: {url}")


class ListOverlay(QMainWindow):
    """Drugie okno: SAMA lista graczy (?panel=1), na prawo od radaru.
    Przezroczyste tło (jak radar), bez ramek. Pokazywane/chowane
    komendami lista on/panel (i razem z radarem przez F8)."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("CS2 Radar - Lista")
        self.setGeometry(WINDOW_X + WINDOW_WIDTH + LIST_GAP, WINDOW_Y, LIST_WIDTH, LIST_HEIGHT)

        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.Tool |
            Qt.WindowTransparentForInput
        )

        self.setAttribute(Qt.WA_TranslucentBackground)

        self.browser = QWebEngineView()
        self.browser.page().setBackgroundColor(QColor(0, 0, 0, 0))
        self.setCentralWidget(self.browser)

        # Auto-wysokość: okno ma być tak długie jak lista (max jak radar).
        # Mierzymy treść na stronie (?panel=1 ma div#player-list).
        self.browser.page().loadFinished.connect(self._on_list_loaded)
        self._fit_timer = QTimer(self)
        self._fit_timer.timeout.connect(self.fit_height)
        self._fit_timer.start(2000)

    def set_url(self, url):
        self.browser.setUrl(QUrl(url))
        print(f"[lista-okno] załadowano: {url}")

    def _on_list_loaded(self, ok):
        if ok:
            self.fit_height()

    def fit_height(self):
        self.browser.page().runJavaScript(
            "(function(){var el=document.getElementById('player-list');"
            "return el ? el.scrollHeight : 0;})()",
            self._apply_height,
        )

    def _apply_height(self, content_height):
        h = clamp_list_height(content_height)
        if h is not None and abs(self.height() - h) > 4:
            self.resize(LIST_WIDTH, h)


class ControlPanel(QMainWindow):
    """Zwykłe (klikalne) okno sterowania: color picker dla każdego wroga,
    przełączniki pfp/listy, reset i podgląd linków. Działa równolegle
    z konsolą (ten sam stan) — odświeża się co sekundę."""

    def __init__(self, state, state_lock, emitter):
        super().__init__()
        self._s = state
        self._lock = state_lock
        self._em = emitter
        self._picking = False
        self._dirty = False
        self._rows = {}

        self.setWindowTitle("CS2 Radar - Sterowanie")
        self.setGeometry(PANEL_X, PANEL_Y, PANEL_W, PANEL_H)

        root = QWidget()
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)

        layout.addWidget(QLabel("Wrogowie — kolor kropki:"))

        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._rows_host = QWidget()
        self._rows_layout = QVBoxLayout(self._rows_host)
        self._rows_layout.addStretch(1)
        self._scroll.setWidget(self._rows_host)
        layout.addWidget(self._scroll, 1)

        # PFP: checkbox + rozmiar (presety albo własne px).
        # Zmiany w GUI tylko szkicują stan — link aktualizuje dopiero ZAPISZ.
        pfp_row = QHBoxLayout()
        self._pfp_cb = QCheckBox("Awatary (pfp)")
        self._pfp_cb.toggled.connect(self.on_pfp_toggled)
        pfp_row.addWidget(self._pfp_cb)
        self._pfp_size_cb = QComboBox()
        for key in PFP_SIZES:
            self._pfp_size_cb.addItem(PFP_SIZE_LABELS[key], key)
        self._pfp_size_cb.addItem("Własny px…", "__custom")
        self._pfp_size_cb.currentIndexChanged.connect(self.on_pfp_size)
        pfp_row.addWidget(self._pfp_size_cb, 1)
        self._pfp_spin = QSpinBox()
        self._pfp_spin.setRange(16, 512)
        self._pfp_spin.setValue(128)
        self._pfp_spin.setSuffix(" px")
        self._pfp_spin.setEnabled(False)
        self._pfp_spin.valueChanged.connect(self.on_pfp_spin)
        pfp_row.addWidget(self._pfp_spin)
        layout.addLayout(pfp_row)

        # Lista: DWA osobne toggles (numerki | panel).
        lista_row = QHBoxLayout()
        self._numery_cb = QCheckBox("Numerki")
        self._numery_cb.setToolTip("Numerki nad kropkami wrogów")
        self._numery_cb.toggled.connect(self.on_badges_toggled)
        lista_row.addWidget(self._numery_cb)
        self._panel_cb = QCheckBox("Lista")
        self._panel_cb.setToolTip("Osobne okno z listą graczy (na prawo od radaru)")
        self._panel_cb.toggled.connect(self.on_panel_toggled)
        lista_row.addWidget(self._panel_cb, 1)
        layout.addLayout(lista_row)

        # Zapisz + reset + status. TYLKO Zapisz przeładowuje link
        # (reszta w GUI jedynie szkicuje stan).
        btn_row = QHBoxLayout()
        self._save_btn = QPushButton("💾 Zapisz")
        self._save_btn.setToolTip("Zastosuj zmiany — dopiero teraz aktualizuje link")
        self._save_btn.clicked.connect(self.on_save)
        btn_row.addWidget(self._save_btn)
        reset_btn = QPushButton("Reset (czysty link)")
        reset_btn.clicked.connect(self.on_reset)
        btn_row.addWidget(reset_btn)
        self._status = QLabel("")
        btn_row.addWidget(self._status, 1)
        layout.addLayout(btn_row)

        # Linki (do kopiowania np. na telefon)
        self._link_radar = QLabel("")
        self._link_radar.setWordWrap(True)
        self._link_radar.setTextInteractionFlags(
            self._link_radar.textInteractionFlags() | Qt.TextSelectableByMouse)
        self._link_radar.setStyleSheet("font-size: 8pt; color: #aaa;")
        layout.addWidget(self._link_radar)
        self._link_list = QLabel("")
        self._link_list.setWordWrap(True)
        self._link_list.setTextInteractionFlags(
            self._link_list.textInteractionFlags() | Qt.TextSelectableByMouse)
        self._link_list.setStyleSheet("font-size: 8pt; color: #aaa;")
        layout.addWidget(self._link_list)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self.refresh)
        self._timer.start(1000)
        self.refresh()
        self.show()

    # ---- wiersze wrogów ----

    def _snapshot(self):
        with self._lock:
            return (get_enemies(self._s), dict(self._s["colors"]),
                    self._s.get("map"), self._s["pfp"],
                    self._s.get("pfp_size", "full"), self._s.get("lista", "off"))

    def _rebuild_rows(self, enemies, colors):
        # wyczyść stare
        while self._rows_layout.count() > 1:  # ostatni to stretch
            item = self._rows_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self._rows = {}
        for i, (sid, pname) in enumerate(enemies, start=1):
            row = QWidget()
            hl = QHBoxLayout(row)
            hl.setContentsMargins(0, 0, 0, 0)
            num = QLabel(str(i))
            num.setFixedWidth(20)
            hl.addWidget(num)
            name = QLabel(pname)
            name.setStyleSheet("font-weight: bold;")
            hl.addWidget(name, 1)
            swatch = QPushButton()
            swatch.setFixedSize(44, 22)
            swatch.clicked.connect(lambda _=False, s=sid: self.pick_color(s))
            hl.addWidget(swatch)
            clear = QPushButton("✕")
            clear.setFixedSize(24, 22)
            clear.setToolTip("Zdejmij kolor")
            clear.clicked.connect(lambda _=False, s=sid: self.clear_color(s))
            hl.addWidget(clear)
            self._rows_layout.insertWidget(self._rows_layout.count() - 1, row)
            self._rows[sid] = {"swatch": swatch, "name": name, "num": num}
        self._update_row_colors(colors)

    def _update_row_colors(self, colors):
        for sid, refs in self._rows.items():
            hexcol = colors.get(sid, "#333333")
            refs["swatch"].setStyleSheet(
                f"QPushButton {{ background-color: {hexcol}; border: 1px solid #888; }}")

    def refresh(self):
        """Odśwież z wątku GUI (timer). Pomija przebudowę w trakcie pickera."""
        if self._picking:
            return
        enemies, colors, map_name, pfp, pfp_size, lista = self._snapshot()
        ids = [sid for sid, _ in enemies]
        if set(ids) != set(self._rows):
            self._rebuild_rows(enemies, colors)
        else:
            self._update_row_colors(colors)
        # kontrolki wg stanu (bez zapętlania sygnałów)
        self._pfp_cb.blockSignals(True)
        self._pfp_cb.setChecked(bool(pfp))
        self._pfp_cb.blockSignals(False)
        if pfp_size in PFP_SIZES:
            self._set_combo(self._pfp_size_cb, pfp_size)
            self._pfp_spin.blockSignals(True)
            self._pfp_spin.setEnabled(False)
            self._pfp_spin.blockSignals(False)
        else:
            # ręczne px (np. "128")
            self._set_combo(self._pfp_size_cb, "__custom")
            self._pfp_spin.blockSignals(True)
            self._pfp_spin.setEnabled(True)
            try:
                custom_px = max(16, min(512, int(pfp_size)))
            except (TypeError, ValueError):
                custom_px = 128
            if self._pfp_spin.value() != custom_px:
                self._pfp_spin.setValue(custom_px)
            self._pfp_spin.blockSignals(False)
        badges_on = lista in ("badges", "both")
        panel_on = lista in ("panel", "both")
        self._numery_cb.blockSignals(True)
        self._numery_cb.setChecked(badges_on)
        self._numery_cb.blockSignals(False)
        self._panel_cb.blockSignals(True)
        self._panel_cb.setChecked(panel_on)
        self._panel_cb.blockSignals(False)
        # linki + status (baza wykryta na starcie — działa z tunelem i bez)
        base = base_of(self._s)
        self._link_radar.setText("Radar: " + build_overlay_url(
            base, colors, pfp, pfp_size, radar_lista_for_mode(lista)))
        self._link_list.setText("Lista: " + build_list_url(base, colors))
        self._status.setText(f"{len(enemies)} wrogów • {map_name or 'brak meczu'}")
        self._save_btn.setText("💾 Zapisz ●" if self._dirty else "💾 Zapisz")

    @staticmethod
    def _set_combo(combo, data):
        idx = combo.findData(data)
        if idx >= 0 and combo.currentIndex() != idx:
            combo.blockSignals(True)
            combo.setCurrentIndex(idx)
            combo.blockSignals(False)

    # ---- akcje (GUI tylko SZKICUJE stan; link aktualizuje przycisk Zapisz) ----

    def mark_dirty(self):
        self._dirty = True

    def on_save(self):
        """JEDYNE miejsce w GUI, które aktualizuje link (przeładowuje widoki)."""
        with self._lock:
            apply_and_reload(self._s, self._em)
        self._dirty = False
        print("[zapisz] link zaktualizowany")
        self.refresh()

    def pick_color(self, sid):
        self._picking = True
        try:
            with self._lock:
                current = self._s["colors"].get(sid, "#ff00ff")
            col = QColorDialog.getColor(QColor(current), self, "Kolor kropki gracza")
            if col.isValid():
                hexcol = normalize_hex(col.name())
                if hexcol:
                    with self._lock:
                        self._s["colors"][sid] = hexcol
                        persist_state(self._s)
                    self.mark_dirty()
                    print(f"[kolor] {sid} -> {hexcol} (szkic — kliknij Zapisz)")
                    self.refresh()
        finally:
            self._picking = False

    def clear_color(self, sid):
        with self._lock:
            if sid in self._s["colors"]:
                del self._s["colors"][sid]
                persist_state(self._s)
            else:
                print(f"[usun] {sid} nie ma ustawionego koloru")
                return
        self.mark_dirty()
        print(f"[usun] zdjęto kolor z {sid} (szkic — kliknij Zapisz)")
        self.refresh()

    def on_pfp_toggled(self, checked):
        with self._lock:
            self._s["pfp"] = bool(checked)
            persist_state(self._s)
        self.mark_dirty()
        print(f"[pfp] awatary wrogów: {'WŁĄCZONE' if checked else 'WYŁĄCZONE'} (szkic — kliknij Zapisz)")
        self.refresh()

    def on_pfp_size(self, index):
        data = self._pfp_size_cb.itemData(index)
        with self._lock:
            if data == "__custom":
                self._s["pfp_size"] = normalize_pfp_size(self._pfp_spin.value())
            elif data in PFP_SIZES:
                self._s["pfp_size"] = data
            else:
                return
            persist_state(self._s)
        self.mark_dirty()
        print(f"[pfp] rozmiar awatara: {self._s['pfp_size']} (szkic — kliknij Zapisz)")
        self.refresh()

    def on_pfp_spin(self, value):
        if self._pfp_size_cb.itemData(self._pfp_size_cb.currentIndex()) != "__custom":
            return
        with self._lock:
            self._s["pfp_size"] = normalize_pfp_size(value)
            persist_state(self._s)
        self.mark_dirty()
        self.refresh()

    def on_badges_toggled(self, checked):
        with self._lock:
            panel_on = self._panel_cb.isChecked()
            self._s["lista"] = combine_lista_modes(checked, panel_on)
            persist_state(self._s)
        self.mark_dirty()
        print(f"[lista] numerki: {'WŁĄCZONE' if checked else 'WYŁĄCZONE'} (szkic — kliknij Zapisz)")
        self.refresh()

    def on_panel_toggled(self, checked):
        with self._lock:
            badges_on = self._numery_cb.isChecked()
            self._s["lista"] = combine_lista_modes(badges_on, checked)
            persist_state(self._s)
        self.mark_dirty()
        print(f"[lista] okno listy: {'WŁĄCZONE' if checked else 'WYŁĄCZONE'} (szkic — kliknij Zapisz)")
        self.refresh()

    def on_reset(self):
        with self._lock:
            self._s["colors"] = {}
            self._s["pfp"] = False
            self._s["pfp_size"] = "full"
            self._s["lista"] = "off"
            persist_state(self._s)
        self.mark_dirty()
        print("[reset] wyczyszczono (szkic — kliknij Zapisz żeby zastosować)")
        self.refresh()


def radar_lista_for_mode(mode):
    """Jaki parametr lista idzie na stronę radaru. Same-page panel już nie
    istnieje (lista ma własne okno), więc radar dostaje co najwyżej numerki."""
    return "badges" if mode in ("badges", "both") else "off"


def clamp_list_height(content_height, max_height=WINDOW_HEIGHT, min_height=120):
    """Wysokość okna listy: tyle ile treści, ale nie więcej niż radar (i nie mniej niż minimum)."""
    try:
        h = int(content_height)
    except (TypeError, ValueError):
        return None
    if h <= 0:
        return None
    return max(min_height, min(max_height, h))


def build_list_url(base_url, colors):
    """Link strony TYLKO z listą (?panel=1, przezroczyste tło). Kolory w znaczki."""
    params = {"panel": "1"}
    if colors:
        params["colors"] = ",".join(f"{sid}:{hexcol}" for sid, hexcol in sorted(colors.items()))
    return base_url + "?" + urlencode(params)


def get_enemies(state):
    """Lista przeciwników z ostatnich danych z gry: [(steam_id, name)], stabilnie po steam_id."""
    players = state.get("players") or []
    local_team = state.get("local_team")
    enemies = []
    for p in players:
        try:
            sid = str(p.get("m_steam_id", ""))
        except Exception:
            continue
        if not STEAM_ID_RE.match(sid):
            continue
        if local_team is not None and p.get("m_team") == local_team:
            continue
        enemies.append((sid, p.get("m_name") or "?"))
    enemies.sort(key=lambda e: e[0])
    return enemies


def print_help():
    print("KOMENDY (wpisz + Enter):")
    print("  [RADAR - co widać na mapie]")
    print("  lista on               - numerki na radarze + OSOBNE okno z listą (na prawo)")
    print("  lista badges           - same numerki, bez okna listy")
    print("  lista panel            - samo okno z listą, bez numerków")
    print("  lista off              - wyłącz (lista zostaje tylko w tej konsoli)")
    print("  pfp on|off [rozmiar]   - awatary wrogów (icon/medium/full/mega=256px)")
    print("  pfp rozmiar <...>      - sam rozmiar awatara")
    print("  reset                  - CZYSTY link (wyłącza kolory, pfp i listę)")
    print("  [GRACZE - kolory kropek]")
    print("  lista                  - wrogowie z numerami (podstawa pod komendę kolor)")
    print("  kolor <nr|steamid> <hex> - np. kolor 2 ff00ff")
    print("  kolory                 - pokaż wszystkie ręcznie przypisane kolory")
    print("  usun <nr|steamid>      - zdejmij kolor graczowi")
    print("  [INFO]")
    print("  link                   - pokaż aktualny link radaru")
    print("  pomoc                  - ta pomoc")
    print("  q                      - zamknij overlay")
    print("  (GUI: okno sterowania pod radarem — pickery kolorów i przełączniki)")


def persist_state(state):
    """Sam zapis configu, BEZ przeładowywania widoków (szkic roboczy GUI)."""
    save_config(state["colors"], state["pfp"], state.get("pfp_size", "full"), state.get("lista", "off"))


def apply_and_reload(state, emitter):
    """Zapisz config i poproś wątek GUI o zsynchronizowanie okien.
    Konsola stosuje od razu; GUI czeka na przycisk Zapisz."""
    persist_state(state)
    emitter.sync_views.emit()


def handle_command(cmd, state, state_lock, emitter):
    """Jedna komenda z konsoli. Zwraca 'quit' gdy zamknąć, inaczej None."""
    parts = cmd.strip().split()
    if not parts:
        return None
    name = parts[0].lower()
    args = parts[1:]

    if name == "q":
        emitter.quit_app.emit()
        return "quit"

    if name == "pomoc":
        print_help()
        return None

    if name == "lista":
        # 'lista on|off|badges|panel' = tryby numerków i panelu.
        # 'badges' = same numerki, lista tylko w tej konsoli.
        if args and args[0].lower() in ("on", "off", "badges", "panel"):
            a = args[0].lower()
            if a == "on":
                mode = "both"
            elif a == "badges":
                mode = "badges"
            elif a == "panel":
                mode = "panel"
            else:
                mode = "off"
            with state_lock:
                state["lista"] = mode
                apply_and_reload(state, emitter)
            print(f"[lista] tryb: {mode} (badges=numerki, panel=lista, both=oba, off=tylko konsola)")
            return None
        if args:
            print("[lista] użycie: lista   albo: lista on|off|badges|panel")
            return None
        with state_lock:
            enemies = get_enemies(state)
            colors = dict(state["colors"])
            map_name = state.get("map")
        if not enemies:
            print("[lista] brak danych z gry — odpal CS2 + usermode (radar.bat) i poczekaj na mecz.")
            if not state.get("ws_lib", True):
                print("[lista] UWAGA: nie masz biblioteki websocket-client, więc listy NIE będzie wcale.")
                print("[lista] Napraw JEDNĄ komendą w nowym oknie PowerShell:")
                print("[lista]   D:\\cs2_webradar-main> .\\venv\\Scripts\\python.exe -m pip install websocket-client")
            print("[lista] (tryby lista on/badges/panel/off i tak zadziałają — nie potrzebują meczu)")
            return None
        print(f"[lista] przeciwnicy ({len(enemies)}), mapa: {map_name or '?'}:")
        for i, (sid, pname) in enumerate(enemies, start=1):
            mark = f" [{colors[sid]}]" if sid in colors else ""
            print(f"  {i}. {pname}  {sid}{mark}")
        print("[lista] żeby pokazać numerki na radarze wpisz: lista on")
        return None

    if name == "kolor":
        if len(args) < 2:
            print("[kolor] użycie: kolor <nr|steamid> <hex>   np. kolor 2 ff00ff")
            return None
        with state_lock:
            enemies = get_enemies(state)
        target, hex_raw = args[0], args[1]
        if STEAM_ID_RE.match(target):
            sid = target
        elif target.isdigit() and 1 <= int(target) <= len(enemies):
            sid = enemies[int(target) - 1][0]
        else:
            print(f"[kolor] zły numer/SteamID: {target} (najpierw wpisz 'lista')")
            return None
        norm = normalize_hex(hex_raw)
        if not norm:
            print(f"[kolor] zły hex: {hex_raw} (3 lub 6 znaków, np. ff00ff)")
            return None
        with state_lock:
            state["colors"][sid] = norm
            apply_and_reload(state, emitter)
        print(f"[kolor] {sid} -> {norm}")
        return None

    if name == "kolory":
        with state_lock:
            colors = dict(state["colors"])
            enemies = get_enemies(state)
        if not colors:
            print("[kolory] brak ręcznie przypisanych kolorów (komenda: kolor <nr|steamid> <hex>)")
            return None
        names = {sid: pname for sid, pname in enemies}
        print(f"[kolory] ręczne przypisania ({len(colors)}):")
        for i, (sid, hexcol) in enumerate(sorted(colors.items()), start=1):
            pname = names.get(sid, "?")
            print(f"  {i}. {pname}  {sid} -> {hexcol}")
        return None

    if name == "usun":
        if len(args) < 1:
            print("[usun] użycie: usun <nr|steamid>")
            return None
        with state_lock:
            enemies = get_enemies(state)
        target = args[0]
        if STEAM_ID_RE.match(target):
            sid = target
        elif target.isdigit() and 1 <= int(target) <= len(enemies):
            sid = enemies[int(target) - 1][0]
        else:
            print(f"[usun] zły numer/SteamID: {target}")
            return None
        with state_lock:
            if sid in state["colors"]:
                del state["colors"][sid]
                apply_and_reload(state, emitter)
                print(f"[usun] zdjęto kolor z {sid}")
            else:
                print(f"[usun] {sid} nie ma ustawionego koloru")
        return None

    if name == "pfp":
        if not args or args[0].lower() not in ("on", "off", "rozmiar"):
            print("[pfp] użycie: pfp on [rozmiar]   albo: pfp off   albo: pfp rozmiar <icon|medium|full|mega|px>")
            return None
        with state_lock:
            if args[0].lower() == "rozmiar":
                if len(args) < 2:
                    print(f"[pfp] rozmiar: icon (32px) / medium (64px) / full (184px) / mega (256px) / własne px 16-512. Aktualny: {state.get('pfp_size', 'full')}")
                    return None
                state["pfp_size"] = normalize_pfp_size(args[1])
                apply_and_reload(state, emitter)
                print(f"[pfp] rozmiar awatara: {state['pfp_size']}")
                return None
            on = args[0].lower() == "on"
            state["pfp"] = on
            if len(args) > 1:
                state["pfp_size"] = normalize_pfp_size(args[1])
            apply_and_reload(state, emitter)
        print(f"[pfp] awatary wrogów: {'WŁĄCZONE' if on else 'WYŁĄCZONE'} ({state.get('pfp_size', 'full')})")
        return None

    if name == "link":
        with state_lock:
            base = base_of(state)
            radar_url = build_overlay_url(base, state["colors"], state["pfp"], state.get("pfp_size", "full"), radar_lista_for_mode(state.get("lista", "off")))
            list_url = build_list_url(base, state["colors"])
        print(f"[link radar] {radar_url}")
        print(f"[link lista] {list_url}")
        return None

    if name == "reset":
        with state_lock:
            state["colors"] = {}
            state["pfp"] = False
            state["pfp_size"] = "full"
            state["lista"] = "off"
            apply_and_reload(state, emitter)
        print("[reset] czysty link — kolory, pfp i lista usunięte")
        return None

    print(f"[?] nieznana komenda: {name}  (wpisz 'pomoc')")
    return None


def ws_loop(state, state_lock, stop_event):
    """Wątek: słucha danych z gry (ta sama szyna co przeglądarka)."""
    try:
        import websocket
    except ImportError:
        print("[ws] pomijam nasłuchiwanie gry (brak websocket-client, komunikat powyżej).")
        return
    while not stop_event.is_set():
        try:
            ws = websocket.create_connection(WS_URL, timeout=5)
        except Exception as e:
            print(f"[ws] brak połączenia z serwerem ({e}) — ponawiam za 2 s...")
            stop_event.wait(2)
            continue
        try:
            while not stop_event.is_set():
                try:
                    msg = ws.recv()
                except Exception:
                    break
                try:
                    data = json.loads(msg)
                except ValueError:
                    continue
                if isinstance(data, dict) and "m_players" in data:
                    with state_lock:
                        state["players"] = data["m_players"]
                        state["local_team"] = data.get("m_local_team")
                        state["map"] = data.get("m_map")
        finally:
            try:
                ws.close()
            except Exception:
                pass
        if not stop_event.is_set():
            stop_event.wait(2)


def console_loop(state, state_lock, emitter, stop_event):
    """Wątek: komendy z konsoli (nie blokuje okna Qt)."""
    print()
    print_help()
    print()
    while not stop_event.is_set():
        try:
            cmd = input("> ")
        except (EOFError, KeyboardInterrupt):
            emitter.quit_app.emit()
            return
        try:
            if handle_command(cmd, state, state_lock, emitter) == "quit":
                return
        except Exception as e:
            print(f"[konsola] błąd: {e}")


def main():
    import os as _os
    _os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-web-security"

    try:
        import websocket  # noqa: F401  (tylko sprawdzenie zależności)
        ws_lib_ok = True
    except ImportError:
        ws_lib_ok = False
    # DOMYŚLNIE startujemy z czystym linkiem (jak po 'reset') — poprzednia
    # sesja się nie przywraca. Zapisany config nadpisujemy czystym.
    state = {
        "colors": {},
        "pfp": False,
        "pfp_size": "full",
        "lista": "off",
        "players": [],
        "local_team": None,
        "map": None,
        "ws_lib": ws_lib_ok,
    }
    save_config({}, False, "full", "off")
    # RLock (reentrant): refresh()/sync_views() też biorą ten lock,
    # a wołane są czasem spod już trzymanego locka (GUI) — zwykły Lock
    # zawieszałby program na amen przy każdym Zapisz/✕.
    state_lock = threading.RLock()
    stop_event = threading.Event()

    # Sonda frontendów: overlay działa niezależnie od przepływu
    # (dev :5173 albo combo :22006, z tunelem i bez).
    picked_base = pick_base_url()
    print(f"[overlay] wykryty frontend: {picked_base}")
    state["base_url"] = picked_base

    start_url = build_overlay_url(picked_base, state["colors"], state["pfp"], state["pfp_size"],
                                  radar_lista_for_mode(state["lista"]))

    app = QApplication(sys.argv)
    overlay = RadarOverlay(start_url)
    holder = {"list_window": None}

    def sync_views():
        """Wątek GUI: radar zawsze, okno listy tylko w trybach panel/both."""
        try:
            with state_lock:
                colors = dict(state["colors"])
                mode = state.get("lista", "off")
                base = base_of(state)
            overlay.set_url(build_overlay_url(base, colors, state["pfp"],
                                              state.get("pfp_size", "full"),
                                              radar_lista_for_mode(mode)))
            if mode in ("panel", "both"):
                w = holder["list_window"]
                if w is None:
                    w = ListOverlay()
                    holder["list_window"] = w
                w.set_url(build_list_url(base, colors))
                if overlay.visible:
                    w.show()
            else:
                w = holder["list_window"]
                if w is not None:
                    w.hide()
        except Exception:
            import traceback
            print("[sync_views] BŁĄD (wklej to do zgłoszenia):")
            traceback.print_exc()

    def toggle_list_window():
        w = holder["list_window"]
        if w is None:
            return
        if overlay.visible and state.get("lista") in ("panel", "both"):
            w.show()
        else:
            w.hide()

    # Sygnały do bezpiecznego komunikowania się między wątkami
    emitter = SignalEmitter()
    emitter.toggle_visibility.connect(overlay.toggle_visibility)
    emitter.toggle_visibility.connect(toggle_list_window)
    emitter.quit_app.connect(app.quit)
    emitter.sync_views.connect(sync_views)

    # Skróty klawiszowe (globalne - działają nawet w CS2)
    try:
        import keyboard

        # F8 - pokaż/ukryj radar
        keyboard.add_hotkey('f8', lambda: emitter.toggle_visibility.emit())

        # F9 - zamknij overlay
        keyboard.add_hotkey('f9', lambda: emitter.quit_app.emit())

        print("=" * 50)
        print("CS2 RADAR OVERLAY - URUCHOMIONY")
        print("=" * 50)
        print(f"URL: {start_url}")
        print(f"Pozycja: {WINDOW_X}, {WINDOW_Y}")
        print(f"Rozmiar: {WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        print()
        print("SKRÓTY KLAWISZOWE:")
        print("  F8 - pokaż/ukryj radar (+ okno listy)")
        print("  F9 - zamknij overlay")
        print("=" * 50)
        print("(Aby skróty działały globalnie w CS2 - uruchom jako administrator)")

    except ImportError:
        print("Zainstaluj: pip install keyboard")
    except Exception as e:
        print(f"Błąd skrótów: {e}")

    # Wątki w tle: dane z gry + konsola (demony — gasną z programem)
    if state["ws_lib"]:
        print("[ws] nasłuchiwanie gry: OK — komenda 'lista' pokaże wrogów w meczu")
    else:
        print("[ws] UWAGA: brak biblioteki websocket-client — komenda 'lista' NIE pokaże wrogów!")
        print("[ws] Napraw JEDNĄ komendą w nowym oknie PowerShell:")
        print("[ws]   D:\\cs2_webradar-main> .\\venv\\Scripts\\python.exe -m pip install websocket-client")
    threading.Thread(target=ws_loop, args=(state, state_lock, stop_event), daemon=True).start()
    # Tryb orkiestratora (radar.bat): konsola należy do głównego okna
    # (komenda 'q' zamyka wszystko), więc pętla input() jest wyłączona.
    # Włączenie: flaga --no-console albo RADAR_NO_CONSOLE=1.
    no_console = "--no-console" in sys.argv or os.environ.get("RADAR_NO_CONSOLE") == "1"
    if no_console:
        print("[konsola] sterowanie z tej konsoli WYŁĄCZONE (wpisz q w głównym oknie radar.bat)")
    else:
        threading.Thread(target=console_loop, args=(state, state_lock, emitter, stop_event), daemon=True).start()

    # Panel sterowania GUI (pickery + przełączniki) — zwykłe okno pod radarem.
    panel = ControlPanel(state, state_lock, emitter)
    print("[panel] okno sterowania otwarte (kolory wrogów, pfp, lista, reset)")

    # Startowy sync (np. lista z poprzedniej sesji od razu otwiera okno).
    sync_views()

    try:
        sys.exit(app.exec_())
    finally:
        stop_event.set()


if __name__ == "__main__":
    main()
