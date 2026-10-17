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
  Palette,
  Sparkles,
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
  controlSpotify,
} from './services/api';

export default function App() {
  // Check if this window was opened as the dedicated Projector Screen
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'screen' || window.location.pathname === '/screen';
  });

  const [activeTab, setActiveTab] = useState<'deck' | 'playlists' | 'media' | 'slideshows' | 'cues' | 'spotify' | 'settings'>('deck');
  const [showQrModal, setShowQrModal] = useState(false);

  // Bright, interesting pattern options: projector, blueprint, waves, geometric
  const [themePattern, setThemePattern] = useState<'projector' | 'blueprint' | 'waves' | 'geometric'>(() => {
    const saved = localStorage.getItem('cinema_theme_pattern');
    if (saved && ['projector', 'blueprint', 'waves', 'geometric'].includes(saved)) {
      return saved as any;
    }
    return 'projector';
  });

  const cycleThemePattern = () => {
    const patterns: Array<'projector' | 'blueprint' | 'waves' | 'geometric'> = [
      'projector',
      'blueprint',
      'waves',
      'geometric',
    ];
    const nextIdx = (patterns.indexOf(themePattern) + 1) % patterns.length;
    const nextPattern = patterns[nextIdx];
    setThemePattern(nextPattern);
    localStorage.setItem('cinema_theme_pattern', nextPattern);
  };

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
      if (action === 'spotify_play') {
        await controlSpotify('play');
        setPlayback((prev) => ({ ...prev, spotifyPlaying: true }));
        return;
      }
      if (action === 'spotify_pause') {
        await controlSpotify('pause');
        setPlayback((prev) => ({ ...prev, spotifyPlaying: false }));
        return;
      }
      if (action === 'spotify_toggle') {
        const next = !playback.spotifyPlaying;
        await controlSpotify(next ? 'play' : 'pause');
        setPlayback((prev) => ({ ...prev, spotifyPlaying: next }));
        return;
      }
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
    <div className={`theme-pattern-${themePattern} min-h-screen text-slate-800 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-all duration-300`}>
      {/* SLEEK COMPACT TOP NAVIGATION BAR (Zero bulky banner, maximum workspace) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs px-3 sm:px-6 py-2 flex items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <nav className="flex items-center overflow-x-auto gap-1 py-0.5 scrollbar-none">
          <button
            onClick={() => setActiveTab('deck')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'deck'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/70'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Live Deck</span>
          </button>
          <button
            onClick={() => setActiveTab('playlists')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'playlists'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/70'
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>Playlists</span>
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'media'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/70'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Media Ingest</span>
          </button>
          <button
            onClick={() => setActiveTab('slideshows')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'slideshows'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/70'
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>Pre-Show Slides</span>
          </button>
          <button
            onClick={() => setActiveTab('cues')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'cues'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/70'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Automation Cues</span>
          </button>
          <button
            onClick={() => setActiveTab('spotify')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'spotify'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/70'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Spotify Audio</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/70'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Setup</span>
          </button>
        </nav>

        {/* Quick Utilities: Phone QR & Projector Window */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowQrModal(true)}
            className="min-h-[38px] px-3 py-1.5 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 border border-slate-200/90 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Open Remote on Phone or Tablet"
          >
            <QrCode className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Phone QR</span>
          </button>

          <a
            href={projectorUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-[38px] px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/25 transition-all whitespace-nowrap"
            title="Launch clean zero-interface projector screen window"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Projector Screen</span>
          </a>
        </div>
      </header>

      {/* 2. AUTOMATION CUE FIRED BANNER */}
      {playback.activeCue && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-center text-xs text-emerald-900 font-medium flex items-center justify-center gap-2 animate-fadeIn">
          <Zap className="w-4 h-4 text-emerald-600 animate-bounce" />
          <span>Automation Triggered: <strong className="text-emerald-950 font-bold">{playback.activeCue}</strong></span>
        </div>
      )}

      {/* 3. MOBILE THUMB TAB BAR (On smartphone/tablet viewports) */}
      <div className="lg:hidden flex items-center overflow-x-auto gap-1 p-2 bg-white/95 border-b border-slate-200 shadow-xs shrink-0">
        <button
          onClick={() => setActiveTab('deck')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'deck' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Deck</span>
        </button>
        <button
          onClick={() => setActiveTab('playlists')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'playlists' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ListMusic className="w-3.5 h-3.5" />
          <span>Playlists</span>
        </button>
        <button
          onClick={() => setActiveTab('media')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'media' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Ingest</span>
        </button>
        <button
          onClick={() => setActiveTab('slideshows')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'slideshows' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Presentation className="w-3.5 h-3.5" />
          <span>Pre-Show</span>
        </button>
        <button
          onClick={() => setActiveTab('cues')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'cues' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Cues</span>
        </button>
        <button
          onClick={() => setActiveTab('spotify')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'spotify' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Audio</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'settings' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
            onReorderPlaylist={async (items) => {
              if (activePlaylist) {
                await handleSavePlaylist({ ...activePlaylist, items });
              }
            }}
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
            themePattern={themePattern}
            onCyclePattern={cycleThemePattern}
            onSelectPattern={(pat) => {
              setThemePattern(pat);
              localStorage.setItem('cinema_theme_pattern', pat);
            }}
            onRefreshSettings={loadAllData}
          />
        )}
      </main>

      {/* 5. PERSISTENT MOBILE THUMB BAR (Visible on smaller viewports when in other tabs) */}
      {activeTab !== 'deck' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 px-4 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-900 truncate">
              {currentItem?.title || 'No Media Selected'}
            </div>
            <div className="text-[11px] text-emerald-600 font-mono font-medium tabular-nums">
              {playback.isPlaying ? 'PLAYING ON PROJECTOR' : 'STANDBY (PRE-SHOW SLIDESHOW)'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleControl('stop')}
              className="min-h-[44px] min-w-[44px] bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200 rounded-xl flex items-center justify-center transition-colors"
              aria-label="Stop"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={() => handleControl(playback.isPlaying ? 'pause' : 'play')}
              className="min-h-[44px] px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/20"
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
              className="min-h-[44px] px-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200"
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
