# CinemaBooth Dual-Mode Projector Architecture (Web Browser Testing + Native Linux 5.1 Appliance for Production)

Deliver a turnkey Linux Projector Appliance package (`cinemabooth-projector_1.0.0_amd64.deb`) with **True 5.1 Surround Sound (Optical AC-3 / HDMI)**, Wayland `cage` kiosk, and native `librespot` for production on an x86_64 Mini PC, while **preserving 100% compatibility with the Web Browser Projector Screen (`/?mode=screen`)** so you can test and run everything in any browser at any time.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Seamless Dual-Mode Operation: Web Page for Testing + Native Linux App for Production**
> - **Web Page Mode (`/?mode=screen` — Testing & Any-PC Browser)**:
>   - Clicking **Projector Screen** in the top bar (or opening `/?mode=screen` in any browser) continues to work identically with zero extra setup.
>   - Video playback, pre-show slideshows, Karaoke (`k2.lazeria.com`), browser microphone release, the 5.1 Speaker Test, and the browser-based **Spotify Web Playback SDK** all run self-contained inside the web page.
>   - Even 5.1 surround videos ingested by the server play smoothly in standard stereo browsers (browsers automatically fold 5.1 AAC down to 2.0 stereo if connected to regular laptop/PC speakers).
> - **Native Linux Appliance Mode (`cinemabooth-projector.deb` — Production Mini PC)**:
>   - On your production x86_64 Mini PC, the `cinemabooth-kiosk.service` launches the Projector Screen with `?mode=screen&appliance=true`.
>   - When `appliance=true` is present, the web page delegates Spotify Connect to the native Linux `librespot` daemon (`cinemabooth-spotify.service`) and delegates hardware 5.1 S/PDIF Optical/HDMI volume & physical microphone mute to `cinemabooth-agent.service`.
>   - **Simultaneous / Hot-Swap Support**: Since the CinemaBooth Docker server broadcasts all state over WebSockets (`wss`), you can use the Web Page Projector for testing whenever the Mini PC is off—or even have a browser preview window open alongside the production projector at the same time.

- **Confirmed Decision 1 — Dual-Mode Compatibility**: Both the browser-based Projector Screen (`/?mode=screen`) and the native Linux Mini PC Appliance (`cinemabooth-projector_1.0.0_amd64.deb`) are first-class targets and work interchangeably against the same CinemaBooth Docker server.
- **Confirmed Decision 2 — Target Hardware (`amd64` x86_64 Mini PC)**: Tuned for Intel NUC / Beelink mini PCs with Intel VA-API hardware video decoding (`mesa-va-drivers`, `intel-media-va-driver`) and S/PDIF Optical (`iec958` Dolby Digital 5.1 AC-3) + HDMI 5.1 surround profiles.
- **Confirmed Decision 3 — Runtime Architecture (Wayland `cage` Kiosk + Native `librespot` + 5.1 Audio Pipeline)**: Uses `cage` booting directly from `tty1` with `--try-supported-channel-layouts`, paired with native `librespot` for production Spotify Connect and browser Web Playback SDK when testing in a web browser.
- **Confirmed Decision 4 — Packaging & Delivery (`.deb` Package + `systemd` Services)**: Dynamically generated `.deb` downloadable directly from CinemaBooth's **Setup** screen and built automatically in GitHub Actions.

---

## 1. Overview & Core Concept

