import React, { useState, useRef, useEffect } from 'react';
import {
  Music,
  Power,
  Settings2,
  Check,
  Radio,
  Volume2,
  VolumeX,
  Upload,
  FileAudio,
  Info,
  Disc,
  Smartphone,
  Tv,
  KeyRound,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { TheaterSettings } from '../types/theater';
import {
  controlSpotify,
  saveSettings,
  uploadPreshowAudio,
  saveSpotifyToken,
  fetchSpotifyToken,
} from '../services/api';
import { preshowAudio, WALK_IN_TRACKS } from '../services/preshowAudio';

interface SpotifyTabProps {
  settings: TheaterSettings;
  spotifyPlaying: boolean;
  spotifyVolume?: number;
  spotifyConnected?: boolean;
  spotifyDeviceName?: string;
  spotifyTrack: string;
  spotifyArtist: string;
  onRefreshSettings: () => void;
}

// PKCE helper functions for 1-click Spotify login from Phone/Tablet/Chromebook
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((x) => possible[x % possible.length])
    .join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  if (window.crypto && window.crypto.subtle) {
    return window.crypto.subtle.digest('SHA-256', data);
  }
  // Pure-JS SHA-256 fallback for plain HTTP LAN origins (e.g. http://192.168.1.130:31047)
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const l = data.length;
  const bitLen = l * 8;
  const padLen = ((l + 8) >> 6) * 64 + 64;
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[l] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 4, bitLen, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const W = new Uint32Array(64);
  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
      const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new ArrayBuffer(32);
  const outView = new DataView(out);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, idx) => outView.setUint32(idx * 4, v, false));
  return out;
}

