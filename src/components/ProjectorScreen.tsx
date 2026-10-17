import React, { useEffect, useRef, useState } from 'react';
import { PlaybackState, Playlist, PlaylistItem, TheaterSettings, Slideshow, SlideshowSlide } from '../types/theater';
import { fetchPlaylists, fetchSettings, syncPlaybackProgress, fetchSlideshows } from '../services/api';

export default function ProjectorScreen() {
  const [playback, setPlayback] = useState<PlaybackState>({
    currentPlaylistId: 'pl_feature_night',
    currentItemIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    isMuted: false,
    spotifyPlaying: true,
    spotifyTrack: '',
    spotifyArtist: '',
    activeCue: null,
    activeSlideshowId: 'ss_general_preshow',
  });

  const [settings, setSettings] = useState<TheaterSettings>({
    theater_name: 'The Majestic Cinema',
    logo_url: '/assets/theater_logo.svg',
    active_slideshow_id: 'ss_general_preshow',
    preshow_display_mode: 'slideshow',
  });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [currentItem, setCurrentItem] = useState<PlaylistItem | null>(null);
  const [useProceduralCanvas, setUseProceduralCanvas] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Pre-show slideshow rotation state
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Load initial settings, playlists, and slideshows
  const refreshAll = () => {
    fetchSettings().then(setSettings).catch(console.error);
    fetchPlaylists().then(setPlaylists).catch(console.error);
    fetchSlideshows().then((ss) => {
      setSlideshows(ss);
    }).catch(console.error);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // Determine current item from currentPlaylistId and currentItemIndex
  useEffect(() => {
    const activePl = playlists.find((p) => p.id === playback.currentPlaylistId);
    if (activePl && activePl.items && activePl.items.length > 0) {
      const idx = Math.min(playback.currentItemIndex, activePl.items.length - 1);
      const it = activePl.items[idx];
      setCurrentItem(it);
    }
  }, [playlists, playback.currentPlaylistId, playback.currentItemIndex]);

  // Connect WebSocket for zero-latency control from mobile remote
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'INIT_STATE') {
          setPlayback(payload.data);
        } else if (payload.type === 'PLAYBACK_ACTION') {
          const { action, value, playbackState } = payload.data;
          setPlayback(playbackState);

          if (videoRef.current) {
            if (action === 'play') {
              videoRef.current.play().catch(() => {
                setUseProceduralCanvas(true);
              });
            } else if (action === 'pause') {
              videoRef.current.pause();
            } else if (action === 'stop') {
              videoRef.current.pause();
              videoRef.current.currentTime = 0;
            } else if (action === 'seek' && typeof value === 'number') {
              videoRef.current.currentTime = value;
            } else if (action === 'volume' && typeof value === 'number') {
              videoRef.current.volume = value;
            } else if (action === 'mute') {
              videoRef.current.muted = playbackState.isMuted;
            }
          }
        } else if (payload.type === 'ITEM_CHANGED') {
          setPlayback(payload.data);
          setUseProceduralCanvas(false);
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            if (payload.data.isPlaying) {
              videoRef.current.play().catch(console.warn);
            }
          }
        } else if (payload.type === 'PLAYBACK_STOPPED' || payload.type === 'PLAYLIST_FINISHED') {
          setPlayback(payload.data);
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
          }
        } else if (payload.type === 'ACTIVE_SLIDESHOW_CHANGED') {
          setPlayback((prev) => ({
            ...prev,
            activeSlideshowId: payload.data.activeSlideshowId,
          }));
          setCurrentSlideIndex(0);
        } else if (payload.type === 'SLIDESHOWS_UPDATED') {
          fetchSlideshows().then(setSlideshows).catch(console.error);
        } else if (payload.type === 'SETTINGS_UPDATED' || payload.type === 'LOGO_UPDATED') {
          fetchSettings().then(setSettings).catch(console.error);
        } else if (payload.type === 'PLAYLISTS_UPDATED') {
          fetchPlaylists().then(setPlaylists).catch(console.error);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // Sync video audio properties
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = playback.volume;
      videoRef.current.muted = playback.isMuted;
    }
  }, [playback.volume, playback.isMuted]);

  // Video time update handler
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      const dur = videoRef.current.duration || currentItem?.duration || 0;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'SYNC_TIME',
          data: { currentTime: cur, duration: dur },
        }));
      }
      syncPlaybackProgress(cur, dur, !videoRef.current.paused);
    }
  };

  const handleVideoEnded = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ITEM_ENDED' }));
    }
  };

  const handleVideoError = () => {
    setUseProceduralCanvas(true);
  };

  // Find active pre-show slideshow
  const activeShowId = playback.activeSlideshowId || settings.active_slideshow_id;
  const activeSlideshow = slideshows.find((s) => s.id === activeShowId) || slideshows[0];
  const slides: SlideshowSlide[] = activeSlideshow?.slides || [];
  const slideDurationSec = activeSlideshow?.slide_duration || 15.0;

  // Pre-show Slideshow rotation timer:
  // "These should play in alpha-numeric order and repeat until the Playlist starts.
  // I would like each slide to stay for about 15 seconds."
  useEffect(() => {
    // Only cycle slides when presentation is NOT playing
    if (playback.isPlaying || slides.length === 0) {
      return;
    }

    const intervalMs = Math.max(3000, slideDurationSec * 1000);
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playback.isPlaying, slides.length, slideDurationSec]);

  // Fullscreen trigger (double click anywhere)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  const isVideoItem = currentItem?.item_type === 'media' && playback.isPlaying;
  const logoSource = settings.logo_url || '/assets/theater_logo.svg';
  const currentSlide = slides[currentSlideIndex % Math.max(1, slides.length)];

  return (
    <div
      onDoubleClick={toggleFullscreen}
      className="relative w-screen h-screen bg-black overflow-hidden select-none cursor-none flex items-center justify-center"
      title="CinemaBooth Projector View (Double-click or F11 for Fullscreen)"
    >
      {/* 1. STANDBY / PRE-SHOW DISPLAY (Shown when not playing video) */}
      {!isVideoItem && (
        <div className="absolute inset-0 flex items-center justify-center w-full h-full bg-[#050608] transition-opacity duration-1000">
          {/* If an active slideshow with slides is selected, display the looping pre-show slideshow */}
          {slides.length > 0 && activeShowId !== 'none' ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
              {/* Slide image in alpha-numeric sequence */}
              <img
                key={currentSlide?.id || currentSlideIndex}
                src={currentSlide?.file_path}
                alt={currentSlide?.caption || 'Pre-Show Slide'}
                className="w-full h-full object-contain pointer-events-none transition-opacity duration-1000 animate-fadeIn"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = logoSource;
                }}
              />
            </div>
          ) : (
            /* Fallback to theater logo JPG if no slideshow selected */
            <img
              src={logoSource}
              alt={settings.theater_name || 'Theater Logo'}
              className="w-full h-full object-contain pointer-events-none transition-transform duration-1000"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/assets/theater_logo.svg';
              }}
            />
          )}
        </div>
      )}

      {/* 2. FULLSCREEN SEAMLESS VIDEO (Clean, ZERO on-screen controls) */}
      {isVideoItem && !useProceduralCanvas && (
        <video
          ref={videoRef}
          src={currentItem?.file_path || ''}
          autoPlay
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleVideoEnded}
          onError={handleVideoError}
          className="absolute inset-0 w-full h-full object-contain bg-black"
        />
      )}

      {/* 3. PROCEDURAL CINEMATIC REEL CANVAS (Fallback for simulation & test clips) */}
      {isVideoItem && useProceduralCanvas && (
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="absolute inset-0 w-full h-full object-contain bg-black"
        />
      )}

      {/* Subtle indicator only when hovered in corner */}
      <div className="absolute bottom-3 right-3 opacity-0 hover:opacity-100 transition-opacity text-[10px] text-white/20 font-mono tracking-widest pointer-events-none">
        CINEMABOOTH PROJECTOR • {isFullscreen ? 'FULLSCREEN' : 'DOUBLE-CLICK FOR FULLSCREEN'}
      </div>
    </div>
  );
}
