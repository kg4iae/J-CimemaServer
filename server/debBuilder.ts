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

  return `# CinemaBooth Projector Appliance - Shared HDMI / Stereo Output (dmix)
pcm.projector_dmix {
    type dmix
    ipc_key 1024
    ipc_perm 0666
    slave {
        pcm "hw:${spdifCard},3"
        period_time 0
        period_size 1024
        buffer_size 4096
        rate 48000
        channels 2
    }
}

pcm.!default {
    type plug
    slave.pcm "projector_dmix"
}

ctl.!default {
    type hw
    card ${spdifCard}
}
`;
}

export function buildProjectorDebPackage(config: ApplianceDebConfig): Buffer {
  const mtime = Math.floor(Date.now() / 1000);
  const cleanServerUrl = (config.serverUrl || 'http://192.168.1.130:31047').replace(/\/+$/, '');
  const cleanDeviceName = config.deviceName || 'CinemaBooth Projector';
  const audioProfile = config.audioProfile || 'stereo-20';
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

  const audioSetupScript = `#!/bin/bash
# CinemaBooth Dynamic Projector Audio Switcher & Unmuter
# Supports on-the-fly switching between:
#   - hdmi-auto (auto-detects active HDMI display via EDID/ELD)
#   - hw:X,Y    (explicit ALSA device, e.g. hw:0,3 HDMI 0, hw:0,7 HDMI 1, hw:0,8 HDMI 2, hw:0,0 Analog)
#   - analog    (onboard 3.5mm Analog output, e.g. hw:0,0)
#   - dual      (simultaneous HDMI + 3.5mm Analog output)
set -e

if [ -f /etc/cinemabooth/projector.conf ]; then
  source /etc/cinemabooth/projector.conf
fi

REQUESTED_DEV="\${1:-\${AUDIO_DEVICE:-hdmi-auto}}"

# 1. Unmute all HDMI IEC958, Speaker, Headphone, and Master/PCM switches across every sound card
for c in \$(awk '/^ *[0-9]+ \\[/{print \$1}' /proc/asound/cards 2>/dev/null); do
  for idx in 0 1 2 3 4 5; do
    amixer -c "\$c" set 'IEC958',"\$idx" unmute >/dev/null 2>&1 || true
  done
  amixer -c "\$c" set 'IEC958' unmute >/dev/null 2>&1 || true
  amixer -c "\$c" set 'IEC958 Default PCM' unmute >/dev/null 2>&1 || true
  amixer -c "\$c" set 'Auto-Mute Mode' Disabled >/dev/null 2>&1 || true
  amixer -c "\$c" -M set 'Master' 90% unmute >/dev/null 2>&1 || true
  amixer -c "\$c" set 'PCM' 90% unmute >/dev/null 2>&1 || true
  amixer -c "\$c" set 'Speaker' 90% unmute >/dev/null 2>&1 || true
  amixer -c "\$c" set 'Headphone' 90% unmute >/dev/null 2>&1 || true
  amixer -c "\$c" set 'Line Out' 90% unmute >/dev/null 2>&1 || true
done

# 2. Auto-detect connected HDMI card/device and Analog card/device
HDMI_CARD=""
HDMI_DEV=""
MONITOR_NAME=""

for card_dir in /proc/asound/card[0-9]*; do
  [ -d "\$card_dir" ] || continue
  c_num="\${card_dir#/proc/asound/card}"
  eld_idx=0
  for eld_file in \$(ls -1v "\$card_dir"/eld* 2>/dev/null); do
    eld_idx=\$((eld_idx + 1))
    if grep -qE '^monitor_present[[:space:]]+1' "\$eld_file" 2>/dev/null; then
      MONITOR_NAME=\$(awk '/^monitor_name/{sub(/^monitor_name[[:space:]]+/, ""); print}' "\$eld_file" 2>/dev/null)
      if [ -n "\$MONITOR_NAME" ]; then
        dev_num=\$(aplay -l 2>/dev/null | grep -F "[\$MONITOR_NAME]" | awk -v c="\$c_num" '/^card / && \$2 == c":" {gsub(":", "", \$4); print \$4; exit}')
      fi
      if [ -z "\$dev_num" ]; then
        dev_num=\$(aplay -l 2>/dev/null | awk -v c="\$c_num" '/^card / && \$2 == c":" && /HDMI|DisplayPort/ {gsub(":", "", \$4); print \$4}' | sed -n "\${eld_idx}p")
      fi
      if [ -n "\$dev_num" ]; then
        HDMI_CARD="\$c_num"
        HDMI_DEV="\$dev_num"
        break 2
      fi
    fi
  done
done

if [ -z "\$HDMI_CARD" ] || [ -z "\$HDMI_DEV" ]; then
  read -r HDMI_CARD HDMI_DEV < <(aplay -l 2>/dev/null | awk '/^card / && /HDMI|DisplayPort/ && !/\\[HDMI [0-9]+\\]/ {gsub(":", "", \$2); gsub(":", "", \$4); print \$2, \$4; exit}') || true
fi
if [ -z "\$HDMI_CARD" ] || [ -z "\$HDMI_DEV" ]; then
  read -r HDMI_CARD HDMI_DEV < <(aplay -l 2>/dev/null | awk '/^card / && /HDMI|DisplayPort/ {gsub(":", "", \$2); gsub(":", "", \$4); print \$2, \$4; exit}') || true
fi

ANALOG_CARD=""
ANALOG_DEV=""
read -r ANALOG_CARD ANALOG_DEV < <(aplay -l 2>/dev/null | awk '/^card / && /Analog/ {gsub(":", "", \$2); gsub(":", "", \$4); print \$2, \$4; exit}') || true

# 3. Route according to REQUESTED_DEV (dual, analog, hw:X,Y, or hdmi-auto)
if [ "\$REQUESTED_DEV" = "dual" ] && [ -n "\$HDMI_CARD" ] && [ -n "\$ANALOG_CARD" ]; then
  echo "CinemaBooth Audio Setup: Dual Output -> HDMI hw:\${HDMI_CARD},\${HDMI_DEV} + Analog hw:\${ANALOG_CARD},\${ANALOG_DEV}"
  cat > /etc/asound.conf <<EOF
pcm.dmix_analog {
    type dmix
    ipc_key 1024
    ipc_perm 0666
    slave {
        pcm "hw:\${ANALOG_CARD},\${ANALOG_DEV}"
        format S16_LE
        period_time 0
        period_size 1024
        buffer_size 4096
        rate 48000
        channels 2
    }
}
pcm.dmix_hdmi {
    type dmix
    ipc_key 1025
    ipc_perm 0666
    slave {
        pcm "hw:\${HDMI_CARD},\${HDMI_DEV}"
        format S16_LE
        period_time 0
        period_size 1024
        buffer_size 4096
        rate 48000
        channels 2
    }
}
pcm.dual_out {
    type multi
    slaves.a.pcm "dmix_analog"
    slaves.a.channels 2
    slaves.b.pcm "dmix_hdmi"
    slaves.b.channels 2
    bindings.0.slave a
    bindings.0.channel 0
    bindings.1.slave a
    bindings.1.channel 1
    bindings.2.slave b
    bindings.2.channel 0
    bindings.3.slave b
    bindings.3.channel 1
}
pcm.dual_route {
    type route
    slave.pcm "dual_out"
    slave.channels 4
    ttable.0.0 1
    ttable.1.1 1
    ttable.0.2 1
    ttable.1.3 1
}
pcm.!default {
    type plug
    slave {
        pcm "dual_route"
        rate 48000
        format S16_LE
        channels 2
    }
}
ctl.!default {
    type hw
    card \${HDMI_CARD}
}
EOF
  exit 0
fi

if [ "\$REQUESTED_DEV" = "analog" ]; then
  TARGET_CARD="\${ANALOG_CARD:-0}"
  TARGET_DEV="\${ANALOG_DEV:-0}"
elif [[ "\$REQUESTED_DEV" =~ ^hw:([0-9]+),([0-9]+)\$ ]]; then
  TARGET_CARD="\${BASH_REMATCH[1]}"
  TARGET_DEV="\${BASH_REMATCH[2]}"
else
  TARGET_CARD="\${HDMI_CARD:-\${ANALOG_CARD:-0}}"
  TARGET_DEV="\${HDMI_DEV:-\${ANALOG_DEV:-3}}"
fi

echo "CinemaBooth Audio Setup: Routing dedicated audio to hw:\${TARGET_CARD},\${TARGET_DEV} (mode: \${REQUESTED_DEV})"

cat > /etc/asound.conf <<EOF
# Auto-configured by cinemabooth-audio-setup: Dedicated Audio Output (hw:\${TARGET_CARD},\${TARGET_DEV})
pcm.projector_dmix {
    type dmix
    ipc_key 1024
    ipc_perm 0666
    slave {
        pcm "hw:\${TARGET_CARD},\${TARGET_DEV}"
        format S16_LE
        period_time 0
        period_size 1024
        buffer_size 4096
        rate 48000
        channels 2
    }
}

pcm.!default {
    type plug
    slave {
        pcm "projector_dmix"
        rate 48000
        format S16_LE
        channels 2
    }
}

ctl.!default {
    type hw
    card \${TARGET_CARD}
}
EOF
`;

  const kioskScript = `#!/bin/bash
# CinemaBooth Wayland Cage Kiosk Launcher (x86_64 Intel VA-API + ALSA Audio)
set -e

if [ -f /etc/cinemabooth/projector.conf ]; then
  source /etc/cinemabooth/projector.conf
fi

CINEMABOOTH_SERVER_URL="\${CINEMABOOTH_SERVER_URL:-${cleanServerUrl}}"
DISPLAY_RESOLUTION="\${DISPLAY_RESOLUTION:-auto}"
AUDIO_PROFILE="\${AUDIO_PROFILE:-stereo-20}"

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 0700 "$XDG_RUNTIME_DIR"

# Configure Intel VA-API hardware video decoding on x86_64 Mini PCs
export LIBVA_DRIVER_NAME=iHD

CHROMIUM_AUDIO_FLAGS="--alsa-output-device=default --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream"
if [ "$AUDIO_PROFILE" = "optical-51-ac3" ] || [ "$AUDIO_PROFILE" = "hdmi-51-pcm" ]; then
  CHROMIUM_AUDIO_FLAGS="$CHROMIUM_AUDIO_FLAGS --try-supported-channel-layouts"
fi

BROWSER_BIN="chromium"
if command -v google-chrome-stable >/dev/null 2>&1; then
  BROWSER_BIN="google-chrome-stable"
fi

CHROME_DATA_DIR="/home/projector/.config/cb-chrome"
mkdir -p "\$CHROME_DATA_DIR"

# Background Chrome DevTools Protocol (CDP) Auto-Unlocker:
# Dispatches a genuine trusted C++ hardware click (Input.dispatchMouseEvent) & hides any autoplay badge/cursor
CDP_SCRIPT="\$XDG_RUNTIME_DIR/cinemabooth-cdp-unlock.js"
cat > "\$CDP_SCRIPT" << 'CDPEOF'
const http = require('node:http');
const crypto = require('node:crypto');

function sendCdpCommands(wsUrl) {
  try {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (res, socket) => {
      function sendJson(obj) {
        const payload = Buffer.from(JSON.stringify(obj), 'utf8');
        const mask = crypto.randomBytes(4);
        let header;
        if (payload.length < 126) {
          header = Buffer.alloc(6);
          header[0] = 0x81;
          header[1] = 0x80 | payload.length;
          mask.copy(header, 2);
        } else {
          header = Buffer.alloc(8);
          header[0] = 0x81;
          header[1] = 0x80 | 126;
          header.writeUInt16BE(payload.length, 2);
          mask.copy(header, 4);
        }
        const masked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
        socket.write(Buffer.concat([header, masked]));
      }

      // Check if this page load has already been unlocked; if not, hide badge/cursor & fire hardware click once
      const jsExpr = \`
        (function() {
          if (!document.getElementById('cb-headless-style')) {
            const st = document.createElement('style');
            st.id = 'cb-headless-style';
            st.textContent = '* { cursor: none !important; } button.animate-bounce { display: none !important; }';
            if (document.head) document.head.appendChild(st);
          }
          document.querySelectorAll('button').forEach(b => {
            if (b.textContent && b.textContent.toLowerCase().includes('enable') && b.textContent.toLowerCase().includes('audio')) {
              b.click();
              b.style.setProperty('display', 'none', 'important');
            }
          });
          if (!window.__cbHeadlessUnlocked && document.body) {
            window.__cbHeadlessUnlocked = true;
            document.body.click();
            return 'NEEDS_HW_CLICK';
          }
          return 'ALREADY_UNLOCKED';
        })();
      \`;
      socket.on('data', (chunk) => {
        const str = chunk.toString('utf8');
        if (str.includes('NEEDS_HW_CLICK')) {
          sendJson({ id: 10, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 10, y: 10, button: 'left', clickCount: 1 } });
          sendJson({ id: 11, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 10, y: 10, button: 'left', clickCount: 1 } });
        }
      });
      sendJson({ id: 1, method: 'Runtime.evaluate', params: { expression: jsExpr, userGesture: true, returnByValue: true } });
      setTimeout(() => { try { socket.destroy(); } catch {} }, 500);
    });
    req.on('error', () => {});
    req.end();
  } catch {}
}

function pollCdp() {
  http.get('http://127.0.0.1:9222/json', (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      try {
        const pages = JSON.parse(body);
        for (const p of pages) {
          if (p.type === 'page' && p.webSocketDebuggerUrl) {
            sendCdpCommands(p.webSocketDebuggerUrl);
          }
        }
      } catch {}
    });
  }).on('error', () => {});
}

// Run during startup and every 3 seconds to catch any page reload
[1000, 2000, 3500, 5000].forEach((ms) => setTimeout(pollCdp, ms));
setInterval(pollCdp, 3000);
CDPEOF

node "\$CDP_SCRIPT" >/dev/null 2>&1 &

TARGET_URL="\${CINEMABOOTH_SERVER_URL}/?mode=screen"

exec cage -s -- "\$BROWSER_BIN" \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --no-first-run \\
  --check-for-update-interval=31536000 \\
  --user-data-dir="\$CHROME_DATA_DIR" \\
  --remote-debugging-port=9222 \\
  --remote-allow-origins=* \\
  --unsafely-treat-insecure-origin-as-secure="\$CINEMABOOTH_SERVER_URL" \\
  --enable-features=VaapiVideoDecodeLinuxGL,VaapiVideoEncoder,CanvasOopRasterization \\
  --ignore-gpu-blocklist \\
  --enable-gpu-rasterization \\
  --enable-zero-copy \\
  \$CHROMIUM_AUDIO_FLAGS \\
  "\$TARGET_URL"
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
mkdir -p /var/cache/librespot

exec "\$LIBRESPOT_BIN" \\
  --name "$SPOTIFY_DEVICE_NAME" \\
  --device-type avr \\
  --backend alsa \\
  --device default \\
  --format S16 \\
  --mixer softvol \\
  --bitrate 320 \\
  --initial-volume 80 \\
  --enable-volume-normalisation \\
  --cache /var/cache/librespot \\
  --disable-audio-cache
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
    AUDIO_DEVICE: 'hdmi-auto',
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

function saveConfigValue(key, val) {
  config[key] = val;
  try {
    let raw = '';
    try { raw = fs.readFileSync('/etc/cinemabooth/projector.conf', 'utf8'); } catch {}
    const regex = new RegExp(\`^\${key}=.*$\`, 'm');
    const newLine = \`\${key}="\${val}"\`;
    if (regex.test(raw)) {
      raw = raw.replace(regex, newLine);
    } else {
      raw = raw.trimEnd() + '\\n' + newLine + '\\n';
    }
    fs.writeFileSync('/etc/cinemabooth/projector.conf', raw, 'utf8');
  } catch {}
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

function getAlsaPlaybackDevices() {
  const list = [
    { id: 'hdmi-auto', label: 'HDMI (Auto-Detect Active Projector)' },
    { id: 'analog', label: '3.5mm Analog / Line Out' },
    { id: 'dual', label: 'Dual Output (HDMI + 3.5mm Analog)' },
  ];
  try {
    const out = execSync('aplay -l', { encoding: 'utf8', timeout: 2000 });
    out.split('\\n').forEach((line) => {
      const m = line.match(/^card\\s+(\\d+):\\s+[^,]+,\\s+device\\s+(\\d+):\\s+(.+)$/);
      if (m) {
        const hwId = \`hw:\${m[1]},\${m[2]}\`;
        list.push({ id: hwId, label: \`\${m[3].trim()} (\${hwId})\` });
      }
    });
  } catch {}
  return list;
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
  // When google-chrome-stable is installed, the official Widevine Spotify Web Playback SDK inside the kiosk handles Spotify Connect
  if (fs.existsSync('/usr/bin/google-chrome-stable')) {
    runCmd('systemctl stop cinemabooth-spotify.service || true');
    return;
  }
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
    activeAudioDevice: config.AUDIO_DEVICE || 'hdmi-auto',
    audioDevices: getAlsaPlaybackDevices(),
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
  // Keep cinemabooth-spotify.service active whenever no Cinema movie or Karaoke is actively playing
  const effectiveSpotify = Boolean(!state.isPlaying && !state.karaokeActive);
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
  if (cmd.action === 'set_audio_output' && cmd.audioDevice) {
    const dev = String(cmd.audioDevice).replace(/[^a-zA-Z0-9:,_-]/g, '');
    saveConfigValue('AUDIO_DEVICE', dev);
    runCmd(\`/usr/bin/cinemabooth-audio-setup "\${dev}" || true\`);
    runCmd('systemctl restart cinemabooth-kiosk.service || true');
  } else if (cmd.action === 'restart_kiosk') {
    runCmd('/usr/bin/cinemabooth-audio-setup || true');
    runCmd('systemctl restart cinemabooth-kiosk.service');
  } else if (cmd.action === 'restart_spotify') {
    runCmd('/usr/bin/cinemabooth-audio-setup || true');
    runCmd('systemctl restart cinemabooth-spotify.service');
  } else if (cmd.action === 'mute_mic') {
    setHardwareMicMute(true);
  } else if (cmd.action === 'unmute_mic') {
    setHardwareMicMute(false);
  } else if (cmd.action === 'set_volume' && typeof cmd.volume === 'number') {
    setHardwareVolume(cmd.volume);
  }
}

// Initial hardware state: detect & unmute HDMI projector audio, mute mic on boot, set default volume
runCmd('/usr/bin/cinemabooth-audio-setup || true');
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
Version: 1.0.2
Section: video
Priority: optional
Architecture: amd64
Depends: cage, chromium | chromium-browser, alsa-utils, libasound2-plugins, mesa-va-drivers, wlr-randr, nodejs, avahi-daemon, curl, ca-certificates
Maintainer: CinemaBooth Theater Systems <support@cinemabooth.local>
Description: CinemaBooth Native Linux Projector Appliance (Wayland Cage + Librespot + Auto HDMI Audio)
 Turns a minimal Debian/Ubuntu x86_64 Mini PC into a dedicated theater projector
 appliance with Intel VA-API hardware video decoding, automatic HDMI ELD & 5.1 surround
 audio detection, native librespot Spotify Connect, and hardware mic muting.
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

# Auto-detect active HDMI projector audio output, unmute IEC958 switches, and configure shared dmix
/usr/bin/cinemabooth-audio-setup || true

amixer set Capture nocap >/dev/null 2>&1 || true

# Disable getty@tty1 so Wayland Cage owns the primary HDMI console cleanly
systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
systemctl daemon-reload >/dev/null 2>&1 || true
systemctl enable cinemabooth-agent.service >/dev/null 2>&1 || true
systemctl enable cinemabooth-kiosk.service >/dev/null 2>&1 || true

if [ -x /usr/bin/google-chrome-stable ]; then
  systemctl disable --now cinemabooth-spotify.service >/dev/null 2>&1 || true
else
  systemctl enable --now cinemabooth-spotify.service >/dev/null 2>&1 || true
fi

systemctl restart cinemabooth-agent.service >/dev/null 2>&1 || true
systemctl restart cinemabooth-kiosk.service >/dev/null 2>&1 || true

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
    { name: './usr/bin/cinemabooth-audio-setup', mode: 0o755, type: 'file', content: Buffer.from(audioSetupScript, 'utf8') },
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
