import zlib from 'node:zlib';

export interface ApplianceDebConfig {
  serverUrl: string;
  deviceName: string;
  audioProfile: 'optical-51-ac3' | 'hdmi-51-pcm' | 'stereo-20';
  spdifCard: string;
  resolution: string;
  theaterName: string;
}

interface TarEntry {
  name: string;
  mode: number;
  content?: Buffer;
  type: 'file' | 'dir';
}

function createTarHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(512, 0);
  const size = entry.type === 'dir' ? 0 : entry.content?.length || 0;
  const mtime = Math.floor(Date.now() / 1000);

  // File name (100 bytes)
  header.write(entry.name.slice(0, 100), 0, 'utf8');
  // File mode (8 bytes octal)
  header.write(entry.mode.toString(8).padStart(7, '0') + '\0', 100, 'ascii');
  // Owner UID (0 = root)
  header.write('0000000\0', 108, 'ascii');
  // Group GID (0 = root)
  header.write('0000000\0', 116, 'ascii');
  // File size in bytes (12 bytes octal)
  header.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
  // Mtime (12 bytes octal)
  header.write(mtime.toString(8).padStart(11, '0') + '\0', 136, 'ascii');
  // Checksum placeholder (8 spaces)
  header.write('        ', 148, 'ascii');
  // Type flag ('0' = normal file, '5' = directory)
  header.write(entry.type === 'dir' ? '5' : '0', 156, 'ascii');
  // USTAR indicator
  header.write('ustar\0', 257, 'ascii');
  header.write('00', 263, 'ascii');
  header.write('root', 265, 'ascii');
  header.write('root', 297, 'ascii');

  // Compute checksum
  let sum = 0;
  for (let i = 0; i < 512; i++) {
    sum += header[i];
  }
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return header;
}

function buildTarGz(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(createTarHeader(entry));
    if (entry.type === 'file' && entry.content && entry.content.length > 0) {
      chunks.push(entry.content);
      const remainder = entry.content.length % 512;
      if (remainder !== 0) {
        chunks.push(Buffer.alloc(512 - remainder, 0));
      }
    }
  }
  // End-of-archive marker (two 512-byte zero blocks)
  chunks.push(Buffer.alloc(1024, 0));
  const tarBuffer = Buffer.concat(chunks);
  return zlib.gzipSync(tarBuffer, { level: 9 });
}

function createArFileMember(name: string, data: Buffer, mtime: number): Buffer {
  const header = Buffer.alloc(60, 0x20); // Fill with spaces
  header.write(name.slice(0, 16), 0, 'ascii');
  header.write(String(mtime).slice(0, 12), 16, 'ascii');
  header.write('0', 28, 'ascii'); // UID
  header.write('0', 34, 'ascii'); // GID
  header.write('100644', 40, 'ascii'); // Mode
  header.write(String(data.length), 48, 'ascii');
  header.write('`\n', 58, 'ascii');

  if (data.length % 2 !== 0) {
    return Buffer.concat([header, data, Buffer.from('\n', 'ascii')]);
  }
  return Buffer.concat([header, data]);
}

export function generateAsoundConf(profile: string, spdifCard: string = '0'): string {
  if (profile === 'optical-51-ac3') {
    return `# CinemaBooth Projector Appliance - Optical TOSLINK 5.1 Surround (Dolby Digital AC-3 640kbps)
# Real-time 6-channel PCM to AC-3 S/PDIF bitstream encoder via libasound2-plugins (a52)
pcm.a52encode {
    type a52
    card ${spdifCard}
    rate 48000
    channels 6
    bitrate 640
}

pcm.cinemabooth51 {
    type plug
    slave.pcm "a52encode"
}

pcm.!default {
    type plug
    slave.pcm "a52encode"
}

ctl.!default {
    type hw
    card ${spdifCard}
}
`;
  }

  if (profile === 'hdmi-51-pcm') {
    return `# CinemaBooth Projector Appliance - HDMI 5.1 Surround (6-Channel Uncompressed LPCM)
pcm.cinemabooth51 {
    type plug
    slave {
        pcm "surround51:${spdifCard}"
        channels 6
    }
}

pcm.!default {
    type plug
    slave {
        pcm "surround51:${spdifCard}"
        channels 6
    }
}

ctl.!default {
    type hw
    card ${spdifCard}
}
`;
  }

  return `# CinemaBooth Projector Appliance - Standard 2.0 Stereo Output
pcm.!default {
    type plug
    slave.pcm "dmix:${spdifCard},0"
}

ctl.!default {
    type hw
    card ${spdifCard}
}
`;
}

