@echo off
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs" & exit /b 0
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
if not exist "%ROOT%\webapp\node_modules" (
    pushd "%ROOT%\webapp"
    call npm ci >nul 2>&1
    popd
)
if not exist "%ROOT%\webapp\node_modules" exit /b 1
if not exist "%ROOT%\webapp\dist\index.html" (
    pushd "%ROOT%\webapp"
    call npm run build >nul 2>&1
    popd
)
if not exist "%ROOT%\webapp\dist\index.html" exit /b 1
set "CF=%ROOT%\cloudflared.exe"
if not exist "%CF%" set "CF="
if "%CF%"=="" (
    where cloudflared >nul 2>&1
    if not errorlevel 1 set "CF=cloudflared"
)
where wt >nul 2>&1
if errorlevel 1 goto nowt
wt -w RADAR -d "%ROOT%\webapp" --title "Radar serwer" cmd /k node ws\app.js
set /a TRIES=0 >nul
:waitserver
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect('127.0.0.1',22006,$null,$null); if(-not $iar.AsyncWaitHandle.WaitOne(1000)){ exit 1 }; $c.EndConnect($iar); $c.Close(); exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto serverup
set /a TRIES+=1 >nul
if %TRIES% GEQ 60 exit /b 1
timeout /t 1 /nobreak >nul
goto waitserver
:serverup
wt -w RADAR new-tab --title "Radar usermode" cmd /d /c call "%ROOT%\radarusermode.bat" ; new-tab --title "Radar overlay" "%ROOT%\venv\Scripts\python.exe" "%ROOT%\radar_overlay.py"
if "%CF%"=="" exit /b 0
wt -w RADAR new-tab --title "Radar tunel" "%CF%" tunnel --url http://localhost:22006
exit /b 0
:nowt
start "RADAR_SERVER" /d "%ROOT%\webapp" node ws\app.js
start "RADAR_USERMODE" cmd /d /c call "%ROOT%\radarusermode.bat"
start "RADAR_OVERLAY" "%ROOT%\venv\Scripts\python.exe" "%ROOT%\radar_overlay.py"
if not "%CF%"=="" start "RADAR_TUNEL" "%CF%" tunnel --url http://localhost:22006
exit /b 0
