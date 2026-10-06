# CS2 WebRadar

Radar do Counter-Strike 2: nakładka nad grą + podgląd w przeglądarce/telefonie.

## Wymagania

- Windows 10+ (64-bit)
- Node.js 18+ (`node -v` ma pokazać wersję)
- Python 3.10–3.12 (`py --version`)
- Git (tylko do pobrania)
- Uruchomiony Counter-Strike 2

Wszystko poniżej robisz w zwykłym **cmd**.

## 1. Pobranie

```bat
git clone https://github.com/kristofersaid/cs2_webradar-main.git
cd cs2_webradar-main
```

## 2. Instalacja (raz)

Zależności strony:

```bat
cd webapp
npm install
cd ..
```

Środowisko Python (venv) + biblioteki overlayu:

```bat
py -3.12 -m venv venv
venv\Scripts\python.exe -m pip install --upgrade pip
venv\Scripts\python.exe -m pip install PyQt5 PyQtWebEngine keyboard websocket-client
```

`usermode.exe` jest już w projekcie (`usermode\release\`) — nic nie kompilujesz.

## 3. Uruchomienie

Włącz CS2, potem kliknij 2x **`radar.bat`**. Sam postawi serwer, `usermode.exe` (kliknij Tak dla admina), overlay i tunel dla kolegi.

- Strona u Ciebie: `http://localhost:5173`
- Telefon w tym samym Wi-Fi: `http://<IP-TWOJEGO-PC>:5173` (IP pokaże okno serwera albo komenda `ipconfig`)
- Link dla kolegi spoza domu: pokazuje okno tunelu (`https://...trycloudflare.com`)

Przy pierwszym starcie Windows zapyta o dostęp dla Node.js — kliknij Zezwalaj (sieci prywatne).

## 4. Skróty (overlay)

- `F8` — pokaż / ukryj radar (uruchom jako administrator, inaczej nie złapie w grze)
- `F9` — zamknij overlay
- Konsola overlayu: `lista`, `kolor <nr> <hex>`, `pfp on`, `link`, `reset`, `q`
- Obok overlayu otwiera się też okno sterowania (GUI) — pickery kolorów i przełączniki
