import { PlaybackState, Playlist, MediaItem, AutomationCue, TheaterSettings, SystemStatus } from '../types/theater';

const API_BASE = '/api';

export async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/status`);
  return res.json();
}

export async function fetchSettings(): Promise<TheaterSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  return res.json();
}

export async function saveSettings(settings: Partial<TheaterSettings>): Promise<void> {
  await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function uploadLogo(file: File): Promise<{ success: boolean; logoUrl: string }> {
  const formData = new FormData();
  formData.append('logo', file);
  const res = await fetch(`${API_BASE}/logo/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function fetchPlaylists(): Promise<Playlist[]> {
  const res = await fetch(`${API_BASE}/playlists`);
  return res.json();
}

export async function savePlaylist(playlist: Partial<Playlist>): Promise<{ id: string }> {
  if (playlist.id && !playlist.id.startsWith('new_')) {
    const res = await fetch(`${API_BASE}/playlists/${playlist.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlist),
    });
    return res.json();
  } else {
    const res = await fetch(`${API_BASE}/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlist),
    });
    return res.json();
  }
}

export async function deletePlaylist(id: string): Promise<void> {
  await fetch(`${API_BASE}/playlists/${id}`, { method: 'DELETE' });
}

export async function fetchMedia(): Promise<MediaItem[]> {
  const res = await fetch(`${API_BASE}/media`);
  return res.json();
}

export async function uploadMedia(file: File): Promise<{ success: boolean; mediaItem: any }> {
  const formData = new FormData();
  formData.append('video', file);
  const res = await fetch(`${API_BASE}/media/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function scanLocalMedia(): Promise<{ success: boolean; newFilesCount: number }> {
  const res = await fetch(`${API_BASE}/media/scan`, { method: 'POST' });
  return res.json();
}

export async function triggerConversion(mediaId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/media/${mediaId}/convert`, { method: 'POST' });
  return res.json();
}

export async function fetchCues(): Promise<AutomationCue[]> {
  const res = await fetch(`${API_BASE}/cues`);
  return res.json();
}

export async function saveCue(cue: Partial<AutomationCue>): Promise<{ id: string }> {
  if (cue.id && !cue.id.startsWith('new_')) {
    const res = await fetch(`${API_BASE}/cues/${cue.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cue),
    });
    return res.json();
  } else {
    const res = await fetch(`${API_BASE}/cues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cue),
    });
    return res.json();
  }
}

export async function deleteCue(id: string): Promise<void> {
  await fetch(`${API_BASE}/cues/${id}`, { method: 'DELETE' });
}

export async function triggerCue(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/cues/${id}/trigger`, { method: 'POST' });
  return res.json();
}

export async function testCuePayload(payload: { service: string; entity_id: string; parameters_json: string }): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/cues/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchSpotifyState(): Promise<any> {
  const res = await fetch(`${API_BASE}/spotify`);
  return res.json();
}

export async function controlSpotify(action: 'play' | 'pause' | 'toggle', track?: string, artist?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/spotify/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, track, artist }),
  });
  return res.json();
}

export async function fetchPlaybackState(): Promise<PlaybackState> {
  const res = await fetch(`${API_BASE}/playback`);
  return res.json();
}

export async function controlPlayback(action: string, value?: any, extra?: { playlistId?: string; itemIndex?: number }): Promise<PlaybackState> {
  const res = await fetch(`${API_BASE}/playback/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, value, ...extra }),
  });
  const data = await res.json();
  return data.playbackState;
}

export async function syncPlaybackProgress(currentTime: number, duration: number, isPlaying: boolean): Promise<void> {
  await fetch(`${API_BASE}/playback/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentTime, duration, isPlaying }),
  });
}

// Ingest YouTube content using yt-dlp
export async function ingestYouTubeVideo(url: string, title?: string): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/media/ytdlp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title }),
  });
  return res.json();
}

// Pre-show Slideshows API
export async function fetchSlideshows(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/slideshows`);
  return res.json();
}

export async function saveSlideshow(slideshow: any): Promise<{ id: string }> {
  if (slideshow.id && !slideshow.id.startsWith('new_')) {
    const res = await fetch(`${API_BASE}/slideshows/${slideshow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slideshow),
    });
    return res.json();
  } else {
    const res = await fetch(`${API_BASE}/slideshows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slideshow),
    });
    return res.json();
  }
}

export async function deleteSlideshow(id: string): Promise<void> {
  await fetch(`${API_BASE}/slideshows/${id}`, { method: 'DELETE' });
}

export async function uploadSlide(slideshowId: string, file: File, caption?: string): Promise<{ success: boolean; slideId: string }> {
  const formData = new FormData();
  formData.append('slide', file);
  if (caption) formData.append('caption', caption);
  const res = await fetch(`${API_BASE}/slideshows/${slideshowId}/slides`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function deleteSlide(slideshowId: string, slideId: string): Promise<void> {
  await fetch(`${API_BASE}/slideshows/${slideshowId}/slides/${slideId}`, { method: 'DELETE' });
}

export async function setActiveSlideshow(slideshowId: string): Promise<void> {
  await fetch(`${API_BASE}/slideshows/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slideshowId }),
  });
}

export async function uploadPreshowAudio(file: File): Promise<{ success: boolean; audioUrl: string; name: string }> {
  const formData = new FormData();
  formData.append('audio', file);
  const res = await fetch(`${API_BASE}/preshow/audio/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}