export function buildProjectorDebPackage(config: ApplianceDebConfig): Buffer {
  const mtime = Math.floor(Date.now() / 1000);
  const cleanServerUrl = (config.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const cleanDeviceName = config.deviceName || 'CinemaBooth Projector';
  const audioProfile = config.audioProfile || 'optical-51-ac3';
  const spdifCard = config.spdifCard || '0';
  const resolution = config.resolution || 'auto';

  const projectorConf = `# CinemaBooth Linux Projector Appliance Configuration
# Managed by cinemabooth-projector package and CinemaBooth Server
CINEMABOOTH_SERVER_URL="${cleanServerUrl}"
SPOTIFY_DEVICE_NAME="${cleanDeviceName}"
AUDIO_PROFILE="${audioProfile}"
SPDIF_CARD="${spdifCard}"
DISPLAY_RESOLUTION="${resolution}"
THEATER_NAME="${(config.theaterName || 'CinemaBooth Theater').replace(/"/g, '')}"
`;

  const asoundConf = generateAsoundConf(audioProfile, spdifCard);

  const kioskScript = `#!/bin/bash
# CinemaBooth Wayland Cage Kiosk Launcher (x86_64 Intel VA-API + 5.1 Surround)
set -e

if [ -f /etc/cinemabooth/projector.conf ]; then
  source /etc/cinemabooth/projector.conf
fi

CINEMABOOTH_SERVER_URL="\${CINEMABOOTH_SERVER_URL:-${cleanServerUrl}}"
DISPLAY_RESOLUTION="\${DISPLAY_RESOLUTION:-auto}"
AUDIO_PROFILE="\${AUDIO_PROFILE:-optical-51-ac3}"

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 0700 "$XDG_RUNTIME_DIR"

# Configure Intel VA-API hardware video decoding on x86_64 Mini PCs
export LIBVA_DRIVER_NAME=iHD

CHROMIUM_AUDIO_FLAGS="--autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream"
if [ "$AUDIO_PROFILE" = "optical-51-ac3" ] || [ "$AUDIO_PROFILE" = "hdmi-51-pcm" ]; then
  CHROMIUM_AUDIO_FLAGS="$CHROMIUM_AUDIO_FLAGS --try-supported-channel-layouts --force-wave-audio"
fi

TARGET_URL="\${CINEMABOOTH_SERVER_URL}/?mode=screen&appliance=true"

exec cage -s -- chromium \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --no-first-run \\
  --check-for-update-interval=31536000 \\
  --enable-features=VaapiVideoDecodeLinuxGL,VaapiVideoEncoder,CanvasOopRasterization \\
  --ignore-gpu-blocklist \\
  --enable-gpu-rasterization \\
  --enable-zero-copy \\
  $CHROMIUM_AUDIO_FLAGS \\
  "$TARGET_URL"
`;

  const installLibrespotScript = `#!/bin/bash
# Automatically downloads and extracts the precompiled x86_64/amd64 librespot binary
# from dtcooper/raspotify GitHub releases without requiring an external apt repo or dpkg lock.
set -e

if command -v librespot >/dev/null 2>&1 || [ -x /usr/local/bin/librespot ]; then
  exit 0
fi

echo "Downloading precompiled librespot (amd64) for Debian 12..."
TMP_DIR="\$(mktemp -d)"
trap 'rm -rf "\$TMP_DIR"' EXIT

DEB_URL=\$(curl -fsSL https://api.github.com/repos/dtcooper/raspotify/releases/latest \\
  | grep -oE 'https://[^"]+raspotify_[^"]+_amd64\\.deb' \\
  | head -n 1)

if [ -n "\$DEB_URL" ]; then
  curl -fsSL "\$DEB_URL" -o "\$TMP_DIR/raspotify.deb"
  dpkg-deb -x "\$TMP_DIR/raspotify.deb" "\$TMP_DIR/extract"
  if [ -f "\$TMP_DIR/extract/usr/bin/librespot" ]; then
    install -m 0755 "\$TMP_DIR/extract/usr/bin/librespot" /usr/local/bin/librespot
    ln -sf /usr/local/bin/librespot /usr/bin/librespot || true
    echo "librespot installed successfully to /usr/local/bin/librespot"
  fi
fi
`;

  const spotifyScript = `#!/bin/bash
# CinemaBooth Native Librespot Spotify Connect Daemon
set -e

if [ -f /etc/cinemabooth/projector.conf ]; then
  source /etc/cinemabooth/projector.conf
fi

SPOTIFY_DEVICE_NAME="\${SPOTIFY_DEVICE_NAME:-CinemaBooth Projector}"

if ! command -v librespot >/dev/null 2>&1 && [ ! -x /usr/local/bin/librespot ]; then
  /usr/bin/cinemabooth-install-librespot || true
fi

LIBRESPOT_BIN="\$(command -v librespot || echo /usr/local/bin/librespot)"

exec "\$LIBRESPOT_BIN" \\
  --name "$SPOTIFY_DEVICE_NAME" \\
  --device-type avr \\
  --backend alsa \\
  --bitrate 320 \\
  --initial-volume 80 \\
  --enable-volume-normalisation
`;

  const agentScript = `#!/usr/bin/env node
/**
 * CinemaBooth Linux Projector Hardware Agent (cinemabooth-agent)
 * Synchronizes native librespot Spotify Connect, 5.1 ALSA/Optical S/PDIF audio,
 * and hardware microphone capture muting with the CinemaBooth Docker Server.
 */
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

function loadConfig() {
  const defaults = {
    CINEMABOOTH_SERVER_URL: '${cleanServerUrl}',
    SPOTIFY_DEVICE_NAME: '${cleanDeviceName}',
    AUDIO_PROFILE: '${audioProfile}',
    SPDIF_CARD: '${spdifCard}',
    DISPLAY_RESOLUTION: '${resolution}',
  };
  try {
    const raw = fs.readFileSync('/etc/cinemabooth/projector.conf', 'utf8');
    raw.split('\\n').forEach((line) => {
      const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
      if (m) defaults[m[1]] = m[2];
    });
  } catch {}
  return defaults;
}

let config = loadConfig();
let micMuted = true;
let spotifyVolume = 80;

function runCmd(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

function setHardwareMicMute(mute) {
  micMuted = Boolean(mute);
  const state = micMuted ? 'nocap' : 'cap';
  runCmd(\`amixer set Capture \${state} || true\`);
  runCmd(\`wpctl set-mute @DEFAULT_AUDIO_SOURCE@ \${micMuted ? '1' : '0'} || true\`);
}

function setHardwareVolume(volPercent) {
  spotifyVolume = Math.max(0, Math.min(100, Math.round(Number(volPercent) || 80)));
  runCmd(\`amixer -M set Master \${spotifyVolume}% unmute || amixer set PCM \${spotifyVolume}% unmute || true\`);
  runCmd(\`wpctl set-volume @DEFAULT_AUDIO_SINK@ \${(spotifyVolume / 100).toFixed(2)} || true\`);
}

function setLibrespotActive(shouldPlay) {
  if (shouldPlay) {
    runCmd('systemctl start cinemabooth-spotify.service || true');
  } else {
    runCmd('systemctl stop cinemabooth-spotify.service || true');
  }
}

function isServiceActive(unit) {
  try {
    const out = execSync(\`systemctl is-active \${unit}\`, { encoding: 'utf8', timeout: 2000 }).trim();
    return out === 'active';
  } catch {
    return false;
  }
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function sendHeartbeat() {
  const payload = JSON.stringify({
    hostname: os.hostname(),
    ip: getLocalIp(),
    arch: os.arch(),
    audioProfile: config.AUDIO_PROFILE,
    librespotRunning: isServiceActive('cinemabooth-spotify.service'),
    kioskRunning: isServiceActive('cinemabooth-kiosk.service'),
    micMuted,
    spotifyVolume,
    uptime: Math.floor(os.uptime()),
  });

  try {
    const url = new URL('/api/appliance/heartbeat', config.CINEMABOOTH_SERVER_URL);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 4000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (Array.isArray(data.commands)) {
              data.commands.forEach(handleCommand);
            }
            if (data.state) {
              syncWithServerState(data.state);
            }
          } catch {}
        });
      }
    );
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch {}
}

let lastSpotifyPlaying = null;
let lastKaraokeActive = null;

function syncWithServerState(state) {
  if (typeof state.spotifyVolume === 'number') {
    const pct = Math.round(state.spotifyVolume * 100);
    if (Math.abs(pct - spotifyVolume) >= 1) {
      setHardwareVolume(pct);
    }
  }
  const effectiveSpotify = Boolean(state.spotifyPlaying && !state.isPlaying && !state.karaokeActive);
  if (lastSpotifyPlaying !== effectiveSpotify) {
    lastSpotifyPlaying = effectiveSpotify;
    setLibrespotActive(effectiveSpotify);
  }
  if (typeof state.karaokeActive === 'boolean' && lastKaraokeActive !== state.karaokeActive) {
    lastKaraokeActive = state.karaokeActive;
    // Mute microphone when returning to Cinema mode; unmute when entering Karaoke mode
    setHardwareMicMute(!state.karaokeActive);
  }
}

function handleCommand(cmd) {
  if (!cmd || !cmd.action) return;
  if (cmd.action === 'restart_kiosk') {
    runCmd('systemctl restart cinemabooth-kiosk.service');
  } else if (cmd.action === 'restart_spotify') {
    runCmd('systemctl restart cinemabooth-spotify.service');
  } else if (cmd.action === 'mute_mic') {
    setHardwareMicMute(true);
  } else if (cmd.action === 'unmute_mic') {
    setHardwareMicMute(false);
  } else if (cmd.action === 'set_volume' && typeof cmd.volume === 'number') {
    setHardwareVolume(cmd.volume);
  }
}

// Initial hardware state: mute mic on boot, set default volume
setHardwareMicMute(true);
setHardwareVolume(80);
sendHeartbeat();
setInterval(sendHeartbeat, 3000);
`;

  const kioskService = `[Unit]
Description=CinemaBooth Wayland Cage Projector Kiosk
After=network-online.target systemd-user-sessions.service sound.target
Wants=network-online.target

[Service]
Type=simple
User=projector
Group=video
SupplementaryGroups=render audio input tty
PAMName=login
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty-fail
ExecStart=/usr/bin/cinemabooth-kiosk
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

  const spotifyService = `[Unit]
Description=CinemaBooth Native Librespot Spotify Connect Receiver
After=network-online.target sound.target avahi-daemon.service
Wants=network-online.target

[Service]
Type=simple
User=projector
Group=audio
ExecStart=/usr/bin/cinemabooth-spotify
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

  const agentService = `[Unit]
Description=CinemaBooth Projector Hardware Control Agent (5.1 Audio, Librespot & Mic Mute)
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/cinemabooth-agent
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

  const controlFile = `Package: cinemabooth-projector
Version: 1.0.1
Section: video
Priority: optional
Architecture: amd64
Depends: cage, chromium | chromium-browser, alsa-utils, libasound2-plugins, mesa-va-drivers, wlr-randr, nodejs, avahi-daemon, curl, ca-certificates
Maintainer: CinemaBooth Theater Systems <support@cinemabooth.local>
Description: CinemaBooth Native Linux Projector Appliance (Wayland Cage + Librespot + True 5.1 Surround)
 Turns a minimal Debian/Ubuntu x86_64 Mini PC into a dedicated theater projector
 appliance with Intel VA-API hardware video decoding, Optical S/PDIF AC-3 5.1 or
 HDMI 5.1 surround sound, native librespot Spotify Connect, and hardware mic muting.
`;

  const postinstScript = `#!/bin/bash
set -e

if ! id -u projector >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G video,render,audio,input,tty,plugdev projector || true
else
  usermod -a -G video,render,audio,input,tty,plugdev projector || true
fi

# Download and extract precompiled librespot binary for Debian 12 amd64
/usr/bin/cinemabooth-install-librespot || true

# Unmute S/PDIF IEC958 optical output if present
amixer set 'IEC958' unmute >/dev/null 2>&1 || true
amixer set 'IEC958',0 unmute >/dev/null 2>&1 || true
amixer set 'IEC958 Default PCM' unmute >/dev/null 2>&1 || true
amixer set Capture nocap >/dev/null 2>&1 || true

# Disable getty@tty1 so Wayland Cage owns the primary HDMI console cleanly
systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
systemctl daemon-reload >/dev/null 2>&1 || true
systemctl enable --now cinemabooth-agent.service >/dev/null 2>&1 || true
systemctl enable --now cinemabooth-spotify.service >/dev/null 2>&1 || true
systemctl enable --now cinemabooth-kiosk.service >/dev/null 2>&1 || true

echo "CinemaBooth Projector Appliance installed and active!"
exit 0
`;

  const prermScript = `#!/bin/bash
set -e
systemctl stop cinemabooth-kiosk.service >/dev/null 2>&1 || true
systemctl stop cinemabooth-spotify.service >/dev/null 2>&1 || true
systemctl stop cinemabooth-agent.service >/dev/null 2>&1 || true
exit 0
`;

  const controlTarGz = buildTarGz([
    { name: './', mode: 0o755, type: 'dir' },
    { name: './control', mode: 0o644, type: 'file', content: Buffer.from(controlFile, 'utf8') },
    { name: './postinst', mode: 0o755, type: 'file', content: Buffer.from(postinstScript, 'utf8') },
    { name: './prerm', mode: 0o755, type: 'file', content: Buffer.from(prermScript, 'utf8') },
  ]);

  const dataTarGz = buildTarGz([
    { name: './', mode: 0o755, type: 'dir' },
    { name: './etc/', mode: 0o755, type: 'dir' },
    { name: './etc/cinemabooth/', mode: 0o755, type: 'dir' },
    { name: './etc/cinemabooth/projector.conf', mode: 0o644, type: 'file', content: Buffer.from(projectorConf, 'utf8') },
    { name: './etc/asound.conf', mode: 0o644, type: 'file', content: Buffer.from(asoundConf, 'utf8') },
    { name: './usr/', mode: 0o755, type: 'dir' },
    { name: './usr/bin/', mode: 0o755, type: 'dir' },
    { name: './usr/bin/cinemabooth-install-librespot', mode: 0o755, type: 'file', content: Buffer.from(installLibrespotScript, 'utf8') },
    { name: './usr/bin/cinemabooth-kiosk', mode: 0o755, type: 'file', content: Buffer.from(kioskScript, 'utf8') },
    { name: './usr/bin/cinemabooth-spotify', mode: 0o755, type: 'file', content: Buffer.from(spotifyScript, 'utf8') },
    { name: './usr/bin/cinemabooth-agent', mode: 0o755, type: 'file', content: Buffer.from(agentScript, 'utf8') },
    { name: './lib/', mode: 0o755, type: 'dir' },
    { name: './lib/systemd/', mode: 0o755, type: 'dir' },
    { name: './lib/systemd/system/', mode: 0o755, type: 'dir' },
    { name: './lib/systemd/system/cinemabooth-kiosk.service', mode: 0o644, type: 'file', content: Buffer.from(kioskService, 'utf8') },
    { name: './lib/systemd/system/cinemabooth-spotify.service', mode: 0o644, type: 'file', content: Buffer.from(spotifyService, 'utf8') },
    { name: './lib/systemd/system/cinemabooth-agent.service', mode: 0o644, type: 'file', content: Buffer.from(agentService, 'utf8') },
  ]);

  const arMagic = Buffer.from('!<arch>\n', 'ascii');
  const debianBinary = createArFileMember('debian-binary', Buffer.from('2.0\n', 'ascii'), mtime);
  const controlMember = createArFileMember('control.tar.gz', controlTarGz, mtime);
  const dataMember = createArFileMember('data.tar.gz', dataTarGz, mtime);

  return Buffer.concat([arMagic, debianBinary, controlMember, dataMember]);
}
