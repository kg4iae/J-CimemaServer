import React, { useState, useRef, useEffect } from 'react';
import {
  Music,
  Play,
  Pause,
  Settings2,
  Check,
  Radio,
  Volume2,
  Sparkles,
  Upload,
  FileAudio,
  VolumeX,
  Info,
  ExternalLink,
  Disc,
  Sliders,
  Volume1,
  RotateCcw,
} from 'lucide-react';
import { TheaterSettings } from '../types/theater';
import { controlSpotify, saveSettings, uploadPreshowAudio } from '../services/api';
import { preshowAudio, WALK_IN_TRACKS } from '../services/preshowAudio';
import { getSpotifyEmbedUrl, getSpotifyWebUrl } from '../utils/spotify';

interface SpotifyTabProps {
  settings: TheaterSettings;
  spotifyPlaying: boolean;
  spotifyTrack: string;
  spotifyArtist: string;
  onRefreshSettings: () => void;
}

// Popular theater pre-show playlist presets
const SPOTIFY_PRESETS = [
  {
    name: 'Classic Movie Soundtracks',
    uri: 'spotify:playlist:37i9dQZF1DXdgnBRuh640I',
    desc: 'Iconic cinema themes & Hollywood overtures',
  },
  {
    name: 'Epic Film Scores (John Williams, Zimmer, etc.)',
    uri: 'spotify:playlist:37i9dQZF1DWZtZ8vBhWstJ',
    desc: 'Grand orchestral cinematic masterpieces',
  },
  {
    name: 'Vintage Cinema Intermission & Swing',
    uri: 'spotify:playlist:37i9dQZF1DXaImRpG7HXqp',
    desc: 'Nostalgic 1950s/60s intermission melodies',
  },
  {
    name: 'Modern Cinema Chill & Lounge',
    uri: 'spotify:playlist:37i9dQZF1DX4WYpdgoIcn6',
    desc: 'Relaxing ambient vibes for auditorium walk-in',
  },
];

