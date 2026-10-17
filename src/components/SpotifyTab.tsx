import React, { useState, useRef } from 'react';
import {
  Music,
  Play,
  Pause,
  Disc3,
  Settings2,
  Check,
  Radio,
  Volume2,
  Sparkles,
  Upload,
  FileAudio,
  VolumeX,
  Info,
} from 'lucide-react';
import { TheaterSettings } from '../types/theater';
import { controlSpotify, saveSettings, uploadPreshowAudio } from '../services/api';
import { preshowAudio } from '../services/preshowAudio';

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

  // Custom audio file upload state
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Local audio preview state on remote
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const handleSaveSpotifyConfig = async (overrideMode?: string) => {
    setSaving(true);
    try {
      const mode = overrideMode || preshowMode;
      await saveSettings({
        spotify_client_id: clientId,
        spotify_playlist_uri: playlistUri,
        spotify_auto_pause: autoPause ? 'true' : 'false',
        spotify_auto_resume: autoResume ? 'true' : 'false',
        preshow_music_mode: mode,
      });
      setSavedMessage('Walk-in audio settings saved successfully.');
      setTimeout(() => setSavedMessage(null), 4000);
      onRefreshSettings();
    } catch (e: any) {
      alert(`Error saving settings: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSpotify = async () => {
    const nextAction = spotifyPlaying ? 'pause' : 'play';
    const track = settings.preshow_audio_name || 'Cinema Paradiso Overture (Ambient Walk-in)';
    await controlSpotify(
      nextAction,
      track,
      preshowMode === 'custom_audio' ? 'Local Media File' : 'Grand Cinema Ensemble'
    );
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
        setSavedMessage(`Uploaded: ${res.name}`);
        setTimeout(() => setSavedMessage(null), 4000);
        onRefreshSettings();
      }
    } catch (err: any) {
      alert(`Audio upload failed: ${err.message}`);
    } finally {
      setUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  // Toggle local speaker test preview
  const handleTogglePreview = () => {
    if (isPreviewPlaying) {
      preshowAudio.stop();
      setIsPreviewPlaying(false);
    } else {
      preshowAudio.unlockAudio().then(() => {
        preshowAudio.syncState({
          isPlaylistPlaying: false,
          spotifyPlaying: true,
          volume: 1.0,
          isMuted: false,
          preshowMusicMode: preshowMode,
          customAudioUrl: settings.preshow_audio_url,
        });
        setIsPreviewPlaying(true);
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. WALK-IN LIVE AUDIO STATUS (Bright White / Slate / Green / Blue) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
        {/* Subtle decorative green/blue radial glow */}
        <div className="absolute top-0 right-0 w-72 h-36 bg-gradient-to-bl from-emerald-500/10 via-teal-500/5 to-transparent pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
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
                <span>{spotifyPlaying ? 'Pre-Show Walk-In Music Active' : 'Walk-In Music Standby'}</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                {preshowMode === 'custom_audio' && settings.preshow_audio_name
                  ? settings.preshow_audio_name
                  : (spotifyTrack || 'Cinema Paradiso Overture (Ambient Walk-in)')}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {preshowMode === 'custom_audio' ? 'Custom Uploaded Audio File' : (spotifyArtist || 'Grand Cinema Ensemble')} · Pre-Show Auditorium Atmosphere
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

            {/* Test Audio Button */}
            <button
              onClick={handleTogglePreview}
              title="Test audio output on this device"
              className={`min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all active:scale-95 ${
                isPreviewPlaying
                  ? 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20 shadow-sm'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {isPreviewPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
              <span>{isPreviewPlaying ? 'Stop Speaker Test' : 'Test Audio'}</span>
            </button>

            {/* Primary Toggle Walk-in Music */}
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
                  <span>Pause Walk-In Music</span>
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

        {/* Windows Browser Autoplay Tip */}
        <div className="mt-5 p-4 bg-blue-50/80 rounded-xl border border-blue-200 text-xs text-blue-950 flex items-start gap-3 shadow-2xs">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-extrabold text-blue-900">Where Does Pre-Show Audio Play?</strong>
            <p className="mt-0.5 text-blue-800">
              Walk-in music plays continuously through the <strong>Projector Screen window</strong> (which outputs to your theater receiver or projector HDMI audio) while pre-show slides are looping.
            </p>
            <p className="mt-1 text-slate-600 text-[11px]">
              Tip: When Windows starts the projector window, click anywhere on the projector screen once (or press F11 for fullscreen). This unlocks the browser audio policy so background music can stream unmuted.
            </p>
          </div>
        </div>
      </div>

      {/* 2. AUDIO SOURCE SELECTION & UPLOAD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">
              Walk-In Music Source &amp; Automation
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono font-medium">Theater Sound System</span>
        </div>

        {/* 3 Source Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Mode 1: Built-in Cinema Ambient Overture */}
          <button
            type="button"
            onClick={() => {
              setPreshowMode('ambient');
              handleSaveSpotifyConfig('ambient');
            }}
            className={`p-4 rounded-xl border text-left text-xs transition-all cursor-pointer ${
              preshowMode === 'ambient'
                ? 'bg-blue-50/90 border-blue-400 text-blue-950 shadow-xs ring-1 ring-blue-400/40'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="font-extrabold text-sm text-slate-900 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Built-in Cinema Overture</span>
            </div>
            <div className="text-slate-500 font-medium leading-relaxed">
              Synthesizes lush orchestral theater chords and ambient cinematic string pads. 100% offline.
            </div>
          </button>

          {/* Mode 2: Custom Audio File Upload */}
          <button
            type="button"
            onClick={() => {
              setPreshowMode('custom_audio');
              handleSaveSpotifyConfig('custom_audio');
            }}
            className={`p-4 rounded-xl border text-left text-xs transition-all cursor-pointer ${
              preshowMode === 'custom_audio'
                ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 shadow-xs ring-1 ring-emerald-400/40'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="font-extrabold text-sm text-slate-900 mb-1 flex items-center gap-1.5">
              <FileAudio className="w-4 h-4 text-emerald-600" />
              <span>Custom Audio File (MP3/WAV)</span>
            </div>
            <div className="text-slate-500 font-medium leading-relaxed">
              Upload your own theater walk-in playlist, retro cinema jingle, or intermission audio track.
            </div>
          </button>

          {/* Mode 3: Spotify Connect */}
          <button
            type="button"
            onClick={() => {
              setPreshowMode('spotify');
              handleSaveSpotifyConfig('spotify');
            }}
            className={`p-4 rounded-xl border text-left text-xs transition-all cursor-pointer ${
              preshowMode === 'spotify'
                ? 'bg-teal-50/90 border-teal-400 text-teal-950 shadow-xs ring-1 ring-teal-400/40'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="font-extrabold text-sm text-slate-900 mb-1 flex items-center gap-1.5">
              <Music className="w-4 h-4 text-teal-600" />
              <span>Spotify Integration</span>
            </div>
            <div className="text-slate-500 font-medium leading-relaxed">
              Connect Spotify to auto-pause Spotify when movies start and auto-resume on credits.
            </div>
          </button>
        </div>

        {/* Custom Audio Upload Box (Visible when custom_audio is selected) */}
        {preshowMode === 'custom_audio' && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Active Pre-Show Audio Track:
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  {settings.preshow_audio_name ? (
                    <span className="font-mono text-emerald-700 font-bold">
                      {settings.preshow_audio_name}
                    </span>
                  ) : (
                    'No custom audio file uploaded yet. Click upload below to choose an MP3 or WAV.'
                  )}
                </span>
              </div>

              <div>
                <input
                  type="file"
                  ref={audioInputRef}
                  accept="audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac,audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                  id="preshow-audio-upload"
                />
                <button
                  type="button"
                  disabled={uploadingAudio}
                  onClick={() => audioInputRef.current?.click()}
                  className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>{uploadingAudio ? 'Uploading Audio...' : 'Upload Walk-In Audio (.mp3, .wav)'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Spotify Fields (Visible when Spotify mode selected) */}
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

        {/* Automation Toggles */}
        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={autoPause}
              onChange={(e) => setAutoPause(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0 bg-white border-slate-300 accent-blue-600"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">Auto-stop Walk-in Music when Playlist Plays</span>
              <span className="text-slate-500 font-medium">Smoothly fades/pauses music immediately when the movie starts.</span>
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
              <span className="font-bold text-slate-900 block">Auto-restart Walk-in Music at End of Playlist</span>
              <span className="text-slate-500 font-medium">Resumes walk-out music when credits finish or Stop is pressed.</span>
            </div>
          </label>
        </div>

        {/* Save CTA */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => handleSaveSpotifyConfig()}
            disabled={saving}
            className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4 text-emerald-300" />
            <span>{saving ? 'Saving...' : 'Save Audio Settings'}</span>
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
