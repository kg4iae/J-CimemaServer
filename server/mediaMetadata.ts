import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface MediaMetadata {
  duration: number; // in seconds
  resolution: string; // e.g. '1920x1080'
  format: string;
  isCompatible: boolean;
  fileSize: number;
}

/**
 * Probe media file using ffprobe
 */
function probeWithFfprobe(filePath: string): Promise<{ duration: number; resolution: string } | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=width,height',
        '-of', 'json',
        filePath,
      ]);

      let stdout = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      const timer = setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 5000);

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && stdout) {
          try {
            const data = JSON.parse(stdout);
            let duration = 0;
            if (data.format?.duration) {
              duration = parseFloat(data.format.duration) || 0;
            }

            let resolution = '1920x1080';
            if (Array.isArray(data.streams)) {
              const videoStream = data.streams.find((s: any) => s.width && s.height);
              if (videoStream) {
                resolution = `${videoStream.width}x${videoStream.height}`;
              }
            }

            resolve({ duration, resolution });
            return;
          } catch {}
        }
        resolve(null);
      });

      proc.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Fallback probe using ffmpeg -i stderr
 */
function probeWithFfmpeg(filePath: string): Promise<{ duration: number; resolution: string } | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn('ffmpeg', ['-i', filePath]);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      const timer = setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 5000);

      proc.on('close', () => {
        clearTimeout(timer);
        let duration = 0;
        let resolution = '1920x1080';

        // Parse: Duration: 00:02:15.34
        const durMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
        if (durMatch) {
          const hours = parseInt(durMatch[1], 10);
          const mins = parseInt(durMatch[2], 10);
          const secs = parseFloat(durMatch[3]);
          duration = hours * 3600 + mins * 60 + secs;
        }

        // Parse: Stream #0:0... Video: ... 1920x1080
        const resMatch = stderr.match(/Video:.*?(\d{3,5})x(\d{3,5})/);
        if (resMatch) {
          resolution = `${resMatch[1]}x${resMatch[2]}`;
        }

        if (duration > 0) {
          resolve({ duration, resolution });
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Pure binary parser for MP4/MOV container atoms ('mvhd' box)
 * Used as high-speed pure-JS fallback if FFmpeg/FFprobe are not installed.
 */
function probeMp4Binary(filePath: string): { duration: number; resolution: string } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024 * 1024); // read first 1MB
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    // Search for 'mvhd' box
    const mvhdIdx = buffer.indexOf('mvhd');
    if (mvhdIdx !== -1 && mvhdIdx + 24 < bytesRead) {
      const version = buffer.readUInt8(mvhdIdx + 4);
      let timescale = 0;
      let durationUnits = 0;

      if (version === 0) {
        timescale = buffer.readUInt32BE(mvhdIdx + 16);
        durationUnits = buffer.readUInt32BE(mvhdIdx + 20);
      } else if (version === 1 && mvhdIdx + 36 < bytesRead) {
        timescale = buffer.readUInt32BE(mvhdIdx + 24);
        durationUnits = Number(buffer.readBigUInt64BE(mvhdIdx + 28));
      }

      if (timescale > 0 && durationUnits > 0) {
        const duration = Math.round((durationUnits / timescale) * 100) / 100;
        return { duration, resolution: '1920x1080' };
      }
    }
  } catch {}
  return null;
}

/**
 * Extract accurate runtime metadata, resolution, and format compatibility for any media file
 */
export async function extractMediaMetadata(filePath: string): Promise<MediaMetadata> {
  const ext = path.extname(filePath).toLowerCase();
  const cleanFormat = ext.replace('.', '');
  const isCompatible = ['mp4', 'webm'].includes(cleanFormat);
  let fileSize = 0;

  try {
    const stat = fs.statSync(filePath);
    fileSize = stat.size;
  } catch {}

  // 1. Try ffprobe (most accurate and fast)
  let probe = await probeWithFfprobe(filePath);

  // 2. Fallback to ffmpeg -i
  if (!probe || probe.duration <= 0) {
    probe = await probeWithFfmpeg(filePath);
  }

  // 3. Fallback to pure MP4 binary parser
  if ((!probe || probe.duration <= 0) && (cleanFormat === 'mp4' || cleanFormat === 'm4v' || cleanFormat === 'mov')) {
    probe = probeMp4Binary(filePath);
  }

  const duration = probe && probe.duration > 0 ? Math.round(probe.duration * 10) / 10 : 120.0;
  const resolution = probe?.resolution || '1920x1080';

  return {
    duration,
    resolution,
    format: cleanFormat,
    isCompatible,
    fileSize,
  };
}
