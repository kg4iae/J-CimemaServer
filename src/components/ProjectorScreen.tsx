import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Music, Sparkles } from 'lucide-react';
import { PlaybackState, Playlist, PlaylistItem, TheaterSettings, Slideshow, SlideshowSlide } from '../types/theater';
import { fetchPlaylists, fetchSettings, syncPlaybackProgress, fetchSlideshows } from '../services/api';
import { preshowAudio } from '../services/preshowAudio';
import { headlessSpotifyPlayer } from '../services/spotifyPlayer';

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
    spotifyVolume: 0.8,
    spotifyConnected: false,
    spotifyDeviceName: 'CinemaBooth Projector',
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
    preshow_music_mode: 'retro',
  });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [currentItem, setCurrentItem] = useState<PlaylistItem | null>(null);
  const [useProceduralCanvas, setUseProceduralCanvas] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Pre-show slideshow rotation state
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState<boolean>(false);
  const [activeSpeakerTest, setActiveSpeakerTest] = useState<string | null>(null);

  const isNativeAppliance = new URLSearchParams(window.location.search).get('appliance') === 'true';

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speakerAudioCtxRef = useRef<AudioContext | null>(null);

  // Discrete 6-Channel (5.1 Surround) & Stereo-Fallback Test Tone Synthesizer
  const playDiscrete51ChannelTone = (channelKey: 'fl' | 'c' | 'fr' | 'sl' | 'sr' | 'lfe') => {
    const labels: Record<string, string> = {
      fl: 'Front Left (Ch 1)',
      fr: 'Front Right (Ch 2)',
      c: 'Center Dialog (Ch 3)',
      lfe: 'LFE Subwoofer (Ch 4)',
      sl: 'Surround Left (Ch 5)',
      sr: 'Surround Right (Ch 6)',
    };
    setActiveSpeakerTest(labels[channelKey] || channelKey.toUpperCase());

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!speakerAudioCtxRef.current) {
        speakerAudioCtxRef.current = new AudioCtx();
      }
      const ctx = speakerAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const maxCh = ctx.destination.maxChannelCount || 2;
      const isSixChannelCapable = maxCh >= 6;
      if (isSixChannelCapable) {
        ctx.destination.channelCount = 6;
        ctx.destination.channelCountMode = 'explicit';
        ctx.destination.channelInterpretation = 'discrete';
      }

      const now = ctx.currentTime;
      const duration = 1.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Frequencies tailored per speaker (Subwoofer uses 55Hz low-frequency LFE sine wave)
      const freqMap: Record<string, number> = {
        fl: 440,
        c: 523.25,
        fr: 659.25,
        sl: 392,
        sr: 493.88,
        lfe: 55,
      };
      osc.type = channelKey === 'lfe' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freqMap[channelKey] || 440, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(channelKey === 'lfe' ? 0.55 : 0.3, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);

      if (isSixChannelCapable) {
        // Standard SMPTE / Web Audio 5.1 layout: 0=FL, 1=FR, 2=C, 3=LFE, 4=SL, 5=SR
        const channelIndexMap: Record<string, number> = {
          fl: 0,
          fr: 1,
          c: 2,
          lfe: 3,
          sl: 4,
          sr: 5,
        };
        const merger = ctx.createChannelMerger(6);
        gain.connect(merger, 0, channelIndexMap[channelKey] ?? 0);
        merger.connect(ctx.destination);
      } else {
        // 2-Channel Stereo Browser Testing Fallback (pans left/center/right so web testing is clear)
        const panner = ctx.createStereoPanner();
        const panMap: Record<string, number> = {
          fl: -0.9,
          sl: -0.65,
          c: 0,
          lfe: 0,
          sr: 0.65,
          fr: 0.9,
        };
        panner.pan.setValueAtTime(panMap[channelKey] ?? 0, now);
        gain.connect(panner);
        panner.connect(ctx.destination);
      }

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('5.1 speaker test audio error:', e);
    }
  };

  const triggerSpeakerTestSequence = (channel: string) => {
    if (channel === 'all') {
      const sequence: Array<'fl' | 'c' | 'fr' | 'sr' | 'sl' | 'lfe'> = ['fl', 'c', 'fr', 'sr', 'sl', 'lfe'];
      sequence.forEach((ch, idx) => {
        setTimeout(() => {
          playDiscrete51ChannelTone(ch);
        }, idx * 1250);
      });
      setTimeout(() => {
        setActiveSpeakerTest(null);
      }, sequence.length * 1250 + 300);
    } else {
      playDiscrete51ChannelTone(channel as any);
      setTimeout(() => {
        setActiveSpeakerTest(null);
      }, 1300);
    }
  };

  // Initialize headless Spotify Connect receiver and unlock audio automatically
  useEffect(() => {
    preshowAudio.unlockAudio();
    headlessSpotifyPlayer.init(playback.spotifyVolume ?? 0.8);
    const t = setTimeout(() => {
      preshowAudio.unlockAudio();
      headlessSpotifyPlayer.unlockAudio();
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  // Synchronize Pre-Show Walk-In Audio engine and Headless Spotify Player with theater state
  useEffect(() => {
    const isSpotifyActive = !playback.isPlaying && !playback.karaokeActive && playback.spotifyPlaying;
    const effectiveSpotifyVol = typeof playback.spotifyVolume === 'number' ? playback.spotifyVolume : playback.volume;

    headlessSpotifyPlayer.syncState({
      shouldPlay: isSpotifyActive,
      volume: effectiveSpotifyVol,
      isMuted: playback.isMuted,
    });

    preshowAudio.syncState({
      isPlaylistPlaying: playback.isPlaying || Boolean(playback.karaokeActive),
      spotifyPlaying: playback.spotifyPlaying && !playback.karaokeActive,
      spotifyConnected: false, // Ensure built-in walk-in audio plays if preshow_music_mode was left on 'spotify' without active Spotify track
      volume: effectiveSpotifyVol,
      isMuted: playback.isMuted,
      preshowMusicMode: settings.preshow_music_mode,
      customAudioUrl: settings.preshow_audio_url,
    });
  }, [
    playback.isPlaying,
    playback.karaokeActive,
    playback.spotifyPlaying,
    playback.spotifyVolume,
    playback.volume,
    playback.isMuted,
    settings.preshow_music_mode,
    settings.preshow_audio_url,
  ]);

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

  // Determine current item from currentPlaylistId and currentItemIndex (automatically skipping past 'cue' items)
  useEffect(() => {
    const activePl = playlists.find((p) => p.id === playback.currentPlaylistId) || playlists[0];
    if (activePl && activePl.items && activePl.items.length > 0) {
      let idx = Math.max(0, Math.min(playback.currentItemIndex, activePl.items.length - 1));
      let it = activePl.items[idx];
      while (it && it.item_type === 'cue' && idx + 1 < activePl.items.length) {
        idx++;
        it = activePl.items[idx];
      }
      if (it && it.item_type === 'cue') {
        const firstMedia = activePl.items.find((m) => m.item_type === 'media');
        if (firstMedia) it = firstMedia;
      }
      setCurrentItem(it);
      setUseProceduralCanvas(false);
    }
  }, [playlists, playback.currentPlaylistId, playback.currentItemIndex]);

  // Connect WebSocket for zero-latency control from mobile/tablet/Chromebook remote
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'REGISTER_SCREEN',
          data: { appliance: isNativeAppliance },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'INIT_STATE') {
          setPlayback(payload.data);
        } else if (payload.type === 'SPEAKER_TEST_51') {
          triggerSpeakerTestSequence(payload.data?.channel || 'all');
        } else if (payload.type === 'PLAYBACK_ACTION') {
          const { action, value, playbackState } = payload.data;
          setPlayback(playbackState);

          if (action === 'play') {
            setUseProceduralCanvas(false);
          }

          if (videoRef.current) {
            if (action === 'play') {
              videoRef.current.play().catch(console.warn);
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
        } else if (payload.type === 'KARAOKE_STATE') {
          setPlayback((prev) => ({
            ...prev,
            karaokeActive: payload.data.karaokeActive,
            karaokeCode: payload.data.karaokeCode ?? prev.karaokeCode,
            micMuted: payload.data.micMuted ?? prev.micMuted,
            isPlaying: payload.data.karaokeActive ? false : prev.isPlaying,
          }));
          if (payload.data.karaokeActive && videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
          }
          if (!payload.data.karaokeActive) {
            setCurrentSlideIndex(0);
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
        } else if (payload.type === 'SPOTIFY_STATE') {
          setPlayback((prev) => ({
            ...prev,
            spotifyPlaying: payload.data.isPlaying,
            spotifyVolume: typeof payload.data.volume === 'number' ? payload.data.volume : prev.spotifyVolume,
            spotifyConnected: typeof payload.data.connected === 'boolean' ? payload.data.connected : prev.spotifyConnected,
            spotifyDeviceName: payload.data.deviceName || prev.spotifyDeviceName,
            spotifyTrack: payload.data.track || prev.spotifyTrack,
            spotifyArtist: payload.data.artist || prev.spotifyArtist,
          }));
        } else if (payload.type === 'SPOTIFY_TOKEN_UPDATED') {
          headlessSpotifyPlayer.reconnect();
        } else if (payload.type === 'SLIDESHOWS_UPDATED') {
          fetchSlideshows().then(setSlideshows).catch(console.error);
        } else if (payload.type === 'SETTINGS_UPDATED' || payload.type === 'LOGO_UPDATED') {
          if (payload.data) {
            setSettings((prev) => ({ ...prev, ...payload.data }));
          }
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

  const isKaraokeMode = Boolean(playback.karaokeActive);
  const activeKaraokeCode = (playback.karaokeCode || settings.karaoke_code || '').trim();
  const karaokePresentationUrl = `https://k2.lazeria.com/p?code=${encodeURIComponent(activeKaraokeCode)}`;

  // Transition from Walk-In Slideshow to Cinema Presentation whenever playback.isPlaying is true
  const isVideoItem = !isKaraokeMode && Boolean(playback.isPlaying);
  const shouldUseCanvasFallback = isVideoItem && (useProceduralCanvas || !currentItem?.file_path || currentItem?.item_type === 'cue');

  // Ensure <video> plays with proper volume & unmuted audio as soon as it mounts or item changes
  useEffect(() => {
    if (isVideoItem && !shouldUseCanvasFallback && videoRef.current) {
      videoRef.current.volume = typeof playback.volume === 'number' ? playback.volume : 1.0;
      videoRef.current.muted = Boolean(playback.isMuted);
      videoRef.current.play().catch(console.warn);
    }
  }, [isVideoItem, shouldUseCanvasFallback, currentItem?.file_path, playback.volume, playback.isMuted]);

  // Procedural Cinema Presentation Reel + Web Audio Soundtrack Fallback (when .mp4 file is missing on disk)
  useEffect(() => {
    if (!shouldUseCanvasFallback) return;

    const totalDur = Number(currentItem?.duration) || Number(playback.duration) || 15;
    const startTs = performance.now() - (Number(playback.currentTime) || 0) * 1000;
    const titleText = currentItem?.title || 'Main Feature Presentation';
    const theaterTitle = settings.theater_name || 'Grand Majestic Cinema';

    // Start Web Audio API Cinema Fanfare / Feature Chord Pad so audio is always audible
    let audioCtx: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    const oscs: OscillatorNode[] = [];
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      masterGain = audioCtx.createGain();
      const effVol = playback.isMuted ? 0.0001 : Math.max(0.05, (playback.volume ?? 1.0) * 0.18);
      masterGain.gain.setValueAtTime(effVol, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);

      // Warm cinema chord (C major 9th orchestral pad)
      [130.81, 196.0, 261.63, 329.63, 392.0].forEach((freq, i) => {
        if (!audioCtx || !masterGain) return;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = i % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        g.gain.setValueAtTime(0.18 / (i + 1), audioCtx.currentTime);
        osc.connect(g);
        g.connect(masterGain);
        osc.start();
        oscs.push(osc);
      });
    } catch {}

    let lastSyncSec = -1;
    let ended = false;

    const renderLoop = (now: number) => {
      const elapsedSec = Math.max(0, (now - startTs) / 1000);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          // Deep cinema background
          const grad = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, w * 0.7);
          grad.addColorStop(0, '#141b2d');
          grad.addColorStop(1, '#04060a');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);

          // SMPTE radar sweep & countdown ring
          const cx = w / 2;
          const cy = h / 2 - 40;
          const radius = 170;

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();

          const angle = (elapsedSec % 1) * Math.PI * 2 - Math.PI / 2;
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, -Math.PI / 2, angle);
          ctx.stroke();

          // Countdown / Feature badge
          const remaining = Math.max(1, Math.ceil(totalDur - elapsedSec));
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 110px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(remaining), cx, cy);

          // Theater & Item Title
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 24px sans-serif';
          ctx.fillText(theaterTitle.toUpperCase(), cx, cy + 240);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 44px sans-serif';
          ctx.fillText(titleText, cx, cy + 295);

          // Progress bar at bottom
          const pct = Math.min(1, elapsedSec / totalDur);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(240, h - 90, w - 480, 10);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(240, h - 90, (w - 480) * pct, 10);
        }
      }

      if (Math.floor(elapsedSec * 2) !== lastSyncSec) {
        lastSyncSec = Math.floor(elapsedSec * 2);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'SYNC_TIME',
              data: { currentTime: elapsedSec, duration: totalDur },
            })
          );
        }
        syncPlaybackProgress(elapsedSec, totalDur, true);
      }

      if (elapsedSec >= totalDur && !ended) {
        ended = true;
        handleVideoEnded();
        return;
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      oscs.forEach((o) => {
        try { o.stop(); } catch {}
      });
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [shouldUseCanvasFallback, currentItem?.id, currentItem?.title, currentItem?.duration, playback.isMuted, playback.volume]);

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
  // Only cycle slides when presentation is NOT playing and NOT in Karaoke mode
  useEffect(() => {
    if (playback.isPlaying || playback.karaokeActive || slides.length === 0) {
      return;
    }

    const intervalMs = Math.max(3000, slideDurationSec * 1000);
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playback.isPlaying, playback.karaokeActive, slides.length, slideDurationSec]);

  // Fullscreen trigger (double click anywhere)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  const logoSource = settings.logo_url || '/assets/theater_logo.svg';
  const currentSlide = slides[currentSlideIndex % Math.max(1, slides.length)];

  return (
    <div
      onClick={() => {
        if (!isKaraokeMode) {
          preshowAudio.unlockAudio();
          headlessSpotifyPlayer.unlockAudio();
        }
      }}
      onDoubleClick={toggleFullscreen}
      className="relative w-screen h-screen bg-black overflow-hidden select-none cursor-default flex items-center justify-center"
      title="CinemaBooth Projector View (Click anywhere for Audio • Double-click or F11 for Fullscreen)"
    >
      {/* 0. KARAOKE PRESENTATION MODE (Full-screen https://k2.lazeria.com/p?code=xxxx) */}
      {isKaraokeMode && (
        <div className="absolute inset-0 z-50 w-full h-full bg-black flex flex-col">
          <iframe
            key={karaokePresentationUrl}
            src={karaokePresentationUrl}
            title="Karaoke Presentation Screen"
            allow="microphone; autoplay; fullscreen; camera; display-capture"
            className="w-full h-full border-0 bg-black"
          />
        </div>
      )}

      {/* 0.5. 5.1 SURROUND SPEAKER TEST CALLOUT OVERLAY */}
      {activeSpeakerTest && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl bg-slate-950/90 border border-emerald-400/80 text-white shadow-2xl backdrop-blur-md flex items-center gap-3 pointer-events-none">
          <Volume2 className="w-5 h-5 text-emerald-400 animate-pulse" />
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-300">
              5.1 Surround Calibration Signal
            </div>
            <div className="text-sm font-bold tracking-tight text-white">
              Testing Speaker: {activeSpeakerTest}
            </div>
          </div>
        </div>
      )}

      {/* Pre-show audio status monitor in bottom-left */}
      {!isKaraokeMode && !isVideoItem && (
        <div className="absolute bottom-3 left-4 z-40 flex items-center gap-2 text-[11px] text-white/50 font-mono tracking-wider opacity-60 hover:opacity-100 transition-opacity pointer-events-none">
          <Music className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            WALK-IN AUDIO:{' '}
            {!playback.spotifyPlaying
              ? 'MUTED / PAUSED'
              : settings.preshow_music_mode === 'spotify'
              ? 'SPOTIFY ACTIVE'
              : settings.preshow_music_mode === 'custom_audio'
              ? `CUSTOM (${settings.preshow_audio_name || 'AUDIO FILE'})`
              : settings.preshow_music_mode === 'overture'
              ? 'GRAND HOLLYWOOD OVERTURE'
              : settings.preshow_music_mode === 'jazz'
              ? 'CINEMA JAZZ LOUNGE'
              : 'RETRO THEATER INTERMISSION'}
          </span>
        </div>
      )}

      {/* 1. STANDBY / PRE-SHOW DISPLAY (Shown when not playing video and not in Karaoke mode) */}
      {!isKaraokeMode && !isVideoItem && (
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
      {isVideoItem && !shouldUseCanvasFallback && (
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
      {shouldUseCanvasFallback && (
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

