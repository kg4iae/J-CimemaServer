import { Play, Pause, Square, SkipBack, SkipForward, Volume2, VolumeX, Music, Zap, Clock, Film, Presentation } from 'lucide-react';
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

  // Calculate entire playlist remaining time:
  // (current item remaining time) + (all subsequent items durations)
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
      {/* 0. PRE-SHOW SLIDESHOW SELECTOR BAR */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Presentation className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-300">
              Pre-Show Slideshow (Standby Projection)
            </div>
            <div className="text-[11px] text-slate-500">
              {playback.isPlaying
                ? 'Presentation in progress (Slideshow paused)'
                : `${selectedShow?.slides?.length || 0} slides · ${selectedShow?.slide_duration || 15}s rotation · Repeating until Play`}
            </div>
          </div>
        </div>

        {/* The Live Deck Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="preshow-select" className="text-xs text-slate-400 hidden sm:inline">
            Active Pre-Show:
          </label>
          <select
            id="preshow-select"
            value={currentShowId}
            onChange={(e) => onSelectSlideshow && onSelectSlideshow(e.target.value)}
            className="min-h-[42px] bg-slate-900 border border-slate-700 hover:border-amber-500/60 rounded-xl px-3 py-2 text-xs font-semibold text-amber-400 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
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

      {/* 1. HERO NOW PLAYING CARD */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Subtle ambient amber glow when playing */}
        <div
          className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl transition-opacity duration-1000 pointer-events-none ${
            playback.isPlaying ? 'bg-amber-500/10 opacity-100' : 'bg-blue-500/5 opacity-40'
          }`}
        />

        {/* Header line: Playlist Name & Cue Status */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="text-sm font-medium text-slate-300">
              Active Playlist: <span className="text-white font-semibold">{activePlaylist?.title || 'None Selected'}</span>
            </h2>
          </div>

          {/* Spotify & Preshow indicator */}
          <div className="flex items-center gap-2 text-xs">
            <Music className={`w-3.5 h-3.5 ${playback.spotifyPlaying ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span className={playback.spotifyPlaying ? 'text-emerald-300 font-medium' : 'text-slate-500'}>
              {playback.spotifyPlaying ? 'Preshow Audio Active' : 'Audio Muted for Feature'}
            </span>
          </div>
        </div>

        {/* Main Item Display */}
        <div className="my-3">
          <div className="text-xs uppercase tracking-widest text-amber-400/90 font-medium mb-1">
            Now on Screen (Item {items.length > 0 ? currentIndex + 1 : 0} of {items.length})
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug">
            {currentItem?.title || 'Ready for Presentation'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {currentItem?.item_type === 'cue'
              ? `Automation Cue · ${currentItem.cue_name || 'Home Assistant Action'}`
              : `Local Video · ${currentItem?.resolution || '4K/1080p'} · ${currentItem?.format?.toUpperCase() || 'MP4'}`}
          </p>
        </div>

        {/* 2. DUAL TIME REMAINING CLOCKS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-5 p-3.5 bg-slate-900/80 rounded-xl border border-slate-800/80">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Item Time Elapsed</div>
            <div className="text-xl sm:text-2xl font-mono tabular-nums font-semibold text-slate-100">
              {formatTime(playback.currentTime)}
            </div>
            <div className="text-[10px] text-slate-500">
              Duration: {formatTime(currentItemDuration)}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400 font-medium">Item Remaining</div>
            <div className="text-xl sm:text-2xl font-mono tabular-nums font-semibold text-amber-400">
              -{formatTime(itemRemaining)}
            </div>
            <div className="text-[10px] text-slate-500">
              {progressPercent.toFixed(0)}% Complete
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-emerald-400" />
              <span>Playlist Time Left</span>
            </div>
            <div className="text-xl sm:text-2xl font-mono tabular-nums font-bold text-emerald-400">
              {formatTime(remainingPlaylistTime)}
            </div>
            <div className="text-[10px] text-slate-500">
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
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none"
          />
          <div className="flex justify-between text-[11px] text-slate-400 font-mono tabular-nums">
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
            className="min-h-[48px] min-w-[48px] px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* STOP */}
          <button
            onClick={() => onControl('stop')}
            aria-label="Stop Event"
            className="min-h-[48px] min-w-[56px] px-4 rounded-xl bg-red-950/40 hover:bg-red-900/60 active:scale-95 text-red-300 border border-red-800/40 flex items-center justify-center gap-2 font-medium text-xs transition-all"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>Stop</span>
          </button>

          {/* PLAY / PAUSE PRIMARY HERO CTA */}
          <button
            onClick={() => onControl(playback.isPlaying ? 'pause' : 'play')}
            aria-label={playback.isPlaying ? 'Pause Presentation' : 'Play Presentation'}
            className="min-h-[54px] min-w-[130px] px-6 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all text-sm uppercase tracking-wide"
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
            className="min-h-[48px] min-w-[48px] px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* 5. VOLUME FADER */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center gap-4 max-w-md mx-auto">
          <button
            onClick={() => onControl('mute')}
            aria-label={playback.isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="min-h-[44px] min-w-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 flex items-center justify-center text-slate-300 shrink-0"
          >
            {playback.isMuted || playback.volume === 0 ? (
              <VolumeX className="w-5 h-5 text-red-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-amber-400" />
            )}
          </button>

          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Auditorium Volume</span>
              <span className="font-mono font-medium text-slate-200">
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
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>
      </div>

      {/* 6. UP NEXT PLAYLIST TIMELINE QUEUE */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white tracking-tight">
            Playlist Event Rundown
          </h3>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
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
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-amber-500/10 border border-amber-500/40 text-white'
                      : isPast
                      ? 'bg-slate-900/40 text-slate-500 opacity-60 hover:opacity-100 hover:bg-slate-900'
                      : 'bg-slate-900/70 text-slate-300 hover:bg-slate-900 hover:text-white border border-transparent'
                  }`}
                >
                  {/* Index / Type indicator */}
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-semibold shrink-0 ${
                      isCurrent
                        ? 'bg-amber-500 text-slate-950'
                        : it.item_type === 'cue'
                        ? 'bg-blue-900/40 text-blue-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {it.item_type === 'cue' ? <Zap className="w-3.5 h-3.5" /> : idx + 1}
                  </div>

                  {/* Item Title & Details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      <span>{it.title}</span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded">
                          Playing Now
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {it.item_type === 'cue' ? (
                        <span className="text-blue-300">Automation Trigger ({it.cue_service || 'Home Assistant'})</span>
                      ) : (
                        <span>Duration: {formatTime(it.duration)}</span>
                      )}
                    </div>
                  </div>

                  {/* Duration Pill / Time */}
                  <div className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
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