- **What It Does**: Lets you test your entire show workflow (slideshows, trailers, 5.1 movies, Spotify On/Off & Volume, Karaoke mode transitions, and 5.1 speaker channel tests) directly in a web browser via `/?mode=screen`, while providing a downloadable Debian package (`cinemabooth-projector_1.0.0_amd64.deb`) that turns a minimal Debian x86_64 Mini PC into a dedicated production theater appliance.
- **Target Audience / Persona**: Projection booth operators who want fast, frictionless testing on a laptop/desktop browser and rock-solid, zero-maintenance 5.1 surround projection on a dedicated Intel NUC / Beelink Mini PC in production.
- **Key Value**:
  - **Test Anywhere in a Browser, Run in Production on Linux**: No need to have the Mini PC online just to test playlists, cues, Karaoke codes, or Spotify controls—the **Projector Screen** button in the top bar always works in any browser.
  - **True 5.1 Surround Sound Over Optical or HDMI**: Preserves 6-channel audio during server media ingestion (which plays in 5.1 on the theater system and automatically downmixes cleanly on stereo testing browsers).
  - **Automatic Spotify & Mic Delegation**: Uses the browser Web Playback SDK during web testing and automatically switches to native Linux `librespot` and ALSA hardware mic muting when running on the production appliance.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Testing in the Web Browser (`/?mode=screen`)**:
     - Click **Projector Screen** in the top navigation bar from any PC/laptop browser.
     - Test pre-show slideshows, feature playback, Karaoke switching, the 5.1 Speaker Channel Tester, and headless browser Spotify Connect without needing the Linux Mini PC connected.
  2. **Deploying to the Production Mini PC (`.deb` Package)**:
     - In the **Setup** tab, open the **Linux Projector Appliance (`.deb` Package & 5.1 Surround Setup)** card.
     - Select your **Audio Output Profile** (`Optical TOSLINK 5.1 Dolby Digital AC-3`, `HDMI 5.1 Uncompressed PCM`, or `2.0 Stereo`).
     - Click **Download `.deb` Package (`amd64`)** or copy the one-line `curl + apt install` command to run over SSH on the Mini PC.
  3. **Verify Discrete Surround Channels with the 5.1 Speaker Tester**:
     - In the **Setup** tab, tap **Run 5.1 Surround Channel Test** (or tap individual speaker buttons: `FL`, `C`, `FR`, `SL`, `SR`, `LFE`).
     - Works on **both** the Web Browser Projector Screen (for testing) and the Production Linux Mini PC (to verify each physical speaker in your auditorium).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision Projection Booth Console — clean high-contrast slate surfaces, crisp status readouts, and touch-friendly 44px+ controls designed for phones, tablets, and Chromebooks.
  - *Color Palette & Mood*: Crisp light/slate operator cards (`#FFFFFF` / `#F8FAFC`), structural hairline borders (`#E2E8F0`), royal blue primary controls (`#2563EB`), emerald active audio/connection indicators (`#059669`), and amber/rose semantic alerts.
  - *Typography & Hierarchy*: `Plus Jakarta Sans` / system geometric sans for UI headers and controls, paired with `JetBrains Mono` (`font-mono tabular-nums`) for IP addresses, audio channel layouts (`5.1 AC-3 640kbps`), volume percentages, and CLI commands.
  - *Interactive Feedback & Motion*: Visual 6-speaker auditorium diagram during the 5.1 channel test, live badges showing active **Web Browser Screens** vs. **Native Linux Appliance** connections, and one-tap CLI copy buttons.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unified WebSocket Broadcasts for Web Testing + Native Appliance**
  - *Chosen Approach*: The CinemaBooth server broadcasts all playback, Karaoke, 5.1 speaker test, and Spotify On/Off + Volume events to every connected WebSocket client (both browser `/?mode=screen` tabs and the native `cinemabooth-agent.service`).
  - *Why*: You never have to toggle a "Testing vs. Production" switch on the server. Opening `/?mode=screen` in a browser works immediately for testing, and turning on the Mini PC connects it automatically for production.
  - *Preventing Double Spotify Playback on the Mini PC*: When `cinemabooth-kiosk` launches Chromium on the Mini PC, it appends `&appliance=true` to the URL (`/?mode=screen&appliance=true`). The React `ProjectorScreen` checks for `appliance=true` and disables the in-browser Spotify Web Playback SDK on that device so `librespot` (`cinemabooth-spotify.service`) handles Spotify exclusively on the Mini PC, while regular browser tabs (`/?mode=screen`) continue running the browser Spotify SDK for testing.

- **Decision 2: AAC 5.1 (`-ac 6`) Server Transcoding for Universal Browser + 5.1 AVR Compatibility**
  - *Chosen Approach*: When a video uploaded to the server has 6 channels (5.1), `ffmpeg` encodes the audio track as 6-channel AAC (`-c:a aac -b:a 384k -ac 6`).
  - *Why*: 6-channel AAC inside an `.mp4` container is natively supported by every modern web browser ( automatically folding down to 2.0 stereo on laptop speakers during testing, while outputting all 6 discrete channels to the ALSA `a52` Dolby Digital 5.1 Optical encoder or HDMI 5.1 output on the production Mini PC).

- **Decision 3: Dynamic On-Server `.deb` Builder + GitHub Actions Artifact**
  - *Chosen Approach*: Generate the `.deb` installer dynamically at `GET /api/appliance/deb` with the user's Server URL and selected 5.1 audio profile pre-populated in `/etc/cinemabooth/projector.conf` and `/etc/asound.conf`, while also building the `.deb` in GitHub Actions.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   OPERATOR DEVICE (Phone / Tablet / Chromebook)            │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ Live Deck & Karaoke  │  │ Spotify On/Off + Vol │  │ Setup: .deb &    │  │
│  │ Remote Controls      │  │ (Native App Selects) │  │ 5.1 Audio Setup  │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
└─────────────┼─────────────────────────┼───────────────────────┼────────────┘
              │ HTTP REST / WebSocket   │                       │
              ▼                         ▼                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             HEADLESS DOCKER SERVER (CinemaBooth Node.js + SQLite)          │
