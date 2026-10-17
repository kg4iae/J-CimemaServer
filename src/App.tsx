import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Play,
  Pause,
  Square,
  ListMusic,
  HardDrive,
  Zap,
  Music,
  Settings as SettingsIcon,
  Maximize2,
  QrCode,
  Presentation,
} from 'lucide-react';
import ProjectorScreen from './components/ProjectorScreen';
import LiveDeckTab from './components/LiveDeckTab';
import PlaylistsTab from './components/PlaylistsTab';
import MediaIngestTab from './components/MediaIngestTab';
import SlideshowTab from './components/SlideshowTab';
import AutomationTab from './components/AutomationTab';
import SpotifyTab from './components/SpotifyTab';
import SettingsTab from './components/SettingsTab';
import QrCodeModal from './components/QrCodeModal';

import {
  PlaybackState,
  Playlist,
  PlaylistItem,
  MediaItem,
  AutomationCue,
  TheaterSettings,
  SystemStatus,
  Slideshow,
} from './types/theater';

import {
  fetchStatus,
  fetchSettings,
  fetchPlaylists,
  savePlaylist,
  deletePlaylist,
  fetchMedia,
  fetchCues,
  controlPlayback,
  fetchPlaybackState,
  fetchSlideshows,
  setActiveSlideshow,
} from './services/api';

