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
} from 'lucide-react';
import { MediaItem } from '../types/theater';
import { uploadMedia, scanLocalMedia, triggerConversion, ingestYouTubeVideo } from '../services/api';

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
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export default function MediaIngestTab({
  mediaList,
  ffmpegAvailable,
  ytdlpAvailable = true,
  onRefresh,
}: MediaIngestTabProps) {
  const [isScanning, setIsScanning] = useState(false);
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
    setStatusMessage('Scanning local folder for new cinema files...');
    try {
      const res = await scanLocalMedia();
      setStatusMessage(`Scan complete! Found and registered ${res.newFilesCount} new files.`);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Scan failed: ${err.message}`);
    } finally {
      setIsScanning(false);
      setTimeout(() => setStatusMessage(null), 5000);
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
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-400" />
              Local Media Storage &amp; Ingestion Pipeline
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Store video files directly on your Windows media PC. Files are scanned, format-verified, and converted with FFmpeg for stutter-free projection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Scan local folder button */}
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <FolderSync className={`w-4 h-4 text-amber-400 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning Directory...' : 'Scan Local Media Folder'}</span>
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
              className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-500/10 transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Ingesting Video...' : 'Ingest Local File'}</span>
            </button>
          </div>
        </div>

        {/* System Capabilities Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="font-semibold text-white">FFmpeg Engine:</span>
            {ffmpegAvailable ? (
              <span className="text-emerald-400 font-medium">Installed &amp; Active</span>
            ) : (
              <span className="text-amber-400 font-medium">In-app fallback active</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="font-semibold text-white">yt-dlp YouTube Ingest:</span>
            {ytdlpAvailable ? (
              <span className="text-emerald-400 font-medium">Installed &amp; Ready</span>
            ) : (
              <span className="text-amber-400 font-medium">Auto-fallback active</span>
            )}
          </div>
        </div>

        {/* Status Message / Notification */}
        {statusMessage && (
          <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl text-xs text-blue-200 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-blue-400" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Upload progress bar */}
        {uploadProgress !== null && (
          <div className="space-y-1.5 p-3 bg-slate-900 rounded-xl border border-slate-800">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Transferring media file to local theater drive...</span>
              <span className="font-mono">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. YT-DLP YOUTUBE CONTENT INGESTION CARD */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-semibold text-white">
              Ingest YouTube Content (via yt-dlp)
            </h3>
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-amber-400" /> yt-dlp Engine
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Paste any YouTube trailer, teaser, countdown bumper, or short film URL. <code>yt-dlp</code> downloads the highest quality stream, muxes it to clean MP4, and indexes it into your local media database.
        </p>

        <form onSubmit={handleYtDlpIngest} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="yt-url" className="block text-xs font-medium text-slate-300 mb-1">
                YouTube Video URL
              </label>
              <input
                id="yt-url"
                type="url"
                required
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label htmlFor="yt-title" className="block text-xs font-medium text-slate-300 mb-1">
                Custom Title (Optional)
              </label>
              <input
                id="yt-title"
                type="text"
                value={ytTitle}
                onChange={(e) => setYtTitle(e.target.value)}
                placeholder="e.g. 2026 Film Festival Trailer"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isYtDownloading || !ytUrl.trim()}
            className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md shadow-red-600/20 transition-all disabled:opacity-40"
          >
            <Download className={`w-4 h-4 ${isYtDownloading ? 'animate-bounce' : ''}`} />
            <span>{isYtDownloading ? 'Executing yt-dlp...' : 'Download & Ingest via yt-dlp'}</span>
          </button>
        </form>
      </div>

      {/* 3. MEDIA ITEMS LIST */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-semibold text-white">
            Media Library ({mediaList.length} items)
          </h3>
          <span className="text-xs text-slate-400">
            Stored locally on host PC
          </span>
        </div>

        {mediaList.length === 0 ? (
          <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
            <Film className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm font-medium text-slate-400">No media files registered yet</p>
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
                  className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3 hover:border-slate-700 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 shrink-0">
                        {item.original_name?.includes('youtube') || item.title?.startsWith('YouTube') ? (
                          <Youtube className="w-5 h-5 text-red-500" />
                        ) : (
                          <Film className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white tracking-tight">
                          {item.title}
                        </h4>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="font-mono text-slate-300 uppercase">{item.format}</span>
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
                        <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Projector Ready</span>
                        </span>
                      )}

                      {needsConvert && (
                        <button
                          onClick={() => handleConvert(item.id)}
                          disabled={isConverting}
                          className="min-h-[36px] px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isConverting ? 'animate-spin' : ''}`} />
                          <span>{isConverting ? 'Processing...' : 'Convert with FFmpeg'}</span>
                        </button>
                      )}

                      {/* Preview button */}
                      <button
                        onClick={() => setPreviewItem(item)}
                        className="min-h-[36px] min-w-[36px] p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center transition-colors"
                        title="Preview video"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Transcode / yt-dlp Progress Bar */}
                  {isConverting && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs text-amber-300">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Ingesting &amp; converting stream ({item.conversion_progress || 45}%)...
                        </span>
                        <span className="font-mono">{item.conversion_progress || 45}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
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
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#141824] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white truncate">
                Preview: {previewItem.title}
              </h3>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded-lg"
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

            <div className="text-xs text-slate-400 flex justify-between">
              <span>File: {previewItem.filename}</span>
              <span>Resolution: {previewItem.resolution}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
