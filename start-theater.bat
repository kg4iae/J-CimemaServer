@echo off
title CinemaBooth - Theater Projection & Automation System
color 0A

echo =====================================================================
echo       CINEMABOOTH - LOCAL THEATER MEDIA & AUTOMATION CONTROLLER
echo =====================================================================
echo.
echo Starting CinemaBooth Server on port 3000...
echo.

:: Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js (LTS version) from https://nodejs.org
    pause
    exit /b 1
)

:: Check if node_modules exists, if not install
if not exist "node_modules\" (
    echo [INFO] Installing required dependencies...
    call npm install || call npm install --legacy-peer-deps
)

:: Launch Node server in the background
echo [INFO] Starting Full-Stack Theater Server (Express + WebSockets + SQLite)...
start "CinemaBooth Server" /min cmd /c "npm run start"

:: Give the server 3 seconds to spin up
timeout /t 3 /nobreak >nul

echo.
echo [INFO] Launching Projector Screen & Operator Remote...
echo.
echo Display Setup Tip:
echo If your projector is configured as a secondary extended monitor (1920x1080),
echo the projector window will position itself on the second screen.
echo.

:: Open Projector Screen in Chrome/Edge Kiosk Mode
:: If secondary monitor is at X=1920, you can use: --window-position=1920,0 --kiosk
start msedge "http://localhost:3000/?mode=screen" 2>nul || start chrome "http://localhost:3000/?mode=screen" 2>nul || start "" "http://localhost:3000/?mode=screen"

:: Open Operator Console on Primary Monitor for phone/touch control
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000"

echo =====================================================================
echo CinemaBooth is now running!
echo  - Projector Display: http://localhost:3000/?mode=screen
echo  - Operator Remote:   http://localhost:3000
echo  - Phone / Tablet:    Use the QR code in the Operator Remote header!
echo =====================================================================
echo To stop CinemaBooth, close the minimized server window.
pause