export default function SpotifyTab({
  settings,
  spotifyPlaying,
  spotifyTrack,
  spotifyArtist,
  onRefreshSettings,
}: SpotifyTabProps) {
  const [clientId, setClientId] = useState(settings.spotify_client_id || '');
  const [playlistUri, setPlaylistUri] = useState(
    settings.spotify_playlist_uri || 'spotify:playlist:37i9dQZF1DXdgnBRuh640I'
  );
  const [autoPause, setAutoPause] = useState(settings.spotify_auto_pause !== 'false');
  const [autoResume, setAutoResume] = useState(settings.spotify_auto_resume !== 'false');
  const [preshowMode, setPreshowMode] = useState(settings.preshow_music_mode || 'retro');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Sync state when settings change from outside
  useEffect(() => {
    if (settings.preshow_music_mode) {
      setPreshowMode(settings.preshow_music_mode);
    }
  }, [settings.preshow_music_mode]);

  // Custom audio file upload state
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Local audio preview state on remote
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  // Helper to resolve title & artist based on mode
  const getModeDisplayInfo = (mode: string) => {
    switch (mode) {
      case 'spotify':
        return {
          title: 'Spotify Pre-Show Playlist',
          artist: 'Spotify Connect / Web Player',
          tag: 'Spotify Integration',
        };
      case 'retro':
      case 'ambient':
        return {
          title: WALK_IN_TRACKS.retro.title,
          artist: WALK_IN_TRACKS.retro.artist,
          tag: 'Retro Intermission Track',
        };
      case 'overture':
        return {
          title: WALK_IN_TRACKS.overture.title,
          artist: WALK_IN_TRACKS.overture.artist,
          tag: 'Hollywood Orchestral Track',
        };
      case 'jazz':
        return {
          title: WALK_IN_TRACKS.jazz.title,
          artist: WALK_IN_TRACKS.jazz.artist,
          tag: 'Cinema Jazz Lounge Track',
        };
      case 'custom_audio':
        return {
          title: settings.preshow_audio_name || 'Custom Uploaded Audio',
          artist: 'Local Media File',
          tag: 'Custom Upload',
        };
      case 'none':
      case 'silent':
        return {
          title: 'Walk-In Audio Disabled (Silent)',
          artist: 'No Pre-Show Audio',
          tag: 'Mute',
        };
      default:
        return {
          title: WALK_IN_TRACKS.retro.title,
          artist: WALK_IN_TRACKS.retro.artist,
          tag: 'Pre-Show Walk-In',
        };
    }
  };

  const handleSelectMode = async (mode: string) => {
    setPreshowMode(mode);
    setSaving(true);
    try {
      if (mode === 'spotify') {
        preshowAudio.stop();
      }
      const info = getModeDisplayInfo(mode);
      await saveSettings({
        spotify_client_id: clientId,
        spotify_playlist_uri: playlistUri,
        spotify_auto_pause: autoPause ? 'true' : 'false',
        spotify_auto_resume: autoResume ? 'true' : 'false',
        preshow_music_mode: mode,
      });

      if (mode === 'spotify') {
        const cleanUri = playlistUri.startsWith('spotify:') ? playlistUri : `spotify:playlist:${playlistUri}`;
        await controlSpotify('launch', info.title, info.artist, cleanUri);
        try {
          window.location.href = cleanUri;
        } catch {}
        setSavedMessage('Spotify Integration Active: Opening and playing playlist in Spotify');
      } else {
        await controlSpotify(spotifyPlaying ? 'play' : 'pause', info.title, info.artist);
        preshowAudio.syncState({
          isPlaylistPlaying: false,
          spotifyPlaying,
          volume: 1.0,
          isMuted: false,
          preshowMusicMode: mode,
          customAudioUrl: settings.preshow_audio_url,
        });
        setSavedMessage(`Walk-in music switched to: ${info.title}`);
      }

      setTimeout(() => setSavedMessage(null), 5000);
      onRefreshSettings();
    } catch (e: any) {
      alert(`Error saving audio mode: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpotifyConfig = async () => {
    setSaving(true);
    try {
      await saveSettings({
        spotify_client_id: clientId,
        spotify_playlist_uri: playlistUri,
        spotify_auto_pause: autoPause ? 'true' : 'false',
        spotify_auto_resume: autoResume ? 'true' : 'false',
        preshow_music_mode: preshowMode,
      });
      setSavedMessage('Spotify and walk-in audio settings saved.');
      setTimeout(() => setSavedMessage(null), 4000);
      onRefreshSettings();
    } catch (e: any) {
      alert(`Error saving settings: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSpotify = async () => {
    const nextAction = spotifyPlaying ? 'pause' : 'play';
    const info = getModeDisplayInfo(preshowMode);
    if (preshowMode === 'spotify') {
      preshowAudio.stop();
      const cleanUri = playlistUri.startsWith('spotify:') ? playlistUri : `spotify:playlist:${playlistUri}`;
      if (nextAction === 'play') {
        await controlSpotify('launch', info.title, info.artist, cleanUri);
        try {
          window.location.href = cleanUri;
        } catch {}
      } else {
        await controlSpotify('pause', info.title, info.artist);
      }
    } else {
      await controlSpotify(nextAction, info.title, info.artist);
    }
  };

  const handleLaunchSpotify = async () => {
    try {
      preshowAudio.stop();
      const cleanUri = playlistUri.startsWith('spotify:') ? playlistUri : `spotify:playlist:${playlistUri}`;
      await controlSpotify('launch', 'Spotify Walk-In Playlist', 'Spotify App', cleanUri);
      try {
        window.location.href = cleanUri;
      } catch {}
      setSavedMessage('Spotify Opened: Playing playlist in Spotify desktop app.');
      setTimeout(() => setSavedMessage(null), 5000);
      onRefreshSettings();
    } catch (err: any) {
      console.warn('Launch Spotify error:', err);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAudio(true);
    try {
      const res = await uploadPreshowAudio(file);
      if (res.success) {
        setPreshowMode('custom_audio');
        await controlSpotify('play', res.name, 'Local Audio File');
        setSavedMessage(`Uploaded & Activated: ${res.name}`);
        setTimeout(() => setSavedMessage(null), 4000);
        onRefreshSettings();
      }
    } catch (err: any) {
      alert(`Audio upload failed: ${err.message}`);
    } finally {
      setUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  // Toggle speaker test preview on this remote device
  const handleTogglePreview = () => {
    if (isPreviewPlaying) {
      preshowAudio.stop();
      setIsPreviewPlaying(false);
    } else {
      preshowAudio.unlockAudio().then(() => {
        preshowAudio.syncState({
          isPlaylistPlaying: false,
          spotifyPlaying: true,
          volume: 1.0,
          isMuted: false,
          preshowMusicMode: preshowMode,
          customAudioUrl: settings.preshow_audio_url,
        });
        setIsPreviewPlaying(true);
      });
    }
  };

  const activeInfo = getModeDisplayInfo(preshowMode);

  return (
    <div className="space-y-6">
      {/* 1. WALK-IN LIVE AUDIO STATUS HERO CARD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-emerald-500/10 via-cyan-500/5 to-transparent pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                spotifyPlaying && preshowMode !== 'none'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-500/30'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              <Music className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-extrabold text-emerald-700 flex items-center gap-2">
                <Radio
                  className={`w-3.5 h-3.5 ${
                    spotifyPlaying && preshowMode !== 'none' ? 'animate-pulse text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <span>
                  {spotifyPlaying && preshowMode !== 'none'
                    ? 'Walk-In Music Streaming to Theater'
                    : 'Walk-In Music Standby (Paused)'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 border border-slate-200">
                  {activeInfo.tag}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                {activeInfo.title}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {activeInfo.artist} · Pre-Show Auditorium Atmosphere
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Visual audio equalizer bars when active */}
            {spotifyPlaying && preshowMode !== 'none' && (
              <div className="hidden sm:flex items-end gap-1 h-6 px-2">
                <span className="w-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.1s] h-4"></span>
                <span className="w-1 bg-emerald-600 rounded-full animate-bounce [animation-delay:0.3s] h-6"></span>
                <span className="w-1 bg-teal-500 rounded-full animate-bounce [animation-delay:0.2s] h-3"></span>
                <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s] h-5"></span>
              </div>
            )}

            {/* Test Audio Output */}
            {preshowMode !== 'spotify' && preshowMode !== 'none' && (
              <button
                onClick={handleTogglePreview}
                title="Test audio output on this device"
                className={`min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all active:scale-95 cursor-pointer ${
                  isPreviewPlaying
                    ? 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20 shadow-sm'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {isPreviewPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
                <span>{isPreviewPlaying ? 'Stop Speaker Test' : 'Test Audio'}</span>
              </button>
            )}

            {/* Primary Toggle Walk-in Music */}
            <button
              onClick={handleToggleSpotify}
              className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer ${
                spotifyPlaying
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20'
              }`}
            >
              {spotifyPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause Walk-In Music</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Walk-In Music</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Windows Audio Output Advice */}
        <div className="mt-5 p-4 bg-blue-50/80 rounded-xl border border-blue-200 text-xs text-blue-950 flex items-start gap-3 shadow-2xs">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-extrabold text-blue-900">Audio Output Architecture:</strong>
            <p className="mt-0.5 text-blue-800">
              Walk-in music streams continuously through your <strong>Projector Screen window</strong> (which routes HDMI surround sound to your AV Receiver or projector). When presentation videos begin, walk-in music automatically fades out so dialog is never interrupted.
            </p>
          </div>
        </div>
      </div>

      {/* 2. CHOOSE WALK-IN MUSIC SOURCE (Cards) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">Select Walk-In Music Source</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono font-medium">Theater Sound System</span>
        </div>

        {/* Sources Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1: SPOTIFY INTEGRATION */}
          <button
            type="button"
            onClick={() => handleSelectMode('spotify')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer relative overflow-hidden group ${
              preshowMode === 'spotify'
                ? 'bg-emerald-50/90 border-emerald-500 text-emerald-950 shadow-md ring-2 ring-emerald-500/30'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Music className="w-4 h-4" />
                </div>
                <span>Spotify Integration</span>
              </div>
              {preshowMode === 'spotify' && (
                <span className="px-2 py-0.5 bg-emerald-600 text-white font-bold rounded-full text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 font-medium leading-relaxed">
              Opens and plays your playlist directly via your installed Spotify desktop app on this host machine, with auto-pause during movies.
            </p>
          </button>

          {/* 2: CUSTOM AUDIO UPLOAD */}
          <button
            type="button"
            onClick={() => handleSelectMode('custom_audio')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer relative overflow-hidden group ${
              preshowMode === 'custom_audio'
                ? 'bg-teal-50/90 border-teal-500 text-teal-950 shadow-md ring-2 ring-teal-500/30'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center">
                  <FileAudio className="w-4 h-4" />
                </div>
                <span>Custom Audio (MP3 / WAV)</span>
              </div>
              {preshowMode === 'custom_audio' && (
                <span className="px-2 py-0.5 bg-teal-600 text-white font-bold rounded-full text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 font-medium leading-relaxed">
              Upload your own preferred theater walk-in playlist, cinema jingle, or high-fidelity audio track.
            </p>
          </button>

          {/* 3: RETRO THEATER INTERMISSION */}
          <button
            type="button"
            onClick={() => handleSelectMode('retro')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer relative overflow-hidden group ${
              preshowMode === 'retro' || preshowMode === 'ambient'
                ? 'bg-blue-50/90 border-blue-500 text-blue-950 shadow-md ring-2 ring-blue-500/30'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Disc className="w-4 h-4" />
                </div>
                <span>Retro Intermission</span>
              </div>
              {(preshowMode === 'retro' || preshowMode === 'ambient') && (
                <span className="px-2 py-0.5 bg-blue-600 text-white font-bold rounded-full text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 font-medium leading-relaxed">
              Vintage theater intermission chime melody with gentle vibraphone notes.
            </p>
          </button>

          {/* 4: SILENT / MUTE */}
          <button
            type="button"
            onClick={() => handleSelectMode('none')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer relative overflow-hidden group ${
              preshowMode === 'none' || preshowMode === 'silent'
                ? 'bg-slate-200/90 border-slate-400 text-slate-900 shadow-md ring-2 ring-slate-400/30'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-600 text-white flex items-center justify-center">
                  <VolumeX className="w-4 h-4" />
                </div>
                <span>No Walk-In Audio (Silent)</span>
              </div>
              {(preshowMode === 'none' || preshowMode === 'silent') && (
                <span className="px-2 py-0.5 bg-slate-700 text-white font-bold rounded-full text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 font-medium leading-relaxed">
              Disable all background walk-in music during slide presentations. Screen stays silent until movies play.
            </p>
          </button>
        </div>

        {/* 3. SPOTIFY LIVE CONTROLLER & LAUNCHER (Shown when Spotify is selected) */}
        {preshowMode === 'spotify' && (
          <div className="p-5 sm:p-6 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl border border-slate-800 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black shadow-md shadow-emerald-500/20">
                  <Music className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white">Spotify Desktop App Integration</h4>
                  <p className="text-[11px] text-slate-400">Host PC Application & Surround Sound Output</p>
                </div>
              </div>

              {/* Primary Action Button: Open & Play in Spotify App */}
              <button
                type="button"
                onClick={handleLaunchSpotify}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all cursor-pointer"
                title="Launch Spotify and start playback on host machine"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Open &amp; Play in Spotify App</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 text-xs text-slate-300 flex items-start gap-3">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-white">Installed Spotify Integration:</span>{' '}
                CinemaBooth communicates directly with your installed Spotify desktop application. Clicking <strong>Open &amp; Play</strong> launches Spotify, navigates to your chosen playlist, and triggers playback so high-fidelity audio streams through your theater AV receiver. When a movie starts, playback automatically pauses.
              </div>
            </div>

            {/* Live Spotify Iframe Embed Preview */}
            <div className="rounded-xl overflow-hidden border border-emerald-500/30 bg-black shadow-inner">
              <iframe
                src={getSpotifyEmbedUrl(playlistUri)}
                width="100%"
                height="152"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                title="Spotify Live Booth Player"
                className="w-full"
              />
            </div>

            {/* Quick Playlist Preset Selector */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Recommended Pre-Show Playlists:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SPOTIFY_PRESETS.map((preset) => (
                  <button
                    key={preset.uri}
                    type="button"
                    onClick={async () => {
                      setPlaylistUri(preset.uri);
                      await saveSettings({
                        spotify_playlist_uri: preset.uri,
                        preshow_music_mode: 'spotify',
                      });
                      onRefreshSettings();
                    }}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      playlistUri === preset.uri
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700/80'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>{preset.name}</span>
                      {playlistUri === preset.uri && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Playlist URI or URL Input */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Paste Any Spotify Playlist Link or URI:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playlistUri}
                  onChange={(e) => setPlaylistUri(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/... or spotify:playlist:..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 shadow-inner"
                />
                <button
                  type="button"
                  onClick={handleSaveSpotifyConfig}
                  className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-emerald-600/30 active:scale-95"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. CUSTOM AUDIO UPLOAD (Shown when Custom Audio mode selected) */}
        {preshowMode === 'custom_audio' && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Active Pre-Show Audio Track:
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  {settings.preshow_audio_name ? (
                    <span className="font-mono text-emerald-700 font-bold">
                      {settings.preshow_audio_name}
                    </span>
                  ) : (
                    'No custom audio file uploaded yet. Click upload below to choose an MP3 or WAV.'
                  )}
                </span>
              </div>

              <div>
                <input
                  type="file"
                  ref={audioInputRef}
                  accept="audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac,audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                  id="preshow-audio-upload"
                />
                <button
                  type="button"
                  disabled={uploadingAudio}
                  onClick={() => audioInputRef.current?.click()}
                  className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>{uploadingAudio ? 'Uploading Audio...' : 'Upload Walk-In Audio (.mp3, .wav)'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. AUTOMATION SETTINGS (Auto-Pause / Resume) */}
        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={autoPause}
              onChange={(e) => setAutoPause(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0 bg-white border-slate-300 accent-blue-600"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">Auto-stop Walk-in Music when Feature Starts</span>
              <span className="text-slate-500 font-medium">
                Automatically pauses Spotify or pre-show music the moment the feature film or playlist starts playing.
              </span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={autoResume}
              onChange={(e) => setAutoResume(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0 bg-white border-slate-300 accent-blue-600"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">Auto-resume Walk-Out Music on Credits / Stop</span>
              <span className="text-slate-500 font-medium">
                Automatically resumes walk-out music when credits finish or Stop is pressed in the theater.
              </span>
            </div>
          </label>
        </div>

        {/* Save CTA */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => handleSaveSpotifyConfig()}
            disabled={saving}
            className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4 text-emerald-300" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>

          {savedMessage && (
            <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-1.5 animate-fadeIn">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{savedMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
