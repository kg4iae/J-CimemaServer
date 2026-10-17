import React, { useState, useRef } from 'react';
import {
  Upload,
  FolderSync,
  Film,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  Eye,
  Youtube,
  Download,
  Terminal,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { MediaItem } from '../types/theater';
import {
  uploadMedia,
  scanLocalMedia,
  triggerConversion,
  ingestYouTubeVideo,
  deleteMedia,
  rescanAllMedia,
} from '../services/api';

interface MediaIngestTabProps {
  mediaList: MediaItem[];
  ffmpegAvailable: boolean;
  ytdlpAvailable?: boolean;
  onRefresh: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return '--:--';
  const totalSec = Math.round(sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  }
  if (m > 0) {
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }
  return `${s}s`;
}

export default function MediaIngestTab({
  mediaList,
  ffmpegAvailable,
  ytdlpAvailable = true,
  onRefresh,
}: MediaIngestTabProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // yt-dlp inputs
  const [ytUrl, setYtUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [isYtDownloading, setIsYtDownloading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setStatusMessage('Scanning media folder: indexing new files & pruning deleted files...');
    try {
      const res = await scanLocalMedia();
      const parts = [];
      if (res.newFilesCount > 0) parts.push(`${res.newFilesCount} new file(s) registered`);
      if (res.prunedCount && res.prunedCount > 0) parts.push(`${res.prunedCount} deleted file(s) removed`);
      if (res.refreshedCount && res.refreshedCount > 0) parts.push(`${res.refreshedCount} runtime(s) updated`);
      
      const summary = parts.length > 0 ? parts.join(', ') : 'All files in sync! No deleted or missing items.';
      setStatusMessage(`Scan Complete: ${summary}`);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Scan failed: ${err.message}`);
    } finally {
      setIsScanning(false);
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  const handleRescanAll = async () => {
    setIsRefreshingAll(true);
    setStatusMessage('Probing FFprobe stream metadata for all files in library...');
    try {
      const res = await rescanAllMedia();
      setStatusMessage(`Verification complete! ${res.updatedCount} file(s) verified with exact runtimes, ${res.prunedCount} deleted items purged.`);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Metadata verification failed: ${err.message}`);
    } finally {
      setIsRefreshingAll(false);
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  const handleDeleteMedia = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"? This removes it from your theater library and deletes the file from disk.`)) {
      return;
    }

    try {
      await deleteMedia(id);
      setStatusMessage(`Deleted "${title}" successfully.`);
      onRefresh();
    } catch (err: any) {
      alert(`Could not delete media: ${err.message}`);
    } finally {
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(15);
    setStatusMessage(`Ingesting ${file.name} to local storage...`);

    try {
      const progressTimer = setInterval(() => {
        setUploadProgress((prev) => (prev ? Math.min(prev + 20, 90) : 30));
      }, 300);

      await uploadMedia(file);
      clearInterval(progressTimer);
      setUploadProgress(100);
      setStatusMessage(`Successfully ingested ${file.name} into theater media database!`);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Ingest failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleYtDlpIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) return;

    setIsYtDownloading(true);
    setStatusMessage(`Calling yt-dlp to download and convert: ${ytUrl}...`);
    try {
      await ingestYouTubeVideo(ytUrl.trim(), ytTitle.trim() || undefined);
      setStatusMessage('yt-dlp job started! Live progress is tracked in the table below.');
      setYtUrl('');
      setYtTitle('');
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`yt-dlp ingest error: ${err.message}`);
    } finally {
      setIsYtDownloading(false);
      setTimeout(() => setStatusMessage(null), 7000);
    }
  };

  const handleConvert = async (mediaId: string) => {
    setStatusMessage('Transcoding job queued. Processing stream with FFmpeg...');
    try {
      await triggerConversion(mediaId);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Conversion request failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP CONTROLS & LOCAL SCANNER */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-600" />
              Local Media Storage &amp; Ingestion Pipeline
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Store video files directly on your Windows media PC. Files are scanned, format-verified, and converted with FFmpeg for stutter-free projection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Scan local folder & prune button */}
            <button
              onClick={handleScan}
              disabled={isScanning || isRefreshingAll}
              className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-2xs cursor-pointer"
              title="Scan folder, discover new media, and prune deleted files"
            >
              <FolderSync className={`w-4 h-4 text-blue-600 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Syncing...' : 'Scan & Sync Media Folder'}</span>
            </button>

            {/* Force verify runtimes button */}
            <button
              onClick={handleRescanAll}
              disabled={isScanning || isRefreshingAll}
              className="min-h-[44px] px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-2xs cursor-pointer"
              title="Probes all video files with FFprobe to verify and fix exact runtimes"
            >
              <Sparkles className={`w-4 h-4 text-emerald-600 ${isRefreshingAll ? 'animate-spin' : ''}`} />
              <span>{isRefreshingAll ? 'Probing Runtimes...' : 'Verify All Runtimes'}</span>
            </button>

            {/* Ingest / Upload File button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="video/*,.mkv,.mp4,.mov,.avi,.webm,.ts"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Ingesting Video...' : 'Ingest Local File'}</span>
            </button>
          </div>
        </div>

        {/* System Capabilities Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <span className="font-bold text-slate-900">FFmpeg Engine:</span>
            {ffmpegAvailable ? (
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Installed &amp; Active
              </span>
            ) : (
              <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                In-app fallback active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <span className="font-bold text-slate-900">yt-dlp YouTube Ingest:</span>
            {ytdlpAvailable ? (
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Installed &amp; Ready
              </span>
            ) : (
              <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Auto-fallback active
              </span>
            )}
          </div>
        </div>

        {/* Status Message / Notification */}
        {statusMessage && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-medium flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-blue-600" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Upload progress bar */}
        {uploadProgress !== null && (
          <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex justify-between text-xs text-slate-700 font-medium">
              <span>Transferring media file to local theater drive...</span>
              <span className="font-mono font-bold">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. YT-DLP YOUTUBE CONTENT INGESTION CARD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-600" />
            <h3 className="text-base font-bold text-slate-900">
              Ingest YouTube Content (via yt-dlp)
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-blue-600" /> yt-dlp Engine
          </span>
        </div>

        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          Paste any YouTube trailer, teaser, countdown bumper, or short film URL. <code>yt-dlp</code> downloads the highest quality stream, muxes it to clean MP4, and indexes it into your local media database.
        </p>

        <form onSubmit={handleYtDlpIngest} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="yt-url" className="block text-xs font-semibold text-slate-700 mb-1">
                YouTube Video URL
              </label>
              <input
                id="yt-url"
                type="url"
                required
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono shadow-2xs"
              />
            </div>

            <div>
              <label htmlFor="yt-title" className="block text-xs font-semibold text-slate-700 mb-1">
                Custom Title (Optional)
              </label>
              <input
                id="yt-title"
                type="text"
                value={ytTitle}
                onChange={(e) => setYtTitle(e.target.value)}
                placeholder="e.g. 2026 Film Festival Trailer"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isYtDownloading || !ytUrl.trim()}
            className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-red-600/20 transition-all disabled:opacity-40"
          >
            <Download className={`w-4 h-4 ${isYtDownloading ? 'animate-bounce' : ''}`} />
            <span>{isYtDownloading ? 'Executing yt-dlp...' : 'Download & Ingest via yt-dlp'}</span>
          </button>
        </form>
      </div>

      {/* 3. MEDIA ITEMS LIST */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">
            Media Library ({mediaList.length} items)
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            Stored locally on host PC
          </span>
        </div>

        {mediaList.length === 0 ? (
          <div className="p-12 text-center text-slate-500 border border-dashed border-slate-300 rounded-xl space-y-2">
            <Film className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-sm font-bold text-slate-700">No media files registered yet</p>
            <p className="text-xs text-slate-500">
              Click &quot;Scan Local Media Folder&quot; to discover files in <code>./media</code> or paste a YouTube URL above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mediaList.map((item) => {
              const isConverting = item.conversion_status === 'converting';
              const needsConvert = item.conversion_status === 'needs_conversion' || !item.is_compatible;

              return (
                <div
                  key={item.id}
                  className="p-4 bg-slate-50/90 border border-slate-200 rounded-xl space-y-3 hover:border-blue-300 transition-colors shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
                        {item.original_name?.includes('youtube') || item.title?.startsWith('YouTube') ? (
                          <Youtube className="w-5 h-5 text-red-600" />
                        ) : (
                          <Film className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                          {item.title}
                        </h4>
                        <div className="text-xs text-slate-500 font-medium flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="font-mono text-blue-700 font-bold uppercase">{item.format}</span>
                          <span>·</span>
                          <span>{item.resolution}</span>
                          <span>·</span>
                          <span>{formatDuration(item.duration)}</span>
                          <span>·</span>
                          <span>{formatBytes(item.file_size)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Compatibility / Conversion Status */}
                      {item.conversion_status === 'ready' && (
                        <span className="text-xs text-emerald-800 flex items-center gap-1 font-bold bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Projector Ready</span>
                        </span>
                      )}

                      {needsConvert && (
                        <button
                          onClick={() => handleConvert(item.id)}
                          disabled={isConverting}
                          className="min-h-[36px] px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-2xs transition-all"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isConverting ? 'animate-spin' : ''}`} />
                          <span>{isConverting ? 'Processing...' : 'Convert with FFmpeg'}</span>
                        </button>
                      )}

                      {/* Preview button */}
                      <button
                        onClick={() => setPreviewItem(item)}
                        className="min-h-[36px] min-w-[36px] p-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                        title="Preview video"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Delete media button */}
                      <button
                        onClick={() => handleDeleteMedia(item.id, item.title)}
                        className="min-h-[36px] min-w-[36px] p-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-500 hover:text-rose-600 rounded-lg flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                        title="Delete from library & disk"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Transcode / yt-dlp Progress Bar */}
                  {isConverting && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs text-blue-900 font-semibold">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                          Ingesting &amp; converting stream ({item.conversion_progress || 45}%)...
                        </span>
                        <span className="font-mono">{item.conversion_progress || 45}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${item.conversion_progress || 45}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. PREVIEW MODAL */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 truncate">
                Preview: {previewItem.title}
              </h3>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-600 hover:text-slate-900 text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Close Preview
              </button>
            </div>

            <div className="aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
              <video
                src={previewItem.file_path}
                controls
                autoPlay
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLVideoElement).style.display = 'none';
                }}
              />
            </div>

            <div className="text-xs text-slate-500 font-medium flex justify-between">
              <span>File: {previewItem.filename}</span>
              <span>Resolution: {previewItem.resolution}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
