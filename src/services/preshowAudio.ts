/**
 * Pre-Show Walk-In Audio Engine
 * Handles high-fidelity ambient cinema audio synthesis, custom audio track playback,
 * smooth crossfading, browser autoplay unlock, and synchronization with theater playback state.
 */

type AutoplayListener = (isBlocked: boolean) => void;

class PreshowAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private chordTimer: any = null;
  private currentChordIndex = 0;
  private customAudio: HTMLAudioElement | null = null;
  private isUnlocked = false;
  private listeners: Set<AutoplayListener> = new Set();
  private isPlayingAmbient = false;
  private targetVolume = 0.8;
  private isMuted = false;
  private musicMode: string = 'ambient';
  private customAudioUrl: string = '';

  // Warm cinematic chord progressions (Frequencies in Hz)
  // Progression: EbMaj9 -> Cm9 -> AbMaj9 -> Bb9sus4 (Authentic cinema walk-in atmosphere)
  private chordProgressions = [
    // EbMaj9 (Eb2, G2, Bb2, D3, F3, G3)
    [77.78, 98.0, 116.54, 146.83, 174.61, 196.0],
    // Cm9 (C2, G2, Eb3, Bb3, D4)
    [65.41, 98.0, 155.56, 233.08, 293.66],
    // AbMaj9 (Ab1, Eb2, C3, G3, Bb3, C4)
    [51.91, 77.78, 130.81, 196.0, 233.08, 261.63],
    // Bb9sus (Bb1, F2, Ab2, C3, Eb3, F3)
    [58.27, 87.31, 103.83, 130.81, 155.56, 174.61],
  ];

  constructor() {
    // Setup custom audio element for uploaded tracks
    if (typeof window !== 'undefined') {
      this.customAudio = new Audio();
      this.customAudio.loop = true;
      this.customAudio.preload = 'auto';

      // Auto-unlock on any user interaction with the window
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
   * Unlock Web Audio context to satisfy browser autoplay security policies
   */
  public async unlockAudio(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return false;
        this.ctx = new AudioContextClass();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      if (this.customAudio && this.musicMode === 'custom_audio' && this.isPlayingAmbient) {
        this.customAudio.play().catch(() => {});
      }

      this.isUnlocked = this.ctx.state === 'running';
      this.notifyListeners();

      // If we should be playing, ensure audio is producing sound
      if (this.isPlayingAmbient) {
        this.applyVolume();
      }

      return this.isUnlocked;
    } catch (e) {
      console.warn('Could not unlock audio context:', e);
      return false;
    }
  }

  public isAudioUnlocked(): boolean {
    return this.isUnlocked;
  }

  /**
   * Update audio parameters based on incoming theater state
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
    this.musicMode = params.preshowMusicMode || this.musicMode || 'ambient';
    if (params.customAudioUrl) {
      this.customAudioUrl = params.customAudioUrl;
    }

    // Pre-show audio should play ONLY when the main playlist video is NOT playing
    // AND walk-in audio / Spotify is enabled
    const shouldPlay = !params.isPlaylistPlaying && params.spotifyPlaying && this.musicMode !== 'none';

    if (shouldPlay) {
      this.start();
    } else {
      this.stop();
    }
  }

  /**
   * Start pre-show audio with smooth fade-in
   */
  public start() {
    this.isPlayingAmbient = true;

    if (this.musicMode === 'custom_audio' && this.customAudioUrl) {
      this.stopSynth();
      this.playCustomAudio();
    } else {
      this.stopCustomAudio();
      this.playSynth();
    }
  }

  /**
   * Stop / fade-out pre-show audio (e.g. when movie starts)
   */
  public stop() {
    this.isPlayingAmbient = false;
    this.fadeToSilence();
  }

  private playCustomAudio() {
    if (!this.customAudio) return;
    if (this.customAudio.src !== window.location.origin + this.customAudioUrl && !this.customAudio.src.endsWith(this.customAudioUrl)) {
      this.customAudio.src = this.customAudioUrl;
    }
    this.customAudio.volume = this.isMuted ? 0 : Math.max(0, Math.min(1, this.targetVolume));
    this.customAudio.play().catch(() => {
      this.isUnlocked = false;
      this.notifyListeners();
    });
  }

  private stopCustomAudio() {
    if (this.customAudio) {
      this.customAudio.pause();
    }
  }

  private ensureAudioContext(): boolean {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return false;
      this.ctx = new AudioContextClass();
    }

    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

      // Lowpass filter for warm cinematic theater sound
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(800, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.5, this.ctx.currentTime);

      this.masterGain.connect(this.filterNode);
      this.filterNode.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.isUnlocked = false;
      this.notifyListeners();
      return false;
    } else {
      this.isUnlocked = true;
      this.notifyListeners();
      return true;
    }
  }

  private playSynth() {
    this.ensureAudioContext();
    if (!this.ctx || !this.masterGain) return;

    // Fade in master gain smoothly
    const effectiveVolume = this.isMuted ? 0 : Math.max(0.01, this.targetVolume * 0.15); // pleasant ambient level
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(effectiveVolume, this.ctx.currentTime + 2.0);

    // If already playing chords, just ensure chord timer is active
    if (this.activeOscillators.length > 0) return;

    // Start chord progression loop
    this.triggerNextChord();
    if (this.chordTimer) clearInterval(this.chordTimer);
    this.chordTimer = setInterval(() => {
      this.triggerNextChord();
    }, 12000); // Crossfade chord every 12 seconds
  }

  private triggerNextChord() {
    if (!this.ctx || !this.masterGain || !this.isPlayingAmbient) return;

    const chord = this.chordProgressions[this.currentChordIndex];
    this.currentChordIndex = (this.currentChordIndex + 1) % this.chordProgressions.length;

    // Fade out old oscillators gently
    const oldOscs = [...this.activeOscillators];
    const now = this.ctx.currentTime;

    // Create new chord voices
    const newOscs: OscillatorNode[] = [];
    chord.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const voiceGain = this.ctx.createGain();

      // Detuned dual waveforms for rich cinema string pad
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Subtle slow frequency modulation (chorus/warmth)
      const detuneAmount = (i % 2 === 0 ? 3 : -3) + (Math.random() * 2 - 1);
      osc.detune.setValueAtTime(detuneAmount, now);

      // Smooth envelope attack
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.exponentialRampToValueAtTime(0.18 / chord.length, now + 3.0);

      osc.connect(voiceGain);
      voiceGain.connect(this.masterGain);
      osc.start(now);
      newOscs.push(osc);
    });

    this.activeOscillators = newOscs;

    // Clean up old oscillators after 3.5s crossfade
    setTimeout(() => {
      oldOscs.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {}
      });
    }, 3500);
  }

  private fadeToSilence() {
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
    }
    if (this.customAudio) {
      // Fade down custom audio
      let vol = this.customAudio.volume;
      const step = vol / 10;
      const fadeInterval = setInterval(() => {
        if (!this.customAudio) {
          clearInterval(fadeInterval);
          return;
        }
        vol = Math.max(0, vol - step);
        this.customAudio.volume = vol;
        if (vol <= 0.02) {
          clearInterval(fadeInterval);
          this.customAudio.pause();
        }
      }, 100);
    }
  }

  private stopSynth() {
    if (this.chordTimer) {
      clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    }
    this.activeOscillators.forEach((o) => {
      try {
        o.stop();
        o.disconnect();
      } catch {}
    });
    this.activeOscillators = [];
  }

  private applyVolume() {
    const effective = this.isMuted ? 0 : Math.max(0.001, this.targetVolume * 0.15);
    if (this.ctx && this.masterGain && this.isPlayingAmbient) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(effective, this.ctx.currentTime + 0.3);
    }
    if (this.customAudio) {
      this.customAudio.volume = this.isMuted ? 0 : Math.max(0, Math.min(1, this.targetVolume));
    }
  }
}

export const preshowAudio = new PreshowAudioEngine();
