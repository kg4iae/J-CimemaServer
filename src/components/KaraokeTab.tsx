import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Maximize2,
  Shield,
  Film,
  CheckCircle2,
  Radio,
  Sparkles,
  VolumeX,
  Music,
  Presentation,
  ExternalLink,
} from 'lucide-react';
import { PlaybackState, TheaterSettings } from '../types/theater';
import { controlKaraoke } from '../services/api';
import { preshowAudio } from '../services/preshowAudio';

interface KaraokeTabProps {
  playback: PlaybackState;
  settings: TheaterSettings;
  onPlaybackUpdated: (state: PlaybackState) => void;
  onRefreshSettings: () => void;
}

export default function KaraokeTab({
  playback,
  settings,
  onPlaybackUpdated,
  onRefreshSettings,
}: KaraokeTabProps) {
  const initialCode = playback.karaokeCode || settings.karaoke_code || '';
  const [sessionCode, setSessionCode] = useState<string>(initialCode);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  useEffect(() => {
    const incoming = playback.karaokeCode ?? settings.karaoke_code ?? '';
    if (incoming && incoming !== sessionCode) {
      setSessionCode(incoming);
    }
  }, [playback.karaokeCode, settings.karaoke_code]);

  const cleanCode = sessionCode.trim().slice(0, 4);
  const presentationUrl = `https://k2.lazeria.com/p?code=${encodeURIComponent(cleanCode || 'xxxx')}`;
  const adminUrl = 'https://k2.lazeria.com/admin';
  const isKaraokeActive = Boolean(playback.karaokeActive);

  const handleCodeChange = async (val: string) => {
    const trimmed = val.replace(/\s+/g, '').slice(0, 4);
    setSessionCode(trimmed);
    try {
      const res = await controlKaraoke('set_code', trimmed);
      if (res?.playbackState) {
        onPlaybackUpdated(res.playbackState);
      }
    } catch (err) {
      console.error('Failed to save karaoke code:', err);
    }
  };

  // Switch to Karaoke mode: stop any cinema playback, pre-show slides, and Spotify audio
  const handleStartKaraoke = async () => {
    setIsBusy(true);
    try {
      // Immediately silence browser walk-in audio
      preshowAudio.syncState({
        isPlaylistPlaying: true,
        spotifyPlaying: false,
        volume: playback.volume,
        isMuted: true,
        preshowMusicMode: settings.preshow_music_mode,
        customAudioUrl: settings.preshow_audio_url,
      });

      const res = await controlKaraoke('start', cleanCode);
      if (res?.playbackState) {
        onPlaybackUpdated(res.playbackState);
      }
      onRefreshSettings();
      setStatusMessage(
        `Switched to Karaoke Mode (Code: ${cleanCode || '----'}). Cinema playback, Pre-Show Slides, and Spotify stopped.`
      );
    } catch (err) {
      console.error('Failed to start Karaoke mode:', err);
    } finally {
      setIsBusy(false);
    }
  };

  // Switch back to Cinema mode: mute microphone, start pre-show slides and Spotify audio
  const handleSwitchToCinemaMode = async () => {
    setIsBusy(true);
    try {
      // Also mute/stop any active browser microphone streams if opened locally
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false;
            track.stop();
          });
        } catch {
          // Ignore if no browser mic permission was granted
        }
      }

      const res = await controlKaraoke('cinema', cleanCode);
      if (res?.playbackState) {
        onPlaybackUpdated(res.playbackState);
      }

      // Immediately resume Pre-Show Walk-In Audio in browser if applicable
      preshowAudio.syncState({
        isPlaylistPlaying: false,
        spotifyPlaying: true,
        volume: playback.volume,
        isMuted: false,
        preshowMusicMode: settings.preshow_music_mode,
        customAudioUrl: settings.preshow_audio_url,
      });

      onRefreshSettings();
      setStatusMessage(
        'Switched back to Cinema Mode. Microphone muted, Pre-Show Slides started, and Spotify audio resumed.'
      );
    } catch (err) {
      console.error('Failed to switch to Cinema mode:', err);
    } finally {
      setIsBusy(false);
    }
  };

  // Redirect to Karaoke Admin Screen (https://k2.lazeria.com/admin)
  const handleOpenAdminRedirect = () => {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = adminUrl;
      } else {
        window.location.href = adminUrl;
      }
    } catch {
      window.location.href = adminUrl;
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER CARD */}
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                isKaraokeActive
                  ? 'bg-gradient-to-br from-fuchsia-600 to-purple-600 text-white shadow-fuchsia-500/20'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Mic className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  Karaoke Stage Integration
                </h2>
                <span
                  className={`px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md border ${
                    isKaraokeActive
                      ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {isKaraokeActive ? 'KARAOKE MODE ACTIVE' : 'CINEMA MODE ACTIVE'}
                </span>
                {playback.micMuted && !isKaraokeActive && (
                  <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                    <MicOff className="w-3 h-3" />
                    Mic Muted
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter your 4-character Lazeria Karaoke session code, launch the Karaoke Presentation Screen, or switch back to Cinema Pre-Show mode.
              </p>
            </div>
          </div>

          {/* Quick Mode Switch Pill */}
          <div className="flex items-center gap-2 shrink-0">
            {isKaraokeActive ? (
              <button
                onClick={handleSwitchToCinemaMode}
                disabled={isBusy}
                className="min-h-[42px] px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-50"
              >
                <Film className="w-4 h-4" />
                <span>Switch Back to Cinema Mode</span>
              </button>
            ) : (
              <div className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>Cinema Pre-Show / Deck Ready</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Toast Banner */}
        {statusMessage && (
          <div className="mt-4 p-3.5 rounded-xl bg-slate-900 text-white text-xs font-medium flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-[11px] font-mono uppercase tracking-wider cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* MAIN CONTROLS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. SESSION CODE & PRESENTATION SCREEN LAUNCHER */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-600" />
                <span>1. Karaoke Session Code & Presentation</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">4-Character Code</span>
            </div>

            <div>
              <label
                htmlFor="karaoke-code-input"
                className="block text-xs font-semibold text-slate-700 mb-2"
              >
                Enter 4-Character Session Code
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="karaoke-code-input"
                  type="text"
                  maxLength={4}
                  value={sessionCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="XXXX"
                  className="w-40 px-4 py-3 text-center text-2xl font-mono font-black tracking-[0.35em] text-slate-900 bg-slate-50 border-2 border-slate-300 rounded-xl focus:outline-none focus:border-fuchsia-600 focus:bg-white transition-all uppercase placeholder:text-slate-300"
                />
                <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Presentation Target URL
                  </div>
                  <div className="text-xs font-mono text-slate-700 truncate mt-0.5">
                    {presentationUrl}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-fuchsia-50/70 border border-fuchsia-200/80 text-xs text-fuchsia-950 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <VolumeX className="w-3.5 h-3.5 text-fuchsia-700" />
                <span>Automatic Transition on Karaoke Start:</span>
              </div>
              <p className="text-fuchsia-800/90 text-[11px] leading-relaxed">
                Opening the Karaoke Presentation Page automatically stops any active movie playback, pauses the Pre-Show Slideshow, stops Spotify & walk-in audio, and unmutes the stage microphone.
              </p>
            </div>
          </div>

          {/* Open Presentation Page Button (Works the same way as "Projector Screen") */}
          <div className="pt-2 space-y-2.5">
            <a
              href={presentationUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                handleStartKaraoke();
              }}
              className="w-full min-h-[48px] px-5 py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 active:scale-[0.99] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 shadow-md shadow-fuchsia-600/25 transition-all cursor-pointer"
              title="Stop cinema playback/Spotify and open Karaoke Presentation Screen"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Open Karaoke Presentation Page</span>
              {cleanCode && (
                <span className="ml-1 px-2 py-0.5 bg-white/20 rounded text-xs font-mono">
                  ?code={cleanCode}
                </span>
              )}
            </a>

            <button
              type="button"
              onClick={handleStartKaraoke}
              disabled={isBusy}
              className="w-full min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Presentation className="w-3.5 h-3.5 text-fuchsia-600" />
              <span>Project Karaoke on Existing Projector Screen Window</span>
            </button>
          </div>
        </div>

        {/* 2. KARAOKE ADMIN & RETURN TO CINEMA MODE */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>2. Karaoke Admin & Cinema Mode Switch</span>
            </h3>

            {/* Karaoke Admin Screen Card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900">Karaoke Admin Screen</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Redirects directly to <span className="font-mono text-slate-700">{adminUrl}</span> to manage singers, song queue, and session codes.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenAdminRedirect}
                className="w-full min-h-[44px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                <span>Open Karaoke Admin Screen (Redirect)</span>
              </button>
            </div>

            {/* Switch Back to Cinema Mode Card */}
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/90 space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-emerald-700" />
                  <span>Return to Cinema Mode Automation</span>
                </div>
                <ul className="text-[11px] text-emerald-800 space-y-1 list-disc list-inside">
                  <li>
                    <strong>Mutes the Microphone</strong> on the host system & browser
                  </li>
                  <li>
                    <strong>Starts Pre-Show Slides</strong> on the Projector Screen
                  </li>
                  <li>
                    <strong>Starts Spotify Audio</strong> & walk-in music automatically
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={handleSwitchToCinemaMode}
                disabled={isBusy}
                className="w-full min-h-[48px] px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 shadow-md shadow-emerald-600/25 transition-all cursor-pointer disabled:opacity-50"
              >
                <MicOff className="w-4 h-4" />
                <Music className="w-4 h-4" />
                <span>Switch Back to Cinema Mode</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
