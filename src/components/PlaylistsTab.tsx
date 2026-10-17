import React, { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Film, Zap, Clock, Check, Edit2, ListPlus } from 'lucide-react';
import { Playlist, PlaylistItem, MediaItem, AutomationCue } from '../types/theater';

interface PlaylistsTabProps {
  playlists: Playlist[];
  mediaList: MediaItem[];
  cues: AutomationCue[];
  activePlaylistId: string;
  onSelectActivePlaylist: (id: string) => void;
  onSavePlaylist: (pl: Partial<Playlist>) => Promise<void>;
  onDeletePlaylist: (id: string) => Promise<void>;
}

function formatDuration(sec: number): string {
  if (isNaN(sec) || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h > 0) {
    return `${h}h ${remM.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  }
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export default function PlaylistsTab({
  playlists,
  mediaList,
  cues,
  activePlaylistId,
  onSelectActivePlaylist,
  onSavePlaylist,
  onDeletePlaylist,
}: PlaylistsTabProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(activePlaylistId || playlists[0]?.id || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [showAddModal, setShowAddModal] = useState<'media' | 'cue' | null>(null);

  const currentPlaylist = playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];

  const handleCreateNewPlaylist = async () => {
    const newTitle = `New Theater Rundown ${playlists.length + 1}`;
    await onSavePlaylist({
      title: newTitle,
      description: 'Custom theatrical program with automation cues and video presentations.',
      items: [],
    });
  };

  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    if (!currentPlaylist || !currentPlaylist.items) return;
    const items = [...currentPlaylist.items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    // re-index sort_order
    items.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });

    await onSavePlaylist({
      ...currentPlaylist,
      items,
    });
  };

  const handleRemoveItem = async (index: number) => {
    if (!currentPlaylist || !currentPlaylist.items) return;
    const items = currentPlaylist.items.filter((_, idx) => idx !== index);
    items.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });
    await onSavePlaylist({
      ...currentPlaylist,
      items,
    });
  };

  const handleAddMediaItem = async (media: MediaItem) => {
    if (!currentPlaylist) return;
    const newItem: PlaylistItem = {
      id: `pli_${Date.now()}`,
      playlist_id: currentPlaylist.id,
      sort_order: (currentPlaylist.items?.length || 0) + 1,
      item_type: 'media',
      title: media.title,
      media_id: media.id,
      cue_id: null,
      duration: media.duration || 120,
      cue_timing: 'before',
      resolution: media.resolution,
      format: media.format,
      file_path: media.file_path,
    };

    const items = [...(currentPlaylist.items || []), newItem];
    await onSavePlaylist({ ...currentPlaylist, items });
    setShowAddModal(null);
  };

  const handleAddCueItem = async (cue: AutomationCue) => {
    if (!currentPlaylist) return;
    const newItem: PlaylistItem = {
      id: `pli_${Date.now()}`,
      playlist_id: currentPlaylist.id,
      sort_order: (currentPlaylist.items?.length || 0) + 1,
      item_type: 'cue',
      title: `Cue: ${cue.name}`,
      media_id: null,
      cue_id: cue.id,
      duration: 0,
      cue_timing: 'before',
      cue_name: cue.name,
      cue_service: cue.service,
    };

    const items = [...(currentPlaylist.items || []), newItem];
    await onSavePlaylist({ ...currentPlaylist, items });
    setShowAddModal(null);
  };

  const handleSaveDetails = async () => {
    if (!currentPlaylist) return;
    await onSavePlaylist({
      ...currentPlaylist,
      title: titleInput || currentPlaylist.title,
      description: descInput,
    });
    setEditingTitle(false);
  };

  const totalRuntime = (currentPlaylist?.items || []).reduce((acc, it) => acc + (Number(it.duration) || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. PLAYLIST SELECTOR BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#141824] border border-slate-800 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {playlists.map((pl) => {
            const isSelected = pl.id === currentPlaylist?.id;
            const isDeckActive = pl.id === activePlaylistId;
            return (
              <button
                key={pl.id}
                onClick={() => setSelectedPlaylistId(pl.id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{pl.title}</span>
                {isDeckActive && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${isSelected ? 'bg-slate-950/20 text-slate-900' : 'bg-emerald-950 text-emerald-400'}`}>
                    Live
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCreateNewPlaylist}
          className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>New Playlist</span>
        </button>
      </div>

      {currentPlaylist && (
        <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 space-y-6">
          {/* 2. PLAYLIST HEADER & EDIT */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex-1 min-w-[280px]">
              {editingTitle ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Playlist Title"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-lg focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    placeholder="Brief description or program notes"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDetails}
                      className="px-3 py-1.5 bg-amber-500 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      onClick={() => setEditingTitle(false)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {currentPlaylist.title}
                    </h2>
                    <button
                      onClick={() => {
                        setTitleInput(currentPlaylist.title);
                        setDescInput(currentPlaylist.description || '');
                        setEditingTitle(true);
                      }}
                      className="text-slate-400 hover:text-white p-1"
                      title="Edit playlist title"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {currentPlaylist.description || 'No description provided'}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 font-mono tabular-nums">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      Runtime: {formatDuration(totalRuntime)}
                    </span>
                    <span>·</span>
                    <span>{currentPlaylist.items?.length || 0} Elements</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions for this Playlist */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onSelectActivePlaylist(currentPlaylist.id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  currentPlaylist.id === activePlaylistId
                    ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{currentPlaylist.id === activePlaylistId ? 'Loaded to Live Deck' : 'Load to Deck & Cue'}</span>
              </button>

              {playlists.length > 1 && (
                <button
                  onClick={() => {
                    if (confirm(`Delete playlist "${currentPlaylist.title}"?`)) {
                      onDeletePlaylist(currentPlaylist.id);
                    }
                  }}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors"
                  title="Delete playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 3. ITEMS LIST & REORDERING */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400 px-1">
              <span>Program Sequence (Order of Execution)</span>
              <span>Reorder / Actions</span>
            </div>

            {(!currentPlaylist.items || currentPlaylist.items.length === 0) ? (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                This playlist has no items yet. Add video clips from your media library or automation cues below.
              </div>
            ) : (
              currentPlaylist.items.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center gap-3 p-3 bg-slate-900/80 border border-slate-800/80 rounded-xl text-white hover:border-slate-700 transition-colors"
                >
                  {/* Sequence Number */}
                  <span className="w-6 text-center font-mono text-xs text-slate-500 font-semibold shrink-0">
                    {idx + 1}
                  </span>

                  {/* Type Icon */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.item_type === 'cue'
                        ? 'bg-blue-900/40 text-blue-400 border border-blue-800/40'
                        : 'bg-amber-950/40 text-amber-400 border border-amber-800/40'
                    }`}
                  >
                    {item.item_type === 'cue' ? <Zap className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate text-slate-100">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {item.item_type === 'cue' ? (
                        <span className="text-blue-300">
                          Automation Trigger ({item.cue_service || 'Home Assistant'})
                        </span>
                      ) : (
                        <span>
                          Video File · {item.resolution || '1080p'} · {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Duration Tag */}
                  <div className="font-mono text-xs tabular-nums text-slate-400 px-2 shrink-0">
                    {item.item_type === 'cue' ? 'Instant' : formatDuration(item.duration)}
                  </div>

                  {/* Reorder Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMoveItem(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-20 transition-opacity"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveItem(idx, 'down')}
                      disabled={idx === (currentPlaylist.items?.length || 0) - 1}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-20 transition-opacity"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 4. INSERT BUTTONS */}
          <div className="flex flex-wrap gap-3 pt-3">
            <button
              onClick={() => setShowAddModal('media')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all"
            >
              <Film className="w-4 h-4 text-amber-400" />
              <span>+ Insert Video / Feature</span>
            </button>

            <button
              onClick={() => setShowAddModal('cue')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all"
            >
              <Zap className="w-4 h-4 text-blue-400" />
              <span>+ Insert Automation Cue (Lighting/Curtain)</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. ADD MEDIA MODAL */}
      {showAddModal === 'media' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141824] border border-slate-800 rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Film className="w-5 h-5 text-amber-400" /> Insert Video from Library
              </h3>
              <button
                onClick={() => setShowAddModal(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            <div className="space-y-2">
              {mediaList.length === 0 ? (
                <div className="text-center p-6 text-sm text-slate-500">
                  No media items available. Ingest media in the Ingest tab first.
                </div>
              ) : (
                mediaList.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => handleAddMediaItem(m)}
                    className="p-3 bg-slate-900 hover:bg-amber-950/20 border border-slate-800 hover:border-amber-500/40 rounded-xl cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{m.title}</div>
                      <div className="text-xs text-slate-400">
                        {m.resolution} · {m.format?.toUpperCase()} · {formatDuration(m.duration)}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-amber-400">Add →</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. ADD CUE MODAL */}
      {showAddModal === 'cue' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141824] border border-slate-800 rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-400" /> Insert Automation Cue
              </h3>
              <button
                onClick={() => setShowAddModal(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            <div className="space-y-2">
              {cues.length === 0 ? (
                <div className="text-center p-6 text-sm text-slate-500">
                  No cues configured. Create one in the Automation Cues tab first.
                </div>
              ) : (
                cues.map((cue) => (
                  <div
                    key={cue.id}
                    onClick={() => handleAddCueItem(cue)}
                    className="p-3 bg-slate-900 hover:bg-blue-950/30 border border-slate-800 hover:border-blue-500/40 rounded-xl cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{cue.name}</div>
                      <div className="text-xs text-blue-300">
                        {cue.cue_type === 'home_assistant'
                          ? `Home Assistant: ${cue.service} (${cue.entity_id})`
                          : `Webhook`}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-blue-400">Insert →</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
