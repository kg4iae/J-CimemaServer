# CinemaBooth — Small Movie Theater Operating Guide

This application is designed specifically to run locally on your Windows media PC connected to a projector, providing seamless fullscreen projection with zero interface clutter, controlled wirelessly from a phone or tablet.

---

## 1. Quick Start on Windows

1. Double click **`start-theater.bat`** (or run `npm run dev` in PowerShell / Terminal).
2. The system starts the local SQLite database and media server on port `3000`.
3. It launches:
   - **Projector Screen**: `http://localhost:3000/?mode=screen` (move this window to your projector display and press **F11** for true fullscreen, or click anywhere to toggle fullscreen).
   - **Operator Remote**: `http://localhost:3000` (open this on your control PC, or scan the QR code to open on your phone or tablet).

---

## 2. Projector Dual-Monitor Configuration

On Windows 10/11:
1. Press `Win + P` and choose **"Extend"** (so your PC monitor and projector are independent screens).
2. Right click desktop -> **Display settings**:
   - Display 1: Your PC monitor / operator desk screen.
   - Display 2: Projector (e.g. 1920x1080 or 3840x2160).
3. Drag the **Projector Screen** window over to the projector screen and press `F11` or double-click the screen.
4. When no media is playing, your custom theater logo is displayed with a clean black background. When playing, video fills 100% of the screen with zero controls, mouse cursors, or menus.

---

## 3. Media Ingestion & Video Formats

- All files are stored locally in the `./media` directory on your PC.
- Supported direct playback: **MP4 (H.264 / AAC)**, **WebM (VP8/VP9/AV1)**.
- If you have `.mkv`, `.mov`, `.avi`, or `.ts` files, use the built-in **Media Ingest & Conversion** panel:
  - Simply drag & drop or click "Scan Folder".
  - If **FFmpeg** is installed, it runs automatic local conversion with real-time progress.
  - To install FFmpeg on Windows, open PowerShell and run:
    ```powershell
    winget install Gyan.FFmpeg
    ```
- **YouTube Video Ingestion via yt-dlp**:
  - In the **Media Ingest** tab, paste any YouTube video link (trailer, bumper, or short film).
  - To install `yt-dlp` on Windows:
    ```powershell
    winget install yt-dlp.yt-dlp
    ```
  - It automatically downloads the best MP4 stream and adds it to your SQLite media database.

---

## 4. Pre-Show JPG Slideshows & Rotation

- In the **Pre-Show Slides** tab:
  - Upload JPG slides (trivia, concession ads, policy reminders, coming attractions).
  - Slides play automatically in **alpha-numeric order** (e.g. `slide_01.jpg`, `slide_02.jpg`).
  - Configure the slide duration (defaults to **15 seconds per slide**).
  - Create multiple slideshows (e.g. *General Feature Pre-Show*, *Family Matinee*, *Retro Night*).
  - **Live Deck Selector**: On the main Live Deck, quickly switch between slideshows or choose "None (Standby Logo Only)".
  - Slides loop continuously until you press **"Play Event"**, which smoothly cuts to the presentation.

---

## 5. Automation Cues & Home Assistant

- Go to **Automation Cues** in the Operator Remote.
- Enter your Home Assistant URL (e.g. `http://192.168.1.50:8123` or `http://homeassistant.local:8123`) and a **Long-Lived Access Token** (created in Home Assistant -> Profile -> Long-Lived Access Tokens).
- You can create cues for:
  - Dimming auditorium house lights (e.g. `light.turn_on` with `brightness_pct: 20`)
  - Full blackout for the feature start (`light.turn_off`)
  - Curtain motors (`cover.open_cover` / `cover.close_cover`)
  - Credits / intermission lights (`light.turn_on` with `brightness_pct: 50`)
- Use the **Test Cue Now** button to test the lights before your audience arrives!

---

## 6. Spotify Preshow & Walk-Out Music

- CinemaBooth features an audio manager designed for theater preshow walk-in music.
- **Before the show starts**: Spotify or high-fidelity cinema ambient walk-in overtures play in the auditorium.
- **When you hit Play**: Spotify automatically stops/fades out smoothly.
- **When the playlist finishes or is stopped**: Spotify automatically resumes for audience exit!
- You can configure your Spotify Client ID and Playlist URI in the **Spotify Audio** tab.

---

## 7. Database Storage

All data (playlists, slideshows, slide records, cue configurations, media library metadata, playback state, and settings) is stored persistently in the **SQLite database** located at `./data/theater.db`. No JSON files are used for persistent data.
