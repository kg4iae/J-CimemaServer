@echo off
setlocal enabledelayedexpansion

:: Switch to the directory where this script is located
cd /d "%~dp0"

title CinemaBooth - Theater Projection and Automation System
color 0A

echo =====================================================================
echo       CINEMABOOTH - LOCAL THEATER MEDIA AND AUTOMATION CONTROLLER
echo =====================================================================
echo.
echo Starting CinemaBooth Server on port 3000...
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found on your system PATH!
    echo Please download and install Node.js LTS from https://nodejs.org
    echo Or install in PowerShell with: winget install OpenJS.NodeJS.LTS
    echo.
    pause
    exit /b 1
)

:: 2. Ensure media, data, and slide directories exist
if not exist "media\" mkdir "media"
if not exist "data\" mkdir "data"
if not exist "public\assets\slides\" mkdir "public\assets\slides"

:: 3. Check if node_modules exists, if not install
if not exist "node_modules\" (
    echo [INFO] Installing required dependencies with npm...
    call npm install --legacy-peer-deps
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] npm install encountered an error. Please check your network connection.
        pause
        exit /b 1
    )
)

:: 4. Launch Node server in the background
echo [INFO] Starting CinemaBooth Full-Stack Server on port 3000...
start "CinemaBooth Server" /min cmd /k "npm run dev"

:: 5. Wait for the server to spin up
echo [INFO] Waiting for server to initialize...
timeout /t 3 /nobreak >nul

echo.
echo [INFO] Launching Projector Screen and Operator Remote...
echo.
echo Display Setup Tip:
echo If your projector is configured as a secondary extended monitor (1920x1080),
echo you can drag the Projector window there or press F11 for fullscreen.
echo.

:: 6. Open Projector Screen (Clean video + slide canvas with no UI)
start "" "http://localhost:3000/?mode=screen"

:: 7. Open Operator Remote (Console for playlists, lights, slideshows, volume)
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000"

echo =====================================================================
echo CinemaBooth is now running!
echo  - Projector Display: http://localhost:3000/?mode=screen
echo  - Operator Remote:   http://localhost:3000
echo  - Phone or Tablet:   Scan the QR code in the Operator Remote header
echo =====================================================================
echo To stop CinemaBooth, close the minimized server window in your taskbar.
echo.
pause
