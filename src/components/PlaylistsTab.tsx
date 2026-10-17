import React, { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Film, Zap, Clock, Check, Edit2, GripVertical, ChevronsUp, ChevronsDown, CheckCircle2 } from 'lucide-react';
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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [reorderFeedback, setReorderFeedback] = useState<string | null>(null);

  const currentPlaylist = playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];

  const handleCreateNewPlaylist = async () => {
    const newTitle = `New Theater Rundown ${playlists.length + 1}`;
    await onSavePlaylist({
      title: newTitle,
      description: 'Custom theatrical program with automation cues and video presentations.',
      items: [],
    });
  };

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (!currentPlaylist || !currentPlaylist.items) return;
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= currentPlaylist.items.length) return;
    const items = [...currentPlaylist.items];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);

    // re-index sort_order
    items.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });

    setReorderFeedback(`Repositioned "${moved.title}" to #${toIndex + 1}`);
    setTimeout(() => setReorderFeedback(null), 3000);

    await onSavePlaylist({
      ...currentPlaylist,
      items,
    });
  };

  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    await handleReorder(index, targetIndex);
  };

  const handleMoveToTop = async (index: number) => {
    await handleReorder(index, 0);
  };

  const handleMoveToBottom = async (index: number) => {
    if (!currentPlaylist?.items) return;
    await handleReorder(index, currentPlaylist.items.length - 1);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      await handleReorder(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
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
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-200/90 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {playlists.map((pl) => {
            const isSelected = pl.id === currentPlaylist?.id;
            const isDeckActive = pl.id === activePlaylistId;
            return (
              <button
                key={pl.id}
                onClick={() => setSelectedPlaylistId(pl.id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{pl.title}</span>
                {isDeckActive && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                    Live
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCreateNewPlaylist}
          className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 shadow-sm shadow-blue-500/20"
        >
          <Plus className="w-4 h-4 text-emerald-300" />
          <span>New Playlist</span>
        </button>
      </div>

      {currentPlaylist && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-6 shadow-sm">
          {/* 2. PLAYLIST HEADER & EDIT */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="flex-1 min-w-[280px]">
              {editingTitle ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Playlist Title"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold text-lg focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="text"
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    placeholder="Brief description or program notes"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700 text-xs focus:outline-none focus:border-blue-600"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDetails}
                      className="px-3.5 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-2xs"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      onClick={() => setEditingTitle(false)}
                      className="px-3.5 py-1.5 bg-slate-200 text-slate-700 text-xs rounded-lg hover:bg-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {currentPlaylist.title}
                    </h2>
                    <button
                      onClick={() => {
                        setTitleInput(currentPlaylist.title);
                        setDescInput(currentPlaylist.description || '');
                        setEditingTitle(true);
                      }}
                      className="text-slate-400 hover:text-blue-600 p-1"
                      title="Edit playlist title"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    {currentPlaylist.description || 'No description provided'}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-600 font-mono font-medium tabular-nums">
                    <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                      <Clock className="w-3.5 h-3.5" />
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
                    ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20'
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
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 flex items-center justify-center transition-colors"
                  title="Delete playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 3. ITEMS LIST & REORDERING */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">
              <span>Program Sequence (Drag or use arrows to reorder)</span>
              <span>Reorder / Actions</span>
            </div>

            {/* Reorder feedback toast */}
            {reorderFeedback && (
              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{reorderFeedback}</span>
              </div>
            )}

            {(!currentPlaylist.items || currentPlaylist.items.length === 0) ? (
              <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl text-slate-500 text-sm">
                This playlist has no items yet. Add video clips from your media library or automation cues below.
              </div>
            ) : (
              currentPlaylist.items.map((item, idx) => {
                const isDragging = draggedIndex === idx;
                const isDragOver = dragOverIndex === idx && draggedIndex !== idx;

                return (
                  <div
                    key={item.id || idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-3.5 rounded-xl border text-slate-900 transition-all ${
                      isDragging
                        ? 'opacity-40 bg-blue-50 border-dashed border-blue-400 scale-[0.99]'
                        : isDragOver
                        ? 'border-blue-500 bg-blue-50/70 shadow-md ring-2 ring-blue-500/30'
                        : 'bg-slate-50/90 border-slate-200 hover:border-blue-300 hover:bg-white shadow-2xs'
                    }`}
                  >
                    {/* Drag Handle */}
                    <div
                      className="text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing p-1 shrink-0"
                      title="Drag to reorder event"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {/* Sequence Number & Position Selector Dropdown */}
                    <div className="relative shrink-0">
                      <select
                        value={idx + 1}
                        onChange={(e) => {
                          const newPos = parseInt(e.target.value, 10) - 1;
                          handleReorder(idx, newPos);
                        }}
                        title={`Currently position #${idx + 1}. Click to jump to another position.`}
                        className="w-8 h-7 text-center font-mono text-xs text-slate-700 font-bold bg-white border border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pl-1.5"
                      >
                        {currentPlaylist.items.map((_, pIdx) => (
                          <option key={pIdx} value={pIdx + 1}>
                            {pIdx + 1}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Type Icon */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.item_type === 'cue'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {item.item_type === 'cue' ? <Zap className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate text-slate-900">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {item.item_type === 'cue' ? (
                          <span className="text-emerald-700 font-semibold">
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
                    <div className="font-mono text-xs font-semibold tabular-nums text-slate-600 px-2 shrink-0 hidden sm:block">
                      {item.item_type === 'cue' ? 'Instant' : formatDuration(item.duration)}
                    </div>

                    {/* Comprehensive Reorder Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Move to Top */}
                      <button
                        type="button"
                        onClick={() => handleMoveToTop(idx)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-20 transition-opacity shadow-2xs cursor-pointer"
                        title="Move to top of playlist (First)"
                      >
                        <ChevronsUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Move Up */}
                      <button
                        type="button"
                        onClick={() => handleMoveItem(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-20 transition-opacity shadow-2xs cursor-pointer"
                        title="Move up one position"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Move Down */}
                      <button
                        type="button"
                        onClick={() => handleMoveItem(idx, 'down')}
                        disabled={idx === (currentPlaylist.items?.length || 0) - 1}
                        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-20 transition-opacity shadow-2xs cursor-pointer"
                        title="Move down one position"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Move to Bottom */}
                      <button
                        type="button"
                        onClick={() => handleMoveToBottom(idx)}
                        disabled={idx === (currentPlaylist.items?.length || 0) - 1}
                        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-20 transition-opacity shadow-2xs cursor-pointer"
                        title="Move to bottom of playlist (Last)"
                      >
                        <ChevronsDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition-colors shadow-2xs cursor-pointer ml-1"
                        title="Remove event from playlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 4. INSERT BUTTONS */}
          <div className="flex flex-wrap gap-3 pt-3">
            <button
              onClick={() => setShowAddModal('media')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-2 transition-all shadow-2xs"
            >
              <Film className="w-4 h-4 text-blue-600" />
              <span>+ Insert Video / Feature</span>
            </button>

            <button
              onClick={() => setShowAddModal('cue')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-2 transition-all shadow-2xs"
            >
              <Zap className="w-4 h-4 text-emerald-600" />
              <span>+ Insert Automation Cue (Lighting/Curtain)</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. ADD MEDIA MODAL */}
      {showAddModal === 'media' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Film className="w-5 h-5 text-blue-600" /> Insert Video from Library
              </h3>
              <button
                onClick={() => setShowAddModal(null)}
                className="text-slate-500 hover:text-slate-900 text-xs font-semibold px-2 py-1 bg-slate-100 rounded-lg"
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
                    className="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition-colors flex items-center justify-between shadow-2xs"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">{m.title}</div>
                      <div className="text-xs text-slate-500 font-medium">
                        {m.resolution} · {m.format?.toUpperCase()} · {formatDuration(m.duration)}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-blue-600">Add →</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. ADD CUE MODAL */}
      {showAddModal === 'cue' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-600" /> Insert Automation Cue
              </h3>
              <button
                onClick={() => setShowAddModal(null)}
                className="text-slate-500 hover:text-slate-900 text-xs font-semibold px-2 py-1 bg-slate-100 rounded-lg"
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
                    className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl cursor-pointer transition-colors flex items-center justify-between shadow-2xs"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">{cue.name}</div>
                      <div className="text-xs text-emerald-700 font-medium">
                        {cue.cue_type === 'home_assistant'
                          ? `Home Assistant: ${cue.service} (${cue.entity_id})`
                          : `Webhook`}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-600">Insert →</span>
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
