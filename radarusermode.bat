@echo off
setlocal

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
    echo Wymagane sa uprawnienia administratora. Otwieranie ponownie...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

pushd "%~dp0usermode\release" || (
    echo Nie znaleziono katalogu usermode\release.
    pause
    exit /b 1
)

if not exist "usermode.exe" (
    echo Nie znaleziono pliku usermode.exe.
    popd
    pause
    exit /b 1
)

usermode.exe
set "EXIT_CODE=%ERRORLEVEL%"
popd
endlocal & exit /b %EXIT_CODE%
