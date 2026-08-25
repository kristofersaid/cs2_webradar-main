@echo off
setlocal

pushd "%~dp0webapp" || (
    echo Nie znaleziono katalogu webapp.
    pause
    exit /b 1
)

where npm >nul 2>&1 || (
    echo Nie znaleziono npm. Zainstaluj Node.js i dodaj go do PATH.
    popd
    pause
    exit /b 1
)

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"
popd
endlocal & exit /b %EXIT_CODE%
