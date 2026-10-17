<#
.SYNOPSIS
    CinemaBooth Automated Windows Downloader & Installer
.DESCRIPTION
    Clones or downloads CinemaBooth from your GitHub repository, checks & installs
    prerequisites (Node.js, Git, FFmpeg, yt-dlp), installs npm dependencies,
    and creates a desktop shortcut to start the theater system.
.PARAMETER RepoUrl
    The HTTPS URL to your GitHub repository (e.g., https://github.com/your-username/cinemabooth.git)
.PARAMETER InstallPath
    The directory where CinemaBooth should be installed. Defaults to $HOME\CinemaBooth
.EXAMPLE
    .\install-cinemabooth.ps1 -RepoUrl "https://github.com/kg4iae/cinemabooth.git"
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false, Position = 0, HelpMessage = "Enter your GitHub repository URL")]
    [string]$RepoUrl,

    [Parameter(Mandatory = $false, Position = 1)]
    [string]$InstallPath = "$HOME\CinemaBooth",

    [switch]$CreateDesktopShortcut = $true,
    [switch]$InstallOptionalTools = $false
)

$ErrorActionPreference = "Stop"

function Write-Header {
    Clear-Host
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "       CINEMABOOTH - THEATER AUTOMATION & PLAYER INSTALLER       " -ForegroundColor Yellow
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host ""
}

Write-Header

# 1. Prompt for GitHub Repository URL if not provided
if (-not $RepoUrl) {
    Write-Host "Enter the GitHub repository URL where you pushed this project." -ForegroundColor White
    Write-Host "Example: https://github.com/your-username/your-repo-name.git" -ForegroundColor DarkGray
    $RepoUrl = Read-Host "GitHub Repository URL"
    while ([string]::IsNullOrWhiteSpace($RepoUrl)) {
        Write-Host "Repository URL cannot be blank." -ForegroundColor Red
        $RepoUrl = Read-Host "GitHub Repository URL"
    }
}

# Clean trailing .git if present for zip fallback
$cleanRepoUrl = $RepoUrl.TrimEnd('/')
if ($cleanRepoUrl.EndsWith('.git')) {
    $cleanRepoUrl = $cleanRepoUrl.Substring(0, $cleanRepoUrl.Length - 4)
}

Write-Host "`nTarget installation folder: $InstallPath" -ForegroundColor Cyan
Write-Host "Repository source:          $RepoUrl`n" -ForegroundColor Cyan

# Helper to refresh current process PATH from Windows Registry
function Refresh-EnvPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::Machine)
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
    $env:Path = "$machinePath;$userPath"
}

# 2. Check & Install Node.js
Write-Host "[1/6] Checking Node.js runtime..." -ForegroundColor Yellow
$nodeInstalled = $false
try {
    $nodeVer = node -v 2>$null
    if ($LASTEXITCODE -eq 0 -and $nodeVer) {
        Write-Host "       Found Node.js ($nodeVer)" -ForegroundColor Green
        $nodeInstalled = $true
    }
} catch {
    $nodeInstalled = $false
}

if (-not $nodeInstalled) {
    Write-Host "       Node.js is not installed." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "       Installing Node.js LTS via winget..." -ForegroundColor Cyan
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        Refresh-EnvPath
    } else {
        Write-Host "       Please download and install Node.js (LTS version) from: https://nodejs.org" -ForegroundColor Red
        Pause
        exit 1
    }
}

# 3. Check & Install Git (or download ZIP fallback)
Write-Host "`n[2/6] Downloading CinemaBooth from GitHub..." -ForegroundColor Yellow
$gitInstalled = $false
try {
    $gitVer = git --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $gitVer) {
        $gitInstalled = $true
    }
} catch {
    $gitInstalled = $false
}

# Prepare installation directory
if (Test-Path -Path $InstallPath) {
    Write-Host "       Directory $InstallPath already exists." -ForegroundColor Cyan
    $overwrite = Read-Host "       Do you want to update/overwrite the existing installation? (Y/N)"
    if ($overwrite -match "^[Yy]") {
        if (Test-Path "$InstallPath\.git") {
            Write-Host "       Pulling latest updates with git..." -ForegroundColor Cyan
            Push-Location $InstallPath
            git pull
            Pop-Location
        } else {
            Write-Host "       Backing up existing data before clean download..." -ForegroundColor DarkGray
            # keep data and media safe if they exist
            if (Test-Path "$InstallPath\data") {
                Copy-Item -Path "$InstallPath\data" -Destination "$HOME\CinemaBooth_data_backup" -Recurse -Force
            }
            Remove-Item -Path $InstallPath -Recurse -Force
        }
    } else {
        Write-Host "Installation aborted by user." -ForegroundColor Yellow
        exit 0
    }
}

