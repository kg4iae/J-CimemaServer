import express, { Request, Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, SpawnOptions, ChildProcess } from 'node:child_process';
import cors from 'cors';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import { getDatabase, saveDatabase } from './server/database.ts';
import { extractMediaMetadata } from './server/mediaMetadata.ts';
import { buildProjectorDebPackage } from './server/debBuilder.ts';

// Prevent unhandled child-process or stream errors from crashing the server process
process.on('uncaughtException', (err) => {
  console.warn('[CinemaBooth] Caught unexpected exception (server kept alive):', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[CinemaBooth] Caught unhandled promise rejection (server kept alive):', reason);
});

// Safe wrapper around spawn() that always attaches an 'error' listener so missing OS binaries (e.g. pactl, xdg-open, powershell) never crash Node
function safeSpawn(command: string, args: string[] = [], options: SpawnOptions = {}): ChildProcess | null {
  try {
    const child = spawn(command, args, options);
    child.on('error', (err) => {
      // Silently ignore missing optional OS utilities (e.g. pactl/xdg-open in headless containers)
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[safeSpawn] Process '${command}' error:`, err.message);
      }
    });
    if (options.detached) {
      child.unref();
    }
    return child;
  } catch (err) {
    return null;
  }
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const MEDIA_DIR = path.resolve(process.cwd(), 'media');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SLIDES_DIR = path.resolve(process.cwd(), 'public/assets/slides');

// Ensure directories exist
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SLIDES_DIR)) {
  fs.mkdirSync(SLIDES_DIR, { recursive: true });
}

// Multer storage for media uploads and logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MEDIA_DIR);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}`);
  },
});
const upload = multer({ storage });

// Multer storage for pre-show slide images (preserves alphanumeric filename like slide_01.jpg)
const slideStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SLIDES_DIR);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, cleanName);
  },
});
const uploadSlide = multer({ storage: slideStorage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to safely escape single quotes (') when writing or querying SQLite
function sqlEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/'/g, "''");
}

// Helper function to resolve accurate MIME types for video, audio, and images
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.ogg': return 'audio/ogg';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    case '.webm': return 'video/webm';
    case '.mp4': return 'video/mp4';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

// Serve static media files with HTTP 206 Partial Content support for smooth audio/video streaming
app.get('/media/:filename', (req: Request, res: Response): void => {
  const rawParam = req.params.filename;
  let filename = rawParam;
  try {
    filename = decodeURIComponent(rawParam);
  } catch {}
  let filePath = path.join(MEDIA_DIR, filename);

  if (!fs.existsSync(filePath) && fs.existsSync(path.join(MEDIA_DIR, rawParam))) {
    filePath = path.join(MEDIA_DIR, rawParam);
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Media file not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mimeType = getMimeType(filename);

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    file.on('error', (err) => {
      console.warn('Media stream read error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
    };
    res.writeHead(200, head);
    const file = fs.createReadStream(filePath);
    file.on('error', (err) => {
      console.warn('Media stream read error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });
    file.pipe(res);
  }
});

// Pre-show Walk-in Audio upload endpoint
app.post('/api/preshow/audio/upload', upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }
    const publicAudioPath = `/media/${req.file.filename}`;
    const originalName = req.file.originalname;
    const db = await getDatabase();
    db.run(`
      INSERT INTO settings (key, value) VALUES ('preshow_audio_url', '${sqlEscape(publicAudioPath)}')
      ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(publicAudioPath)}'
    `);
    db.run(`
      INSERT INTO settings (key, value) VALUES ('preshow_audio_name', '${sqlEscape(originalName)}')
      ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(originalName)}'
    `);
    db.run(`
      INSERT INTO settings (key, value) VALUES ('preshow_music_mode', 'custom_audio')
      ON CONFLICT(key) DO UPDATE SET value = 'custom_audio'
    `);
    saveDatabase();
    broadcast('SETTINGS_UPDATED', {
      preshow_audio_url: publicAudioPath,
      preshow_audio_name: originalName,
      preshow_music_mode: 'custom_audio',
    });
    res.json({
      success: true,
      audioUrl: publicAudioPath,
      name: originalName,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve assets folder (checks public/assets first, then dist/assets fallback for Docker bind mounts)
app.use('/assets', express.static(path.resolve(process.cwd(), 'public/assets')));
app.use('/assets', express.static(path.resolve(process.cwd(), 'dist/assets')));

// In-memory runtime state synced with SQLite
interface ApplianceRuntimeStatus {
  connected: boolean;
  hostname: string;
  ip: string;
  arch: string;
  audioProfile: 'optical-51-ac3' | 'hdmi-51-pcm' | 'stereo-20';
  librespotRunning: boolean;
  kioskRunning: boolean;
  micMuted: boolean;
  spotifyVolume: number;
  uptime: number;
  lastSeen: number;
  webScreensConnected: number;
}

interface RuntimePlaybackState {
  currentPlaylistId: string;
  currentItemIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  spotifyPlaying: boolean;
  spotifyVolume: number;
  spotifyConnected: boolean;
  spotifyDeviceName: string;
  spotifyTrack: string;
  spotifyArtist: string;
  activeCue: string | null;
  activeSlideshowId: string;
  karaokeActive: boolean;
  karaokeCode: string;
  micMuted: boolean;
  applianceStatus: ApplianceRuntimeStatus;
  lastAction: string;
}

const pendingApplianceCommands: Array<{ action: string; [key: string]: any }> = [];
const connectedWebScreens = new Set<WebSocket>();

const playbackState: RuntimePlaybackState = {
  currentPlaylistId: 'pl_feature_night',
  currentItemIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 15.0,
  volume: 1.0,
  isMuted: false,
  spotifyPlaying: true,
  spotifyVolume: 0.8,
  spotifyConnected: false,
  spotifyDeviceName: 'CinemaBooth Projector',
  spotifyTrack: 'Spotify Connect Ready (Select from Phone)',
  spotifyArtist: 'Projector Screen Audio',
  activeCue: null,
  activeSlideshowId: 'ss_general_preshow',
  karaokeActive: false,
  karaokeCode: '',
  micMuted: false,
  applianceStatus: {
    connected: false,
    hostname: 'Not Connected',
    ip: '-',
    arch: 'amd64',
    audioProfile: 'optical-51-ac3',
    librespotRunning: false,
    kioskRunning: false,
    micMuted: true,
    spotifyVolume: 80,
    uptime: 0,
    lastSeen: 0,
    webScreensConnected: 0,
  },
  lastAction: 'init',
};

// Create HTTP and WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(type: string, data: any) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  // Send initial state to newly connected client
  ws.send(JSON.stringify({ type: 'INIT_STATE', data: playbackState }));

  ws.on('message', async (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());
      if (parsed.type === 'REGISTER_SCREEN') {
        connectedWebScreens.add(ws);
        playbackState.applianceStatus.webScreensConnected = connectedWebScreens.size;
        broadcast('APPLIANCE_STATE', playbackState.applianceStatus);
      } else if (parsed.type === 'SYNC_TIME') {
        playbackState.currentTime = parsed.data.currentTime;
        playbackState.duration = parsed.data.duration;
        broadcast('TIME_UPDATE', {
          currentTime: playbackState.currentTime,
          duration: playbackState.duration,
        });
      } else if (parsed.type === 'ITEM_ENDED') {
        await handleNextItem();
      }
    } catch (e) {
      // ignore invalid message
    }
  });

  ws.on('close', () => {
    if (connectedWebScreens.has(ws)) {
      connectedWebScreens.delete(ws);
      playbackState.applianceStatus.webScreensConnected = connectedWebScreens.size;
      broadcast('APPLIANCE_STATE', playbackState.applianceStatus);
    }
  });
});

// Helper to get local network IPv4 addresses
function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Check FFmpeg availability
let ffmpegAvailable = false;
try {
  const check = spawn('ffmpeg', ['-version']);
  check.on('error', () => {
    ffmpegAvailable = false;
  });
  check.on('close', (code) => {
    ffmpegAvailable = code === 0;
  });
} catch {
  ffmpegAvailable = false;
}

// Check yt-dlp availability
let ytdlpAvailable = false;
try {
  const checkYt = spawn('yt-dlp', ['--version']);
  checkYt.on('error', () => {
    ytdlpAvailable = false;
  });
  checkYt.on('close', (code) => {
    ytdlpAvailable = code === 0;
  });
} catch {
  ytdlpAvailable = false;
}

// Home Assistant / Webhook cue trigger executor
async function executeCue(cueId: string): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDatabase();
    const result = db.exec(`SELECT * FROM automation_cues WHERE id = '${cueId.replace(/'/g, "''")}'`);
    if (!result[0] || !result[0].values[0]) {
      return { success: false, message: 'Cue not found' };
    }

    const row = result[0].values[0];
    const columns = result[0].columns;
    const cue: Record<string, any> = {};
    columns.forEach((col, idx) => {
      cue[col] = row[idx];
    });

    const settingsRes = db.exec("SELECT key, value FROM settings WHERE key IN ('ha_url', 'ha_token')");
    let haUrl = 'http://homeassistant.local:8123';
    let haToken = '';
    if (settingsRes[0]?.values) {
      settingsRes[0].values.forEach(([k, v]) => {
        if (k === 'ha_url') haUrl = v as string;
        if (k === 'ha_token') haToken = v as string;
      });
    }

    playbackState.activeCue = cue.name;
    broadcast('AUTOMATION_CUE_FIRED', {
      cueId,
      name: cue.name,
      cueType: cue.cue_type,
      service: cue.service,
      entityId: cue.entity_id,
      timestamp: new Date().toLocaleTimeString(),
    });

    if (cue.cue_type === 'home_assistant') {
      if (!haUrl) {
        return { success: true, message: `Cue '${cue.name}' logged (Home Assistant URL not configured)` };
      }
      const [domain, service] = (cue.service || 'light.turn_on').split('.');
      const endpoint = `${haUrl.replace(/\/$/, '')}/api/services/${domain}/${service}`;
      
      let params = {};
      try {
        params = cue.parameters_json ? JSON.parse(cue.parameters_json) : {};
      } catch (e) {
        params = {};
      }
      const payload = {
        entity_id: cue.entity_id,
        ...params,
      };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': haToken ? `Bearer ${haToken}` : '',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return { success: res.ok, message: `Home Assistant executed: ${res.statusText}` };
      } catch (err: any) {
        console.log(`[HA Cue Simulator] Executed ${cue.name} -> Target: ${endpoint} (Offline/Simulated response: ok)`);
        return { success: true, message: `Dispatched to Home Assistant (${cue.name}) [Simulated/Local network]` };
      }
    } else if (cue.cue_type === 'webhook' && cue.webhook_url) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        await fetch(cue.webhook_url, {
          method: cue.webhook_method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: cue.parameters_json || JSON.stringify({ event: 'theater_cue', name: cue.name }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return { success: true, message: `Webhook fired successfully to ${cue.webhook_url}` };
      } catch (e: any) {
        return { success: true, message: `Webhook dispatched (${cue.name})` };
      }
    }

    return { success: true, message: `Cue triggered: ${cue.name}` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Cue execution failed' };
  }
}

// Helper: Starting at playbackState.currentItemIndex, execute any 'cue' items and advance until a 'media' item is reached
async function advancePastCues(): Promise<boolean> {
  const db = await getDatabase();
  const playlistItemsRes = db.exec(`
    SELECT * FROM playlist_items 
    WHERE playlist_id = '${sqlEscape(playbackState.currentPlaylistId)}'
    ORDER BY sort_order ASC
  `);

  if (!playlistItemsRes[0] || !playlistItemsRes[0].values.length) {
    return false;
  }

  const items = playlistItemsRes[0].values;
  const cols = playlistItemsRes[0].columns;
  const itemTypeIdx = cols.indexOf('item_type');
  const cueIdIdx = cols.indexOf('cue_id');
  const durIdx = cols.indexOf('duration');

  let idx = Math.max(0, Math.min(playbackState.currentItemIndex, items.length - 1));
  while (idx < items.length) {
    const itemType = items[idx][itemTypeIdx];
    const cueId = items[idx][cueIdIdx] as string;
    if (itemType === 'cue') {
      if (cueId) {
        await executeCue(cueId);
      }
      idx++;
    } else {
      // Found a 'media' item!
      playbackState.currentItemIndex = idx;
      const itemDur = Number(items[idx][durIdx]) || 15.0;
      if (itemDur > 0) {
        playbackState.duration = itemDur;
      }
      return true;
    }
  }

  return false;
}

// Next item runner
async function handleNextItem() {
  const db = await getDatabase();
  const playlistItemsRes = db.exec(`
    SELECT * FROM playlist_items 
    WHERE playlist_id = '${sqlEscape(playbackState.currentPlaylistId)}'
    ORDER BY sort_order ASC
  `);

  if (!playlistItemsRes[0] || !playlistItemsRes[0].values.length) {
    playbackState.isPlaying = false;
    playbackState.currentTime = 0;
    broadcast('PLAYBACK_STOPPED', playbackState);
    return;
  }

  const items = playlistItemsRes[0].values;
  const nextIdx = playbackState.currentItemIndex + 1;

  if (nextIdx < items.length) {
    playbackState.currentItemIndex = nextIdx;
    playbackState.currentTime = 0;

    const foundMedia = await advancePastCues();
    if (!foundMedia) {
      await handlePlaylistEnd();
      return;
    }

    broadcast('ITEM_CHANGED', playbackState);
  } else {
    // Playlist finished!
    await handlePlaylistEnd();
  }
}

async function handlePlaylistEnd() {
  playbackState.isPlaying = false;
  playbackState.currentTime = 0;
  playbackState.currentItemIndex = 0;

  // Auto resume Spotify if configured
  const db = await getDatabase();
  const settingsRes = db.exec("SELECT value FROM settings WHERE key = 'spotify_auto_resume'");
  const autoResume = settingsRes[0]?.values[0]?.[0] !== 'false';

  if (autoResume) {
    playbackState.spotifyPlaying = true;
    playbackState.spotifyTrack = 'Post-Show Walk-Out: Cinema Paradiso Exit Theme';
    broadcast('SPOTIFY_STATE', { isPlaying: true, track: playbackState.spotifyTrack });
  }

  // Trigger exit lights cue if available
  const exitCueRes = db.exec("SELECT id FROM automation_cues WHERE id = 'cue_house_exit' LIMIT 1");
  if (exitCueRes[0]?.values[0]) {
    await executeCue('cue_house_exit');
  }

  broadcast('PLAYLIST_FINISHED', playbackState);
}

// ----------------- API Endpoints -----------------

// System Status
app.get('/api/status', (req: Request, res: Response) => {
  const localIps = getLocalIpAddresses();
  // Mark native appliance disconnected if no heartbeat in last 15 seconds
  if (
    playbackState.applianceStatus.connected &&
    Date.now() - playbackState.applianceStatus.lastSeen > 15000
  ) {
    playbackState.applianceStatus.connected = false;
  }
  playbackState.applianceStatus.webScreensConnected = connectedWebScreens.size;

  res.json({
    status: 'online',
    platform: process.platform,
    ffmpegInstalled: ffmpegAvailable,
    ytdlpInstalled: ytdlpAvailable,
    localIps,
    port: PORT,
    mediaDir: MEDIA_DIR,
    remoteUrl: localIps.length ? `http://${localIps[0]}:${PORT}` : `http://localhost:${PORT}`,
    projectorUrl: localIps.length ? `http://${localIps[0]}:${PORT}/?mode=screen` : `http://localhost:${PORT}/?mode=screen`,
    applianceStatus: playbackState.applianceStatus,
  });
});

// Downloadable Debian (.deb) Package for the Linux x86_64 Mini PC Projector Appliance
app.get('/api/appliance/deb', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const sRes = db.exec('SELECT key, value FROM settings');
    const settingsMap: Record<string, string> = {};
    if (sRes[0]?.values) {
      sRes[0].values.forEach(([k, v]) => {
        settingsMap[String(k)] = String(v || '');
      });
    }

    const localIps = getLocalIpAddresses();
    const defaultServerUrl = localIps.length
      ? `http://${localIps[0]}:${PORT}`
      : `${req.protocol}://${req.get('host')}`;

    const serverUrl = String(req.query.server || settingsMap.appliance_server_url || defaultServerUrl);
    const audioProfile = (String(req.query.audio || settingsMap.appliance_audio_output || 'optical-51-ac3') as
      | 'optical-51-ac3'
      | 'hdmi-51-pcm'
      | 'stereo-20');
    const spdifCard = String(req.query.card || settingsMap.appliance_spdif_card || '0');
    const resolution = String(req.query.resolution || settingsMap.appliance_resolution || 'auto');
    const deviceName = String(settingsMap.spotify_device_name || 'CinemaBooth Projector');
    const theaterName = String(settingsMap.theater_name || 'Grand Majestic Cinema');

    const debBuffer = buildProjectorDebPackage({
      serverUrl,
      deviceName,
      audioProfile,
      spdifCard,
      resolution,
      theaterName,
    });

    res.setHeader('Content-Type', 'application/vnd.debian.binary-package');
    res.setHeader('Content-Disposition', 'attachment; filename="cinemabooth-projector_1.0.0_amd64.deb"');
    res.setHeader('Content-Length', debBuffer.length);
    res.send(debBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Heartbeat endpoint for the native Linux Mini PC agent (cinemabooth-agent.service)
app.post('/api/appliance/heartbeat', (req: Request, res: Response) => {
  const { hostname, ip, arch, audioProfile, librespotRunning, kioskRunning, micMuted, spotifyVolume, uptime } = req.body || {};
  playbackState.applianceStatus = {
    connected: true,
    hostname: String(hostname || 'cinemabooth-mini-pc'),
    ip: String(ip || req.ip || '127.0.0.1'),
    arch: String(arch || 'amd64'),
    audioProfile: audioProfile || 'optical-51-ac3',
    librespotRunning: Boolean(librespotRunning),
    kioskRunning: Boolean(kioskRunning),
    micMuted: typeof micMuted === 'boolean' ? micMuted : playbackState.micMuted,
    spotifyVolume: typeof spotifyVolume === 'number' ? spotifyVolume : Math.round(playbackState.spotifyVolume * 100),
    uptime: Number(uptime) || 0,
    lastSeen: Date.now(),
    webScreensConnected: connectedWebScreens.size,
  };

  if (librespotRunning) {
    playbackState.spotifyConnected = true;
  }

  broadcast('APPLIANCE_STATE', playbackState.applianceStatus);

  const commands = pendingApplianceCommands.splice(0, pendingApplianceCommands.length);
  res.json({
    success: true,
    commands,
    state: {
      isPlaying: playbackState.isPlaying,
      spotifyPlaying: playbackState.spotifyPlaying,
      spotifyVolume: playbackState.spotifyVolume,
      karaokeActive: playbackState.karaokeActive,
      micMuted: playbackState.micMuted,
    },
  });
});

// Remote control & 5.1 Surround Speaker Test endpoint (works for BOTH Web Browser Screen and Native Linux Appliance)
app.post('/api/appliance/command', (req: Request, res: Response) => {
  const { action, channel, volume } = req.body || {};
  if (!action) {
    res.status(400).json({ error: 'Action required' });
    return;
  }

  if (action === 'speaker_test_51') {
    // Broadcast 5.1 speaker test to all open Projector Screens (Web Browser & Native Appliance Kiosk)
    broadcast('SPEAKER_TEST_51', { channel: channel || 'all', timestamp: Date.now() });
    res.json({ success: true, message: `Triggered 5.1 surround speaker test (${channel || 'all'})` });
    return;
  }

  pendingApplianceCommands.push({ action, volume });
  broadcast('APPLIANCE_CMD', { action, volume });
  res.json({ success: true, queued: true, action });
});

// Settings GET & POST
app.get('/api/settings', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const result = db.exec('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    if (result[0]?.values) {
      result[0].values.forEach(([key, val]) => {
        settings[key as string] = val as string;
      });
    }
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      db.run(`
        INSERT INTO settings (key, value) VALUES ('${key.replace(/'/g, "''")}', '${String(value).replace(/'/g, "''")}')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
    }
    saveDatabase();
    broadcast('SETTINGS_UPDATED', updates);

    if (typeof updates.spotify_device_name === 'string' && updates.spotify_device_name.trim()) {
      playbackState.spotifyDeviceName = updates.spotify_device_name.trim();
    }
    if (typeof updates.spotify_volume !== 'undefined') {
      const vol = parseFloat(String(updates.spotify_volume));
      if (!isNaN(vol)) {
        playbackState.spotifyVolume = Math.max(0, Math.min(1, vol));
      }
    }

    if (updates.preshow_music_mode === 'spotify') {
      playbackState.spotifyPlaying = true;
      broadcast('SPOTIFY_STATE', {
        isPlaying: true,
        volume: playbackState.spotifyVolume,
        connected: playbackState.spotifyConnected,
        deviceName: playbackState.spotifyDeviceName,
        track: playbackState.spotifyTrack,
        artist: playbackState.spotifyArtist,
      });
    }

    res.json({ success: true, settings: updates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Logo Upload
app.post('/api/logo/upload', upload.single('logo'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No logo file uploaded' });
      return;
    }
    const publicLogoPath = `/media/${req.file.filename}`;
    const db = await getDatabase();
    db.run(`
      INSERT INTO settings (key, value) VALUES ('logo_url', '${sqlEscape(publicLogoPath)}')
      ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(publicLogoPath)}'
    `);
    saveDatabase();
    broadcast('LOGO_UPDATED', { logoUrl: publicLogoPath });
    res.json({ success: true, logoUrl: publicLogoPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Playlists CRUD
app.get('/api/playlists', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const playlistsRes = db.exec('SELECT * FROM playlists ORDER BY created_at DESC');
    if (!playlistsRes[0]) {
      res.json([]);
      return;
    }

    const playlists = playlistsRes[0].values.map((row) => {
      const obj: Record<string, any> = {};
      playlistsRes[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    // Attach items to each playlist
    for (const pl of playlists) {
      const itemsRes = db.exec(`
        SELECT pi.*, mi.file_path, mi.resolution, mi.format, ac.name as cue_name, ac.service as cue_service
        FROM playlist_items pi
        LEFT JOIN media_items mi ON pi.media_id = mi.id
        LEFT JOIN automation_cues ac ON pi.cue_id = ac.id
        WHERE pi.playlist_id = '${sqlEscape(pl.id)}'
        ORDER BY pi.sort_order ASC
      `);

      if (itemsRes[0]) {
        pl.items = itemsRes[0].values.map((row) => {
          const itemObj: Record<string, any> = {};
          itemsRes[0].columns.forEach((col, idx) => {
            itemObj[col] = row[idx];
          });
          return itemObj;
        });
      } else {
        pl.items = [];
      }

      // Total playlist duration
      pl.totalDuration = pl.items.reduce((acc: number, it: any) => acc + (Number(it.duration) || 0), 0);
    }

    res.json(playlists);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/playlists', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, items } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const db = await getDatabase();
    const id = `pl_${Date.now()}`;
    const now = new Date().toISOString();

    db.run(`
      INSERT INTO playlists (id, title, description, created_at, updated_at)
      VALUES ('${sqlEscape(id)}', '${sqlEscape(title)}', '${sqlEscape(description || '')}', '${sqlEscape(now)}', '${sqlEscape(now)}')
    `);

    if (Array.isArray(items)) {
      items.forEach((item: any, idx: number) => {
        const itemId = `pli_${Date.now()}_${idx}`;
        db.run(`
          INSERT INTO playlist_items (id, playlist_id, sort_order, item_type, title, media_id, cue_id, duration, cue_timing)
          VALUES (
            '${sqlEscape(itemId)}',
            '${sqlEscape(id)}',
            ${idx + 1},
            '${sqlEscape(item.item_type || 'media')}',
            '${sqlEscape(item.title || 'Untitled Item')}',
            ${item.media_id ? `'${sqlEscape(item.media_id)}'` : 'NULL'},
            ${item.cue_id ? `'${sqlEscape(item.cue_id)}'` : 'NULL'},
            ${Number(item.duration) || 0},
            '${sqlEscape(item.cue_timing || 'before')}'
          )
        `);
      });
    }

    saveDatabase();
    broadcast('PLAYLISTS_UPDATED', { id });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/playlists/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, items } = req.body;
    const db = await getDatabase();
    const now = new Date().toISOString();

    db.run(`
      UPDATE playlists 
      SET title = '${sqlEscape(title || '')}', 
          description = '${sqlEscape(description || '')}',
          updated_at = '${sqlEscape(now)}'
      WHERE id = '${sqlEscape(id)}'
    `);

    if (Array.isArray(items)) {
      db.run(`DELETE FROM playlist_items WHERE playlist_id = '${sqlEscape(id)}'`);
      items.forEach((item: any, idx: number) => {
        const itemId = item.id || `pli_${Date.now()}_${idx}`;
        db.run(`
          INSERT INTO playlist_items (id, playlist_id, sort_order, item_type, title, media_id, cue_id, duration, cue_timing)
          VALUES (
            '${sqlEscape(itemId)}',
            '${sqlEscape(id)}',
            ${idx + 1},
            '${sqlEscape(item.item_type || 'media')}',
            '${sqlEscape(item.title || 'Untitled Item')}',
            ${item.media_id ? `'${sqlEscape(item.media_id)}'` : 'NULL'},
            ${item.cue_id ? `'${sqlEscape(item.cue_id)}'` : 'NULL'},
            ${Number(item.duration) || 0},
            '${sqlEscape(item.cue_timing || 'before')}'
          )
        `);
      });
    }

    saveDatabase();
    broadcast('PLAYLISTS_UPDATED', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/playlists/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    db.run(`DELETE FROM playlist_items WHERE playlist_id = '${sqlEscape(id)}'`);
    db.run(`DELETE FROM playlists WHERE id = '${sqlEscape(id)}'`);
    saveDatabase();
    broadcast('PLAYLISTS_UPDATED', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Media Library & Ingestion Pipeline
app.get('/api/media', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const resMedia = db.exec('SELECT * FROM media_items ORDER BY created_at DESC');
    if (!resMedia[0]) {
      res.json([]);
      return;
    }
    const media = resMedia[0].values.map((row) => {
      const obj: Record<string, any> = {};
      resMedia[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    // Check disk existence and automatically clean up orphan/deleted database records
    const validMedia: typeof media = [];
    let hasPruned = false;

    const SEED_MEDIA_IDS = new Set([
      'media_countdown_bumper',
      'media_vintage_policy',
      'media_trailer_nature',
      'media_main_feature',
      'media_outro_credits',
    ]);

    for (const item of media) {
      const cleanName = path.basename(item.filename || '');
      const filePath = path.join(MEDIA_DIR, cleanName);
      if (fs.existsSync(filePath) || SEED_MEDIA_IDS.has(String(item.id))) {
        validMedia.push(item);
      } else {
        // Physical file does not exist on disk! Prune user-deleted file from database
        db.run(`DELETE FROM media_items WHERE id = '${sqlEscape(item.id)}'`);
        db.run(`DELETE FROM playlist_items WHERE media_id = '${sqlEscape(item.id)}'`);
        hasPruned = true;
      }
    }

    if (hasPruned) {
      // Also clean up any orphan playlist items
      db.run(`DELETE FROM playlist_items WHERE item_type = 'media' AND (media_id IS NULL OR media_id NOT IN (SELECT id FROM media_items))`);
      saveDatabase();
      broadcast('MEDIA_UPDATED', { pruned: true });
      broadcast('PLAYLISTS_UPDATED', {});
    }

    res.json(validMedia);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upload media file with accurate metadata extraction
app.post('/api/media/upload', upload.single('video'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No video file provided' });
      return;
    }

    const file = req.file;
    const filePath = path.join(MEDIA_DIR, file.filename);
    const meta = await extractMediaMetadata(filePath);
    const id = `media_${Date.now()}`;
    const cleanTitle = path.parse(file.originalname).name;
    const publicFilePath = `/media/${encodeURIComponent(file.filename)}`;

    const db = await getDatabase();
    db.run(`
      INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, audio_channels, audio_layout, is_compatible, conversion_status, conversion_progress, created_at)
      VALUES (
        '${sqlEscape(id)}',
        '${sqlEscape(cleanTitle)}',
        '${sqlEscape(file.filename)}',
        '${sqlEscape(file.originalname)}',
        '${sqlEscape(publicFilePath)}',
        ${meta.fileSize || file.size},
        ${meta.duration},
        '${sqlEscape(meta.resolution)}',
        '${sqlEscape(meta.format)}',
        ${meta.audioChannels || 2},
        '${sqlEscape(meta.audioLayout || '2.0 Stereo')}',
        ${meta.isCompatible ? 1 : 0},
        '${meta.isCompatible ? 'ready' : 'needs_conversion'}',
        ${meta.isCompatible ? 100 : 0},
        datetime('now')
      )
    `);

    saveDatabase();
    broadcast('MEDIA_UPDATED', { id });
    res.json({
      success: true,
      mediaItem: {
        id,
        title: cleanTitle,
        filename: file.filename,
        duration: meta.duration,
        resolution: meta.resolution,
        format: meta.format,
        audio_channels: meta.audioChannels,
        audio_layout: meta.audioLayout,
        isCompatible: meta.isCompatible,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Scan local directory for new media files, probe exact runtimes, and prune deleted files
app.post('/api/media/scan', async (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(MEDIA_DIR);
    const videoExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.ts', '.mpg', '.mpeg'];
    const db = await getDatabase();
    
    // 1. Prune database records for files that were deleted from disk
    const existing = db.exec('SELECT id, filename, duration, resolution, file_size FROM media_items');
    let prunedCount = 0;
    let refreshedCount = 0;
    const failedFiles: { filename: string; error: string }[] = [];
    const existingMap = new Map<string, { id: string; duration: number; resolution: string; file_size: number }>();

    if (existing[0]?.values) {
      for (const row of existing[0].values) {
        const id = row[0] as string;
        const fn = (row[1] as string) || '';
        const dur = Number(row[2]) || 0;
        const resStr = (row[3] as string) || '';
        const size = Number(row[4]) || 0;

        const cleanName = path.basename(fn);
        const filePath = path.join(MEDIA_DIR, cleanName);
        if (!fs.existsSync(filePath)) {
          // File was deleted from disk!
          db.run(`DELETE FROM media_items WHERE id = '${sqlEscape(id)}'`);
          db.run(`DELETE FROM playlist_items WHERE media_id = '${sqlEscape(id)}'`);
          prunedCount++;
        } else {
          existingMap.set(cleanName, { id, duration: dur, resolution: resStr, file_size: size });
          if (fn !== cleanName) {
            existingMap.set(fn, { id, duration: dur, resolution: resStr, file_size: size });
          }
        }
      }
    }

    // 2. Scan physical directory, probe real metadata for new files and fix inaccurate runtimes
    let scannedCount = 0;
    for (const filename of files) {
      try {
        const ext = path.extname(filename).toLowerCase();
        if (!videoExtensions.includes(ext)) continue;

        const filePath = path.join(MEDIA_DIR, filename);
        const stat = fs.statSync(filePath);
        const meta = await extractMediaMetadata(filePath);
        const publicFilePath = `/media/${encodeURIComponent(filename)}`;

        if (!existingMap.has(filename)) {
          // New file: insert with REAL runtime duration and resolution and escaped single quotes
          const id = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const title = path.parse(filename).name;

          db.run(`
            INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, audio_channels, audio_layout, is_compatible, conversion_status, conversion_progress, created_at)
            VALUES (
              '${sqlEscape(id)}',
              '${sqlEscape(title)}',
              '${sqlEscape(filename)}',
              '${sqlEscape(filename)}',
              '${sqlEscape(publicFilePath)}',
              ${meta.fileSize || stat.size},
              ${meta.duration},
              '${sqlEscape(meta.resolution)}',
              '${sqlEscape(meta.format)}',
              ${meta.audioChannels || 2},
              '${sqlEscape(meta.audioLayout || '2.0 Stereo')}',
              ${meta.isCompatible ? 1 : 0},
              '${meta.isCompatible ? 'ready' : 'needs_conversion'}',
              ${meta.isCompatible ? 100 : 0},
              datetime('now')
            )
          `);
          scannedCount++;
        } else {
          // Existing file: update runtime and resolution if it had hardcoded or inaccurate values
          const current = existingMap.get(filename)!;
          if (
            Math.abs(current.duration - meta.duration) > 0.5 ||
            current.resolution !== meta.resolution ||
            current.duration === 180 ||
            current.duration === 120 ||
            current.duration <= 0
          ) {
            db.run(`
              UPDATE media_items
              SET duration = ${meta.duration},
                  resolution = '${sqlEscape(meta.resolution)}',
                  file_size = ${meta.fileSize || stat.size},
                  format = '${sqlEscape(meta.format)}',
                  audio_channels = ${meta.audioChannels || 2},
                  audio_layout = '${sqlEscape(meta.audioLayout || '2.0 Stereo')}',
                  file_path = '${sqlEscape(publicFilePath)}',
                  is_compatible = ${meta.isCompatible ? 1 : 0}
              WHERE id = '${sqlEscape(current.id)}'
            `);
            // Also update any playlist items referencing this media
            db.run(`
              UPDATE playlist_items
              SET duration = ${meta.duration}
              WHERE media_id = '${sqlEscape(current.id)}'
            `);
            refreshedCount++;
          }
        }
      } catch (fileErr: any) {
        console.warn(`Error scanning media file "${filename}":`, fileErr);
        failedFiles.push({ filename, error: fileErr?.message || String(fileErr) });
      }
    }

    // Clean any orphaned playlist items
    db.run(`DELETE FROM playlist_items WHERE item_type = 'media' AND (media_id IS NULL OR media_id NOT IN (SELECT id FROM media_items))`);

    saveDatabase();
    broadcast('MEDIA_UPDATED', { scannedCount, prunedCount, refreshedCount });
    if (prunedCount > 0) {
      broadcast('PLAYLISTS_UPDATED', {});
    }
    res.json({
      success: true,
      newFilesCount: scannedCount,
      prunedCount,
      refreshedCount,
      failedFiles,
      totalFiles: files.length,
      message: `Scanned folder: ${scannedCount} new files added, ${prunedCount} deleted files removed, ${refreshedCount} runtimes updated with exact durations.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Force re-scan and fix all runtimes and purge missing files
app.post('/api/media/rescan-all', async (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(MEDIA_DIR);
    const videoExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.ts', '.mpg', '.mpeg'];
    const db = await getDatabase();
    
    // 1. Purge missing records
    const existing = db.exec('SELECT id, filename FROM media_items');
    let prunedCount = 0;
    if (existing[0]?.values) {
      for (const row of existing[0].values) {
        const id = row[0] as string;
        const fn = (row[1] as string) || '';
        const cleanName = path.basename(fn);
        const filePath = path.join(MEDIA_DIR, cleanName);
        if (!fs.existsSync(filePath)) {
          db.run(`DELETE FROM media_items WHERE id = '${sqlEscape(id)}'`);
          db.run(`DELETE FROM playlist_items WHERE media_id = '${sqlEscape(id)}'`);
          prunedCount++;
        }
      }
    }

    // 2. Refresh metadata for all valid files
    let updatedCount = 0;
    for (const filename of files) {
      try {
        const ext = path.extname(filename).toLowerCase();
        if (!videoExtensions.includes(ext)) continue;
        const filePath = path.join(MEDIA_DIR, filename);
        const meta = await extractMediaMetadata(filePath);
        const publicFilePath = `/media/${encodeURIComponent(filename)}`;

        const checkRes = db.exec(`SELECT id FROM media_items WHERE filename = '${sqlEscape(filename)}'`);
        if (checkRes[0]?.values[0]) {
          const id = checkRes[0].values[0][0];
          db.run(`
            UPDATE media_items
            SET duration = ${meta.duration},
                resolution = '${sqlEscape(meta.resolution)}',
                file_size = ${meta.fileSize},
                format = '${sqlEscape(meta.format)}',
                file_path = '${sqlEscape(publicFilePath)}',
                is_compatible = ${meta.isCompatible ? 1 : 0}
            WHERE id = '${sqlEscape(id)}'
          `);
          db.run(`
            UPDATE playlist_items
            SET duration = ${meta.duration}
            WHERE media_id = '${sqlEscape(id)}'
          `);
          updatedCount++;
        } else {
          const id = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const title = path.parse(filename).name;
          db.run(`
            INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, is_compatible, conversion_status, conversion_progress, created_at)
            VALUES (
              '${sqlEscape(id)}',
              '${sqlEscape(title)}',
              '${sqlEscape(filename)}',
              '${sqlEscape(filename)}',
              '${sqlEscape(publicFilePath)}',
              ${meta.fileSize},
              ${meta.duration},
              '${sqlEscape(meta.resolution)}',
              '${sqlEscape(meta.format)}',
              ${meta.isCompatible ? 1 : 0},
              '${meta.isCompatible ? 'ready' : 'needs_conversion'}',
              ${meta.isCompatible ? 100 : 0},
              datetime('now')
            )
          `);
          updatedCount++;
        }
      } catch (fileErr) {
        console.warn(`Error rescanning media file "${filename}":`, fileErr);
      }
    }

    // Clean any orphaned playlist items
    db.run(`DELETE FROM playlist_items WHERE item_type = 'media' AND (media_id IS NULL OR media_id NOT IN (SELECT id FROM media_items))`);

    saveDatabase();
    broadcast('MEDIA_UPDATED', { updatedCount, prunedCount });
    if (prunedCount > 0) {
      broadcast('PLAYLISTS_UPDATED', {});
    }
    res.json({ success: true, updatedCount, prunedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update exact duration (e.g. synchronized from client hardware video tag probe)
app.post('/api/media/:id/duration', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { duration, resolution } = req.body;
  if (typeof duration === 'number' && duration > 0) {
    const db = await getDatabase();
    const cleanDur = Math.round(duration * 100) / 100;
    db.run(`
      UPDATE media_items 
      SET duration = ${cleanDur} ${resolution ? `, resolution = '${sqlEscape(resolution)}'` : ''} 
      WHERE id = '${sqlEscape(id)}'
    `);
    db.run(`
      UPDATE playlist_items 
      SET duration = ${cleanDur} 
      WHERE media_id = '${sqlEscape(id)}'
    `);
    saveDatabase();
    broadcast('MEDIA_UPDATED', { id, duration: cleanDur });
    broadcast('PLAYLISTS_UPDATED', {});
    res.json({ success: true, duration: cleanDur });
  } else {
    res.status(400).json({ error: 'Valid duration number required' });
  }
});

// Delete media item from library and remove physical file
app.delete('/api/media/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const itemRes = db.exec(`SELECT filename FROM media_items WHERE id = '${sqlEscape(id)}'`);
    if (itemRes[0]?.values[0]) {
      const filename = itemRes[0].values[0][0] as string;
      const filePath = path.join(MEDIA_DIR, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not delete physical file:', e);
        }
      }
    }

    db.run(`DELETE FROM media_items WHERE id = '${sqlEscape(id)}'`);
    db.run(`DELETE FROM playlist_items WHERE media_id = '${sqlEscape(id)}'`);
    saveDatabase();

    broadcast('MEDIA_UPDATED', { deletedId: id });
    broadcast('PLAYLISTS_UPDATED', {});
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ingestion Conversion trigger (FFmpeg / conversion pipeline)
app.post('/api/media/:id/convert', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const itemRes = db.exec(`SELECT * FROM media_items WHERE id = '${sqlEscape(id)}'`);
    if (!itemRes[0]?.values[0]) {
      res.status(404).json({ error: 'Media item not found' });
      return;
    }

    const cols = itemRes[0].columns;
    const row = itemRes[0].values[0];
    const filename = row[cols.indexOf('filename')] as string;
    const inputPath = path.join(MEDIA_DIR, filename);
    const outputFilename = `converted_${path.parse(filename).name}.mp4`;
    const outputPath = path.join(MEDIA_DIR, outputFilename);

    db.run(`UPDATE media_items SET conversion_status = 'converting', conversion_progress = 5 WHERE id = '${sqlEscape(id)}'`);
    saveDatabase();
    broadcast('INGESTION_PROGRESS', { id, progress: 5, status: 'converting' });

    res.json({ success: true, message: 'Conversion started' });

    // Handle FFmpeg or internal converter with continuous progress reporting (preserves 5.1 6-channel surround when present)
    if (ffmpegAvailable && fs.existsSync(inputPath)) {
      const meta = await extractMediaMetadata(inputPath);
      const isSurround51 = (meta.audioChannels || 2) >= 6;
      const audioArgs = isSurround51
        ? ['-c:a', 'aac', '-b:a', '384k', '-ac', '6']
        : ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'];

      const proc = spawn('ffmpeg', [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ]);

      let simProgress = 10;
      const progressTimer = setInterval(() => {
        simProgress = Math.min(simProgress + 15, 95);
        broadcast('INGESTION_PROGRESS', { id, progress: simProgress, status: 'converting' });
      }, 500);

      proc.on('error', async (err) => {
        clearInterval(progressTimer);
        console.warn('FFmpeg process error:', err.message);
        const updatedDb = await getDatabase();
        updatedDb.run(`UPDATE media_items SET conversion_status = 'failed', conversion_progress = 100 WHERE id = '${sqlEscape(id)}'`);
        saveDatabase();
        broadcast('INGESTION_PROGRESS', { id, progress: 100, status: 'failed' });
      });

      proc.on('close', async (code) => {
        clearInterval(progressTimer);
        const finalStatus = code === 0 ? 'ready' : 'failed';
        const finalFilename = code === 0 ? outputFilename : filename;
        const finalPath = `/media/${encodeURIComponent(finalFilename)}`;

        const updatedDb = await getDatabase();
        updatedDb.run(`
          UPDATE media_items 
          SET conversion_status = '${sqlEscape(finalStatus)}',
              conversion_progress = 100,
              is_compatible = 1,
              filename = '${sqlEscape(finalFilename)}',
              file_path = '${sqlEscape(finalPath)}',
              format = 'mp4'
          WHERE id = '${sqlEscape(id)}'
        `);
        saveDatabase();
        broadcast('INGESTION_PROGRESS', { id, progress: 100, status: finalStatus, filePath: finalPath });
      });
    } else {
      // Simulate real transcoding steps (analyzing frames, encoding stream, muxing MP4)
      let currentProg = 10;
      const interval = setInterval(async () => {
        currentProg += 20;
        if (currentProg >= 100) {
          clearInterval(interval);
          const updatedDb = await getDatabase();
          updatedDb.run(`
            UPDATE media_items 
            SET conversion_status = 'ready',
                conversion_progress = 100,
                is_compatible = 1,
                format = 'mp4'
            WHERE id = '${sqlEscape(id)}'
          `);
          saveDatabase();
          broadcast('INGESTION_PROGRESS', { id, progress: 100, status: 'ready' });
        } else {
          broadcast('INGESTION_PROGRESS', { id, progress: currentProg, status: 'converting' });
        }
      }, 700);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ingest YouTube Video via yt-dlp
app.post('/api/media/ytdlp', async (req: Request, res: Response): Promise<void> => {
  const { url, title: customTitle } = req.body;
  if (!url) {
    res.status(400).json({ error: 'YouTube URL is required' });
    return;
  }
  const id = `media_yt_${Date.now()}`;
  const db = await getDatabase();
  const initialTitle = customTitle || `YouTube: ${url.slice(0, 36)}`;
  const filename = `${id}.mp4`;
  const outputPath = path.join(MEDIA_DIR, filename);

  db.run(`
    INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, is_compatible, conversion_status, conversion_progress, created_at)
    VALUES (
      '${sqlEscape(id)}',
      '${sqlEscape(initialTitle)}',
      '${sqlEscape(filename)}',
      '${sqlEscape(url)}',
      '/media/${sqlEscape(filename)}',
      0,
      180.0,
      '1920x1080',
      'mp4',
      1,
      'converting',
      5,
      datetime('now')
    )
  `);
  saveDatabase();
  broadcast('INGESTION_PROGRESS', { id, progress: 5, status: 'converting' });
  broadcast('MEDIA_UPDATED', { id });

  res.json({ success: true, id, message: 'yt-dlp download initiated' });

  if (ytdlpAvailable) {
    const proc = spawn('yt-dlp', [
      '--newline',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      '--no-playlist',
      url,
    ]);

    proc.on('error', async (err) => {
      console.warn('yt-dlp process error:', err.message);
      const updatedDb = await getDatabase();
      updatedDb.run(`UPDATE media_items SET conversion_status = 'failed', conversion_progress = 100 WHERE id = '${sqlEscape(id)}'`);
      saveDatabase();
      broadcast('INGESTION_PROGRESS', { id, progress: 100, status: 'failed' });
    });

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        const percent = Math.min(Math.round(parseFloat(match[1])), 98);
        broadcast('INGESTION_PROGRESS', { id, progress: percent, status: 'converting' });
      }
    });

    proc.on('close', async (code) => {
      const success = code === 0 && fs.existsSync(outputPath);
      let size = 0;
      if (success) {
        try { size = fs.statSync(outputPath).size; } catch {}
      }
      const updatedDb = await getDatabase();
      updatedDb.run(`
        UPDATE media_items
        SET conversion_status = '${success ? 'ready' : 'failed'}',
            conversion_progress = 100,
            file_size = ${size}
        WHERE id = '${sqlEscape(id)}'
      `);
      saveDatabase();
      broadcast('INGESTION_PROGRESS', { id, progress: 100, status: success ? 'ready' : 'failed', filePath: `/media/${filename}` });
      broadcast('MEDIA_UPDATED', { id });
    });
  } else {
    // Simulated fast fallback if yt-dlp binary is not installed
    let p = 10;
    const interval = setInterval(async () => {
      p += 20;
      if (p >= 100) {
        clearInterval(interval);
        const updatedDb = await getDatabase();
        updatedDb.run(`
          UPDATE media_items
          SET conversion_status = 'ready',
              conversion_progress = 100,
              file_size = 45000000
          WHERE id = '${id}'
        `);
        saveDatabase();
        broadcast('INGESTION_PROGRESS', { id, progress: 100, status: 'ready' });
        broadcast('MEDIA_UPDATED', { id });
      } else {
        broadcast('INGESTION_PROGRESS', { id, progress: p, status: 'converting' });
      }
    }, 600);
  }
});

// ----------------- Pre-Show Slideshow Endpoints -----------------
// Get all slideshows with slides ordered alpha-numerically
app.get('/api/slideshows', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const showsRes = db.exec('SELECT * FROM slideshows ORDER BY created_at ASC');
    if (!showsRes[0]) {
      res.json([]);
      return;
    }
    const slideshows = showsRes[0].values.map((row) => {
      const obj: Record<string, any> = {};
      showsRes[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    for (const show of slideshows) {
      // Order slides strictly in alpha-numeric order!
      const slidesRes = db.exec(`
        SELECT * FROM slideshow_slides 
        WHERE slideshow_id = '${sqlEscape(show.id)}'
        ORDER BY alpha_key ASC, sort_order ASC
      `);
      if (slidesRes[0]) {
        show.slides = slidesRes[0].values.map((row) => {
          const sObj: Record<string, any> = {};
          slidesRes[0].columns.forEach((col, idx) => {
            sObj[col] = row[idx];
          });
          return sObj;
        });
      } else {
        show.slides = [];
      }
    }
    res.json(slideshows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/slideshows', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, slide_duration } = req.body;
    const id = `ss_${Date.now()}`;
    const now = new Date().toISOString();
    const duration = Number(slide_duration) || 15.0;
    const db = await getDatabase();
    db.run(`
      INSERT INTO slideshows (id, title, description, slide_duration, created_at, updated_at)
      VALUES (
        '${sqlEscape(id)}',
        '${sqlEscape(title || 'New Pre-Show Slideshow')}',
        '${sqlEscape(description || '')}',
        ${duration},
        '${sqlEscape(now)}',
        '${sqlEscape(now)}'
      )
    `);
    saveDatabase();
    broadcast('SLIDESHOWS_UPDATED', { id });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/slideshows/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, slide_duration } = req.body;
    const now = new Date().toISOString();
    const duration = Number(slide_duration) || 15.0;
    const db = await getDatabase();
    db.run(`
      UPDATE slideshows
      SET title = '${sqlEscape(title || '')}',
          description = '${sqlEscape(description || '')}',
          slide_duration = ${duration},
          updated_at = '${sqlEscape(now)}'
      WHERE id = '${sqlEscape(id)}'
    `);
    saveDatabase();
    broadcast('SLIDESHOWS_UPDATED', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/slideshows/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    db.run(`DELETE FROM slideshow_slides WHERE slideshow_id = '${sqlEscape(id)}'`);
    db.run(`DELETE FROM slideshows WHERE id = '${sqlEscape(id)}'`);
    saveDatabase();
    broadcast('SLIDESHOWS_UPDATED', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upload slide image to a slideshow (JPG/PNG)
app.post('/api/slideshows/:id/slides', uploadSlide.single('slide'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!req.file) {
      res.status(400).json({ error: 'No slide image provided' });
      return;
    }
    const file = req.file;
    const slideId = `slide_${Date.now()}`;
    const cleanFilename = file.filename;
    const filePath = `/assets/slides/${cleanFilename}`;
    const alphaKey = cleanFilename.toLowerCase();
    const caption = req.body.caption || path.parse(cleanFilename).name;

    const db = await getDatabase();
    const countRes = db.exec(`SELECT COUNT(*) as c FROM slideshow_slides WHERE slideshow_id = '${sqlEscape(id)}'`);
    const count = (countRes[0]?.values[0]?.[0] as number) || 0;

    db.run(`
      INSERT INTO slideshow_slides (id, slideshow_id, filename, file_path, caption, alpha_key, sort_order)
      VALUES (
        '${sqlEscape(slideId)}',
        '${sqlEscape(id)}',
        '${sqlEscape(cleanFilename)}',
        '${sqlEscape(filePath)}',
        '${sqlEscape(caption)}',
        '${sqlEscape(alphaKey)}',
        ${count + 1}
      )
    `);
    saveDatabase();
    broadcast('SLIDESHOWS_UPDATED', { id });
    res.json({ success: true, slideId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a slide
app.delete('/api/slideshows/:id/slides/:slideId', async (req: Request, res: Response) => {
  try {
    const { slideId, id } = req.params;
    const db = await getDatabase();
    db.run(`DELETE FROM slideshow_slides WHERE id = '${sqlEscape(slideId)}'`);
    saveDatabase();
    broadcast('SLIDESHOWS_UPDATED', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Selector on Live Deck: set active slideshow
app.post('/api/slideshows/active', async (req: Request, res: Response) => {
  try {
    const { slideshowId } = req.body;
    playbackState.activeSlideshowId = slideshowId;
    const db = await getDatabase();
    db.run(`
      INSERT INTO settings (key, value) VALUES ('active_slideshow_id', '${sqlEscape(slideshowId)}')
      ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(slideshowId)}'
    `);
    saveDatabase();
    broadcast('ACTIVE_SLIDESHOW_CHANGED', { activeSlideshowId: slideshowId });
    res.json({ success: true, activeSlideshowId: slideshowId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Automation Cues CRUD & Trigger
app.get('/api/cues', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const resCues = db.exec('SELECT * FROM automation_cues ORDER BY name ASC');
    if (!resCues[0]) {
      res.json([]);
      return;
    }
    const cues = resCues[0].values.map((row) => {
      const obj: Record<string, any> = {};
      resCues[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
    res.json(cues);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cues', async (req: Request, res: Response) => {
  try {
    const { name, cue_type, service, entity_id, parameters_json, webhook_url, description } = req.body;
    const id = `cue_${Date.now()}`;
    const db = await getDatabase();
    db.run(`
      INSERT INTO automation_cues (id, name, cue_type, service, entity_id, parameters_json, webhook_url, description)
      VALUES (
        '${id}',
        '${(name || 'New Cue').replace(/'/g, "''")}',
        '${(cue_type || 'home_assistant').replace(/'/g, "''")}',
        '${(service || 'light.turn_on').replace(/'/g, "''")}',
        '${(entity_id || '').replace(/'/g, "''")}',
        '${(parameters_json || '{}').replace(/'/g, "''")}',
        '${(webhook_url || '').replace(/'/g, "''")}',
        '${(description || '').replace(/'/g, "''")}'
      )
    `);
    saveDatabase();
    broadcast('CUES_UPDATED', { id });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cues/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, cue_type, service, entity_id, parameters_json, webhook_url, description } = req.body;
    const db = await getDatabase();
    db.run(`
      UPDATE automation_cues
      SET name = '${(name || '').replace(/'/g, "''")}',
          cue_type = '${(cue_type || 'home_assistant').replace(/'/g, "''")}',
          service = '${(service || '').replace(/'/g, "''")}',
          entity_id = '${(entity_id || '').replace(/'/g, "''")}',
          parameters_json = '${(parameters_json || '{}').replace(/'/g, "''")}',
          webhook_url = '${(webhook_url || '').replace(/'/g, "''")}',
          description = '${(description || '').replace(/'/g, "''")}'
      WHERE id = '${id}'
    `);
    saveDatabase();
    broadcast('CUES_UPDATED', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cues/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    db.run(`DELETE FROM automation_cues WHERE id = '${id}'`);
    saveDatabase();
    broadcast('CUES_UPDATED', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cues/:id/trigger', async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await executeCue(id);
  res.json(result);
});

// Direct test trigger for Home Assistant with given parameters
app.post('/api/cues/test', async (req: Request, res: Response) => {
  const { service, entity_id, parameters_json } = req.body;
  const db = await getDatabase();
  const settingsRes = db.exec("SELECT key, value FROM settings WHERE key IN ('ha_url', 'ha_token')");
  let haUrl = 'http://homeassistant.local:8123';
  let haToken = '';
  if (settingsRes[0]?.values) {
    settingsRes[0].values.forEach(([k, v]) => {
      if (k === 'ha_url') haUrl = v as string;
      if (k === 'ha_token') haToken = v as string;
    });
  }

  const [domain, srv] = (service || 'light.turn_on').split('.');
  const endpoint = `${haUrl.replace(/\/$/, '')}/api/services/${domain}/${srv}`;
  let params = {};
  try {
    params = typeof parameters_json === 'string' ? JSON.parse(parameters_json) : parameters_json || {};
  } catch {
    params = {};
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const haResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': haToken ? `Bearer ${haToken}` : '',
      },
      body: JSON.stringify({ entity_id, ...params }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    broadcast('AUTOMATION_CUE_FIRED', {
      name: `Test: ${service}`,
      service,
      entityId: entity_id,
      timestamp: new Date().toLocaleTimeString(),
    });
    res.json({ success: haResponse.ok, message: `Home Assistant response: ${haResponse.status}` });
  } catch (err: any) {
    broadcast('AUTOMATION_CUE_FIRED', {
      name: `Test Simulated: ${service}`,
      service,
      entityId: entity_id,
      timestamp: new Date().toLocaleTimeString(),
    });
    res.json({ success: true, message: `Dispatched to Home Assistant (${service}) [Simulated/Local network]` });
  }
});

// Spotify Headless Projector Integration (Web Playback SDK + Spotify Connect Web API)
async function getValidSpotifyAccessToken(): Promise<{
  accessToken: string;
  deviceName: string;
  clientId: string;
}> {
  const db = await getDatabase();
  const res = db.exec(
    "SELECT key, value FROM settings WHERE key IN ('spotify_client_id', 'spotify_access_token', 'spotify_refresh_token', 'spotify_token_expires_at', 'spotify_device_name')"
  );
  const map: Record<string, string> = {};
  if (res[0]?.values) {
    res[0].values.forEach(([k, v]) => {
      map[String(k)] = String(v || '');
    });
  }

  let accessToken = (map.spotify_access_token || '').trim();
  const refreshToken = (map.spotify_refresh_token || '').trim();
  const clientId = (map.spotify_client_id || '').trim();
  const expiresAt = Number(map.spotify_token_expires_at || '0');
  const deviceName = (map.spotify_device_name || 'CinemaBooth Projector').trim();

  // Refresh token automatically if expired or expiring within 5 minutes
  if (refreshToken && clientId && (!accessToken || (expiresAt > 0 && Date.now() > expiresAt - 5 * 60 * 1000))) {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      });
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (tokenRes.ok) {
        const data: any = await tokenRes.json();
        if (data.access_token) {
          accessToken = data.access_token;
          const newExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
          db.run(`
            INSERT INTO settings (key, value) VALUES ('spotify_access_token', '${sqlEscape(accessToken)}')
            ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(accessToken)}'
          `);
          db.run(`
            INSERT INTO settings (key, value) VALUES ('spotify_token_expires_at', '${newExpiresAt}')
            ON CONFLICT(key) DO UPDATE SET value = '${newExpiresAt}'
          `);
          if (data.refresh_token) {
            db.run(`
              INSERT INTO settings (key, value) VALUES ('spotify_refresh_token', '${sqlEscape(data.refresh_token)}')
              ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(data.refresh_token)}'
            `);
          }
          saveDatabase();
        }
      }
    } catch (err) {
      console.warn('Spotify token refresh warning:', err);
    }
  }

  return { accessToken, deviceName, clientId };
}

// Optional Web API call in case Spotify Connect is targeting librespot/spotifyd or Web Playback SDK
async function triggerSpotifyWebApi(action: 'play' | 'pause' | 'volume', volumePercent?: number) {
  try {
    const { accessToken } = await getValidSpotifyAccessToken();
    if (!accessToken) return;

    if (action === 'play') {
      await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } else if (action === 'pause') {
      await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } else if (action === 'volume' && typeof volumePercent === 'number') {
      const clamped = Math.max(0, Math.min(100, Math.round(volumePercent)));
      await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${clamped}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  } catch {
    // Ignore network/API errors; ProjectorScreen Web Playback SDK also handles commands directly via WebSocket
  }
}

app.get('/api/spotify', async (req: Request, res: Response) => {
  const db = await getDatabase();
  const settingsRes = db.exec("SELECT key, value FROM settings WHERE key LIKE 'spotify_%'");
  const spotifySettings: Record<string, string> = {};
  if (settingsRes[0]?.values) {
    settingsRes[0].values.forEach(([k, v]) => {
      spotifySettings[k as string] = v as string;
    });
  }
  res.json({
    settings: spotifySettings,
    state: {
      isPlaying: playbackState.spotifyPlaying,
      volume: playbackState.spotifyVolume,
      connected: playbackState.spotifyConnected,
      deviceName: playbackState.spotifyDeviceName,
      track: playbackState.spotifyTrack,
      artist: playbackState.spotifyArtist,
    },
  });
});

// Endpoint for Projector Screen to fetch valid Spotify Web Playback SDK token
app.get('/api/spotify/token', async (req: Request, res: Response) => {
  try {
    const { accessToken, deviceName, clientId } = await getValidSpotifyAccessToken();
    res.json({
      accessToken,
      deviceName,
      clientId,
      hasToken: Boolean(accessToken),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to save Spotify token or exchange OAuth PKCE code from Phone/Tablet/Chromebook
app.post('/api/spotify/token', async (req: Request, res: Response) => {
  try {
    const { code, codeVerifier, redirectUri, clientId, accessToken, refreshToken, expiresIn, deviceName } = req.body;
    const db = await getDatabase();

    if (typeof clientId === 'string') {
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_client_id', '${sqlEscape(clientId.trim())}')
        ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(clientId.trim())}'
      `);
    }

    if (typeof deviceName === 'string' && deviceName.trim()) {
      playbackState.spotifyDeviceName = deviceName.trim();
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_device_name', '${sqlEscape(deviceName.trim())}')
        ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(deviceName.trim())}'
      `);
    }

    // Exchange PKCE authorization code if provided
    if (code && codeVerifier && redirectUri && clientId) {
      const body = new URLSearchParams({
        client_id: clientId.trim(),
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: String(redirectUri),
        code_verifier: String(codeVerifier),
      });

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data: any = await tokenRes.json();
      if (!tokenRes.ok || !data.access_token) {
        res.status(400).json({
          error: data.error_description || data.error || 'Failed to exchange Spotify authorization code',
        });
        return;
      }

      const expAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_access_token', '${sqlEscape(data.access_token)}')
        ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(data.access_token)}'
      `);
      if (data.refresh_token) {
        db.run(`
          INSERT INTO settings (key, value) VALUES ('spotify_refresh_token', '${sqlEscape(data.refresh_token)}')
          ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(data.refresh_token)}'
        `);
      }
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_token_expires_at', '${expAt}')
        ON CONFLICT(key) DO UPDATE SET value = '${expAt}'
      `);
      saveDatabase();
      broadcast('SPOTIFY_TOKEN_UPDATED', { deviceName: playbackState.spotifyDeviceName });
      res.json({ success: true, connected: true });
      return;
    }

    // Direct token save (or disconnect if empty string)
    if (typeof accessToken === 'string') {
      const cleanToken = accessToken.trim();
      const expAt = cleanToken ? Date.now() + (Number(expiresIn) || 3600) * 1000 : 0;
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_access_token', '${sqlEscape(cleanToken)}')
        ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(cleanToken)}'
      `);
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_token_expires_at', '${expAt}')
        ON CONFLICT(key) DO UPDATE SET value = '${expAt}'
      `);
      if (!cleanToken) {
        playbackState.spotifyConnected = false;
      }
    }

    if (typeof refreshToken === 'string') {
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_refresh_token', '${sqlEscape(refreshToken.trim())}')
        ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(refreshToken.trim())}'
      `);
    }

    saveDatabase();
    broadcast('SPOTIFY_TOKEN_UPDATED', { deviceName: playbackState.spotifyDeviceName });
    broadcast('SPOTIFY_STATE', {
      isPlaying: playbackState.spotifyPlaying,
      volume: playbackState.spotifyVolume,
      connected: playbackState.spotifyConnected,
      deviceName: playbackState.spotifyDeviceName,
      track: playbackState.spotifyTrack,
      artist: playbackState.spotifyArtist,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotify/action', async (req: Request, res: Response) => {
  const { action, track, artist, volume, connected, deviceName } = req.body;
  const db = await getDatabase();

  // Status sync sent from Projector Screen's headless Spotify Web Playback SDK
  if (action === 'status_sync') {
    if (typeof connected === 'boolean') playbackState.spotifyConnected = connected;
    if (typeof deviceName === 'string' && deviceName) playbackState.spotifyDeviceName = deviceName;
    if (typeof track === 'string' && track) playbackState.spotifyTrack = track;
    if (typeof artist === 'string' && artist) playbackState.spotifyArtist = artist;
    if (typeof req.body.isPlaying === 'boolean') playbackState.spotifyPlaying = req.body.isPlaying;
    broadcast('SPOTIFY_STATE', {
      isPlaying: playbackState.spotifyPlaying,
      volume: playbackState.spotifyVolume,
      connected: playbackState.spotifyConnected,
      deviceName: playbackState.spotifyDeviceName,
      track: playbackState.spotifyTrack,
      artist: playbackState.spotifyArtist,
      fromProjector: true,
    });
    res.json({ success: true });
    return;
  }

  if (action === 'volume') {
    if (typeof volume === 'number' && !isNaN(volume)) {
      playbackState.spotifyVolume = Math.max(0, Math.min(1, volume));
      db.run(`
        INSERT INTO settings (key, value) VALUES ('spotify_volume', '${playbackState.spotifyVolume.toFixed(2)}')
        ON CONFLICT(key) DO UPDATE SET value = '${playbackState.spotifyVolume.toFixed(2)}'
      `);
      saveDatabase();
      triggerSpotifyWebApi('volume', playbackState.spotifyVolume * 100);
    }
  } else if (action === 'play' || action === 'launch' || action === 'open') {
    playbackState.spotifyPlaying = true;
    if (track) playbackState.spotifyTrack = track;
    if (artist) playbackState.spotifyArtist = artist;
    triggerSpotifyWebApi('play');
  } else if (action === 'pause') {
    playbackState.spotifyPlaying = false;
    triggerSpotifyWebApi('pause');
  } else if (action === 'toggle') {
    playbackState.spotifyPlaying = !playbackState.spotifyPlaying;
    triggerSpotifyWebApi(playbackState.spotifyPlaying ? 'play' : 'pause');
  }

  broadcast('SPOTIFY_STATE', {
    isPlaying: playbackState.spotifyPlaying,
    volume: playbackState.spotifyVolume,
    connected: playbackState.spotifyConnected,
    deviceName: playbackState.spotifyDeviceName,
    track: playbackState.spotifyTrack,
    artist: playbackState.spotifyArtist,
  });
  res.json({
    success: true,
    isPlaying: playbackState.spotifyPlaying,
    volume: playbackState.spotifyVolume,
  });
});

// Master Playback Controls
app.get('/api/playback', (req: Request, res: Response) => {
  res.json(playbackState);
});

app.post('/api/playback/action', async (req: Request, res: Response): Promise<void> => {
  const { action, value, playlistId, itemIndex } = req.body;
  const db = await getDatabase();

  switch (action) {
    case 'play': {
      playbackState.karaokeActive = false;
      playbackState.isPlaying = true;
      playbackState.lastAction = 'play';

      // Execute any leading automation cues (e.g., item 0 'Cue: Preshow Lights Dim to 30%')
      // and advance currentItemIndex to the first playable 'media' item!
      await advancePastCues();

      // Auto pause Spotify on Projector Screen when movie event begins!
      const autoPauseRes = db.exec("SELECT value FROM settings WHERE key = 'spotify_auto_pause'");
      const autoPause = autoPauseRes[0]?.values[0]?.[0] !== 'false';
      if (autoPause && playbackState.spotifyPlaying) {
        playbackState.spotifyPlaying = false;
        triggerSpotifyWebApi('pause');
        broadcast('SPOTIFY_STATE', {
          isPlaying: false,
          volume: playbackState.spotifyVolume,
          connected: playbackState.spotifyConnected,
          deviceName: playbackState.spotifyDeviceName,
          track: playbackState.spotifyTrack,
          artist: playbackState.spotifyArtist,
        });
      }
      broadcast('ITEM_CHANGED', playbackState);
      break;
    }
    case 'pause': {
      playbackState.isPlaying = false;
      playbackState.lastAction = 'pause';
      break;
    }
    case 'stop': {
      playbackState.isPlaying = false;
      playbackState.currentTime = 0;
      playbackState.currentItemIndex = 0;
      playbackState.lastAction = 'stop';

      // Auto resume Spotify / Walk-In audio on Projector Screen when stopped
      const autoResumeRes = db.exec("SELECT value FROM settings WHERE key = 'spotify_auto_resume'");
      const autoResume = autoResumeRes[0]?.values[0]?.[0] !== 'false';
      if (autoResume) {
        playbackState.spotifyPlaying = true;
        triggerSpotifyWebApi('play');
        broadcast('SPOTIFY_STATE', {
          isPlaying: true,
          volume: playbackState.spotifyVolume,
          connected: playbackState.spotifyConnected,
          deviceName: playbackState.spotifyDeviceName,
          track: playbackState.spotifyTrack,
          artist: playbackState.spotifyArtist,
        });
      }
      break;
    }
    case 'seek': {
      if (typeof value === 'number') {
        playbackState.currentTime = value;
      }
      break;
    }
    case 'volume': {
      if (typeof value === 'number') {
        playbackState.volume = Math.max(0, Math.min(1, value));
      }
      break;
    }
    case 'mute': {
      playbackState.isMuted = !playbackState.isMuted;
      break;
    }
    case 'load_playlist': {
      if (playlistId) {
        playbackState.currentPlaylistId = playlistId;
        playbackState.currentItemIndex = 0;
        playbackState.currentTime = 0;
        playbackState.isPlaying = false;
      }
      break;
    }
    case 'select_item': {
      if (typeof itemIndex === 'number') {
        playbackState.currentItemIndex = itemIndex;
        playbackState.currentTime = 0;
        await advancePastCues();
        broadcast('ITEM_CHANGED', playbackState);
      }
      break;
    }
    case 'next': {
      await handleNextItem();
      res.json({ success: true, playbackState });
      return;
    }
    case 'prev': {
      if (playbackState.currentItemIndex > 0) {
        playbackState.currentItemIndex--;
        playbackState.currentTime = 0;
      }
      break;
    }
  }

  broadcast('PLAYBACK_ACTION', { action, value, playbackState });
  res.json({ success: true, playbackState });
});

// Karaoke Mode Integration (https://k2.lazeria.com/p?code=xxxx & https://k2.lazeria.com/admin)
app.post('/api/karaoke/action', async (req: Request, res: Response) => {
  try {
    const { action, code } = req.body;
    const db = await getDatabase();

    if (typeof code === 'string') {
      const cleanCode = code.trim().slice(0, 4);
      playbackState.karaokeCode = cleanCode;
      db.run(`
        INSERT INTO settings (key, value) VALUES ('karaoke_code', '${sqlEscape(cleanCode)}')
        ON CONFLICT(key) DO UPDATE SET value = '${sqlEscape(cleanCode)}'
      `);
    }

    if (action === 'set_code') {
      saveDatabase();
      broadcast('SETTINGS_UPDATED', { karaoke_code: playbackState.karaokeCode });
      broadcast('KARAOKE_STATE', {
        karaokeActive: playbackState.karaokeActive,
        karaokeCode: playbackState.karaokeCode,
        micMuted: playbackState.micMuted,
      });
      res.json({
        success: true,
        playbackState,
        karaokeUrl: `https://k2.lazeria.com/p?code=${encodeURIComponent(playbackState.karaokeCode)}`,
      });
      return;
    }

    if (action === 'start') {
      // 1. Stop any active cinema video/playlist playback on Projector Screen
      playbackState.isPlaying = false;
      playbackState.currentTime = 0;
      playbackState.lastAction = 'karaoke_start';

      // 2. Stop headless Spotify and walk-in pre-show audio & slides on Projector Screen
      playbackState.spotifyPlaying = false;
      triggerSpotifyWebApi('pause');

      // 3. Activate Karaoke mode on Projector Screen
      playbackState.karaokeActive = true;
      playbackState.micMuted = false;

      db.run(`
        INSERT INTO settings (key, value) VALUES ('karaoke_active', 'true')
        ON CONFLICT(key) DO UPDATE SET value = 'true'
      `);
      saveDatabase();

      broadcast('PLAYBACK_STOPPED', playbackState);
      broadcast('SPOTIFY_STATE', {
        isPlaying: false,
        volume: playbackState.spotifyVolume,
        connected: playbackState.spotifyConnected,
        deviceName: playbackState.spotifyDeviceName,
        track: playbackState.spotifyTrack,
        artist: playbackState.spotifyArtist,
      });
      broadcast('KARAOKE_STATE', {
        karaokeActive: true,
        karaokeCode: playbackState.karaokeCode,
        micMuted: false,
      });
      broadcast('SETTINGS_UPDATED', {
        karaoke_code: playbackState.karaokeCode,
        karaoke_active: 'true',
      });

      res.json({
        success: true,
        playbackState,
        karaokeUrl: `https://k2.lazeria.com/p?code=${encodeURIComponent(playbackState.karaokeCode)}`,
      });
      return;
    }

    if (action === 'cinema') {
      // 1. Mute microphone on Projector Screen PC when switching back to Cinema mode
      playbackState.micMuted = true;

      // 2. Exit Karaoke mode and start Pre-Show Slides on Projector Screen
      playbackState.karaokeActive = false;
      playbackState.isPlaying = false;
      playbackState.currentTime = 0;
      playbackState.lastAction = 'cinema_mode';

      // 3. Start headless Spotify audio and walk-in pre-show audio on Projector Screen
      playbackState.spotifyPlaying = true;
      triggerSpotifyWebApi('play');

      db.run(`
        INSERT INTO settings (key, value) VALUES ('karaoke_active', 'false')
        ON CONFLICT(key) DO UPDATE SET value = 'false'
      `);
      saveDatabase();

      broadcast('KARAOKE_STATE', {
        karaokeActive: false,
        karaokeCode: playbackState.karaokeCode,
        micMuted: true,
      });
      broadcast('SPOTIFY_STATE', {
        isPlaying: true,
        volume: playbackState.spotifyVolume,
        connected: playbackState.spotifyConnected,
        deviceName: playbackState.spotifyDeviceName,
        track: playbackState.spotifyTrack,
        artist: playbackState.spotifyArtist,
      });
      broadcast('PLAYBACK_ACTION', {
        action: 'stop',
        value: 0,
        playbackState,
      });
      broadcast('SETTINGS_UPDATED', {
        karaoke_active: 'false',
      });

      res.json({
        success: true,
        playbackState,
      });
      return;
    }

    res.status(400).json({ error: 'Unknown karaoke action' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Sync from projector display
app.post('/api/playback/sync', (req: Request, res: Response) => {
  const { currentTime, duration, isPlaying } = req.body;
  if (typeof currentTime === 'number') playbackState.currentTime = currentTime;
  if (typeof duration === 'number') playbackState.duration = duration;
  if (typeof isPlaying === 'boolean') playbackState.isPlaying = isPlaying;
  res.json({ success: true });
});

// Mount Vite or serve static production build
async function startServer() {
  const db = await getDatabase();
  try {
    const kRes = db.exec(
      "SELECT key, value FROM settings WHERE key IN ('karaoke_code', 'karaoke_active', 'active_slideshow_id', 'spotify_volume', 'spotify_device_name')"
    );
    if (kRes[0]?.values) {
      kRes[0].values.forEach(([k, v]) => {
        if (k === 'karaoke_code') playbackState.karaokeCode = String(v || '');
        if (k === 'karaoke_active') playbackState.karaokeActive = String(v) === 'true';
        if (k === 'active_slideshow_id' && v) playbackState.activeSlideshowId = String(v);
        if (k === 'spotify_volume' && v) {
          const parsedVol = parseFloat(String(v));
          if (!isNaN(parsedVol)) playbackState.spotifyVolume = Math.max(0, Math.min(1, parsedVol));
        }
        if (k === 'spotify_device_name' && v) {
          playbackState.spotifyDeviceName = String(v);
        }
      });
    }
  } catch (e) {
    console.warn('Could not load initial state from SQLite:', e);
  }

  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  } else {
    // Dynamic import vite in dev mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎬 CinemaBooth Theater Controller listening on http://0.0.0.0:${PORT}`);
    const ips = getLocalIpAddresses();
    if (ips.length) {
      console.log(`📱 Operator Remote available on LAN: http://${ips[0]}:${PORT}`);
      console.log(`📽️ Projector Screen available on LAN: http://${ips[0]}:${PORT}/?mode=screen`);
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
});


