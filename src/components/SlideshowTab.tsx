import React, { useState, useRef } from 'react';
import { Presentation, Plus, Trash2, Upload, Clock, Check, Eye, Image as ImageIcon } from 'lucide-react';
import { Slideshow, SlideshowSlide } from '../types/theater';
import { saveSlideshow, deleteSlideshow, uploadSlide, deleteSlide, setActiveSlideshow } from '../services/api';

interface SlideshowTabProps {
  slideshows: Slideshow[];
  activeSlideshowId?: string;
  onRefresh: () => void;
}

export default function SlideshowTab({
  slideshows,
  activeSlideshowId,
  onRefresh,
}: SlideshowTabProps) {
  const [selectedShowId, setSelectedShowId] = useState<string>(activeSlideshowId || slideshows[0]?.id || '');
  const [isUploading, setIsUploading] = useState(false);
  const [previewSlide, setPreviewSlide] = useState<SlideshowSlide | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [durationInput, setDurationInput] = useState<number>(15);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentShow = slideshows.find((s) => s.id === selectedShowId) || slideshows[0];

  const handleCreateNewShow = async () => {
    const title = `Pre-Show Slideshow ${slideshows.length + 1}`;
    const res = await saveSlideshow({
      title,
      description: 'Rotating JPG pre-show slides played in alpha-numeric order before the feature.',
      slide_duration: 15.0,
    });
    setStatusMsg(`Created new slideshow: ${title}`);
    setTimeout(() => setStatusMsg(null), 3000);
    onRefresh();
    if (res?.id) setSelectedShowId(res.id);
  };

  const handleSaveDetails = async () => {
    if (!currentShow) return;
    await saveSlideshow({
      id: currentShow.id,
      title: titleInput || currentShow.title,
      description: descInput,
      slide_duration: Number(durationInput) || 15.0,
    });
    setEditingTitle(false);
    setStatusMsg('Slideshow details updated.');
    setTimeout(() => setStatusMsg(null), 3000);
    onRefresh();
  };

  const handleUploadSlides = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentShow || !e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    setStatusMsg(`Uploading ${files.length} slide image(s)...`);

    try {
      for (const file of files) {
        await uploadSlide(currentShow.id, file, file.name);
      }
      setStatusMsg(`Successfully uploaded and indexed ${files.length} slide(s) in alpha-numeric sequence!`);
      onRefresh();
    } catch (err: any) {
      alert(`Slide upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const handleDeleteSlide = async (slideId: string) => {
    if (!currentShow) return;
    await deleteSlide(currentShow.id, slideId);
    onRefresh();
  };

  const handleDeleteShow = async (showId: string) => {
    if (confirm('Delete this entire slideshow and its slide library?')) {
      await deleteSlideshow(showId);
      onRefresh();
    }
  };

  const handleSetActive = async (showId: string) => {
    await setActiveSlideshow(showId);
    setStatusMsg('Active pre-show slideshow updated for the Live Deck and Projector.');
    setTimeout(() => setStatusMsg(null), 3000);
    onRefresh();
  };

  const slides = currentShow?.slides || [];

  return (
    <div className="space-y-6">
      {/* 1. SLIDESHOW SELECTOR BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-200/90 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {slideshows.map((ss) => {
            const isSelected = ss.id === currentShow?.id;
            const isActivePreshow = ss.id === activeSlideshowId;
            return (
              <button
                key={ss.id}
                onClick={() => setSelectedShowId(ss.id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{ss.title}</span>
                {isActivePreshow && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                    Active Pre-Show
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCreateNewShow}
          className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 shadow-sm shadow-blue-500/20"
        >
          <Plus className="w-4 h-4 text-emerald-300" />
          <span>New Slideshow</span>
        </button>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium">
          {statusMsg}
        </div>
      )}

      {currentShow && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-6 shadow-sm">
          {/* 2. SLIDESHOW HEADER & TIMING CONFIG */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="flex-1 min-w-[280px]">
              {editingTitle ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Slideshow Title"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold text-lg focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="text"
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    placeholder="Description / Audience notes"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700 text-xs focus:outline-none focus:border-blue-600"
                  />
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-700 font-semibold">Duration per Slide (Seconds):</label>
                    <input
                      type="number"
                      min={3}
                      max={120}
                      value={durationInput}
                      onChange={(e) => setDurationInput(Number(e.target.value))}
                      className="w-24 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1 text-slate-900 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDetails}
                      className="px-3.5 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-2xs"
                    >
                      <Check className="w-3.5 h-3.5" /> Save Configuration
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
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      <Presentation className="w-6 h-6 text-blue-600" />
                      {currentShow.title}
                    </h2>
                    <button
                      onClick={() => {
                        setTitleInput(currentShow.title);
                        setDescInput(currentShow.description || '');
                        setDurationInput(currentShow.slide_duration || 15);
                        setEditingTitle(true);
                      }}
                      className="text-slate-400 hover:text-blue-600 p-1"
                      title="Edit slideshow details"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    {currentShow.description || 'Pre-show slide rotation loop'}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-600 font-mono font-medium tabular-nums">
                    <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      {currentShow.slide_duration || 15}s per slide
                    </span>
                    <span>·</span>
                    <span>{slides.length} JPG Slides (Alpha-numeric sequence)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions for this Slideshow */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleSetActive(currentShow.id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  currentShow.id === activeSlideshowId
                    ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>{currentShow.id === activeSlideshowId ? 'Selected on Live Deck' : 'Set as Active Pre-Show'}</span>
              </button>

              {slideshows.length > 1 && (
                <button
                  onClick={() => handleDeleteShow(currentShow.id)}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 flex items-center justify-center transition-colors"
                  title="Delete slideshow"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 3. SLIDES LIST & ALPHA-NUMERIC ORDERING */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">
              <span>Slides in Alpha-Numeric Order (Loops until Playlist starts)</span>
              <span>Sequence Key</span>
            </div>

            {slides.length === 0 ? (
              <div className="p-10 text-center border border-dashed border-slate-300 rounded-xl text-slate-500 text-sm space-y-2">
                <ImageIcon className="w-8 h-8 mx-auto text-slate-400" />
                <p className="text-slate-800 font-bold">No slides uploaded yet</p>
                <p className="text-xs text-slate-500">
                  Upload JPG files named like <code>slide_01_welcome.jpg</code>, <code>slide_02_concessions.jpg</code>. They will automatically play in alpha-numeric order!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {slides.map((slide, idx) => (
                  <div
                    key={slide.id}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden group hover:border-blue-400 transition-colors flex flex-col shadow-2xs"
                  >
                    {/* Thumbnail Image */}
                    <div className="aspect-video bg-slate-900 relative flex items-center justify-center overflow-hidden">
                      <img
                        src={slide.file_path}
                        alt={slide.caption || slide.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/assets/theater_logo.svg';
                        }}
                      />
                      <span className="absolute top-2 left-2 bg-slate-950/80 text-white font-mono text-[11px] px-2 py-0.5 rounded font-bold">
                        #{idx + 1}
                      </span>
                      <button
                        onClick={() => setPreviewSlide(slide)}
                        className="absolute bottom-2 right-2 p-1.5 bg-black/70 hover:bg-blue-600 text-white rounded-lg transition-colors"
                        title="Preview slide"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Details */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="text-xs font-mono text-blue-700 font-bold truncate">
                          {slide.alpha_key || slide.filename}
                        </div>
                        <div className="text-xs text-slate-700 font-medium truncate mt-0.5">
                          {slide.caption || slide.filename}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <span className="font-medium">Duration: {currentShow.slide_duration || 15}s</span>
                        <button
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                          title="Remove slide"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. UPLOAD SLIDES BUTTON */}
          <div className="pt-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadSlides}
              accept="image/jpeg,image/png,image/svg+xml,.jpg,.jpeg,.png,.svg"
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="min-h-[46px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Uploading Slides...' : '+ Upload Pre-Show Slide JPG Images'}</span>
            </button>
            <span className="text-[11px] text-slate-500 block mt-2 font-medium">
              Tip: Name your files with prefixes like <code>01_intro.jpg</code>, <code>02_trivia.jpg</code> to maintain your desired alphanumeric order.
            </span>
          </div>
        </div>
      )}

      {/* 5. PREVIEW MODAL */}
      {previewSlide && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {previewSlide.caption || previewSlide.filename}
                </h3>
                <span className="text-xs font-mono text-blue-600 font-semibold">
                  Alphanumeric Key: {previewSlide.alpha_key} · Duration: {currentShow?.slide_duration || 15}s
                </span>
              </div>
              <button
                onClick={() => setPreviewSlide(null)}
                className="text-slate-600 hover:text-slate-900 text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-200">
              <img
                src={previewSlide.file_path}
                alt={previewSlide.caption}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
