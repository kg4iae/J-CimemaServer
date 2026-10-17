import fs from 'fs';
import path from 'path';

function createWavBuffer(sampleRate: number, numChannels: number, samples: Float32Array[]): Buffer {
  const numSamples = samples[0].length;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numSamples * numChannels * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let s = samples[ch][i];
      s = Math.max(-1, Math.min(1, s));
      const intSample = s < 0 ? Math.floor(s * 32768) : Math.floor(s * 32767);
      buffer.writeInt16LE(intSample, offset);
      offset += 2;
    }
  }

  return buffer;
}

const SAMPLE_RATE = 44100;
const DURATION = 20;
const numSamples = SAMPLE_RATE * DURATION;

// Generate ultra-soft, warm cinema chime pad (gentle, harmonic, zero harshness)
const left = new Float32Array(numSamples);
const right = new Float32Array(numSamples);

// Frequencies for a warm pentatonic chime sequence: C4, E4, G4, A4, C5, D5, E5, G5
const chordFreqs = [261.63, 329.63, 392.00, 440.00, 523.25];

for (let i = 0; i < numSamples; i++) {
  const t = i / SAMPLE_RATE;
  // Soft gentle background warmth
  let valL = 0;
  let valR = 0;

  for (let c = 0; c < chordFreqs.length; c++) {
    const f = chordFreqs[c];
    // Warm slow sine wave with very gentle envelope
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t + (c * 1.2));
    const sine = Math.sin(2 * Math.PI * f * t) * 0.04 * env;
    valL += sine;
    valR += sine * 0.95;
  }

  // Smooth fade-in and fade-out
  const fadeIn = Math.min(1, t / 3.0);
  const fadeOut = Math.min(1, (DURATION - t) / 3.0);
  const masterEnv = fadeIn * fadeOut;

  left[i] = valL * masterEnv;
  right[i] = valR * masterEnv;
}

const wavBuffer = createWavBuffer(SAMPLE_RATE, 2, [left, right]);

const outDir = path.resolve('public/assets/audio');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'grand_hollywood_overture.wav'), wavBuffer);
fs.writeFileSync(path.join(outDir, 'retro_cinema_intermission.wav'), wavBuffer);
fs.writeFileSync(path.join(outDir, 'cinema_jazz_lounge.wav'), wavBuffer);

const distDir = path.resolve('dist/assets/audio');
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'grand_hollywood_overture.wav'), wavBuffer);
  fs.writeFileSync(path.join(distDir, 'retro_cinema_intermission.wav'), wavBuffer);
  fs.writeFileSync(path.join(distDir, 'cinema_jazz_lounge.wav'), wavBuffer);
}

console.log('Gentle soft audio generated successfully!');
