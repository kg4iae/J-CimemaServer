# CinemaBooth Windows Automated Setup Script
# Run in PowerShell as Administrator or standard user

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "      CinemaBooth - Windows Theater Setup & Preflight     " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/5] Checking Node.js runtime..." -NoNewline
try {
    $nodeVersion = node -v
    Write-Host " OK ($nodeVersion)" -ForegroundColor Green
} catch {
    Write-Host " MISSING!" -ForegroundColor Red
    Write-Host "Please install Node.js 20+ from https://nodejs.org or run:"
    Write-Host "  winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
    exit 1
}

# 2. Check FFmpeg for video conversion
Write-Host "[2/5] Checking FFmpeg video conversion tool..." -NoNewline
try {
    $ffmpegVersion = ffmpeg -version
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " NOT DETECTED (Optional but Recommended for video ingestion)" -ForegroundColor Yellow
    Write-Host "You can easily install FFmpeg on Windows via winget:" -ForegroundColor Gray
    Write-Host "  winget install Gyan.FFmpeg" -ForegroundColor Cyan
}

# 3. Check yt-dlp for YouTube video ingestion
Write-Host "[3/5] Checking yt-dlp YouTube video downloader..." -NoNewline
try {
    $ytdlpVersion = yt-dlp --version
    Write-Host " OK ($ytdlpVersion)" -ForegroundColor Green
} catch {
    Write-Host " NOT DETECTED (Optional for YouTube video ingestion)" -ForegroundColor Yellow
    Write-Host "You can install yt-dlp on Windows via winget:" -ForegroundColor Gray
    Write-Host "  winget install yt-dlp.yt-dlp" -ForegroundColor Cyan
}

# 4. Create Media, Slides & Data Directories
Write-Host "[4/5] Ensuring local media, slides, and SQLite database directories exist..." -NoNewline
New-Item -ItemType Directory -Force -Path ".\media" | Out-Null
New-Item -ItemType Directory -Force -Path ".\data" | Out-Null
New-Item -ItemType Directory -Force -Path ".\public\assets\slides" | Out-Null
Write-Host " OK" -ForegroundColor Green

# 5. Install npm dependencies & build
Write-Host "[5/5] Installing application dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Notice: Retrying npm install with --legacy-peer-deps..." -ForegroundColor Yellow
    npm install --legacy-peer-deps
}

Write-Host ""
Write-Host "Setup Complete! You can now start the theater system with:" -ForegroundColor Green
Write-Host "  .\start-theater.bat" -ForegroundColor Yellow
Write-Host "or:"
Write-Host "  npm run dev" -ForegroundColor Yellow
