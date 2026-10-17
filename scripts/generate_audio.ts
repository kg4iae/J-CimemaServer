import fs from 'fs';
import path from 'path';

// Helper to write standard 16-bit PCM Stereo WAV file
function createWavBuffer(sampleRate: number, numChannels: number, samples: Float32Array[]): Buffer {
  const numSamples = samples[0].length;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numSamples * numChannels * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22); // num channels
  buffer.writeUInt32LE(sampleRate, 24); // sample rate
  buffer.writeUInt32LE(byteRate, 28); // byte rate
  buffer.writeUInt16LE(blockAlign, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write interleaved PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      // Soft clamp between -1 and 1
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

// Note frequency helper (e.g. 'C4', 'Eb3', etc.)
const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
};

function noteFreq(noteStr: string): number {
  const match = noteStr.match(/^([A-G][b#]?)([0-9])$/);
  if (!match) return 440;
  const name = match[1];
  const octave = parseInt(match[2], 10);
  const semitonesFromC0 = octave * 12 + NOTE_SEMITONES[name];
  // A4 is octave 4, A = 9 -> 4 * 12 + 9 = 57 -> 440 Hz
  return 440 * Math.pow(2, (semitonesFromC0 - 57) / 12);
}

// 1. Generate Retro Cinema Intermission Walk-in Track (Catchy, nostalgic vintage cinema melody)
function generateRetroIntermission(durationSec = 28): Buffer {
  const numSamples = SAMPLE_RATE * durationSec;
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Tempo: 120 BPM -> 1 beat = 0.5s
  const beatSec = 0.5;

  // Intermission melody (vibraphone / bell tones)
  const melody: Array<{ note: string; startBeat: number; durBeats: number }> = [
    // Phrase 1: "Welcome to the show / Walk-in theme"
    { note: 'G4', startBeat: 0, durBeats: 1 },
    { note: 'C5', startBeat: 1, durBeats: 1.5 },
    { note: 'E5', startBeat: 2.5, durBeats: 0.5 },
    { note: 'G5', startBeat: 3, durBeats: 2 },
    { note: 'E5', startBeat: 5, durBeats: 1 },
    { note: 'D5', startBeat: 6, durBeats: 2 },

    { note: 'F4', startBeat: 8, durBeats: 1 },
    { note: 'B4', startBeat: 9, durBeats: 1.5 },
    { note: 'D5', startBeat: 10.5, durBeats: 0.5 },
    { note: 'F5', startBeat: 11, durBeats: 2 },
    { note: 'D5', startBeat: 13, durBeats: 1 },
    { note: 'C5', startBeat: 14, durBeats: 2 },

    // Phrase 2:
    { note: 'A4', startBeat: 16, durBeats: 1 },
    { note: 'C5', startBeat: 17, durBeats: 1 },
    { note: 'F5', startBeat: 18, durBeats: 1.5 },
    { note: 'E5', startBeat: 19.5, durBeats: 0.5 },
    { note: 'D5', startBeat: 20, durBeats: 2 },
    { note: 'G4', startBeat: 22, durBeats: 2 },

    { note: 'C5', startBeat: 24, durBeats: 3 },
    { note: 'E5', startBeat: 27, durBeats: 1 },
    { note: 'G5', startBeat: 28, durBeats: 2 },
    { note: 'C6', startBeat: 30, durBeats: 4 },

    // Repeat variation
    { note: 'G4', startBeat: 36, durBeats: 1 },
    { note: 'C5', startBeat: 37, durBeats: 1.5 },
    { note: 'E5', startBeat: 38.5, durBeats: 0.5 },
    { note: 'G5', startBeat: 39, durBeats: 2 },
    { note: 'E5', startBeat: 41, durBeats: 1 },
    { note: 'D5', startBeat: 42, durBeats: 2 },

    { note: 'F5', startBeat: 44, durBeats: 1 },
    { note: 'E5', startBeat: 45, durBeats: 1 },
    { note: 'D5', startBeat: 46, durBeats: 1 },
    { note: 'B4', startBeat: 47, durBeats: 1 },
    { note: 'C5', startBeat: 48, durBeats: 6 },
  ];

  // Warm Rhodes / Theater Vibraphone synthesis for melody
  for (const m of melody) {
    const startSample = Math.floor(m.startBeat * beatSec * SAMPLE_RATE);
    const durSamples = Math.floor(m.durBeats * beatSec * SAMPLE_RATE);
    const freq = noteFreq(m.note);

    for (let s = 0; s < durSamples && startSample + s < numSamples; s++) {
      const t = s / SAMPLE_RATE;
      // Exponential decay envelope like vibraphone / marimba
      const decay = Math.exp(-t * 2.8);
      // Bell harmonics
      const osc = Math.sin(2 * Math.PI * freq * t) * 0.4 +
                  Math.sin(2 * Math.PI * freq * 2.0 * t) * 0.15 +
                  Math.sin(2 * Math.PI * freq * 3.01 * t) * 0.08 +
                  Math.sin(2 * Math.PI * freq * 4.0 * t) * 0.03;
      const val = osc * decay * 0.45;
      const idx = startSample + s;
      left[idx] += val * 0.65;
      right[idx] += val * 0.75;
    }
  }

  // Chords / Bass progression (C -> G -> F -> C) every 4 beats
  const chords = [
    { bass: 'C2', notes: ['C3', 'E3', 'G3', 'C4'] },
    { bass: 'G2', notes: ['B2', 'D3', 'G3', 'B3'] },
    { bass: 'F2', notes: ['A2', 'C3', 'F3', 'A3'] },
    { bass: 'C2', notes: ['G2', 'C3', 'E3', 'G3'] },
  ];

  const totalBars = Math.floor((durationSec / beatSec) / 4);
  for (let bar = 0; bar < totalBars; bar++) {
    const chord = chords[bar % chords.length];
    const barStart = Math.floor(bar * 4 * beatSec * SAMPLE_RATE);
    const barDur = Math.floor(4 * beatSec * SAMPLE_RATE);

    // Warm Rhodes organ pad
    for (let s = 0; s < barDur && barStart + s < numSamples; s++) {
      const t = s / SAMPLE_RATE;
      const env = Math.min(1, s / (0.1 * SAMPLE_RATE)) * Math.exp(-t * 0.3);

      let chordSignal = 0;
      for (const cn of chord.notes) {
        const cf = noteFreq(cn);
        chordSignal += Math.sin(2 * Math.PI * cf * t) * 0.06;
        chordSignal += Math.sin(2 * Math.PI * (cf * 2) * t) * 0.02;
      }

      // Upright walking bass
      const bf = noteFreq(chord.bass);
      const bassEnv = Math.exp(-((s % Math.floor(beatSec * SAMPLE_RATE)) / SAMPLE_RATE) * 3.5);
      const bassSignal = (Math.sin(2 * Math.PI * bf * t) + Math.sin(2 * Math.PI * bf * 0.5 * t) * 0.5) * bassEnv * 0.22;

      const idx = barStart + s;
      left[idx] += (chordSignal * 0.7 + bassSignal * 0.6) * env;
      right[idx] += (chordSignal * 0.7 + bassSignal * 0.6) * env;
    }
  }

  // Smooth fade-in (1.5s) and fade-out (2.0s) for seamless loop
  const fadeInSamples = Math.floor(1.5 * SAMPLE_RATE);
  const fadeOutSamples = Math.floor(2.0 * SAMPLE_RATE);
  for (let i = 0; i < fadeInSamples; i++) {
    const f = i / fadeInSamples;
    left[i] *= f;
    right[i] *= f;
  }
  for (let i = 0; i < fadeOutSamples; i++) {
    const idx = numSamples - 1 - i;
    const f = i / fadeOutSamples;
    left[idx] *= f;
    right[idx] *= f;
  }

  return createWavBuffer(SAMPLE_RATE, 2, [left, right]);
}

// 2. Generate Grand Hollywood Orchestral Overture (Majestic strings, French horns, theater bells)
function generateHollywoodOverture(durationSec = 30): Buffer {
  const numSamples = SAMPLE_RATE * durationSec;
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Majestic chords: D major -> G major -> B minor -> A major
  const chords = [
    { root: 'D3', notes: ['D3', 'F#3', 'A3', 'D4', 'F#4'], bass: 'D2' },
    { root: 'G3', notes: ['G2', 'B3', 'D4', 'G4', 'B4'], bass: 'G1' },
    { root: 'B3', notes: ['B2', 'D3', 'F#3', 'B3', 'D4'], bass: 'B1' },
    { root: 'A3', notes: ['A2', 'C#3', 'E3', 'A3', 'C#4'], bass: 'A1' },
  ];

  const chordDuration = 7.5; // 7.5 seconds per chord = 30s total
  for (let c = 0; c < chords.length; c++) {
    const chord = chords[c];
    const startSample = Math.floor(c * chordDuration * SAMPLE_RATE);
    const durSamples = Math.floor(chordDuration * SAMPLE_RATE);

    for (let s = 0; s < durSamples && startSample + s < numSamples; s++) {
      const t = s / SAMPLE_RATE;
      const idx = startSample + s;

      // Smooth attack and release envelope
      const attack = Math.min(1, s / (1.8 * SAMPLE_RATE));
      const release = Math.min(1, (durSamples - s) / (1.5 * SAMPLE_RATE));
      const env = attack * release;

      // Rich string ensemble with ensemble chorus (multiple detuned sine/triangles)
      let stringSoundLeft = 0;
      let stringSoundRight = 0;

      chord.notes.forEach((note, nIdx) => {
        const freq = noteFreq(note);
        // Stereo detuning for wide cinematic string width
        const lVoice = Math.sin(2 * Math.PI * (freq - 0.35) * t) * 0.08 +
                       Math.sin(2 * Math.PI * (freq * 2 + 0.2) * t) * 0.03;
        const rVoice = Math.sin(2 * Math.PI * (freq + 0.35) * t) * 0.08 +
                       Math.sin(2 * Math.PI * (freq * 2 - 0.2) * t) * 0.03;
        stringSoundLeft += lVoice;
        stringSoundRight += rVoice;
      });

      // Warm French Horn swell in center
      const bf = noteFreq(chord.bass);
      const horn = (Math.sin(2 * Math.PI * bf * t) * 0.18 +
                    Math.sin(2 * Math.PI * (bf * 2) * t) * 0.09 +
                    Math.sin(2 * Math.PI * (bf * 3) * t) * 0.03);

      left[idx] += (stringSoundLeft + horn * 0.8) * env;
      right[idx] += (stringSoundRight + horn * 0.8) * env;

      // Orchestral Glockenspiel / Chime on chord change (first 2 seconds)
      if (s < 2 * SAMPLE_RATE) {
        const bellT = s / SAMPLE_RATE;
        const bellFreq = noteFreq(chord.notes[chord.notes.length - 1]) * 2;
        const bellEnv = Math.exp(-bellT * 3.0) * 0.25;
        const bell = Math.sin(2 * Math.PI * bellFreq * bellT) + Math.sin(2 * Math.PI * bellFreq * 2.76 * bellT) * 0.3;
        left[idx] += bell * bellEnv * 0.7;
        right[idx] += bell * bellEnv * 0.9;
      }
    }
  }

  // Loop crossfade
  const fadeIn = Math.floor(1.5 * SAMPLE_RATE);
  const fadeOut = Math.floor(2.0 * SAMPLE_RATE);
  for (let i = 0; i < fadeIn; i++) {
    left[i] *= i / fadeIn;
    right[i] *= i / fadeIn;
  }
  for (let i = 0; i < fadeOut; i++) {
    const idx = numSamples - 1 - i;
    left[idx] *= i / fadeOut;
    right[idx] *= i / fadeOut;
  }

  return createWavBuffer(SAMPLE_RATE, 2, [left, right]);
}

// 3. Generate Cinema Jazz Lounge Walk-In (Smooth, relaxing piano and double bass)
function generateCinemaJazzLounge(durationSec = 28): Buffer {
  const numSamples = SAMPLE_RATE * durationSec;
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Jazz progression: FMaj7 -> Dm9 -> Gm7 -> C9sus (Classic theater lounge)
  const jazzChords = [
    { bass: 'F2', notes: ['A3', 'C4', 'E4', 'G4'] },
    { bass: 'D2', notes: ['F3', 'A3', 'C4', 'E4'] },
    { bass: 'G2', notes: ['Bb3', 'D4', 'F4', 'A4'] },
    { bass: 'C2', notes: ['Bb3', 'D4', 'F4', 'G4'] },
  ];

  const chordSec = 7.0;
  for (let c = 0; c < jazzChords.length; c++) {
    const jc = jazzChords[c];
    const startSample = Math.floor(c * chordSec * SAMPLE_RATE);
    const durSamples = Math.floor(chordSec * SAMPLE_RATE);

    for (let s = 0; s < durSamples && startSample + s < numSamples; s++) {
      const t = s / SAMPLE_RATE;
      const idx = startSample + s;
      const env = Math.min(1, s / (0.8 * SAMPLE_RATE)) * Math.min(1, (durSamples - s) / (0.8 * SAMPLE_RATE));

      // Warm acoustic piano sound (harmonics with gentle hammer decay)
      let pianoL = 0;
      let pianoR = 0;
      jc.notes.forEach((n, idxNote) => {
        const nf = noteFreq(n);
        const pDecay = Math.exp(-t * (1.2 + idxNote * 0.15));
        const sound = (Math.sin(2 * Math.PI * nf * t) * 0.08 +
                       Math.sin(2 * Math.PI * (nf * 2) * t) * 0.03 +
                       Math.sin(2 * Math.PI * (nf * 3) * t) * 0.01) * pDecay;
        if (idxNote % 2 === 0) pianoL += sound;
        else pianoR += sound;
      });

      // Upright pizzicato double-bass
      const bf = noteFreq(jc.bass);
      const bassPluck = Math.exp(-((s % (1.75 * SAMPLE_RATE)) / SAMPLE_RATE) * 2.5);
      const bass = (Math.sin(2 * Math.PI * bf * t) * 0.22 +
                    Math.sin(2 * Math.PI * (bf * 2) * t) * 0.08) * bassPluck;

      left[idx] += (pianoL + bass * 0.5) * env;
      right[idx] += (pianoR + bass * 0.5) * env;
    }
  }

  // Loop crossfade
  const fadeIn = Math.floor(1.5 * SAMPLE_RATE);
  const fadeOut = Math.floor(2.0 * SAMPLE_RATE);
  for (let i = 0; i < fadeIn; i++) {
    left[i] *= i / fadeIn;
    right[i] *= i / fadeIn;
  }
  for (let i = 0; i < fadeOut; i++) {
    const idx = numSamples - 1 - i;
    left[idx] *= i / fadeOut;
    right[idx] *= i / fadeOut;
  }

  return createWavBuffer(SAMPLE_RATE, 2, [left, right]);
}

// Generate all files
const outDir = path.resolve(process.cwd(), 'public/assets/audio');
fs.mkdirSync(outDir, { recursive: true });

console.log('Generating retro intermission audio...');
const retroBuf = generateRetroIntermission(28);
fs.writeFileSync(path.join(outDir, 'retro_cinema_intermission.wav'), retroBuf);
console.log('Retro intermission audio generated:', retroBuf.length, 'bytes');

console.log('Generating Hollywood overture audio...');
const overtureBuf = generateHollywoodOverture(30);
fs.writeFileSync(path.join(outDir, 'grand_hollywood_overture.wav'), overtureBuf);
console.log('Hollywood overture generated:', overtureBuf.length, 'bytes');

console.log('Generating Cinema jazz lounge audio...');
const jazzBuf = generateCinemaJazzLounge(28);
fs.writeFileSync(path.join(outDir, 'cinema_jazz_lounge.wav'), jazzBuf);
console.log('Cinema jazz lounge generated:', jazzBuf.length, 'bytes');

console.log('All walk-in audio tracks generated successfully in /public/assets/audio/');
