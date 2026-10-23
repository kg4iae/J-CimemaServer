import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'theater.db');

let dbInstance: SqlJsDatabase | null = null;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function saveDatabase(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to persist SQLite database to disk:', err);
  }
}

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
      console.log('Loaded existing SQLite database from', DB_PATH);
    } catch (err) {
      console.warn('Could not read existing database, initializing fresh one:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    console.log('Creating fresh SQLite database at', DB_PATH);
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  saveDatabase();
  return dbInstance;
}

function initSchema(db: SqlJsDatabase) {
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      duration REAL NOT NULL,
      resolution TEXT NOT NULL,
      format TEXT NOT NULL,
      is_compatible INTEGER NOT NULL DEFAULT 1,
      conversion_status TEXT NOT NULL DEFAULT 'ready',
      conversion_progress REAL NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automation_cues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cue_type TEXT NOT NULL, -- 'home_assistant' | 'webhook' | 'custom'
      service TEXT,            -- e.g. 'light.turn_on', 'scene.turn_on', 'cover.close_cover'
      entity_id TEXT,          -- e.g. 'light.auditorium_lights'
      parameters_json TEXT,    -- e.g. '{"brightness_pct": 20}'
      webhook_url TEXT,
      webhook_method TEXT DEFAULT 'POST',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      item_type TEXT NOT NULL, -- 'media' | 'cue'
      title TEXT NOT NULL,
      media_id TEXT,
      cue_id TEXT,
      duration REAL NOT NULL DEFAULT 0,
      cue_timing TEXT NOT NULL DEFAULT 'before', -- 'before' | 'after'
      FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playback_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_playlist_id TEXT,
      current_item_index INTEGER DEFAULT 0,
      is_playing INTEGER DEFAULT 0,
      current_time REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      volume REAL DEFAULT 1.0,
      is_muted INTEGER DEFAULT 0,
      spotify_playing INTEGER DEFAULT 1,
      spotify_track TEXT,
      spotify_artist TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS slideshows (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      slide_duration REAL NOT NULL DEFAULT 15.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slideshow_slides (
      id TEXT PRIMARY KEY,
      slideshow_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      caption TEXT,
      alpha_key TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (slideshow_id) REFERENCES slideshows (id) ON DELETE CASCADE
    );
  `);

  // Seed default settings if empty
  const checkSettings = db.exec("SELECT COUNT(*) as count FROM settings");
  const count = checkSettings[0]?.values[0]?.[0] as number || 0;
  if (count === 0) {
    db.run(`
      INSERT INTO settings (key, value) VALUES
      ('theater_name', 'Grand Majestic Cinema'),
      ('logo_url', '/assets/theater_logo.svg'),
      ('logo_title', 'SILVER SCREEN CINEMA'),
      ('ha_url', 'http://homeassistant.local:8123'),
      ('ha_token', ''),
      ('spotify_client_id', ''),
      ('spotify_playlist_uri', 'spotify:playlist:37i9dQZF1DXdgnBRuh640I'),
      ('spotify_auto_pause', 'true'),
      ('spotify_auto_resume', 'true'),
      ('preshow_music_mode', 'ambient'),
      ('active_slideshow_id', 'ss_general_preshow'),
      ('preshow_display_mode', 'slideshow'),
      ('karaoke_code', ''),
      ('karaoke_active', 'false')
    `);
  } else {
    db.run(`
      INSERT OR IGNORE INTO settings (key, value) VALUES
      ('karaoke_code', ''),
      ('karaoke_active', 'false')
    `);
  }

  // Seed default slideshows if empty
  const checkSlideshows = db.exec("SELECT COUNT(*) as count FROM slideshows");
  const slideshowCount = checkSlideshows[0]?.values[0]?.[0] as number || 0;
  if (slideshowCount === 0) {
    const now = new Date().toISOString();
    db.run(`
      INSERT INTO slideshows (id, title, description, slide_duration, created_at, updated_at) VALUES
      ('ss_general_preshow', 'General Feature Pre-Show (Trivia & Promos)', '15-second rotating slides featuring cinema trivia, refreshments, and theater etiquette.', 15.0, '${now}', '${now}'),
      ('ss_retro_night', 'Vintage Cinema & Classic Sponsors', 'Vintage golden era theater slides and retro intermission advertisements.', 15.0, '${now}', '${now}')
    `);

    // Add slides sorted alpha-numerically
    db.run(`
      INSERT INTO slideshow_slides (id, slideshow_id, filename, file_path, caption, alpha_key, sort_order) VALUES
      ('slide_1', 'ss_general_preshow', 'slide_01_welcome.svg', '/assets/slides/slide_01_welcome.svg', 'Welcome to the Majestic Cinema', 'slide_01_welcome.jpg', 1),
      ('slide_2', 'ss_general_preshow', 'slide_02_concessions.svg', '/assets/slides/slide_02_concessions.svg', 'Gourmet Butter Popcorn & Soda at the Lobby', 'slide_02_concessions.jpg', 2),
      ('slide_3', 'ss_general_preshow', 'slide_03_trivia.svg', '/assets/slides/slide_03_trivia.svg', 'Movie Trivia: The Golden Age of Film', 'slide_03_trivia.jpg', 3),
      ('slide_4', 'ss_general_preshow', 'slide_04_silence_phones.svg', '/assets/slides/slide_04_silence_phones.svg', 'Auditorium Courtesy: Silence Mobile Devices', 'slide_04_silence_phones.jpg', 4),
      ('slide_5', 'ss_general_preshow', 'slide_05_coming_soon.svg', '/assets/slides/slide_05_coming_soon.svg', 'Coming Soon to Screen One', 'slide_05_coming_soon.jpg', 5),

      ('slide_r1', 'ss_retro_night', 'slide_01_welcome.svg', '/assets/slides/slide_01_welcome.svg', 'Classic Cinema Showcase Evening', 'slide_01_welcome.jpg', 1),
      ('slide_r2', 'ss_retro_night', 'slide_03_trivia.svg', '/assets/slides/slide_03_trivia.svg', 'Vintage Reel Trivia Contest', 'slide_02_trivia.jpg', 2),
      ('slide_r3', 'ss_retro_night', 'slide_02_concessions.svg', '/assets/slides/slide_02_concessions.svg', 'Old-Fashioned Candy Counter Treats', 'slide_03_concessions.jpg', 3)
    `);
  }

  // Seed default cues if empty
  const checkCues = db.exec("SELECT COUNT(*) as count FROM automation_cues");
  const cueCount = checkCues[0]?.values[0]?.[0] as number || 0;
  if (cueCount === 0) {
    db.run(`
      INSERT INTO automation_cues (id, name, cue_type, service, entity_id, parameters_json, description) VALUES
      ('cue_dim_preshow', 'Preshow Lights - Dim to 30%', 'home_assistant', 'light.turn_on', 'light.auditorium_lights', '{"brightness_pct": 30, "transition": 5}', 'Dims auditorium house lights softly for walk-in audience'),
      ('cue_curtains_open', 'Curtains - Open Proscenium', 'home_assistant', 'cover.open_cover', 'cover.stage_curtains', '{}', 'Opens theater main drapery / masking'),
      ('cue_blackout', 'Feature Start - Blackout Lights', 'home_assistant', 'light.turn_off', 'light.auditorium_lights', '{"transition": 8}', 'Full cinematic blackout when main presentation begins'),
      ('cue_intermission_lights', 'Intermission / Credits - Lights 50%', 'home_assistant', 'light.turn_on', 'light.auditorium_lights', '{"brightness_pct": 50, "transition": 6}', 'Bring up aisle and house lights halfway for credits or intermission'),
      ('cue_house_exit', 'Exit Lights - Full 100%', 'home_assistant', 'light.turn_on', 'light.auditorium_lights', '{"brightness_pct": 100, "transition": 3}', 'Full bright house illumination when event concludes')
    `);
  }

  // Seed default media library if empty
  const checkMedia = db.exec("SELECT COUNT(*) as count FROM media_items");
  const mediaCount = checkMedia[0]?.values[0]?.[0] as number || 0;
  if (mediaCount === 0) {
    db.run(`
      INSERT INTO media_items (id, title, filename, original_name, file_path, file_size, duration, resolution, format, is_compatible, conversion_status, conversion_progress, created_at) VALUES
      ('media_countdown_bumper', 'Classic Cinema Countdown Bumper', 'countdown_bumper.mp4', 'countdown_bumper.mp4', '/media/countdown_bumper.mp4', 15480000, 15.0, '3840x2160', 'mp4', 1, 'ready', 100, datetime('now')),
      ('media_vintage_policy', 'Theater Courtesy & Silence Phones Trailer', 'theater_policy.mp4', 'theater_policy.mp4', '/media/theater_policy.mp4', 28400000, 32.0, '1920x1080', 'mp4', 1, 'ready', 100, datetime('now')),
      ('media_trailer_nature', 'Feature Trailer: Celestial Horizons 4K', 'celestial_trailer.mp4', 'celestial_trailer.mp4', '/media/celestial_trailer.mp4', 85000000, 110.0, '3840x2160', 'mp4', 1, 'ready', 100, datetime('now')),
      ('media_main_feature', 'Main Presentation: The Grand Voyage', 'main_feature.mp4', 'main_feature.mp4', '/media/main_feature.mp4', 420000000, 360.0, '3840x2160', 'mp4', 1, 'ready', 100, datetime('now')),
      ('media_outro_credits', 'Theater Farewell & Next Week Preview', 'outro_preview.mp4', 'outro_preview.mp4', '/media/outro_preview.mp4', 42000000, 45.0, '1920x1080', 'mp4', 1, 'ready', 100, datetime('now'))
    `);
  }

  // Seed default playlists if empty
  const checkPlaylists = db.exec("SELECT COUNT(*) as count FROM playlists");
  const playlistCount = checkPlaylists[0]?.values[0]?.[0] as number || 0;
  if (playlistCount === 0) {
    const now = new Date().toISOString();
    db.run(`
      INSERT INTO playlists (id, title, description, created_at, updated_at) VALUES
      ('pl_feature_night', 'Friday Gala: Main Feature Presentation', 'Full theatrical sequence with pre-show music, house lights fade, bumper, feature, and credits.', '${now}', '${now}'),
      ('pl_matinee', 'Family Weekend Matinee', 'Short preview reels followed by animated feature presentation.', '${now}', '${now}'),
      ('pl_shorts_showcase', 'Independent Shorts Showcase', 'Curated selection of short films with subtle interval lighting.', '${now}', '${now}')
    `);

    // Add items for Friday Gala
    db.run(`
      INSERT INTO playlist_items (id, playlist_id, sort_order, item_type, title, media_id, cue_id, duration, cue_timing) VALUES
      ('pli_1', 'pl_feature_night', 1, 'cue', 'Cue: Preshow Lights Dim to 30%', NULL, 'cue_dim_preshow', 0, 'before'),
      ('pli_2', 'pl_feature_night', 2, 'media', 'Cinema Countdown Bumper', 'media_countdown_bumper', NULL, 15.0, 'before'),
      ('pli_3', 'pl_feature_night', 3, 'cue', 'Cue: Curtains Open Proscenium', NULL, 'cue_curtains_open', 0, 'before'),
      ('pli_4', 'pl_feature_night', 4, 'media', 'Theater Courtesy & Silence Phones', 'media_vintage_policy', NULL, 32.0, 'before'),
      ('pli_5', 'pl_feature_night', 5, 'media', 'Coming Attractions: Celestial Horizons 4K', 'media_trailer_nature', NULL, 110.0, 'before'),
      ('pli_6', 'pl_feature_night', 6, 'cue', 'Cue: Feature Start - Auditorium Blackout', NULL, 'cue_blackout', 0, 'before'),
      ('pli_7', 'pl_feature_night', 7, 'media', 'Main Presentation: The Grand Voyage', 'media_main_feature', NULL, 360.0, 'before'),
      ('pli_8', 'pl_feature_night', 8, 'cue', 'Cue: Intermission / Credits Lights 50%', NULL, 'cue_intermission_lights', 0, 'before'),
      ('pli_9', 'pl_feature_night', 9, 'media', 'Theater Farewell & Next Week Preview', 'media_outro_credits', NULL, 45.0, 'before'),
      ('pli_10', 'pl_feature_night', 10, 'cue', 'Cue: Exit Lights Full 100%', NULL, 'cue_house_exit', 0, 'after')
    `);

    // Add items for Matinee
    db.run(`
      INSERT INTO playlist_items (id, playlist_id, sort_order, item_type, title, media_id, cue_id, duration, cue_timing) VALUES
      ('pli_m1', 'pl_matinee', 1, 'cue', 'Cue: Preshow Lights Dim to 30%', NULL, 'cue_dim_preshow', 0, 'before'),
      ('pli_m2', 'pl_matinee', 2, 'media', 'Cinema Countdown Bumper', 'media_countdown_bumper', NULL, 15.0, 'before'),
      ('pli_m3', 'pl_matinee', 3, 'cue', 'Cue: Feature Start - Auditorium Blackout', NULL, 'cue_blackout', 0, 'before'),
      ('pli_m4', 'pl_matinee', 4, 'media', 'Main Presentation: The Grand Voyage', 'media_main_feature', NULL, 360.0, 'before'),
      ('pli_m5', 'pl_matinee', 5, 'cue', 'Cue: Exit Lights Full 100%', NULL, 'cue_house_exit', 0, 'after')
    `);
  }

  // Seed playback state if empty
  const checkState = db.exec("SELECT COUNT(*) as count FROM playback_state");
  const stateCount = checkState[0]?.values[0]?.[0] as number || 0;
  if (stateCount === 0) {
    db.run(`
      INSERT INTO playback_state (id, current_playlist_id, current_item_index, is_playing, current_time, duration, volume, is_muted, spotify_playing, spotify_track, spotify_artist, updated_at)
      VALUES (1, 'pl_feature_night', 0, 0, 0, 15.0, 1.0, 0, 1, 'Cinema Paradiso Love Theme (Ambient Overture)', 'Ennio Morricone Orchestra', datetime('now'))
    `);
  }
}
