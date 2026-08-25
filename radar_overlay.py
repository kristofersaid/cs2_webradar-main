import sys
from PyQt5.QtCore import Qt, QUrl, pyqtSignal, QObject
from PyQt5.QtGui import QColor
from PyQt5.QtWidgets import QApplication, QMainWindow
from PyQt5.QtWebEngineWidgets import QWebEngineView

# ============ USTAWIENIA ============
WINDOW_X = 0
WINDOW_Y = 0
WINDOW_WIDTH = 420
WINDOW_HEIGHT = 420
URL = "http://localhost:5173"
# ====================================


class SignalEmitter(QObject):
    """Klasa do przekazywania sygnałów z wątku keyboard do Qt"""
    toggle_visibility = pyqtSignal()
    quit_app = pyqtSignal()


class RadarOverlay(QMainWindow):
    def __init__(self):
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
        self.browser.setUrl(QUrl(URL))
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


def main():
    import os
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-web-security"
    
    app = QApplication(sys.argv)
    overlay = RadarOverlay()
    
    # Sygnały do bezpiecznego komunikowania się między wątkami
    emitter = SignalEmitter()
    emitter.toggle_visibility.connect(overlay.toggle_visibility)
    emitter.quit_app.connect(app.quit)
    
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
        print(f"URL: {URL}")
        print(f"Pozycja: {WINDOW_X}, {WINDOW_Y}")
        print(f"Rozmiar: {WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        print()
        print("SKRÓTY KLAWISZOWE:")
        print("  F8 - pokaż/ukryj radar")
        print("  F9 - zamknij overlay")
        print("=" * 50)
        print("(Aby skróty działały globalnie w CS2 - uruchom jako administrator)")
        
    except ImportError:
        print("Zainstaluj: pip install keyboard")
    except Exception as e:
        print(f"Błąd skrótów: {e}")
    
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()