│  ┌────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Express API + WebSocket Hub (wss)  │  │ On-the-Fly .deb Generator    │  │
│  │ • FFmpeg 5.1 Audio Preservation    │  │ GET /api/appliance/deb       │  │
│  │ • 5.1 Channel Test Signal Relay    │  │ • /etc/asound.conf (a52 5.1) │  │
│  │ • SQLite (./data/theater.db)       │  │ • systemd units + agent      │  │
│  └──────────┬─────────────────────────┴──────────────┬──────────────────┘  │
└─────────────┼────────────────────────────────────────┼─────────────────────┘
              │                                        │
              │ WebSocket (Testing)                    │ WebSocket (Production)
              ▼                                        ▼
┌───────────────────────────────────────┐  ┌─────────────────────────────────┐
│   WEB BROWSER PROJECTOR (Testing)     │  │ NATIVE LINUX MINI PC APPLIANCE  │
│   URL: /?mode=screen                  │  │ (cinemabooth-projector.deb)     │
│                                       │  │                                 │
│ • Standard Browser Tab / Window       │  │ 1. cinemabooth-agent.service    │
│ • Video (5.1 auto-downmix or 5.1 out) │  │    • Controls librespot On/Off  │
│ • Browser Spotify Web Playback SDK    │  │    • Sets ALSA/S/PDIF Volume    │
│ • Web Audio 5.1 / Stereo Speaker Test │  │    • Hardware Mic Capture Mute  │
│ • Karaoke Iframe + Browser Mic Release│  │ 2. cinemabooth-spotify.service  │
│                                       │  │    • Native librespot daemon    │
│                                       │  │ 3. cinemabooth-kiosk.service    │
│                                       │  │    • Wayland Cage + VA-API      │
│                                       │  │    • URL: /?mode=screen         │
│                                       │  │           &appliance=true       │
│                                       │  │ 4. ALSA 5.1 Optical AC-3 / HDMI │
└───────────────────────────────────────┘  └─────────────────────────────────┘
```

### Data Model & State (SQLite `./data/theater.db`)
- **`media` Table Enhancement**:
  - `audio_channels` (`INTEGER`, default `2`, e.g., `6` for 5.1 surround) and `audio_layout` (`TEXT`, e.g., `'5.1 Surround'` or `'2.0 Stereo'`) persisted in SQLite.
- **`settings` Table Keys**:
  - `appliance_server_url`: LAN URL baked into the `.deb` installer.
  - `appliance_audio_output`: `'optical-51-ac3'` | `'hdmi-51-pcm'` | `'stereo-20'`.
  - `appliance_spdif_card`: Target ALSA card index/name for optical S/PDIF (`0` / `default`).
  - `appliance_resolution`: `'auto'` | `'1920x1080@60'` | `'3840x2160@60'`.
- **Real-Time Appliance & Screen State (`PlaybackState`)**:
  - Tracks both connected **Web Browser Screens** and the **Native Linux Appliance** (`applianceStatus`: `{ connected, hostname, ip, arch, audioProfile, librespotRunning, kioskRunning, micMuted, spotifyVolume, uptime }`).

### Interactive Component & State Mapping
- **`ProjectorScreen.tsx` Dual-Mode Handling**:
  - Checks `new URLSearchParams(window.location.search).get('appliance') === 'true'`.
  - In **Web Browser Mode** (`appliance !== 'true'`), initializes `headlessSpotifyPlayer` (Web Playback SDK) so browser testing has full Spotify Connect support.
  - In **Native Appliance Mode** (`appliance === 'true'`), skips the browser Spotify SDK because native `librespot` is running on the Mini PC.
  - Listens for `SPEAKER_TEST_51` WebSocket events and synthesizes discrete 6-channel test tones (Front L, Center, Front R, Surround L, Surround R, LFE Subwoofer) via Web Audio API (`ChannelMergerNode(6)` with automatic 2-channel stereo pan fallback if tested on a stereo laptop browser).
- **Setup Tab (`SettingsTab.tsx`) — Linux Projector Appliance & 5.1 Surround Card**:
  - Displays live connection status for both **Web Browser Projector Screens** (Testing) and the **Native Linux Appliance** (Production).
  - Select **Audio Output Profile** (`Optical TOSLINK 5.1 AC-3`, `HDMI 5.1 PCM`, `2.0 Stereo`), **Server URL**, and **Display Resolution**, persisted to SQLite.
  - **Interactive 5.1 Surround Speaker Test** buttons (`Test All 5.1 Channels`, `FL`, `C`, `FR`, `SL`, `SR`, `LFE`).
  - **Download `.deb` Installer (`cinemabooth-projector_1.0.0_amd64.deb`)** and remote appliance service controls (**Restart Kiosk**, **Restart Librespot**, **Mute Hardware Mic**).
