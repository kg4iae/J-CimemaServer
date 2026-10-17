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
 * Locate executable path on system (handles Windows installation paths)
 */
function findExecutable(binName: string): string {
  const isWin = process.platform === 'win32';
  const name = isWin && !binName.toLowerCase().endsWith('.exe') ? `${binName}.exe` : binName;

  if (isWin) {
    const candidates = [
      name,
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin', name),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'ffmpeg', 'bin', name),
      'C:\\ffmpeg\\bin\\' + name,
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', name),
      'C:\\ProgramData\\chocolatey\\bin\\' + name,
    ];
    for (const cand of candidates) {
      try {
        if (cand === name || fs.existsSync(cand)) {
          return cand;
        }
      } catch {}
    }
  }
  return name;
}

/**
 * Probe media file using ffprobe
 */
function probeWithFfprobe(filePath: string): Promise<{ duration: number; resolution: string } | null> {
  return new Promise((resolve) => {
    try {
      const ffprobeBin = findExecutable('ffprobe');
      const proc = spawn(ffprobeBin, [
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
      }, 7000);

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

            if (duration > 0) {
              resolve({ duration: Math.round(duration * 100) / 100, resolution });
              return;
            }
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
      const ffmpegBin = findExecutable('ffmpeg');
      const proc = spawn(ffmpegBin, ['-i', filePath]);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      const timer = setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 7000);

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
          resolve({ duration: Math.round(duration * 100) / 100, resolution });
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
 * Scans BOTH the beginning (first 2MB) AND the tail (last 8MB) where the 'moov' atom
 * is written by encoders when -movflags +faststart was not used.
 */
function probeMp4Binary(filePath: string): { duration: number; resolution: string } | null {
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    if (fileSize < 64) return null;

    const fd = fs.openSync(filePath, 'r');

    const parseMvhd = (buf: Buffer): number => {
      const idx = buf.indexOf('mvhd');
      if (idx !== -1 && idx + 24 < buf.length) {
        const version = buf.readUInt8(idx + 4);
        let timescale = 0;
        let durationUnits = 0;
        if (version === 0) {
          timescale = buf.readUInt32BE(idx + 16);
          durationUnits = buf.readUInt32BE(idx + 20);
        } else if (version === 1 && idx + 36 < buf.length) {
          timescale = buf.readUInt32BE(idx + 24);
          durationUnits = Number(buf.readBigUInt64BE(idx + 28));
        }
        if (timescale > 0 && durationUnits > 0) {
          return Math.round((durationUnits / timescale) * 100) / 100;
        }
      }
      return 0;
    };

    // 1. Check head (first 2MB)
    const headSize = Math.min(fileSize, 2 * 1024 * 1024);
    const headBuf = Buffer.alloc(headSize);
    fs.readSync(fd, headBuf, 0, headSize, 0);
    let dur = parseMvhd(headBuf);

    // 2. If not in head, check tail (last 8MB) where moov is placed
    if (dur <= 0 && fileSize > headSize) {
      const tailSize = Math.min(fileSize, 8 * 1024 * 1024);
      const tailBuf = Buffer.alloc(tailSize);
      fs.readSync(fd, tailBuf, 0, tailSize, fileSize - tailSize);
      dur = parseMvhd(tailBuf);
    }

    fs.closeSync(fd);

    if (dur > 0) {
      return { duration: dur, resolution: '1920x1080' };
    }
  } catch {}
  return null;
}

/**
 * Pure binary parser for Matroska / WebM files
 * Reads Matroska Segment Info Duration tag
 */
function probeMatroskaBinary(filePath: string): { duration: number; resolution: string } | null {
  try {
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r');
    const readSize = Math.min(stat.size, 2 * 1024 * 1024);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, 0);
    fs.closeSync(fd);

    // Look for Matroska Duration tag (0x44 0x89)
    for (let i = 0; i < buf.length - 10; i++) {
      if (buf[i] === 0x44 && buf[i + 1] === 0x89) {
        const floatSize = buf[i + 2];
        if (floatSize === 4) {
          const val = buf.readFloatBE(i + 3);
          if (val > 0 && val < 86400 * 1000) {
            const sec = val > 1000 ? val / 1000 : val;
            return { duration: Math.round(sec * 100) / 100, resolution: '1920x1080' };
          }
        } else if (floatSize === 8) {
          const val = buf.readDoubleBE(i + 3);
          if (val > 0 && val < 86400 * 1000) {
            const sec = val > 1000 ? val / 1000 : val;
            return { duration: Math.round(sec * 100) / 100, resolution: '1920x1080' };
          }
        }
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

  // 3. Fallback to pure MP4 binary parser (scans head and tail)
  if ((!probe || probe.duration <= 0) && ['mp4', 'm4v', 'mov'].includes(cleanFormat)) {
    probe = probeMp4Binary(filePath);
  }

  // 4. Fallback to pure Matroska / WebM binary parser
  if ((!probe || probe.duration <= 0) && ['mkv', 'webm'].includes(cleanFormat)) {
    probe = probeMatroskaBinary(filePath);
  }

  // 5. Intelligent duration resolution:
  // If still not determined, estimate from file size assuming typical 8 Mbps video bitrate
  let duration = probe && probe.duration > 0 ? probe.duration : 0;
  if (duration <= 0 && fileSize > 0) {
    const estimatedSeconds = Math.round(fileSize / (1024 * 1024)); // ~1MB/s rough estimate
    duration = Math.max(10, Math.min(estimatedSeconds, 7200));
  }

  const resolution = probe?.resolution || '1920x1080';

  return {
    duration,
    resolution,
    format: cleanFormat,
    isCompatible,
    fileSize,
  };
}