export default function App() {
  // Check if this window was opened as the dedicated Projector Screen
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'screen' || window.location.pathname === '/screen';
  });

  const [activeTab, setActiveTab] = useState<'deck' | 'playlists' | 'media' | 'slideshows' | 'cues' | 'spotify' | 'settings'>('deck');
  const [showQrModal, setShowQrModal] = useState(false);

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [settings, setSettings] = useState<TheaterSettings>({
    theater_name: 'Grand Majestic Cinema',
    logo_url: '/assets/theater_logo.svg',
    active_slideshow_id: 'ss_general_preshow',
  });

  const [playback, setPlayback] = useState<PlaybackState>({
    currentPlaylistId: 'pl_feature_night',
    currentItemIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 15.0,
    volume: 1.0,
    isMuted: false,
    spotifyPlaying: true,
    spotifyTrack: '',
    spotifyArtist: '',
    activeCue: null,
    activeSlideshowId: 'ss_general_preshow',
  });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [cues, setCues] = useState<AutomationCue[]>([]);
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  // Load all initial data from SQLite backend
  const loadAllData = async () => {
    try {
      const [st, sett, pls, med, cu, pb, ss] = await Promise.all([
        fetchStatus(),
        fetchSettings(),
        fetchPlaylists(),
        fetchMedia(),
        fetchCues(),
        fetchPlaybackState(),
        fetchSlideshows(),
      ]);
      setStatus(st);
      setSettings(sett);
      setPlaylists(pls);
      setMediaList(med);
      setCues(cu);
      setPlayback(pb);
      setSlideshows(ss);
    } catch (err) {
      console.error('Failed to load initial theater state:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Set up real-time WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'INIT_STATE' || payload.type === 'PLAYBACK_ACTION') {
          setPlayback(payload.data.playbackState || payload.data);
        } else if (payload.type === 'TIME_UPDATE') {
          setPlayback((prev) => ({
            ...prev,
            currentTime: payload.data.currentTime,
            duration: payload.data.duration || prev.duration,
          }));
        } else if (payload.type === 'ITEM_CHANGED') {
          setPlayback(payload.data);
        } else if (payload.type === 'PLAYBACK_STOPPED' || payload.type === 'PLAYLIST_FINISHED') {
          setPlayback(payload.data);
        } else if (payload.type === 'SPOTIFY_STATE') {
          setPlayback((prev) => ({
            ...prev,
            spotifyPlaying: payload.data.isPlaying,
            spotifyTrack: payload.data.track || prev.spotifyTrack,
          }));
        } else if (payload.type === 'AUTOMATION_CUE_FIRED') {
          setPlayback((prev) => ({
            ...prev,
            activeCue: payload.data.name,
          }));
          setTimeout(() => {
            setPlayback((prev) => ({ ...prev, activeCue: null }));
          }, 6000);
        } else if (payload.type === 'ACTIVE_SLIDESHOW_CHANGED') {
          setPlayback((prev) => ({
            ...prev,
            activeSlideshowId: payload.data.activeSlideshowId,
          }));
        } else if (payload.type === 'SLIDESHOWS_UPDATED') {
          fetchSlideshows().then(setSlideshows).catch(console.error);
        } else if (payload.type === 'PLAYLISTS_UPDATED') {
          fetchPlaylists().then(setPlaylists).catch(console.error);
        } else if (payload.type === 'MEDIA_UPDATED') {
          fetchMedia().then(setMediaList).catch(console.error);
        } else if (payload.type === 'INGESTION_PROGRESS') {
          setMediaList((prev) =>
            prev.map((m) =>
              m.id === payload.data.id
                ? {
                    ...m,
                    conversion_progress: payload.data.progress,
                    conversion_status: payload.data.status,
                  }
                : m
            )
          );
        } else if (payload.type === 'CUES_UPDATED') {
          fetchCues().then(setCues).catch(console.error);
        } else if (payload.type === 'SETTINGS_UPDATED') {
          fetchSettings().then(setSettings).catch(console.error);
        }
      } catch (err) {
        console.error('WS client parse error:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // If in Projector Screen Mode, render the clean zero-interface projector canvas
  if (isProjectorMode) {
    return <ProjectorScreen />;
  }

  // Active playlist and current item resolution
  const activePlaylist = playlists.find((p) => p.id === playback.currentPlaylistId) || playlists[0];
  const currentItem: PlaylistItem | null =
    activePlaylist && activePlaylist.items && activePlaylist.items.length > 0
      ? activePlaylist.items[Math.min(playback.currentItemIndex, activePlaylist.items.length - 1)]
      : null;

  // Master playback controller handler
  const handleControl = async (action: string, value?: any) => {
    try {
      const updated = await controlPlayback(action, value);
      setPlayback(updated);
    } catch (err) {
      console.error('Control action error:', err);
    }
  };

  const handleSelectItem = async (index: number) => {
    try {
      const updated = await controlPlayback('select_item', null, { itemIndex: index });
      setPlayback(updated);
    } catch (err) {
      console.error('Select item error:', err);
    }
  };

  const handleSelectActivePlaylist = async (playlistId: string) => {
    try {
      const updated = await controlPlayback('load_playlist', null, { playlistId });
      setPlayback(updated);
    } catch (err) {
      console.error('Load playlist error:', err);
    }
  };

  const handleSelectSlideshow = async (slideshowId: string) => {
    try {
      await setActiveSlideshow(slideshowId);
      setPlayback((prev) => ({ ...prev, activeSlideshowId: slideshowId }));
    } catch (err) {
      console.error('Select slideshow error:', err);
    }
  };

  const handleSavePlaylist = async (pl: Partial<Playlist>) => {
    await savePlaylist(pl);
    const refreshed = await fetchPlaylists();
    setPlaylists(refreshed);
  };

  const handleDeletePlaylist = async (id: string) => {
    await deletePlaylist(id);
    const refreshed = await fetchPlaylists();
    setPlaylists(refreshed);
  };

  const remoteUrl =
    status?.localIps && status.localIps.length > 0
      ? `http://${status.localIps[0]}:${status.port || 3000}`
      : window.location.origin;

  const projectorUrl = `${window.location.origin}/?mode=screen`;

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* 1. TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 bg-[#0f121b]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <Film className="w-5 h-5 text-amber-400" />
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            {settings.theater_name || 'CinemaBooth'}
          </span>
          <span className="hidden sm:inline text-xs text-slate-400">· Projection Booth</span>
        </div>

        {/* Zone 2: Navigation Links (Tabs) */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('deck')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'deck'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Live Deck
          </button>
          <button
            onClick={() => setActiveTab('playlists')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'playlists'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Playlists
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'media'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Media Ingest
          </button>
          <button
            onClick={() => setActiveTab('slideshows')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'slideshows'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pre-Show Slides
          </button>
          <button
            onClick={() => setActiveTab('cues')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'cues'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Automation Cues
          </button>
          <button
            onClick={() => setActiveTab('spotify')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'spotify'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Spotify Audio
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Settings
          </button>
        </nav>

        {/* Zone 3: Primary Actions (Projector Window & QR Link) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowQrModal(true)}
            className="min-h-[40px] px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all"
            title="Open Remote on Phone or Tablet"
          >
            <QrCode className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Phone QR</span>
          </button>

          <a
            href={projectorUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-[40px] px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/10 transition-all whitespace-nowrap"
            title="Launch clean zero-interface projector screen window"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Projector Screen</span>
          </a>
        </div>
      </header>

      {/* 2. AUTOMATION CUE FIRED BANNER (Shown briefly when a light/curtain cue triggers) */}
      {playback.activeCue && (
        <div className="bg-blue-950/80 border-b border-blue-800/80 px-4 py-2 text-center text-xs text-blue-200 flex items-center justify-center gap-2 animate-fadeIn">
          <Zap className="w-4 h-4 text-amber-400 animate-bounce" />
          <span>Automation Fired: <strong className="text-white">{playback.activeCue}</strong></span>
        </div>
      )}

      {/* 3. MOBILE THUMB TAB BAR (On smartphone/tablet viewports) */}
      <div className="lg:hidden flex items-center overflow-x-auto gap-1 p-2 bg-[#0d1017] border-b border-slate-800 shrink-0">
        <button
          onClick={() => setActiveTab('deck')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'deck' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Deck</span>
        </button>
        <button
          onClick={() => setActiveTab('playlists')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'playlists' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ListMusic className="w-3.5 h-3.5" />
          <span>Playlists</span>
        </button>
        <button
          onClick={() => setActiveTab('media')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'media' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Ingest</span>
        </button>
        <button
          onClick={() => setActiveTab('slideshows')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'slideshows' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Presentation className="w-3.5 h-3.5" />
          <span>Pre-Show</span>
        </button>
        <button
          onClick={() => setActiveTab('cues')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'cues' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Cues</span>
        </button>
        <button
          onClick={() => setActiveTab('spotify')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'spotify' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Audio</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'settings' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Setup</span>
        </button>
      </div>

      {/* 4. MAIN WORKSPACE VIEWPORT */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 pb-28 lg:pb-12 space-y-6">
        {activeTab === 'deck' && (
          <LiveDeckTab
            playback={playback}
            activePlaylist={activePlaylist}
            currentItem={currentItem}
            slideshows={slideshows}
            activeSlideshowId={playback.activeSlideshowId || settings.active_slideshow_id}
            onControl={handleControl}
            onSelectItem={handleSelectItem}
            onSelectSlideshow={handleSelectSlideshow}
          />
        )}

        {activeTab === 'playlists' && (
          <PlaylistsTab
            playlists={playlists}
            mediaList={mediaList}
            cues={cues}
            activePlaylistId={playback.currentPlaylistId}
            onSelectActivePlaylist={handleSelectActivePlaylist}
            onSavePlaylist={handleSavePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
          />
        )}

        {activeTab === 'media' && (
          <MediaIngestTab
            mediaList={mediaList}
            ffmpegAvailable={status?.ffmpegInstalled || false}
            ytdlpAvailable={status?.ytdlpInstalled}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === 'slideshows' && (
          <SlideshowTab
            slideshows={slideshows}
            activeSlideshowId={playback.activeSlideshowId || settings.active_slideshow_id}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === 'cues' && (
          <AutomationTab
            cues={cues}
            settings={settings}
            activeCue={playback.activeCue}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === 'spotify' && (
          <SpotifyTab
            settings={settings}
            spotifyPlaying={playback.spotifyPlaying}
            spotifyTrack={playback.spotifyTrack}
            spotifyArtist={playback.spotifyArtist}
            onRefreshSettings={loadAllData}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            status={status}
            onRefreshSettings={loadAllData}
          />
        )}
      </main>

      {/* 5. PERSISTENT MOBILE THUMB BAR (Visible on smaller viewports when in other tabs) */}
      {activeTab !== 'deck' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0f121b]/95 backdrop-blur-md border-t border-slate-800 p-3 px-4 flex items-center justify-between gap-3 shadow-2xl">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {currentItem?.title || 'No Media Selected'}
            </div>
            <div className="text-[11px] text-amber-400 font-mono tabular-nums">
              {playback.isPlaying ? 'PLAYING ON PROJECTOR' : 'STANDBY (PRE-SHOW SLIDESHOW)'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleControl('stop')}
              className="min-h-[44px] min-w-[44px] bg-red-950/40 text-red-300 border border-red-800/40 rounded-xl flex items-center justify-center"
              aria-label="Stop"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={() => handleControl(playback.isPlaying ? 'pause' : 'play')}
              className="min-h-[44px] px-4 bg-amber-500 active:scale-95 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              aria-label={playback.isPlaying ? 'Pause' : 'Play'}
            >
              {playback.isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              onClick={() => setActiveTab('deck')}
              className="min-h-[44px] px-3 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium"
            >
              Deck →
            </button>
          </div>
        </div>
      )}

      {/* 6. QR CODE MODAL FOR MOBILE / TABLET OPERATORS */}
      {showQrModal && (
        <QrCodeModal
          url={remoteUrl}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
}
