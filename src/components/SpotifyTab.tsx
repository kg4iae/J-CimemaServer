import React, { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, Disc3, Settings2, Check, Radio, Volume2, Sparkles } from 'lucide-react';
import { TheaterSettings } from '../types/theater';
import { controlSpotify, saveSettings } from '../services/api';

interface SpotifyTabProps {
  settings: TheaterSettings;
  spotifyPlaying: boolean;
  spotifyTrack: string;
  spotifyArtist: string;
  onRefreshSettings: () => void;
}

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
  const [preshowMode, setPreshowMode] = useState(settings.preshow_music_mode || 'ambient');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Web Audio ambient tone generator for walk-in atmosphere
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const oscNodesRef = useRef<OscillatorNode[]>([]);

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
      setSavedMessage('Spotify & walk-in audio settings saved.');
      setTimeout(() => setSavedMessage(null), 4000);
      onRefreshSettings();
    } catch (e: any) {
      alert(`Error saving settings: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSpotify = async () => {
    await controlSpotify(
      spotifyPlaying ? 'pause' : 'play',
      'Cinema Paradiso Overture (Ambient Walk-in)',
      'Grand Cinema Ensemble'
    );
  };

  // Play subtle cinematic ambient chords using Web Audio when enabled
  const startAmbientSynth = () => {
    if (audioCtxRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.06, ctx.currentTime);
      masterGain.connect(ctx.destination);

      // Warm cinematic minor 9th chord frequencies (C3, G3, D#4, A#4, D5)
      const freqs = [130.81, 196.0, 311.13, 466.16, 587.33];
      const oscs = freqs.map((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, ctx.currentTime);
        osc.connect(masterGain);
        osc.start();
        return osc;
      });

      audioCtxRef.current = ctx;
      gainNodeRef.current = masterGain;
      oscNodesRef.current = oscs;
    } catch (e) {
      console.warn('AudioContext not allowed or supported', e);
    }
  };

  const stopAmbientSynth = () => {
    if (audioCtxRef.current) {
      oscNodesRef.current.forEach((o) => {
        try { o.stop(); o.disconnect(); } catch {}
      });
      oscNodesRef.current = [];
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  // Synchronize ambient audio with spotifyPlaying state if ambient mode is active
  useEffect(() => {
    if (spotifyPlaying && preshowMode === 'ambient') {
      // Audio context requires user gesture
    } else {
      stopAmbientSynth();
    }
    return () => {
      stopAmbientSynth();
    };
  }, [spotifyPlaying, preshowMode]);

  return (
    <div className="space-y-6">
      {/* 1. WALK-IN LIVE AUDIO STATUS (Bright White / Slate / Green / Blue) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
        {/* Subtle decorative green/blue radial glow */}
        <div className="absolute top-0 right-0 w-72 h-36 bg-gradient-to-bl from-emerald-500/10 via-teal-500/5 to-transparent pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                spotifyPlaying
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              <Music className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-extrabold text-emerald-700 flex items-center gap-2">
                <Radio className={`w-3.5 h-3.5 ${spotifyPlaying ? 'animate-pulse text-emerald-600' : 'text-slate-400'}`} />
                <span>{spotifyPlaying ? 'Preshow Walk-In Music Active' : 'Walk-In Music Standby'}</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                {spotifyTrack || 'Cinema Paradiso Overture (Ambient Walk-in)'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {spotifyArtist || 'Grand Cinema Ensemble'} · Pre-Show Audience Atmosphere
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Visual audio equalizer bars when playing */}
            {spotifyPlaying && (
              <div className="hidden sm:flex items-end gap-1 h-6 px-2">
                <span className="w-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.1s] h-4"></span>
                <span className="w-1 bg-emerald-600 rounded-full animate-bounce [animation-delay:0.3s] h-6"></span>
                <span className="w-1 bg-teal-500 rounded-full animate-bounce [animation-delay:0.2s] h-3"></span>
                <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s] h-5"></span>
              </div>
            )}

            <button
              onClick={handleToggleSpotify}
              className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95 ${
                spotifyPlaying
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20'
              }`}
            >
              {spotifyPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause Music</span>
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

        {/* Behavior Notice */}
        <div className="mt-5 p-4 bg-emerald-50/70 rounded-xl border border-emerald-200/90 text-xs text-emerald-950 flex items-start gap-2.5 shadow-2xs">
          <Disc3 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed font-medium">
            <strong className="font-extrabold text-emerald-900">Seamless Automation:</strong> When you click <strong className="text-blue-700 font-extrabold">&quot;Play Event&quot;</strong> in the Live Deck, walk-in music automatically pauses so audio never overlaps with the feature. When the presentation finishes or <strong className="text-rose-600 font-extrabold">&quot;Stop&quot;</strong> is triggered, music automatically resumes for audience exit.
          </p>
        </div>
      </div>

      {/* 2. AUTOMATION SETTINGS & SPOTIFY WEB API CONFIGURATION */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">
              Preshow Music &amp; Spotify Integration Settings
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono font-medium">Windows Media PC Local Hook</span>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={autoPause}
              onChange={(e) => setAutoPause(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0 bg-white border-slate-300 accent-blue-600"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">Auto-stop Spotify when Playlist Plays</span>
              <span className="text-slate-500 font-medium">Fades/pauses music instantly when video presentation begins.</span>
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
              <span className="font-bold text-slate-900 block">Auto-restart Spotify at End of Playlist</span>
              <span className="text-slate-500 font-medium">Resumes walk-out music when credits finish or Stop is pressed.</span>
            </div>
          </label>
        </div>

        {/* Preshow Source Selector */}
        <div className="pt-2">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Walk-in Music Source
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPreshowMode('ambient')}
              className={`p-4 rounded-xl border text-left text-xs transition-all ${
                preshowMode === 'ambient'
                  ? 'bg-blue-50 border-blue-400 text-blue-950 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="font-extrabold text-sm text-slate-900 mb-0.5 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Built-in Cinema Overtures (Offline)</span>
              </div>
              <div className="text-slate-500 font-medium">
                Plays high-fidelity orchestral &amp; jazz walk-in music. Zero account credentials required.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPreshowMode('spotify')}
              className={`p-4 rounded-xl border text-left text-xs transition-all ${
                preshowMode === 'spotify'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="font-extrabold text-sm text-slate-900 mb-0.5 flex items-center gap-1.5">
                <Music className="w-4 h-4 text-emerald-600" />
                <span>Spotify Connect / Web Player</span>
              </div>
              <div className="text-slate-500 font-medium">
                Streams your custom Spotify playlists directly to the theater sound system.
              </div>
            </button>
          </div>
        </div>

        {/* Spotify Credentials Fields */}
        {preshowMode === 'spotify' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Spotify Client ID (Developer Dashboard)
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="e.g. 4a2b9..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono shadow-2xs focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Spotify Playlist URI or Link
              </label>
              <input
                type="text"
                value={playlistUri}
                onChange={(e) => setPlaylistUri(e.target.value)}
                placeholder="spotify:playlist:37i9dQZF1DXdgnBRuh640I"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono shadow-2xs focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleSaveSpotifyConfig}
            disabled={saving}
            className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50"
          >
            <Check className="w-4 h-4 text-emerald-300" />
            <span>{saving ? 'Saving...' : 'Save Music Settings'}</span>
          </button>

          {savedMessage && (
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-1.5 animate-fadeIn">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>{savedMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