function base64urlencode(a: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(a)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export default function SpotifyTab({
  settings,
  spotifyPlaying,
  spotifyVolume = 0.8,
  spotifyConnected = false,
  spotifyDeviceName = 'CinemaBooth Projector',
  spotifyTrack,
  spotifyArtist,
  onRefreshSettings,
}: SpotifyTabProps) {
  const [clientId, setClientId] = useState(settings.spotify_client_id || '');
  const [deviceName, setDeviceName] = useState(
    settings.spotify_device_name || spotifyDeviceName || 'CinemaBooth Projector'
  );
  const [manualAccessToken, setManualAccessToken] = useState('');
  const [manualRefreshToken, setManualRefreshToken] = useState('');
  const [hasStoredToken, setHasStoredToken] = useState<boolean>(false);

  const [localVolume, setLocalVolume] = useState<number>(
    typeof spotifyVolume === 'number'
      ? spotifyVolume
      : parseFloat(settings.spotify_volume || '0.8') || 0.8
  );

  const [autoPause, setAutoPause] = useState(settings.spotify_auto_pause !== 'false');
  const [autoResume, setAutoResume] = useState(settings.spotify_auto_resume !== 'false');
  const [preshowMode, setPreshowMode] = useState(settings.preshow_music_mode || 'spotify');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Custom audio file upload state
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof spotifyVolume === 'number') {
      setLocalVolume(spotifyVolume);
    }
  }, [spotifyVolume]);

  useEffect(() => {
    if (settings.preshow_music_mode) {
      setPreshowMode(settings.preshow_music_mode);
    }
    if (settings.spotify_client_id) {
      setClientId(settings.spotify_client_id);
    }
    if (settings.spotify_device_name) {
      setDeviceName(settings.spotify_device_name);
    }
  }, [settings.preshow_music_mode, settings.spotify_client_id, settings.spotify_device_name]);

  // Check if server already has a valid Spotify token stored in SQLite
  useEffect(() => {
    fetchSpotifyToken()
      .then((res) => {
        setHasStoredToken(Boolean(res?.hasToken));
      })
      .catch(() => {});
  }, []);

  // Handle OAuth PKCE redirect callback (?code=...) if returning from Spotify authorization
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const verifier = sessionStorage.getItem('spotify_pkce_verifier');
    const savedClientId = sessionStorage.getItem('spotify_pkce_client_id') || clientId;

    if (code && verifier && savedClientId) {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      saveSpotifyToken({
        code,
        codeVerifier: verifier,
        redirectUri,
        clientId: savedClientId,
        deviceName,
      })
        .then((res) => {
          sessionStorage.removeItem('spotify_pkce_verifier');
          window.history.replaceState({}, document.title, window.location.pathname);
          if (res?.success) {
            setHasStoredToken(true);
            setSavedMessage(
              'Spotify account linked to SQLite! Headless Spotify on the Projector Screen is now ready.'
            );
            onRefreshSettings();
          }
        })
        .catch((err) => {
          console.error('Spotify PKCE exchange error:', err);
        });
    }
  }, []);

  // Toggle Spotify On / Off
  const handleToggleSpotifyOnOff = async () => {
    const nextAction = spotifyPlaying ? 'pause' : 'play';
    await controlSpotify(nextAction);
  };

  // Change Spotify Volume (0.0 - 1.0)
  const handleVolumeChange = async (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setLocalVolume(clamped);
    await controlSpotify('volume', undefined, undefined, clamped);
  };

  const handleSelectMode = async (mode: string) => {
    setPreshowMode(mode);
    setSaving(true);
    try {
      if (mode === 'spotify') {
        preshowAudio.stop();
      }
      await saveSettings({
        spotify_client_id: clientId,
        spotify_device_name: deviceName,
        spotify_auto_pause: autoPause ? 'true' : 'false',
        spotify_auto_resume: autoResume ? 'true' : 'false',
        preshow_music_mode: mode,
      });

      setSavedMessage(`Walk-in audio source updated to: ${mode.toUpperCase()}`);
      setTimeout(() => setSavedMessage(null), 4000);
      onRefreshSettings();
    } catch (e: any) {
      console.error('Error saving audio mode:', e);
    } finally {
      setSaving(false);
    }
  };

  // Start 1-Click Spotify OAuth PKCE flow from Phone, Tablet, or Chromebook
  const handleStartSpotifyOAuth = async () => {
    if (!clientId.trim()) {
      setSavedMessage('Please enter your Spotify Client ID first.');
      return;
    }
    const verifier = generateRandomString(64);
    const hashed = await sha256(verifier);
    const challenge = base64urlencode(hashed);
    const redirectUri = `${window.location.origin}${window.location.pathname}`;

    sessionStorage.setItem('spotify_pkce_verifier', verifier);
    sessionStorage.setItem('spotify_pkce_client_id', clientId.trim());

    await saveSettings({
      spotify_client_id: clientId.trim(),
      spotify_device_name: deviceName.trim() || 'CinemaBooth Projector',
    });

    const scope =
      'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId.trim());
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('redirect_uri', redirectUri);

    window.location.href = authUrl.toString();
  };

  // Save manual access/refresh tokens or device name to SQLite
  const handleSaveSpotifyCredentials = async () => {
    setSaving(true);
    try {
      await saveSettings({
        spotify_client_id: clientId.trim(),
        spotify_device_name: deviceName.trim() || 'CinemaBooth Projector',
        spotify_auto_pause: autoPause ? 'true' : 'false',
        spotify_auto_resume: autoResume ? 'true' : 'false',
        preshow_music_mode: preshowMode,
      });

      if (manualAccessToken.trim() || manualRefreshToken.trim()) {
        await saveSpotifyToken({
          clientId: clientId.trim(),
          deviceName: deviceName.trim() || 'CinemaBooth Projector',
          accessToken: manualAccessToken.trim() || undefined,
          refreshToken: manualRefreshToken.trim() || undefined,
        });
        setHasStoredToken(true);
        setManualAccessToken('');
        setManualRefreshToken('');
      } else {
        await saveSpotifyToken({
          clientId: clientId.trim(),
          deviceName: deviceName.trim() || 'CinemaBooth Projector',
        });
      }

      setSavedMessage(
        'Saved to SQLite database! The Projector Screen headless Spotify player has been updated.'
      );
      setTimeout(() => setSavedMessage(null), 5000);
      onRefreshSettings();
    } catch (err: any) {
      console.error('Failed to save Spotify settings:', err);
    } finally {
      setSaving(false);
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
      console.error('Audio upload failed:', err);
    } finally {
      setUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. HEADLESS SPOTIFY MASTER ON/OFF & VOLUME CONTROLLER (Optimized for Phone / Tablet / Chromebook) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-emerald-500/10 via-cyan-500/5 to-transparent pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Status & Active Track from Phone Spotify Connect */}
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                spotifyPlaying && preshowMode !== 'none'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-500/30'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              <Music className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider border ${
                    spotifyPlaying
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <Radio
                    className={`w-3 h-3 ${
                      spotifyPlaying ? 'text-emerald-600 animate-pulse' : 'text-slate-400'
                    }`}
                  />
                  {spotifyPlaying ? 'SPOTIFY ON (PLAYING)' : 'SPOTIFY OFF (PAUSED)'}
                </span>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                    spotifyConnected
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : hasStoredToken
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                >
                  <Tv className="w-3 h-3" />
                  {spotifyConnected
                    ? `Projector Connected: ${deviceName}`
                    : hasStoredToken
                    ? `Ready for Projector Screen (${deviceName})`
                    : 'Token Not Linked Yet'}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                {spotifyTrack || 'Select Playlist on Your Phone Spotify App'}
              </h3>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {spotifyArtist ||
                    `Use native Spotify app on your phone → Connect to "${deviceName}"`}
                </span>
              </p>
            </div>
          </div>

          {/* Primary ON / OFF Button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleToggleSpotifyOnOff}
              className={`w-full md:w-auto min-h-[56px] px-8 py-3.5 rounded-2xl font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-md active:scale-95 cursor-pointer ${
                spotifyPlaying
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                  : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20'
              }`}
            >
              <Power className="w-5 h-5" />
              <span>{spotifyPlaying ? 'Spotify: ON (Click to Turn Off)' : 'Spotify: OFF (Click to Turn On)'}</span>
            </button>
          </div>
        </div>

        {/* DEDICATED SPOTIFY VOLUME CONTROL */}
        <div className="mt-6 pt-6 border-t border-slate-200/90">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <button
                type="button"
                onClick={() => handleVolumeChange(localVolume > 0 ? 0 : 0.8)}
                className="min-h-[46px] min-w-[46px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title={localVolume === 0 ? 'Unmute Spotify' : 'Mute Spotify'}
              >
                {localVolume === 0 ? (
                  <VolumeX className="w-5 h-5 text-rose-500" />
                ) : (
                  <Volume2 className="w-5 h-5 text-emerald-600" />
                )}
              </button>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Projector Screen Spotify Volume</span>
                  <span className="font-mono text-sm font-extrabold text-emerald-700">
                    {Math.round(localVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={localVolume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  aria-label="Spotify Volume"
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
              </div>
            </div>

            {/* Quick Volume Presets for Phone/Tablet */}
            <div className="flex items-center gap-1.5 shrink-0">
              {[0.25, 0.5, 0.75, 1.0].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleVolumeChange(preset)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                    Math.abs(localVolume - preset) < 0.03
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {Math.round(preset * 100)}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Architecture Info Banner */}
        <div className="mt-5 p-4 bg-emerald-50/70 rounded-xl border border-emerald-200/80 text-xs text-emerald-950 flex items-start gap-3">
          <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-extrabold text-emerald-900">
              Headless Projector Screen Spotify Connect:
            </strong>{' '}
            Spotify runs invisibly inside your <strong>Projector Screen</strong> browser window (or via{' '}
            <code>spotifyd</code> / <code>librespot</code> on the Projector PC). Open the native{' '}
            <strong>Spotify app on your phone</strong> to pick any playlist or song and select{' '}
            <strong>{deviceName}</strong> under Spotify Connect devices. CinemaBooth automatically pauses Spotify when a movie or Karaoke starts, and resumes it when returning to Cinema pre-show.
          </div>
        </div>
      </div>

      {/* 2. HEADLESS SPOTIFY ACCOUNT SETUP (Persisted in Docker SQLite Database) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Headless Projector Spotify Connect Setup
              </h3>
              <p className="text-xs text-slate-500">
                Credentials are stored in the Docker SQLite database so the Projector Screen connects automatically without needing a keyboard.
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-lg text-xs font-bold border ${
              hasStoredToken
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {hasStoredToken ? 'Spotify Token Stored in DB' : 'No Token Stored'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Spotify Connect Speaker Name (Shown on Your Phone)
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="CinemaBooth Projector"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Spotify Developer Client ID (Optional for Native Linux Appliance)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Paste Spotify Client ID..."
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
              />
              <button
                type="button"
                onClick={handleStartSpotifyOAuth}
                className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-xs"
                title="Authorize with Spotify from your phone/tablet/Chromebook"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Link Spotify</span>
              </button>
            </div>
          </div>
        </div>

        {/* Exact Redirect URI Helper Box for Spotify Developer Dashboard */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="text-[11px] font-bold text-slate-700">
              Spotify Developer Redirect URI (Paste this exact URL in your Spotify App settings):
            </div>
            <code className="block text-xs font-mono font-bold text-emerald-700 truncate">
              {typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'http://127.0.0.1:3000/'}
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              const uri = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'http://127.0.0.1:3000/';
              navigator.clipboard.writeText(uri);
              setSavedMessage(`Copied Redirect URI: ${uri}`);
              setTimeout(() => setSavedMessage(null), 3000);
            }}
            className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
          >
            <Copy className="w-3.5 h-3.5 text-emerald-600" />
            <span>Copy Redirect URI</span>
          </button>
        </div>

        {/* Optional Direct Token Paste (if not using OAuth redirect) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Or Paste Spotify Access Token Directly (Optional)
            </label>
            <input
              type="password"
              value={manualAccessToken}
              onChange={(e) => setManualAccessToken(e.target.value)}
              placeholder={hasStoredToken ? '•••••••••••••••••••• (Stored in SQLite)' : 'Paste access token...'}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Spotify Refresh Token (Optional)
            </label>
            <input
              type="password"
              value={manualRefreshToken}
              onChange={(e) => setManualRefreshToken(e.target.value)}
              placeholder="Paste refresh token..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Automation Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={autoPause}
              onChange={(e) => setAutoPause(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-0 bg-white border-slate-300 accent-emerald-600"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">
                Auto-Pause Spotify when Movie / Karaoke Starts
              </span>
              <span className="text-slate-500 font-medium">
                Automatically turns Spotify OFF when a playlist or Karaoke starts.
              </span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={autoResume}
              onChange={(e) => setAutoResume(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-0 bg-white border-slate-300 accent-emerald-600"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">
                Auto-Resume Spotify on Stop / Return to Cinema
              </span>
              <span className="text-slate-500 font-medium">
                Automatically turns Spotify ON when returning to Cinema pre-show slides.
              </span>
            </div>
          </label>
        </div>

        {/* Save Button & Toast */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleSaveSpotifyCredentials}
            disabled={saving}
            className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4 text-emerald-300" />
            <span>{saving ? 'Saving to Database...' : 'Save Spotify Configuration'}</span>
          </button>

          {savedMessage && (
            <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-1.5 animate-fadeIn">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{savedMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. WALK-IN AUDIO SOURCE SELECTOR (Spotify Connect vs Local MP3/Intermission Fallback) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
          <Settings2 className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Pre-Show Audio Source on Projector Screen
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => handleSelectMode('spotify')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer ${
              preshowMode === 'spotify'
                ? 'bg-emerald-50/90 border-emerald-500 text-emerald-950 shadow-sm ring-2 ring-emerald-500/25'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="font-extrabold text-sm text-slate-900 flex items-center justify-between mb-1">
              <span className="flex items-center gap-2">
                <Music className="w-4 h-4 text-emerald-600" />
                Headless Spotify
              </span>
              {preshowMode === 'spotify' && (
                <span className="px-2 py-0.5 bg-emerald-600 text-white font-bold rounded-md text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 text-[11px]">
              Select playlists on your phone Spotify app; CinemaBooth controls On/Off &amp; Volume.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('custom_audio')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer ${
              preshowMode === 'custom_audio'
                ? 'bg-teal-50/90 border-teal-500 text-teal-950 shadow-sm ring-2 ring-teal-500/25'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="font-extrabold text-sm text-slate-900 flex items-center justify-between mb-1">
              <span className="flex items-center gap-2">
                <FileAudio className="w-4 h-4 text-teal-600" />
                Custom MP3/WAV
              </span>
              {preshowMode === 'custom_audio' && (
                <span className="px-2 py-0.5 bg-teal-600 text-white font-bold rounded-md text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 text-[11px]">
              Stream an uploaded MP3/WAV audio file from the Docker server to the Projector Screen.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('retro')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer ${
              preshowMode === 'retro' || preshowMode === 'ambient'
                ? 'bg-blue-50/90 border-blue-500 text-blue-950 shadow-sm ring-2 ring-blue-500/25'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="font-extrabold text-sm text-slate-900 flex items-center justify-between mb-1">
              <span className="flex items-center gap-2">
                <Disc className="w-4 h-4 text-blue-600" />
                Built-In Intermission
              </span>
              {(preshowMode === 'retro' || preshowMode === 'ambient') && (
                <span className="px-2 py-0.5 bg-blue-600 text-white font-bold rounded-md text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 text-[11px]">
              {WALK_IN_TRACKS.retro.title} on Projector Screen.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('none')}
            className={`p-4 rounded-2xl border text-left text-xs transition-all cursor-pointer ${
              preshowMode === 'none' || preshowMode === 'silent'
                ? 'bg-slate-200/90 border-slate-400 text-slate-900 shadow-sm'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="font-extrabold text-sm text-slate-900 flex items-center justify-between mb-1">
              <span className="flex items-center gap-2">
                <VolumeX className="w-4 h-4 text-slate-600" />
                Silent Standby
              </span>
              {(preshowMode === 'none' || preshowMode === 'silent') && (
                <span className="px-2 py-0.5 bg-slate-700 text-white font-bold rounded-md text-[10px]">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 text-[11px]">
              No walk-in audio during pre-show slides.
            </p>
          </button>
        </div>

        {preshowMode === 'custom_audio' && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">Uploaded Audio File:</span>
              <span className="text-slate-600 font-mono">
                {settings.preshow_audio_name || 'None uploaded yet'}
              </span>
            </div>
            <div>
              <input
                type="file"
                ref={audioInputRef}
                accept="audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac,audio/*"
                onChange={handleAudioUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingAudio}
                onClick={() => audioInputRef.current?.click()}
                className="min-h-[40px] px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>{uploadingAudio ? 'Uploading...' : 'Upload Audio File'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
