export type ItemType = 'media' | 'cue';

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  sort_order: number;
  item_type: ItemType;
  title: string;
  media_id: string | null;
  cue_id: string | null;
  duration: number; // in seconds
  cue_timing: 'before' | 'after';
  // Joined fields
  file_path?: string;
  resolution?: string;
  format?: string;
  cue_name?: string;
  cue_service?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  items: PlaylistItem[];
  totalDuration?: number;
}

export interface MediaItem {
  id: string;
  title: string;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  duration: number;
  resolution: string;
  format: string;
  is_compatible: number;
  conversion_status: 'ready' | 'needs_conversion' | 'converting' | 'failed';
  conversion_progress: number;
  created_at: string;
}

export interface AutomationCue {
  id: string;
  name: string;
  cue_type: 'home_assistant' | 'webhook' | 'custom';
  service?: string;
  entity_id?: string;
  parameters_json?: string;
  webhook_url?: string;
  webhook_method?: string;
  description?: string;
}

export interface SlideshowSlide {
  id: string;
  slideshow_id: string;
  filename: string;
  file_path: string;
  caption: string;
  alpha_key: string;
  sort_order: number;
}

export interface Slideshow {
  id: string;
  title: string;
  description: string;
  slide_duration: number; // in seconds (default: 15)
  created_at: string;
  updated_at: string;
  slides: SlideshowSlide[];
}

export interface SystemStatus {
  status: string;
  platform: string;
  ffmpegInstalled: boolean;
  ytdlpInstalled: boolean;
  localIps: string[];
  port: number;
  mediaDir: string;
  remoteUrl: string;
  projectorUrl: string;
}

export interface PlaybackState {
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
  activeSlideshowId?: string;
  lastAction?: string;
}

export interface TheaterSettings {
  theater_name?: string;
  logo_url?: string;
  logo_title?: string;
  ha_url?: string;
  ha_token?: string;
  spotify_client_id?: string;
  spotify_playlist_uri?: string;
  spotify_auto_pause?: string;
  spotify_auto_resume?: string;
  preshow_music_mode?: string;
  active_slideshow_id?: string;
  preshow_display_mode?: 'slideshow' | 'logo';
  [key: string]: string | undefined;
}
