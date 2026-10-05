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
python -m pip install PyQt5 PyQtWebEngine keyboard websocket-client
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

Serwer WebSocket nasluchuje na `0.0.0.0:22006` (localhost + LAN), a frontend na `0.0.0.0:5173`.

### Podgląd na telefonie w tej samej sieci Wi-Fi

Dane zawsze pochodzą tylko z komputera-hosta (PC z CS2 + `usermode.exe`).
Frontend automatycznie łączy WebSocket do tego samego hosta, z którego załadowano stronę
(`window.location.hostname`), więc nic nie trzeba wpisywać ręcznie:

1. Na PC uruchom normalnie `radar.bat` (CS2 musi działać + `usermode.exe`).
2. W oknie serwera znajdź linijkę `LAN podglad: http://192.168.X.X:5173`
   (albo na PC sprawdź IP: `ipconfig` -> adres IPv4, np. `192.168.1.10`).
3. Na telefonie (to samo Wi-Fi) otwórz `http://<IP-PC>:5173`, np. `http://192.168.1.10:5173`.
4. Telefon sam połączy się do `ws://<IP-PC>:22006/cs2_webradar` i pokaże ten sam radar co PC.

Uwaga: przy pierwszym uruchomieniu Windows Firewall zapyta o dostęp dla Node.js - kliknij
"Zezwalaj" (sieci prywatne). Jeśli telefon nie łączy, ręcznie odblokuj porty TCP `5173` i `22006`
dla sieci prywatnej albo uruchom PowerShell jako administrator:
`New-NetFirewallRule -DisplayName "CS2 Radar 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow`
`New-NetFirewallRule -DisplayName "CS2 Radar 22006" -Direction Inbound -LocalPort 22006 -Protocol TCP -Action Allow`

### 2. Moduł usermode

Uruchom jako administrator:

```powershell
cd .\usermode\release
.\usermode.exe
```

Domyslna konfiguracja (`m_ip: localhost`) jest poprawna i zostaw ją - `usermode.exe` działa
na tym samym PC co serwer WebSocket, więc łączy się lokalnie. Nie zmieniaj jej na IP telefonu.

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
- `usermode/config.json` zostaw na `localhost` (usermode zawsze wysyła do lokalnego serwera na PC-hoście).
  Adresu WebSocket we frontendzie (`webapp/src/app.jsx`) nie trzeba już zmieniać - wykrywa się sam
  z `window.location.hostname`, z auto-reconnect co 2 s.
- Nie commituj lokalnego katalogu `venv`, `node_modules` ani plikow wynikowych kompilacji.