if (-not (Test-Path -Path $InstallPath)) {
    if ($gitInstalled) {
        Write-Host "       Cloning via Git to $InstallPath..." -ForegroundColor Green
        git clone $RepoUrl $InstallPath
    } else {
        Write-Host "       Git is not installed. Downloading repository ZIP archive from GitHub..." -ForegroundColor Cyan
        $zipUrl = "$cleanRepoUrl/archive/refs/heads/main.zip"
        $tempZip = "$env:TEMP\cinemabooth_main.zip"
        $tempExtract = "$env:TEMP\cinemabooth_extract"

        try {
            Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
        } catch {
            # Try master branch if main fails
            $zipUrl = "$cleanRepoUrl/archive/refs/heads/master.zip"
            Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
        }

        if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
        Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
        $innerFolder = Get-ChildItem -Path $tempExtract | Select-Object -First 1
        Move-Item -Path $innerFolder.FullName -Destination $InstallPath -Force
        Remove-Item $tempZip -Force
        Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "       Extracted archive to $InstallPath" -ForegroundColor Green
    }
}

# 4. Check Optional Tools (FFmpeg for video conversion, yt-dlp for YouTube ingestion)
Write-Host "`n[3/6] Checking Video Pipeline Tools (FFmpeg & yt-dlp)..." -ForegroundColor Yellow

$ffmpegFound = $null -ne (Get-Command ffmpeg -ErrorAction SilentlyContinue)
$ytdlpFound = $null -ne (Get-Command yt-dlp -ErrorAction SilentlyContinue)

if ($ffmpegFound) {
    Write-Host "       FFmpeg: Detected (Video transcode & audio pipeline ready)" -ForegroundColor Green
} else {
    Write-Host "       FFmpeg: Not detected (Optional, needed for automatic MKV/AVI conversion)" -ForegroundColor DarkGray
    if ($InstallOptionalTools -or (Get-Command winget -ErrorAction SilentlyContinue)) {
        $installFfmpeg = Read-Host "       Would you like to install FFmpeg via winget now? (Y/N)"
        if ($installFfmpeg -match "^[Yy]") {
            winget install Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements
            Refresh-EnvPath
        }
    }
}

if ($ytdlpFound) {
    Write-Host "       yt-dlp: Detected (YouTube ingestion ready)" -ForegroundColor Green
} else {
    Write-Host "       yt-dlp: Not detected (Optional, needed to ingest YouTube trailers directly)" -ForegroundColor DarkGray
    if ($InstallOptionalTools -or (Get-Command winget -ErrorAction SilentlyContinue)) {
        $installYtdlp = Read-Host "       Would you like to install yt-dlp via winget now? (Y/N)"
        if ($installYtdlp -match "^[Yy]") {
            winget install yt-dlp.yt-dlp --silent --accept-package-agreements --accept-source-agreements
            Refresh-EnvPath
        }
    }
}

# 5. Ensure required SQLite, Media, and Slides folders exist
Write-Host "`n[4/6] Creating storage directories..." -ForegroundColor Yellow
$mediaDir = Join-Path $InstallPath "media"
$dataDir = Join-Path $InstallPath "data"
$slidesDir = Join-Path $InstallPath "public\assets\slides"
$audioDir = Join-Path $InstallPath "public\assets\audio"

New-Item -ItemType Directory -Force -Path $mediaDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $slidesDir | Out-Null
New-Item -ItemType Directory -Force -Path $audioDir | Out-Null
Write-Host "       Local folders initialized: media, data (SQLite), slides, audio" -ForegroundColor Green

# 6. Install Node dependencies
Write-Host "`n[5/6] Installing Node.js packages with npm..." -ForegroundColor Yellow
Push-Location $InstallPath
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "       Retrying npm install with --legacy-peer-deps..." -ForegroundColor Yellow
        npm install --legacy-peer-deps
    }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "       Dependencies installed successfully!" -ForegroundColor Green
    } else {
        throw "npm install failed"
    }
} catch {
    Write-Host "       Error during npm install. Check your network connection." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# 7. Create Desktop Shortcut
Write-Host "`n[6/6] Creating Theater Desktop Shortcut..." -ForegroundColor Yellow
try {
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "CinemaBooth Theater.lnk"
    $targetBat = Join-Path $InstallPath "start-theater.bat"

    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $targetBat
    $shortcut.WorkingDirectory = $InstallPath
    $shortcut.Description = "Launch CinemaBooth Theater Controller & Projector Display"
    $shortcut.IconLocation = "shell32.dll,115"
    $shortcut.Save()

    Write-Host "       Desktop shortcut created: 'CinemaBooth Theater'" -ForegroundColor Green
} catch {
    Write-Host "       Could not create desktop shortcut (non-critical)." -ForegroundColor DarkGray
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "                 INSTALLATION COMPLETE!                         " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the theater now:" -ForegroundColor White
Write-Host "  1. Double click the 'CinemaBooth Theater' icon on your Desktop" -ForegroundColor Yellow
Write-Host "  2. Or open PowerShell and run:" -ForegroundColor White
Write-Host "     cd `"$InstallPath`"" -ForegroundColor Cyan
Write-Host "     .\start-theater.bat" -ForegroundColor Cyan
Write-Host ""
Write-Host "Network Remote Access:" -ForegroundColor White
Write-Host "  Projector Screen: http://localhost:3000/?mode=screen" -ForegroundColor Gray
Write-Host "  Operator Remote:  http://localhost:3000" -ForegroundColor Gray
Write-Host ""

$startNow = Read-Host "Would you like to start CinemaBooth right now? (Y/N)"
if ($startNow -match "^[Yy]") {
    Start-Process -FilePath (Join-Path $InstallPath "start-theater.bat") -WorkingDirectory $InstallPath
}
