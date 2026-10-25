/**
 * CinemaBooth Pre-Show Walk-In Audio Engine
 * Handles high-fidelity local cinema audio tracks, user uploads, smooth crossfading,
 * browser autoplay unlock, and synchronization with theater playback and Spotify state.
 */

export type WalkInMusicMode = 'spotify' | 'retro' | 'overture' | 'jazz' | 'custom_audio' | 'ambient' | 'none' | 'silent';

export const WALK_IN_TRACKS: Record<string, { title: string; artist: string; url: string; description: string }> = {
  retro: {
    title: 'Retro Theater Intermission & Walk-In',
    artist: 'Cinema Palace Orchestra',
    url: '/assets/audio/retro_cinema_intermission.wav',
    description: 'Nostalgic 1950s/1970s theater intermission swing with vibraphone, warm chords, and authentic cinema vibe.',
  },
  overture: {
    title: 'Grand Hollywood Orchestral Overture',
    artist: 'Symphonic Cinema Ensemble',
    url: '/assets/audio/grand_hollywood_overture.wav',
    description: 'Majestic orchestral overture with French horns, lush strings, and theatrical chimes.',
  },
  jazz: {
    title: 'Cinema Lounge & Film Noir Jazz',
    artist: 'Midnight Cinema Quartet',
    url: '/assets/audio/cinema_jazz_lounge.wav',
    description: 'Smooth, relaxing theater lounge jazz with warm piano, walking upright bass, and gentle chords.',
  },
};

type AutoplayListener = (isBlocked: boolean) => void;

class PreshowAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private isUnlocked = true;
  private listeners: Set<AutoplayListener> = new Set();
  private isPlaying = false;
  private targetVolume = 0.8;
  private isMuted = false;
  private currentMode: string = 'retro';
  private customAudioUrl: string = '';
  private currentTrackUrl: string = '';
  private synthCtx: AudioContext | null = null;
  private synthGain: GainNode | null = null;
  private synthOscs: OscillatorNode[] = [];
  private usingSynthFallback = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.preload = 'auto';

      this.audio.addEventListener('error', () => {
        if (this.isPlaying) {
          this.startSynthFallback();
        }
      });

      // Global user gesture listeners for seamless browser autoplay unlock
      const unlockHandler = () => {
        this.unlockAudio();
      };
      window.addEventListener('click', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });
    }
  }

  private startSynthFallback() {
    if (this.usingSynthFallback) {
      this.applyVolume();
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.synthCtx = new AudioCtx();
      if (this.synthCtx.state === 'suspended') {
        this.synthCtx.resume().catch(() => {});
      }
      this.synthGain = this.synthCtx.createGain();
      const eff = this.isMuted ? 0.0001 : Math.max(0.02, Math.min(1, this.targetVolume) * 0.12);
      this.synthGain.gain.setValueAtTime(eff, this.synthCtx.currentTime);
      this.synthGain.connect(this.synthCtx.destination);

      // Warm cinema lounge Fmaj7 chord pad
      [174.61, 220.0, 261.63, 329.63].forEach((freq, i) => {
        if (!this.synthCtx || !this.synthGain) return;
        const osc = this.synthCtx.createOscillator();
        const g = this.synthCtx.createGain();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, this.synthCtx.currentTime);
        g.gain.setValueAtTime(0.22 / (i + 1), this.synthCtx.currentTime);
        osc.connect(g);
        g.connect(this.synthGain);
        osc.start();
        this.synthOscs.push(osc);
      });
      this.usingSynthFallback = true;
    } catch {}
  }

  private stopSynthFallback() {
    this.usingSynthFallback = false;
    this.synthOscs.forEach((o) => {
      try { o.stop(); } catch {}
    });
    this.synthOscs = [];
    if (this.synthCtx) {
      this.synthCtx.close().catch(() => {});
      this.synthCtx = null;
      this.synthGain = null;
    }
  }

  public subscribeAutoplay(listener: AutoplayListener): () => void {
    this.listeners.add(listener);
    listener(!this.isUnlocked);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn(!this.isUnlocked));
  }

  /**
   * Unlock HTML5 Audio to satisfy browser autoplay security policies
   */
  public async unlockAudio(): Promise<boolean> {
    if (!this.audio) return false;
    this.isUnlocked = true;
    this.notifyListeners();
    try {
      if (this.synthCtx && this.synthCtx.state === 'suspended') {
        await this.synthCtx.resume().catch(() => {});
      }

      if (this.isPlaying && this.currentTrackUrl && !this.usingSynthFallback) {
        this.applyVolume();
        await this.audio.play();
      }
      return true;
    } catch {
      if (this.isPlaying) {
        this.startSynthFallback();
      }
      return true;
    }
  }

  public isAudioUnlocked(): boolean {
    return this.isUnlocked;
  }

  /**
   * Resolve target audio URL based on selected walk-in mode
   */
  private resolveAudioUrl(mode: string, spotifyConnected: boolean = false): string | null {
    if (mode === 'none' || mode === 'silent') {
      return null;
    }
    if (mode === 'spotify') {
      if (spotifyConnected) {
        return null;
      }
      return WALK_IN_TRACKS.retro.url;
    }
    if (mode === 'custom_audio') {
      return this.customAudioUrl || WALK_IN_TRACKS.retro.url;
    }
    if (mode === 'ambient') {
      return WALK_IN_TRACKS.retro.url;
    }
    if (WALK_IN_TRACKS[mode]) {
      return WALK_IN_TRACKS[mode].url;
    }
    return WALK_IN_TRACKS.retro.url;
  }

  /**
   * Update audio engine parameters based on incoming theater state
   */
  public syncState(params: {
    isPlaylistPlaying: boolean;
    spotifyPlaying: boolean;
    spotifyConnected?: boolean;
    volume: number;
    isMuted: boolean;
    preshowMusicMode?: string;
    customAudioUrl?: string;
  }) {
    this.targetVolume = typeof params.volume === 'number' ? params.volume : 0.8;
    this.isMuted = !!params.isMuted;
    const mode = params.preshowMusicMode || this.currentMode || 'retro';
    this.currentMode = mode;
    if (params.customAudioUrl) {
      this.customAudioUrl = params.customAudioUrl;
    }

    if (mode === 'none' || mode === 'silent') {
      this.stop();
      return;
    }

    // Pre-show audio should play ONLY when the presentation video is NOT active
    // AND walk-in audio is toggled ON
    const shouldPlay = !params.isPlaylistPlaying && params.spotifyPlaying;

    if (!shouldPlay) {
      this.stop();
      return;
    }

    const targetUrl = this.resolveAudioUrl(this.currentMode, Boolean(params.spotifyConnected));
    if (!targetUrl) {
      this.stop();
      return;
    }

    this.startTrack(targetUrl);
  }

  /**
   * Start track playback with smooth volume
   */
  private startTrack(url: string) {
    if (!this.audio) return;

    this.isPlaying = true;
    const isNewTrack = this.currentTrackUrl !== url;

    if (isNewTrack) {
      this.stopSynthFallback();
      this.currentTrackUrl = url;
      this.audio.src = url;
      this.audio.load();
    }

    this.applyVolume();

    if (this.usingSynthFallback) {
      return;
    }

    if (this.audio.paused) {
      this.audio
        .play()
        .then(() => {
          this.isUnlocked = true;
          this.notifyListeners();
        })
        .catch(() => {
          this.isUnlocked = true;
          this.notifyListeners();
          this.startSynthFallback();
        });
    }
  }

  /**
   * Pause and reset audio playback without corrupting HTMLAudioElement src
   */
  public stop() {
    this.isPlaying = false;
    this.stopSynthFallback();
    if (!this.audio) return;

    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {}
  }

  /**
   * Apply volume and mute settings to the audio element
   */
  private applyVolume() {
    const eff = this.isMuted ? 0 : Math.max(0, Math.min(1, this.targetVolume));
    if (this.audio) {
      this.audio.volume = eff;
    }
    if (this.synthGain && this.synthCtx) {
      this.synthGain.gain.setValueAtTime(this.isMuted ? 0.0001 : Math.max(0.02, eff * 0.12), this.synthCtx.currentTime);
    }
  }
}

export const preshowAudio = new PreshowAudioEngine();


