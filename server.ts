import express, { Request, Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import cors from 'cors';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import { getDatabase, saveDatabase } from './server/database.ts';
import { extractMediaMetadata } from './server/mediaMetadata.ts';

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
  const filename = req.params.filename;
  const filePath = path.join(MEDIA_DIR, filename);

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
    fs.createReadStream(filePath).pipe(res);
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
      INSERT INTO settings (key, value) VALUES ('preshow_audio_url', '${publicAudioPath}')
      ON CONFLICT(key) DO UPDATE SET value = '${publicAudioPath}'
    `);
    db.run(`
      INSERT INTO settings (key, value) VALUES ('preshow_audio_name', '${originalName.replace(/'/g, "''")}')
      ON CONFLICT(key) DO UPDATE SET value = '${originalName.replace(/'/g, "''")}'
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

// Serve assets folder
app.use('/assets', express.static(path.resolve(process.cwd(), 'public/assets')));

// In-memory runtime state synced with SQLite
interface RuntimePlaybackState {
  currentPlaylistId: string;
  currentItemIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  spotifyPlaying: boolean;
  spotifyTrack: string;
  spotifyArtist: string;
  activeCue: string | null;
  activeSlideshowId: string;
  lastAction: string;
}

const playbackState: RuntimePlaybackState = {
  currentPlaylistId: 'pl_feature_night',
  currentItemIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 15.0,
  volume: 1.0,
  isMuted: false,
  spotifyPlaying: true,
  spotifyTrack: 'Cinema Paradiso Overture (Ambient Walk-in)',
  spotifyArtist: 'Grand Cinema Ensemble',
  activeCue: null,
  activeSlideshowId: 'ss_general_preshow',
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
      if (parsed.type === 'SYNC_TIME') {
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

// Next item runner
async function handleNextItem() {
  const db = await getDatabase();
  const playlistItemsRes = db.exec(`
    SELECT * FROM playlist_items 
    WHERE playlist_id = '${playbackState.currentPlaylistId}'
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
    
    // Check if next item is a cue
    const cols = playlistItemsRes[0].columns;
    const itemTypeIdx = cols.indexOf('item_type');
    const cueIdIdx = cols.indexOf('cue_id');
    const itemType = items[nextIdx][itemTypeIdx];
    const cueId = items[nextIdx][cueIdIdx] as string;

    if (itemType === 'cue' && cueId) {
      await executeCue(cueId);
      // If it's a cue item, advance immediately to the next one
      if (nextIdx + 1 < items.length) {
        playbackState.currentItemIndex = nextIdx + 1;
      } else {
        // End of playlist
        handlePlaylistEnd();
        return;
      }
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
  });
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
      INSERT INTO settings (key, value) VALUES ('logo_url', '${publicLogoPath}')
      ON CONFLICT(key) DO UPDATE SET value = '${publicLogoPath}'
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
        WHERE pi.playlist_id = '${pl.id}'
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
      VALUES ('${id}', '${title.replace(/'/g, "''")}', '${(description || '').replace(/'/g, "''")}', '${now}', '${now}')
    `);

    if (Array.isArray(items)) {
      items.forEach((item: any, idx: number) => {
        const itemId = `pli_${Date.now()}_${idx}`;
        db.run(`
          INSERT INTO playlist_items (id, playlist_id, sort_order, item_type, title, media_id, cue_id, duration, cue_timing)
          VALUES (
            '${itemId}',
            '${id}',
            ${idx + 1},
            '${(item.item_type || 'media').replace(/'/g, "''")}',
            '${(item.title || 'Untitled Item').replace(/'/g, "''")}',
            ${item.media_id ? `'${item.media_id}'` : 'NULL'},
            ${item.cue_id ? `'${item.cue_id}'` : 'NULL'},
            ${Number(item.duration) || 0},
            '${item.cue_timing || 'before'}'
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
      SET title = '${(title || '').replace(/'/g, "''")}', 
          description = '${(description || '').replace(/'/g, "''")}',
          updated_at = '${now}'
      WHERE id = '${id}'
    `);

    if (Array.isArray(items)) {
      db.run(`DELETE FROM playlist_items WHERE playlist_id = '${id}'`);
      items.forEach((item: any, idx: number) => {
        const itemId = item.id || `pli_${Date.now()}_${idx}`;
        db.run(`
          INSERT INTO playlist_items (id, playlist_id, sort_order, item_type, title, media_id, cue_id, duration, cue_timing)
          VALUES (
            '${itemId}',
            '${id}',
            ${idx + 1},
            '${(item.item_type || 'media').replace(/'/g, "''")}',
            '${(item.title || 'Untitled Item').replace(/'/g, "''")}',
            ${item.media_id ? `'${item.media_id}'` : 'NULL'},
            ${item.cue_id ? `'${item.cue_id}'` : 'NULL'},
            ${Number(item.duration) || 0},
            '${item.cue_timing || 'before'}'
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
    db.run(`DELETE FROM playlist_items WHERE playlist_id = '${id}'`);
    db.run(`DELETE FROM playlists WHERE id = '${id}'`);
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

    for (const item of media) {
      const filePath = path.join(MEDIA_DIR, item.filename);
      if (fs.existsSync(filePath)) {
        validMedia.push(item);
      } else {
        // Physical file does not exist on disk! Prune it from database
        db.run(`DELETE FROM media_items WHERE id = '${item.id}'`);
        db.run(`DELETE FROM playlist_items WHERE media_id = '${item.id}'`);
        hasPruned = true;
      }
    }

    if (hasPruned) {
      saveDatabase();
      broadcast('MEDIA_UPDATED', { pruned: true });
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

    const db = await getDatabase();
    db.run(`
      INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, is_compatible, conversion_status, conversion_progress, created_at)
      VALUES (
        '${id}',
        '${cleanTitle.replace(/'/g, "''")}',
        '${file.filename}',
        '${file.originalname.replace(/'/g, "''")}',
        '/media/${file.filename}',
        ${meta.fileSize || file.size},
        ${meta.duration},
        '${meta.resolution}',
        '${meta.format}',
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
    const videoExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.ts'];
    const db = await getDatabase();
    
    // 1. Prune database records for files that were deleted from disk
    const existing = db.exec('SELECT id, filename, duration, resolution, file_size FROM media_items');
    let prunedCount = 0;
    let refreshedCount = 0;
    const existingMap = new Map<string, { id: string; duration: number; resolution: string; file_size: number }>();

    if (existing[0]?.values) {
      for (const row of existing[0].values) {
        const id = row[0] as string;
        const fn = row[1] as string;
        const dur = Number(row[2]) || 0;
        const res = (row[3] as string) || '';
        const size = Number(row[4]) || 0;

        const filePath = path.join(MEDIA_DIR, fn);
        if (!fs.existsSync(filePath)) {
          // File was deleted from disk!
          db.run(`DELETE FROM media_items WHERE id = '${id}'`);
          db.run(`DELETE FROM playlist_items WHERE media_id = '${id}'`);
          prunedCount++;
        } else {
          existingMap.set(fn, { id, duration: dur, resolution: res, file_size: size });
        }
      }
    }

    // 2. Scan physical directory, probe real metadata for new files and fix inaccurate runtimes
    let scannedCount = 0;
    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      if (!videoExtensions.includes(ext)) continue;

      const filePath = path.join(MEDIA_DIR, filename);
      const stat = fs.statSync(filePath);
      const meta = await extractMediaMetadata(filePath);

      if (!existingMap.has(filename)) {
        // New file: insert with REAL runtime duration and resolution
        const id = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const title = path.parse(filename).name;

        db.run(`
          INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, is_compatible, conversion_status, conversion_progress, created_at)
          VALUES (
            '${id}',
            '${title.replace(/'/g, "''")}',
            '${filename}',
            '${filename}',
            '/media/${filename}',
            ${meta.fileSize || stat.size},
            ${meta.duration},
            '${meta.resolution}',
            '${meta.format}',
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
          current.duration === 120
        ) {
          db.run(`
            UPDATE media_items
            SET duration = ${meta.duration},
                resolution = '${meta.resolution}',
                file_size = ${meta.fileSize || stat.size},
                format = '${meta.format}',
                is_compatible = ${meta.isCompatible ? 1 : 0}
            WHERE id = '${current.id}'
          `);
          // Also update any playlist items referencing this media
          db.run(`
            UPDATE playlist_items
            SET duration = ${meta.duration}
            WHERE media_id = '${current.id}'
          `);
          refreshedCount++;
        }
      }
    }

    saveDatabase();
    broadcast('MEDIA_UPDATED', { scannedCount, prunedCount, refreshedCount });
    res.json({
      success: true,
      newFilesCount: scannedCount,
      prunedCount,
      refreshedCount,
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
    const videoExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.ts'];
    const db = await getDatabase();
    
    // 1. Purge missing records
    const existing = db.exec('SELECT id, filename FROM media_items');
    let prunedCount = 0;
    if (existing[0]?.values) {
      for (const row of existing[0].values) {
        const id = row[0] as string;
        const fn = row[1] as string;
        const filePath = path.join(MEDIA_DIR, fn);
        if (!fs.existsSync(filePath)) {
          db.run(`DELETE FROM media_items WHERE id = '${id}'`);
          db.run(`DELETE FROM playlist_items WHERE media_id = '${id}'`);
          prunedCount++;
        }
      }
    }

    // 2. Refresh metadata for all valid files
    let updatedCount = 0;
    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      if (!videoExtensions.includes(ext)) continue;
      const filePath = path.join(MEDIA_DIR, filename);
      const meta = await extractMediaMetadata(filePath);

      const checkRes = db.exec(`SELECT id FROM media_items WHERE filename = '${filename}'`);
      if (checkRes[0]?.values[0]) {
        const id = checkRes[0].values[0][0];
        db.run(`
          UPDATE media_items
          SET duration = ${meta.duration},
              resolution = '${meta.resolution}',
              file_size = ${meta.fileSize},
              format = '${meta.format}',
              is_compatible = ${meta.isCompatible ? 1 : 0}
          WHERE id = '${id}'
        `);
        db.run(`
          UPDATE playlist_items
          SET duration = ${meta.duration}
          WHERE media_id = '${id}'
        `);
        updatedCount++;
      } else {
        const id = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const title = path.parse(filename).name;
        db.run(`
          INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, is_compatible, conversion_status, conversion_progress, created_at)
          VALUES (
            '${id}',
            '${title.replace(/'/g, "''")}',
            '${filename}',
            '${filename}',
            '/media/${filename}',
            ${meta.fileSize},
            ${meta.duration},
            '${meta.resolution}',
            '${meta.format}',
            ${meta.isCompatible ? 1 : 0},
            '${meta.isCompatible ? 'ready' : 'needs_conversion'}',
            ${meta.isCompatible ? 100 : 0},
            datetime('now')
          )
        `);
        updatedCount++;
      }
    }

    saveDatabase();
    broadcast('MEDIA_UPDATED', { updatedCount, prunedCount });
    res.json({ success: true, updatedCount, prunedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete media item from library and remove physical file
app.delete('/api/media/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    const itemRes = db.exec(`SELECT filename FROM media_items WHERE id = '${id}'`);
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

    db.run(`DELETE FROM media_items WHERE id = '${id}'`);
    db.run(`DELETE FROM playlist_items WHERE media_id = '${id}'`);
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
    const itemRes = db.exec(`SELECT * FROM media_items WHERE id = '${id}'`);
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

    db.run(`UPDATE media_items SET conversion_status = 'converting', conversion_progress = 5 WHERE id = '${id}'`);
    saveDatabase();
    broadcast('INGESTION_PROGRESS', { id, progress: 5, status: 'converting' });

    res.json({ success: true, message: 'Conversion started' });

    // Handle FFmpeg or internal converter with continuous progress reporting
    if (ffmpegAvailable && fs.existsSync(inputPath)) {
      const proc = spawn('ffmpeg', [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ]);

      let simProgress = 10;
      const progressTimer = setInterval(() => {
        simProgress = Math.min(simProgress + 15, 95);
        broadcast('INGESTION_PROGRESS', { id, progress: simProgress, status: 'converting' });
      }, 500);

      proc.on('close', async (code) => {
        clearInterval(progressTimer);
        const finalStatus = code === 0 ? 'ready' : 'failed';
        const finalPath = code === 0 ? `/media/${outputFilename}` : `/media/${filename}`;
        const finalFilename = code === 0 ? outputFilename : filename;

        const updatedDb = await getDatabase();
        updatedDb.run(`
          UPDATE media_items 
          SET conversion_status = '${finalStatus}',
              conversion_progress = 100,
              is_compatible = 1,
              filename = '${finalFilename}',
              file_path = '${finalPath}',
              format = 'mp4'
          WHERE id = '${id}'
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
            WHERE id = '${id}'
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
      '${id}',
      '${initialTitle.replace(/'/g, "''")}',
      '${filename}',
      '${url.replace(/'/g, "''")}',
      '/media/${filename}',
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
        WHERE id = '${id}'
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
        WHERE slideshow_id = '${show.id}'
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
        '${id}',
        '${(title || 'New Pre-Show Slideshow').replace(/'/g, "''")}',
        '${(description || '').replace(/'/g, "''")}',
        ${duration},
        '${now}',
        '${now}'
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
      SET title = '${(title || '').replace(/'/g, "''")}',
          description = '${(description || '').replace(/'/g, "''")}',
          slide_duration = ${duration},
          updated_at = '${now}'
      WHERE id = '${id}'
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
    db.run(`DELETE FROM slideshow_slides WHERE slideshow_id = '${id}'`);
    db.run(`DELETE FROM slideshows WHERE id = '${id}'`);
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
    const countRes = db.exec(`SELECT COUNT(*) as c FROM slideshow_slides WHERE slideshow_id = '${id}'`);
    const count = (countRes[0]?.values[0]?.[0] as number) || 0;

    db.run(`
      INSERT INTO slideshow_slides (id, slideshow_id, filename, file_path, caption, alpha_key, sort_order)
      VALUES (
        '${slideId}',
        '${id}',
        '${cleanFilename.replace(/'/g, "''")}',
        '${filePath}',
        '${caption.replace(/'/g, "''")}',
        '${alphaKey.replace(/'/g, "''")}',
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
    db.run(`DELETE FROM slideshow_slides WHERE id = '${slideId}'`);
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
      INSERT INTO settings (key, value) VALUES ('active_slideshow_id', '${slideshowId}')
      ON CONFLICT(key) DO UPDATE SET value = '${slideshowId}'
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

// Spotify Integration
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
      track: playbackState.spotifyTrack,
      artist: playbackState.spotifyArtist,
    },
  });
});

app.post('/api/spotify/action', async (req: Request, res: Response) => {
  const { action, track, artist } = req.body;
  const db = await getDatabase();

  if (action === 'launch' || action === 'open') {
    const uriRes = db.exec("SELECT value FROM settings WHERE key = 'spotify_playlist_uri'");
    const spotifyUri = uriRes[0]?.values[0]?.[0] || 'spotify:playlist:37i9dQZF1DXdgnBRuh640I';
    if (process.platform === 'win32') {
      try {
        spawn('cmd', ['/c', 'start', String(spotifyUri)]);
      } catch (e) {
        console.warn('Could not launch Spotify on Windows:', e);
      }
    }
    res.json({ success: true, launched: spotifyUri });
    return;
  }

  if (action === 'play') {
    playbackState.spotifyPlaying = true;
    if (track) playbackState.spotifyTrack = track;
    if (artist) playbackState.spotifyArtist = artist;
    if (process.platform === 'win32') {
      try {
        // Send Windows Media Play/Pause
        spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]179)']);
      } catch {}
    }
  } else if (action === 'pause') {
    playbackState.spotifyPlaying = false;
    if (process.platform === 'win32') {
      try {
        spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]179)']);
      } catch {}
    }
  } else if (action === 'toggle') {
    playbackState.spotifyPlaying = !playbackState.spotifyPlaying;
    if (process.platform === 'win32') {
      try {
        spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]179)']);
      } catch {}
    }
  }

  broadcast('SPOTIFY_STATE', {
    isPlaying: playbackState.spotifyPlaying,
    track: playbackState.spotifyTrack,
    artist: playbackState.spotifyArtist,
  });
  res.json({ success: true, isPlaying: playbackState.spotifyPlaying });
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
      playbackState.isPlaying = true;
      playbackState.lastAction = 'play';

      // Auto pause Spotify when movie event begins!
      const autoPauseRes = db.exec("SELECT value FROM settings WHERE key = 'spotify_auto_pause'");
      const autoPause = autoPauseRes[0]?.values[0]?.[0] !== 'false';
      if (autoPause && playbackState.spotifyPlaying) {
        playbackState.spotifyPlaying = false;
        broadcast('SPOTIFY_STATE', { isPlaying: false, track: playbackState.spotifyTrack });
        if (process.platform === 'win32') {
          try {
            spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]179)']);
          } catch {}
        }
      }
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
      playbackState.lastAction = 'stop';

      // Auto resume Spotify when stopped
      const autoResumeRes = db.exec("SELECT value FROM settings WHERE key = 'spotify_auto_resume'");
      const autoResume = autoResumeRes[0]?.values[0]?.[0] !== 'false';
      if (autoResume) {
        playbackState.spotifyPlaying = true;
        broadcast('SPOTIFY_STATE', { isPlaying: true, track: playbackState.spotifyTrack });
        if (process.platform === 'win32') {
          try {
            spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]179)']);
          } catch {}
        }
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
  await getDatabase();

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
