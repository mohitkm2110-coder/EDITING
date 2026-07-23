import { Injectable } from '@angular/core';
import { StateService, TRACKS, BeatInfo } from './state-service';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private audioCtx: AudioContext | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;

  constructor(private state: StateService) {}

  getOrCreateContext(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.audioCtx;
  }

  resumeContext(): void {
    const ctx = this.audioCtx;
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  getContext(): AudioContext | null { return this.audioCtx; }

  startMusic(fromTime: number, offset: number): void {
    const ctx = this.getOrCreateContext();
    const buf = this.state.music().buffer;
    if (!buf) return;
    this.stopMusic();
    if (ctx.state === 'suspended') ctx.resume();
    const offInBuf = Math.max(0, (fromTime + offset)) % buf.duration;
    this.musicSource = ctx.createBufferSource();
    this.musicSource.buffer = buf;
    this.musicSource.loop = true;
    this.musicSource.connect(this.musicGain!);
    this.musicSource.start(0, offInBuf);
  }

  stopMusic(): void {
    if (this.musicSource) {
      try { this.musicSource.stop(); this.musicSource.disconnect(); } catch (_) {}
      this.musicSource = null;
    }
  }

  setupMusicGain(): void {
    const ctx = this.getOrCreateContext();
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.state.music().volume;
    this.musicGain.connect(ctx.destination);
  }

  updateMusicGain(val: number): void {
    if (this.musicGain) this.musicGain.gain.value = val;
  }

  close(): void {
    this.stopMusic();
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
  }

  async analyzeMusicFile(file: File): Promise<void> {
    try {
      const ab = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await ctx.decodeAudioData(ab);
      ctx.close();
      const m = this.state.music();
      m.buffer = buffer;
      this.state.music.set(m);
      this.detectBeatsFromBuffer(buffer);
      this.detectMusicStructure(buffer);
    } catch (err: any) {
      console.warn('Music analysis:', err.message);
    }
  }

  detectBeatsFromBuffer(buf: AudioBuffer): void {
    const d = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const ws = 1024, hs = 512;
    const nw = Math.floor((d.length - ws) / hs);
    const e: number[] = [];
    for (let w = 0; w < nw; w++) {
      let s = 0;
      const o = w * hs;
      for (let i = 0; i < ws; i++) s += d[o + i] * d[o + i];
      e.push(s / ws);
    }
    const aw = Math.round(sr / hs * 0.5);
    const peaks: number[] = [];
    for (let i = 1; i < e.length - 1; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - aw); j < Math.min(e.length, i + aw); j++) { s += e[j]; c++; }
      const r = e[i] / (s / c + 1e-10);
      if (r > 1.8 && e[i] > e[i - 1] && e[i] > e[i + 1]) peaks.push((i * hs) / sr);
    }
    const m = this.state.music();
    if (peaks.length < 4) {
      m.beats = [];
      for (let t = 0; t < buf.duration; t += 60 / (m.bpm || 120)) m.beats.push(t);
      this.state.music.set(m);
      return;
    }
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
    const hist: Record<string, number> = {};
    intervals.forEach(v => { const k = Math.round(v / 0.01) * 0.01; hist[k] = (hist[k] || 0) + 1; });
    let bestInterval = 0, bestCount = 0;
    for (const [k, c] of Object.entries(hist)) { if (c > bestCount) { bestCount = c; bestInterval = parseFloat(k); } }
    const detectedBpm = Math.round(60 / (bestInterval || 0.5));
    if (detectedBpm > 50 && detectedBpm < 220) m.bpm = detectedBpm;
    m.beats = [];
    for (let t = 0; t < buf.duration; t += 60 / m.bpm) m.beats.push(t);
    this.state.music.set(m);
  }

  detectMusicStructure(buf: AudioBuffer): void {
    const bpm = this.state.music().bpm || 120;
    const beatInterval = 60 / bpm;
    const sr = buf.sampleRate;
    const ch = buf.getChannelData(0);
    const totalBeats = Math.min(Math.ceil(buf.duration / beatInterval), 1024);
    const beats: BeatInfo[] = [];
    for (let i = 0; i < totalBeats; i++) {
      const start = Math.floor(i * beatInterval * sr);
      const end = Math.min(Math.floor((i + 1) * beatInterval * sr), ch.length);
      let energy = 0, count = 0;
      for (let j = start; j < end; j++) { energy += ch[j] * ch[j]; count++; }
      beats.push({ time: i * beatInterval, energy: count ? Math.sqrt(energy / count) : 0, smooth: 0, energyDelta: 0, isImpact: false, isDrop: false });
    }
    const maxE = Math.max(...beats.map(b => b.energy), 0.001);
    beats.forEach(b => b.energy /= maxE);
    const smooth = beats.map((b, i) => {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 2); j < Math.min(beats.length, i + 3); j++) { s += beats[j].energy; c++; }
      return s / c;
    });
    beats.forEach((b, i) => { b.smooth = smooth[i]; b.energyDelta = i > 0 ? smooth[i] - smooth[i - 1] : 0; });
    const sorted = [...beats].sort((a, b) => b.smooth - a.smooth);
    const impactThreshold = sorted[Math.max(2, Math.floor(sorted.length * 0.12))].smooth;
    beats.forEach(b => { b.isImpact = b.smooth >= impactThreshold; });
    for (let i = 2; i < beats.length; i++) {
      if (beats[i].energyDelta > 0.12 && beats[i].smooth > 0.4) beats[i].isDrop = true;
    }
    const m = this.state.music();
    m.analysis = { beats, impactThreshold };
    this.state.music.set(m);
  }

  generateBuiltInTrack(id: string): void {
    const track = TRACKS[id];
    if (!track) return;
    const sr = 44100;
    const bpm = track.bpm;
    const beatLen = 60 / bpm;
    const totalBeats = 64;
    const dur = totalBeats * beatLen;
    const ctx = new OfflineAudioContext(2, sr * dur, sr);
    this.renderTrack(ctx, id, bpm, dur, totalBeats);
    ctx.startRendering().then(buffer => {
      const m = this.state.music();
      m.buffer = buffer;
      m.bpm = bpm;
      m.beats = [];
      for (let t = 0; t < dur; t += beatLen) m.beats.push(t);
      this.state.music.set(m);
      this.detectMusicStructure(buffer);
    }).catch(e => console.error(e));
  }

  private renderTrack(ctx: OfflineAudioContext, id: string, bpm: number, dur: number, tb: number): void {
    const bl = 60 / bpm;
    const sr = ctx.sampleRate;
    const noiseBuf = (() => { const b = ctx.createBuffer(1, sr, sr); const d = b.getChannelData(0); for (let i = 0; i < sr; i++) d[i] = Math.random() * 2 - 1; return b; })();

    const kick = (t: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
      g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.15);
    };
    const snare = (t: number) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const g = ctx.createGain(), o = ctx.createOscillator(), g2 = ctx.createGain();
      o.frequency.setValueAtTime(180, t); g2.gain.setValueAtTime(0.6, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      s.connect(g); g.connect(ctx.destination); o.connect(g2); g2.connect(ctx.destination);
      s.start(t); s.stop(t + 0.15); o.start(t); o.stop(t + 0.12);
    };
    const hat = (t: number, ch: boolean) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = ch ? 8000 : 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(ch ? 0.25 : 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + (ch ? 0.05 : 0.12));
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + (ch ? 0.05 : 0.12));
    };
    const bass = (t: number, n: number) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const g = ctx.createGain();
      o.frequency.setValueAtTime(n, t); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + bl * 2);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + bl * 2);
    };
    const lead = (t: number, f: number, d: number) => {
      const o = ctx.createOscillator(); o.type = 'triangle';
      const g = ctx.createGain(), fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = 2000;
      o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.15, t); g.gain.setValueAtTime(0.15, t + d * 0.8);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(fl); fl.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d);
    };

    switch (id) {
      case 'neon':
        for (let i = 0; i < tb; i++) {
          const t = i * bl;
          if (i % 4 === 0) kick(t);
          if (i % 4 === 2) { kick(t); snare(t); for (let h = 0; h < 4; h++) hat(t + h * bl / 4, h % 2 === 0); }
          if (i % 4 === 1 || i % 4 === 3) hat(t + bl / 4, true);
          if (i % 8 === 0) bass(t, 65.4);
          if (i % 8 === 4) bass(t, 73.4);
          if (i % 16 === 0 && i < tb - 8) {
            [523, 587, 659, 784, 659, 587, 523, 494].forEach((f, j) => lead(t + j * bl / 2, f, bl / 2));
          }
        }
        break;
      case 'epic':
        for (let i = 0; i < tb; i++) {
          const t = i * bl;
          if (i % 4 === 0) kick(t);
          if (i % 4 === 2) snare(t);
          if (i % 32 === 0) {
            const o = ctx.createOscillator(); o.type = 'sine';
            const g = ctx.createGain(); o.frequency.setValueAtTime(130.8, t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 8);
            o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 8);
          }
          if (i % 4 === 0) [262, 330, 392, 523].forEach((f, j) => {
            const o = ctx.createOscillator(); o.type = 'sine';
            const g = ctx.createGain(); o.frequency.setValueAtTime(f, t + j * 0.08); g.gain.setValueAtTime(0.06, t + j * 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + j * 0.08 + 0.3);
            o.connect(g); g.connect(ctx.destination); o.start(t + j * 0.08); o.stop(t + j * 0.08 + 0.3);
          });
        }
        break;
      case 'urban':
        for (let i = 0; i < tb; i++) {
          const t = i * bl;
          if (i % 4 === 0) kick(t);
          if (i % 4 === 2) snare(t);
          if (i % 8 === 0 || i % 8 === 6) kick(t + bl / 2);
          if (i % 4 === 0) for (let h = 0; h < 8; h++) { const ht = t + h * bl / 8; hat(ht, h % 2 === 0); if (h === 3 || h === 7) kick(ht + 0.02); }
          if (i % 8 === 0) bass(t, 43.7);
          if (i % 8 === 4) bass(t, 49.0);
        }
        break;
      case 'chill':
        for (let i = 0; i < tb; i++) {
          const t = i * bl;
          if (i % 4 === 0) { kick(t); hat(t + bl / 4, true); hat(t + bl / 2, true); hat(t + bl * 3 / 4, true); }
          if (i % 8 === 0) {
            const s = ctx.createBufferSource(); s.buffer = noiseBuf;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.02, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            s.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + 0.3);
          }
          if (i % 16 === 0) [262, 330, 392].forEach(f => {
            const o = ctx.createOscillator(); o.type = 'triangle';
            const g = ctx.createGain(); o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 4);
            o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 4);
          });
        }
        break;
    }
  }
}
