/**
 * Headless Spotify Connect Receiver for Projector Screen (Spotify Web Playback SDK)
 * Runs invisibly inside ProjectorScreen.tsx on the Projector PC.
 * Allows selecting playlists/songs from the native Spotify app on a phone via Spotify Connect,
 * while CinemaBooth controls On/Off (Play/Pause) and Volume.
 */

import { fetchSpotifyToken, controlSpotify } from './api';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

class HeadlessSpotifyPlayerService {
  private player: any = null;
  private deviceId: string | null = null;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  private currentVolume: number = 0.8;
  private shouldBePlaying: boolean = true;
  private deviceName: string = 'CinemaBooth Projector';
  private lastTrackTitle: string = '';

  public async init(initialVolume: number = 0.8): Promise<void> {
    if (typeof window === 'undefined' || this.isInitializing) return;
    this.currentVolume = Math.max(0, Math.min(1, initialVolume));

    try {
      const tokenInfo = await fetchSpotifyToken();
      if (!tokenInfo?.hasToken || !tokenInfo?.accessToken) {
        return;
      }
      if (tokenInfo.deviceName) {
        this.deviceName = tokenInfo.deviceName;
      }

      this.isInitializing = true;
      await this.loadSdkScript();
      this.createPlayerInstance();
    } catch (err) {
      console.warn('[HeadlessSpotify] Could not initialize Spotify SDK:', err);
      this.isInitializing = false;
    }
  }

  public async reconnect(): Promise<void> {
    if (this.player) {
      try {
        this.player.disconnect();
      } catch {}
      this.player = null;
      this.isReady = false;
      this.deviceId = null;
    }
    this.isInitializing = false;
    await this.init(this.currentVolume);
  }

  private loadSdkScript(): Promise<void> {
    return new Promise((resolve) => {
      if (window.Spotify) {
        resolve();
        return;
      }
      window.onSpotifyWebPlaybackSDKReady = () => {
        resolve();
      };
      const existing = document.getElementById('spotify-player-sdk');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'spotify-player-sdk';
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);
      }
    });
  }

  private createPlayerInstance() {
    if (!window.Spotify || this.player) {
      this.isInitializing = false;
      return;
    }

    this.player = new window.Spotify.Player({
      name: this.deviceName || 'CinemaBooth Projector',
      getOAuthToken: async (cb: (token: string) => void) => {
        try {
          const data = await fetchSpotifyToken();
          if (data?.accessToken) {
            cb(data.accessToken);
          }
        } catch (err) {
          console.warn('[HeadlessSpotify] Failed to fetch token for SDK:', err);
        }
      },
      volume: this.currentVolume,
    });

    this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
      this.deviceId = device_id;
      this.isReady = true;
      this.isInitializing = false;
      controlSpotify('status_sync', undefined, undefined, undefined, {
        connected: true,
        deviceName: this.deviceName,
      }).catch(() => {});
    });

    this.player.addListener('not_ready', () => {
      this.isReady = false;
      controlSpotify('status_sync', undefined, undefined, undefined, {
        connected: false,
        deviceName: this.deviceName,
      }).catch(() => {});
    });

    this.player.addListener('player_state_changed', (state: any) => {
      if (!state) return;
      const trackWindow = state.track_window?.current_track;
      const trackName = trackWindow?.name || '';
      const artistName = Array.isArray(trackWindow?.artists)
        ? trackWindow.artists.map((a: any) => a.name).join(', ')
        : '';

      if (trackName && trackName !== this.lastTrackTitle) {
        this.lastTrackTitle = trackName;
        controlSpotify('status_sync', trackName, artistName, undefined, {
          connected: true,
          deviceName: this.deviceName,
          isPlaying: !state.paused,
        }).catch(() => {});
      }
    });

    this.player.addListener('initialization_error', () => {
      this.isInitializing = false;
    });
    this.player.addListener('authentication_error', () => {
      this.isInitializing = false;
      this.isReady = false;
    });

    this.player.connect();
  }

  public unlockAudio() {
    if (this.player && typeof this.player.activateElement === 'function') {
      try {
        this.player.activateElement();
      } catch {}
    }
  }

  /**
   * Synchronize headless Spotify player with CinemaBooth On/Off and Volume state
   */
  public syncState(params: {
    shouldPlay: boolean;
    volume: number;
    isMuted: boolean;
  }) {
    const effectiveVolume = params.isMuted ? 0 : Math.max(0, Math.min(1, params.volume));

    if (Math.abs(effectiveVolume - this.currentVolume) > 0.005) {
      this.currentVolume = effectiveVolume;
      if (this.player && this.isReady) {
        try {
          this.player.setVolume(effectiveVolume).catch(() => {});
        } catch {}
      }
    }

    if (params.shouldPlay !== this.shouldBePlaying) {
      this.shouldBePlaying = params.shouldPlay;
      if (this.player && this.isReady) {
        try {
          if (params.shouldPlay) {
            this.player.resume().catch(() => {});
          } else {
            this.player.pause().catch(() => {});
          }
        } catch {}
      }
    }
  }
}

export const headlessSpotifyPlayer = new HeadlessSpotifyPlayerService();
