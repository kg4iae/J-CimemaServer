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
  private isUnlocked = false;
  private listeners: Set<AutoplayListener> = new Set();
  private isPlaying = false;
  private targetVolume = 0.8;
  private isMuted = false;
  private currentMode: string = 'retro';
  private customAudioUrl: string = '';
  private currentTrackUrl: string = '';

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.preload = 'auto';

      // Global user gesture listeners for seamless browser autoplay unlock
      const unlockHandler = () => {
        this.unlockAudio();
      };
      window.addEventListener('click', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });
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
    try {
      this.isUnlocked = true;
      this.notifyListeners();

      if (this.isPlaying && this.currentTrackUrl) {
        this.applyVolume();
        await this.audio.play();
      }
      return true;
    } catch (e) {
      this.isUnlocked = false;
      this.notifyListeners();
      return false;
    }
  }

  public isAudioUnlocked(): boolean {
    return this.isUnlocked;
  }

  /**
   * Resolve target audio URL based on selected walk-in mode
   */
  private resolveAudioUrl(mode: string): string | null {
    if (mode === 'spotify' || mode === 'none' || mode === 'silent') {
      return null;
    }
    if (mode === 'custom_audio') {
      return this.customAudioUrl || null;
    }
    if (mode === 'ambient') {
      // Map legacy "ambient" to the retro intermission walk-in
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
    volume: number;
    isMuted: boolean;
    preshowMusicMode?: string;
    customAudioUrl?: string;
  }) {
    this.targetVolume = typeof params.volume === 'number' ? params.volume : 0.8;
    this.isMuted = !!params.isMuted;
    this.currentMode = params.preshowMusicMode || this.currentMode || 'retro';
    if (params.customAudioUrl) {
      this.customAudioUrl = params.customAudioUrl;
    }

    // Pre-show audio should play ONLY when the presentation video is NOT active
    // AND walk-in audio is toggled ON
    const shouldPlay = !params.isPlaylistPlaying && params.spotifyPlaying;

    if (!shouldPlay) {
      this.stop();
      return;
    }

    // If mode is Spotify or None/Silent, stop internal audio engine immediately!
    if (this.currentMode === 'spotify' || this.currentMode === 'none' || this.currentMode === 'silent') {
      this.stop();
      return;
    }

    const targetUrl = this.resolveAudioUrl(this.currentMode);
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
    const isNewTrack = this.currentTrackUrl !== url || !this.audio.src.includes(url);

    if (isNewTrack) {
      this.currentTrackUrl = url;
      this.audio.src = url;
      this.audio.load();
    }

    this.applyVolume();

    this.audio
      .play()
      .then(() => {
        this.isUnlocked = true;
        this.notifyListeners();
      })
      .catch((err) => {
        // Autoplay blocked by browser policy until user interacts with page
        this.isUnlocked = false;
        this.notifyListeners();
      });
  }

  /**
   * Smoothly fade out and pause audio
   */
  public stop() {
    this.isPlaying = false;
    if (!this.audio) return;

    try {
      this.audio.pause();
    } catch {}
  }

  /**
   * Apply volume and mute settings to the audio element
   */
  private applyVolume() {
    if (!this.audio) return;
    const eff = this.isMuted ? 0 : Math.max(0, Math.min(1, this.targetVolume));
    this.audio.volume = eff;
  }
}

export const preshowAudio = new PreshowAudioEngine();
