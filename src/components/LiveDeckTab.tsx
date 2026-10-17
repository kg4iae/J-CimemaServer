import React from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music,
  Zap,
  Clock,
  Film,
  Presentation,
} from 'lucide-react';
import { PlaybackState, Playlist, PlaylistItem, Slideshow } from '../types/theater';

interface LiveDeckTabProps {
  playback: PlaybackState;
  activePlaylist?: Playlist;
  currentItem?: PlaylistItem | null;
  slideshows?: Slideshow[];
  activeSlideshowId?: string;
  onControl: (action: string, value?: any) => void;
  onSelectItem: (index: number) => void;
  onSelectSlideshow?: (id: string) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function LiveDeckTab({
  playback,
  activePlaylist,
  currentItem,
  slideshows = [],
  activeSlideshowId,
  onControl,
  onSelectItem,
  onSelectSlideshow,
}: LiveDeckTabProps) {
  const items = activePlaylist?.items || [];
  const currentIndex = playback.currentItemIndex;

  // Selected slideshow
  const currentShowId = playback.activeSlideshowId || activeSlideshowId || slideshows[0]?.id || '';
  const selectedShow = slideshows.find((s) => s.id === currentShowId);

  // Calculate remaining time for current item
  const currentItemDuration = currentItem?.duration || playback.duration || 0;
  const itemRemaining = Math.max(0, currentItemDuration - playback.currentTime);

  // Calculate entire playlist remaining time
  const remainingPlaylistTime = items.reduce((acc, it, idx) => {
    if (idx === currentIndex) {
      return acc + itemRemaining;
    } else if (idx > currentIndex) {
      return acc + (Number(it.duration) || 0);
    }
    return acc;
  }, 0);

  const totalPlaylistDuration = items.reduce((acc, it) => acc + (Number(it.duration) || 0), 0);

  const progressPercent = currentItemDuration > 0
    ? Math.min(100, (playback.currentTime / currentItemDuration) * 100)
    : 0;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onControl('seek', val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onControl('volume', val);
  };

  return (
    <div className="space-y-6">
      {/* 0. PRE-SHOW SLIDESHOW SELECTOR BAR (Bright / Emerald / Slate) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <Presentation className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">
              Pre-Show Slideshow (Standby Projection)
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {playback.isPlaying
                ? 'Presentation active on screen (Slideshow auto-paused)'
                : `${selectedShow?.slides?.length || 0} JPG slides · ${selectedShow?.slide_duration || 15}s rotation · Loops in alpha-numeric order`}
            </div>
          </div>
        </div>

        {/* Live Deck Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="preshow-select" className="text-xs font-semibold text-slate-700 hidden sm:inline">
            Active Pre-Show:
          </label>
          <select
            id="preshow-select"
            value={currentShowId}
            onChange={(e) => onSelectSlideshow && onSelectSlideshow(e.target.value)}
            className="min-h-[42px] bg-slate-50 border border-slate-300 hover:border-blue-500 rounded-xl px-3.5 py-2 text-xs font-semibold text-blue-700 focus:outline-none focus:border-blue-600 transition-colors cursor-pointer shadow-2xs"
          >
            {slideshows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.slides?.length || 0} slides · {s.slide_duration || 15}s)
              </option>
            ))}
            <option value="none">None (Theater Standby Logo Only)</option>
          </select>
        </div>
      </div>

      {/* 1. HERO NOW PLAYING CARD (Bright White / Blue / Green Accents) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
        {/* Subtle decorative blue/emerald mesh glow */}
        <div
          className={`absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl transition-opacity duration-1000 pointer-events-none ${
            playback.isPlaying ? 'bg-emerald-500/10 opacity-100' : 'bg-blue-500/10 opacity-60'
          }`}
        />

        {/* Header line: Playlist Name & Cue Status */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Active Playlist: <span className="text-slate-900 font-bold normal-case text-sm">{activePlaylist?.title || 'None Selected'}</span>
            </h2>
          </div>

          {/* Spotify & Preshow indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200/80 text-xs">
            <Music className={`w-3.5 h-3.5 ${playback.spotifyPlaying ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
            <span className={playback.spotifyPlaying ? 'text-emerald-800 font-semibold' : 'text-slate-500 font-medium'}>
              {playback.spotifyPlaying ? 'Preshow Audio Active' : 'Audio Muted for Feature'}
            </span>
          </div>
        </div>

        {/* Main Item Display */}
        <div className="my-3">
          <div className="text-xs uppercase tracking-widest text-blue-600 font-bold mb-1">
            Now on Screen (Item {items.length > 0 ? currentIndex + 1 : 0} of {items.length})
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
            {currentItem?.title || 'Ready for Presentation'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {currentItem?.item_type === 'cue'
              ? `Automation Cue · ${currentItem.cue_name || 'Home Assistant Action'}`
              : `Local Video · ${currentItem?.resolution || '1080p'} · ${currentItem?.format?.toUpperCase() || 'MP4'}`}
          </p>
        </div>

        {/* 2. DUAL TIME REMAINING CLOCKS (Bright White, Crisp Cobalt Blue & Emerald Green) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-5">
          <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Item Time Elapsed</div>
            <div className="text-2xl font-mono tabular-nums font-extrabold text-slate-900 mt-0.5">
              {formatTime(playback.currentTime)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
              Duration: {formatTime(currentItemDuration)}
            </div>
          </div>

          <div className="p-4 bg-gradient-to-br from-blue-50/90 to-white border border-blue-200/90 rounded-2xl shadow-2xs">
            <div className="text-[11px] text-blue-700 font-bold uppercase tracking-wider">Item Remaining</div>
            <div className="text-2xl font-mono tabular-nums font-extrabold text-blue-600 mt-0.5">
              -{formatTime(itemRemaining)}
            </div>
            <div className="text-[11px] text-blue-600/80 mt-0.5 font-semibold">
              {progressPercent.toFixed(0)}% Complete
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 p-4 bg-gradient-to-br from-emerald-50/90 to-white border border-emerald-200/90 rounded-2xl shadow-2xs">
            <div className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Playlist Time Left</span>
            </div>
            <div className="text-2xl font-mono tabular-nums font-extrabold text-emerald-600 mt-0.5">
              {formatTime(remainingPlaylistTime)}
            </div>
            <div className="text-[11px] text-emerald-700/80 mt-0.5 font-semibold">
              Total Event: {formatTime(totalPlaylistDuration)}
            </div>
          </div>
        </div>

        {/* 3. SCRUBBER SLIDER */}
        <div className="space-y-1.5 my-4">
          <input
            type="range"
            min={0}
            max={currentItemDuration || 100}
            step={0.5}
            value={playback.currentTime}
            onChange={handleSeekChange}
            aria-label="Video Seek Bar"
            className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
          />
          <div className="flex justify-between text-xs text-slate-600 font-mono font-medium tabular-nums">
            <span>{formatTime(playback.currentTime)}</span>
            <span>{formatTime(currentItemDuration)}</span>
          </div>
        </div>

        {/* 4. MASTER TRANSPORT CONTROLS (Ergonomic 48px+ hitboxes for phone/tablet) */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2">
          {/* Previous */}
          <button
            onClick={() => onControl('prev')}
            disabled={currentIndex === 0}
            aria-label="Previous Item"
            className="min-h-[48px] min-w-[48px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-2xs"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* STOP */}
          <button
            onClick={() => onControl('stop')}
            aria-label="Stop Event"
            className="min-h-[48px] min-w-[64px] px-4 rounded-xl bg-slate-100 hover:bg-rose-50 active:scale-95 text-slate-700 hover:text-rose-600 border border-slate-200 flex items-center justify-center gap-2 font-bold text-xs transition-all shadow-2xs"
          >
            <Square className="w-4 h-4 fill-current text-rose-500" />
            <span>Stop</span>
          </button>

          {/* PLAY / PAUSE PRIMARY HERO CTA */}
          <button
            onClick={() => onControl(playback.isPlaying ? 'pause' : 'play')}
            aria-label={playback.isPlaying ? 'Pause Presentation' : 'Play Presentation'}
            className={`min-h-[54px] min-w-[145px] px-6 rounded-xl font-extrabold flex items-center justify-center gap-2 shadow-md transition-all text-sm uppercase tracking-wide active:scale-95 text-white ${
              playback.isPlaying
                ? 'bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 shadow-blue-600/25'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/25'
            }`}
          >
            {playback.isPlaying ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Play Event</span>
              </>
            )}
          </button>

          {/* Next */}
          <button
            onClick={() => onControl('next')}
            disabled={currentIndex >= items.length - 1}
            aria-label="Next Item"
            className="min-h-[48px] min-w-[48px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-2xs"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* 5. VOLUME FADER */}
        <div className="mt-6 pt-5 border-t border-slate-200 flex items-center gap-4 max-w-md mx-auto">
          <button
            onClick={() => onControl('mute')}
            aria-label={playback.isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0"
          >
            {playback.isMuted || playback.volume === 0 ? (
              <VolumeX className="w-5 h-5 text-rose-500" />
            ) : (
              <Volume2 className="w-5 h-5 text-blue-600" />
            )}
          </button>

          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-xs text-slate-600 font-semibold">
              <span>Auditorium Volume</span>
              <span className="font-mono text-slate-900 font-bold">
                {playback.isMuted ? 'MUTED' : `${Math.round(playback.volume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playback.isMuted ? 0 : playback.volume}
              onChange={handleVolumeChange}
              aria-label="Volume Level"
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>
      </div>

      {/* 6. UP NEXT PLAYLIST TIMELINE QUEUE */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            Playlist Event Rundown
          </h3>
          <span className="text-xs text-slate-500 font-mono font-medium tabular-nums">
            {items.length} items · {formatTime(totalPlaylistDuration)} total
          </span>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No items in active playlist. Select or create one in the Playlists tab.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it, idx) => {
              const isCurrent = idx === currentIndex;
              const isPast = idx < currentIndex;
              return (
                <div
                  key={it.id || idx}
                  onClick={() => onSelectItem(idx)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-blue-50 border border-blue-300 text-slate-900 shadow-xs'
                      : isPast
                      ? 'bg-slate-50 text-slate-400 opacity-60 hover:opacity-100 hover:bg-slate-100'
                      : 'bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-slate-200/70'
                  }`}
                >
                  {/* Index / Type indicator */}
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : it.item_type === 'cue'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {it.item_type === 'cue' ? <Zap className="w-3.5 h-3.5 text-emerald-700" /> : idx + 1}
                  </div>

                  {/* Item Title & Details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-2">
                      <span className={isCurrent ? 'text-blue-950' : 'text-slate-900'}>{it.title}</span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-700 bg-blue-100/90 border border-blue-200 px-2 py-0.5 rounded">
                          Playing Now
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {it.item_type === 'cue' ? (
                        <span className="text-emerald-700 font-semibold">Automation Trigger ({it.cue_service || 'Home Assistant'})</span>
                      ) : (
                        <span>Duration: {formatTime(it.duration)}</span>
                      )}
                    </div>
                  </div>

                  {/* Duration Pill / Time */}
                  <div className="text-xs font-mono font-semibold tabular-nums text-slate-600 shrink-0">
                    {formatTime(it.duration)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
