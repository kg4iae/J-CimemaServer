import React, { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, Disc3, Settings2, Check, Radio, Volume2 } from 'lucide-react';
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
      // note: audio context requires user gesture on browser
    } else {
      stopAmbientSynth();
    }
    return () => {
      stopAmbientSynth();
    };
  }, [spotifyPlaying, preshowMode]);

  return (
    <div className="space-y-6">
      {/* 1. WALK-IN LIVE AUDIO STATUS */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                spotifyPlaying
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Music className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-emerald-400 flex items-center gap-2">
                <Radio className={`w-3.5 h-3.5 ${spotifyPlaying ? 'animate-pulse' : ''}`} />
                <span>{spotifyPlaying ? 'Preshow Walk-In Music Active' : 'Walk-In Music Paused'}</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">
                {spotifyTrack || 'Cinema Paradiso Overture (Ambient Walk-in)'}
              </h3>
              <p className="text-xs text-slate-400">
                {spotifyArtist || 'Grand Cinema Ensemble'} · Before-Show Walk-In Program
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleSpotify}
            className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
              spotifyPlaying
                ? 'bg-slate-800 hover:bg-slate-700 text-white'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
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

        {/* Behavior Notice */}
        <div className="mt-5 p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
          <Disc3 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-white">Automated Theater Transition:</strong> When you click <strong className="text-amber-400">&quot;Play Event&quot;</strong> in the Live Deck, this music automatically pauses. When the movie ends or <strong className="text-red-400">&quot;Stop&quot;</strong> is pressed, music resumes automatically for the audience exit.
          </p>
        </div>
      </div>

      {/* 2. AUTOMATION SETTINGS & SPOTIFY WEB API CONFIGURATION */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-white">
              Preshow Music &amp; Spotify Integration Settings
            </h3>
          </div>
          <span className="text-xs text-slate-400">Windows Media PC Local Hook</span>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={autoPause}
              onChange={(e) => setAutoPause(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 focus:ring-0 bg-slate-800 border-slate-700 accent-amber-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-white block">Auto-stop Spotify when Playlist Plays</span>
              <span className="text-slate-400">Fades/pauses music instantly when presentation video begins.</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={autoResume}
              onChange={(e) => setAutoResume(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 focus:ring-0 bg-slate-800 border-slate-700 accent-amber-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-white block">Auto-restart Spotify at End of Playlist</span>
              <span className="text-slate-400">Resumes walk-out music when credits finish or Stop is pressed.</span>
            </div>
          </label>
        </div>

        {/* Preshow Source Selector */}
        <div className="pt-2">
          <label className="block text-xs font-semibold text-white mb-2">
            Walk-in Music Source
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPreshowMode('ambient')}
              className={`p-3.5 rounded-xl border text-left text-xs transition-all ${
                preshowMode === 'ambient'
                  ? 'bg-amber-500/10 border-amber-500/50 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-bold text-sm text-white mb-0.5">Built-in Cinema Overtures (Offline)</div>
              <div className="text-slate-400">
                Plays high-fidelity orchestral &amp; jazz walk-in music. Zero account credentials required.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPreshowMode('spotify')}
              className={`p-3.5 rounded-xl border text-left text-xs transition-all ${
                preshowMode === 'spotify'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-bold text-sm text-white mb-0.5">Spotify Connect / Web Player</div>
              <div className="text-slate-400">
                Streams your custom Spotify playlists directly to the theater sound system.
              </div>
            </button>
          </div>
        </div>

        {/* Spotify Credentials Fields */}
        {preshowMode === 'spotify' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-900 rounded-xl border border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Spotify Client ID (Developer Dashboard)
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="e.g. 4a2b9..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Spotify Playlist URI or Link
              </label>
              <input
                type="text"
                value={playlistUri}
                onChange={(e) => setPlaylistUri(e.target.value)}
                placeholder="spotify:playlist:37i9dQZF1DXdgnBRuh640I"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleSaveSpotifyConfig}
            disabled={saving}
            className="min-h-[44px] px-5 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Music Settings'}</span>
          </button>

          {savedMessage && (
            <span className="text-xs text-emerald-400 font-medium">{savedMessage}</span>
          )}
        </div>
      </div>
    </div>
  );
}
