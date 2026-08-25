# CS2 WebRadar

CS2 WebRadar to radar internetowy dla Counter-Strike 2. Projekt sklada sie z trzech wspolpracujacych elementow:

- `webapp/` - aplikacja React/Vite oraz serwer WebSocket przekazujacy dane na porcie `22006`;
- `usermode/` - aplikacja C++ odczytujaca dane z gry i wysylajaca je do serwera WebSocket;
- `radar_overlay.py` - przezroczysty overlay PyQt5 wyswietlajacy radar nad gra.

W katalogu `webapp/public/data/` znajduja sie dane map uzywanych przez radar. Plik `config.json` w katalogu `usermode/` zawiera adres serwera WebSocket.

## Wymagania

- Windows 10 lub nowszy;
- Node.js 18 lub nowszy oraz npm;
- Python 3.10 lub nowszy;
- uruchomiony Counter-Strike 2.

## Pobranie

W PowerShell wykonaj:

```powershell
git clone https://github.com/kristofersaid/cs2_webradar-main.git
cd cs2_webradar-main
```

## Instalacja

Zainstaluj zaleznosci aplikacji webowej:

```powershell
cd webapp
npm install
cd ..
```

Utworz i aktywuj srodowisko Python, a nastepnie zainstaluj zaleznosci overlayu:

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install PyQt5 PyQtWebEngine keyboard
deactivate
```

## Moduł usermode

Gotowy plik `usermode/release/usermode.exe` jest juz dolaczony do projektu. Nie trzeba go kompilowac ani instalowac dodatkowych narzedzi C++.

## Uruchomienie lokalne

Po instalacji uruchom plik `radar.bat` znajdujacy sie w katalogu glownym projektu. Skrypt automatycznie:

1. uruchomi serwer WebSocket i frontend;
2. uruchomi gotowy `usermode.exe` z uprawnieniami administratora;
3. uruchomi overlay Python.

Skrypty korzystaja ze sciezki katalogu projektu (`%~dp0`), dlatego projekt mozna umiescic w dowolnym katalogu i na innym komputerze bez zmieniania sciezek.

Mozesz tez uruchomic elementy recznie w osobnych oknach PowerShell, w podanej kolejnosci.

### 1. Serwer WebSocket i frontend

```powershell
cd .\webapp
npm run dev
```

Serwer WebSocket bedzie nasluchiwal na `localhost:22006`, a frontend bedzie dostepny pod adresem `http://localhost:5173`.

### 2. Moduł usermode

Uruchom jako administrator:

```powershell
cd .\usermode\release
.\usermode.exe
```

Domyslna konfiguracja laczy sie z `localhost`. Aby uzyc innego adresu, zmien pole `m_ip` w `usermode/config.json`.

### 3. Overlay

W osobnym oknie uruchom:

```powershell
cd .
.\venv\Scripts\python.exe .\radar_overlay.py
```

Skróty klawiszowe overlayu:

- `F8` - pokazuje lub ukrywa radar;
- `F9` - zamyka overlay.

Do obslugi globalnych skrotow klawiszowych uruchom overlay jako administrator.

## Uwagi

- Przed uruchomieniem overlayu musza dzialac frontend i serwer WebSocket.
- Przy zmianie komputera lub adresu sieciowego zaktualizuj `m_ip` w `usermode/config.json` oraz ustaw odpowiedni adres w `webapp/src/app.jsx`.
- Nie commituj lokalnego katalogu `venv`, `node_modules` ani plikow wynikowych kompilacji.