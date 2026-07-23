import { Injectable } from '@angular/core';
import { StateService, Scene, Highlight, AudioEvent } from './state-service';
import { EffectsService } from './effects-service';
import { AudioService } from './audio-service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(
    private state: StateService,
    private effects: EffectsService,
    private audio: AudioService,
  ) {}

  cancelRender(): void {
    this.state.cancelling.set(true);
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch (_) {}
    }
  }

  async renderEdit(
    videoEl: HTMLVideoElement,
    scenes: Scene[],
    highlights: Highlight[],
    audioEvents: AudioEvent[],
    onProgress?: (pct: number) => void,
  ): Promise<{ blob: Blob; url: string; ext: string; mime: string }> {
    const tmpl = this.state.getTemplate();
    const exportOpts = this.state.export();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    let canvasW: number, canvasH: number;
    if (this.state.platformIsVertical()) {
      canvasW = Math.round(exportOpts.resolution * 9 / 16);
      canvasH = exportOpts.resolution;
    } else {
      canvasW = Math.round(exportOpts.resolution * 16 / 9);
      canvasH = exportOpts.resolution;
    }
    const qualMap: Record<string, string> = { standard: 'low', high: 'medium', ultra: 'high' };
    const smoothingQuality = qualMap[exportOpts.quality] || 'medium';
    this.effects.setupCanvas(canvas, ctx, canvasW, canvasH, smoothingQuality);
    const duration = videoEl.duration;
    const fps = exportOpts.fps;
    const frameDur = 1 / fps;
    const totalFrames = Math.round(duration * fps);
    const beatTimes = this.generateBeats(duration, audioEvents, highlights, tmpl.beatSync, tmpl.sparseEffects);

    let audioTracks: MediaStreamTrack[] = [];
    let procCtx: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;
    let musicSource: AudioBufferSourceNode | null = null;

    try {
      procCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (procCtx.state === 'suspended') await procCtx.resume();
      audioDest = procCtx.createMediaStreamDestination();
      const origGain = procCtx.createGain();
      origGain.gain.value = this.state.music().origVolume;
      procCtx.createMediaElementSource(videoEl).connect(origGain).connect(audioDest);
      const music = this.state.music();
      if (music.buffer) {
        musicSource = procCtx.createBufferSource();
        musicSource.buffer = music.buffer;
        musicSource.loop = true;
        const musicGain = procCtx.createGain();
        musicGain.gain.value = music.volume;
        musicSource.connect(musicGain).connect(audioDest);
        musicSource.start(0, music.offset);
      }
      audioTracks = audioDest.stream.getAudioTracks();
    } catch (e: any) { console.warn('Audio setup:', e.message); }

    const cStream = canvas.captureStream(fps);
    const tracks = [...cStream.getVideoTracks(), ...audioTracks];
    let mime = '';
    const codecs = exportOpts.format === 'mp4'
      ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/quicktime', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm'];
    codecs.forEach(t => { if (MediaRecorder.isTypeSupported(t)) mime = t; });
    this.chunks = [];
    const pixelCount = canvasW * canvasH;
    const qualityBits: Record<string, number> = { standard: 0.08, high: 0.13, ultra: 0.2 };
    const bitsPerPixel = qualityBits[exportOpts.quality] || 0.08;
    const videoBitrate = Math.round(pixelCount * fps * bitsPerPixel);
    const recorderOpts = mime ? { mimeType: mime, videoBitsPerSecond: videoBitrate } : { videoBitsPerSecond: videoBitrate };
    this.recorder = new MediaRecorder(new MediaStream(tracks), recorderOpts);
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(100);

    const efState = this.effects.createEffectState();
    let beatIdx = 0;
    let prevSceneIdx = -1;
    let frameCount = 0;
    videoEl.muted = true;
    videoEl.currentTime = 0;
    await new Promise<void>(r => { videoEl.onseeked = () => r(); setTimeout(r, 300); });
    await videoEl.play();
    await new Promise(r => setTimeout(r, 50));

    await new Promise<void>(resolve => {
      const renderFrame = () => {
        if (this.state.cancelling()) { videoEl.pause(); resolve(); return; }
        if (videoEl.paused && frameCount < totalFrames) { requestAnimationFrame(renderFrame); return; }
        const videoTime = videoEl.currentTime;
        while (frameCount < totalFrames && (frameCount === 0 || videoTime >= (frameCount + 0.5) / fps)) {
          const ct = frameCount / fps;
          const sceneIdx = scenes.findIndex(s => ct >= s.start && ct < s.end);
          const isNewScene = sceneIdx !== prevSceneIdx && prevSceneIdx >= 0;
          prevSceneIdx = sceneIdx;
          while (beatIdx < beatTimes.length && beatTimes[beatIdx].time <= ct) {
            const b = beatTimes[beatIdx];
            this.effects.triggerBeatEffect(efState, tmpl, b.isDrop ? 1 : b.tier, ct, b.mult || 1);
            beatIdx++;
          }
          this.effects.applyEffects(ctx, canvas, videoEl, tmpl, efState, ct, isNewScene);
          frameCount++;
          if (onProgress) onProgress(frameCount / totalFrames);
        }
        if (frameCount < totalFrames) { requestAnimationFrame(renderFrame); }
        else { resolve(); }
      };
      requestAnimationFrame(renderFrame);
    });

    videoEl.pause();
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    await new Promise(r => setTimeout(r, 200));
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('quicktime') ? 'mov' : 'webm';
    const blob = new Blob(this.chunks, { type: mime || 'video/webm' });
    const url = URL.createObjectURL(blob);
    if (musicSource) try { musicSource.stop(); } catch (_) {}
    if (procCtx) try { procCtx.close(); } catch (_) {}
    return { blob, url, ext, mime };
  }

  private generateBeats(duration: number, audioEvents: AudioEvent[], highlights: Highlight[], beatSync: string, sparseEffects: boolean): any[] {
    beatSync = beatSync || 'normal';
    const bpm = this.state.music().bpm || 120;
    const beatInterval = 60 / bpm;
    const beats: any[] = [];
    const beatTimes = this.state.music().beats.length > 0
      ? this.state.music().beats.filter(t => t <= duration)
      : Array.from({ length: Math.ceil(duration / beatInterval) }, (_, i) => i * beatInterval);
    if (!beatTimes.length) return beats;
    for (const t of beatTimes) beats.push({ time: t, tier: 4, isDrop: false, mult: 1 });

    if (beatSync === 'high') {
      const musicAnalysis = this.state.music().analysis;
      let strongBeatIndices = new Set<number>();
      if (musicAnalysis && sparseEffects) {
        musicAnalysis.beats.forEach((mb, idx) => {
          if (idx < beats.length && mb.isImpact) strongBeatIndices.add(idx);
        });
      }
      const peaks = highlights.filter(h => h.intensity > 40);
      peaks.sort((a, b) => b.intensity - a.intensity);

      if (sparseEffects) {
        const maxEffects = Math.max(3, Math.min(6, Math.round(duration / 10)));
        let scheduled = 0;
        let impactCandidates: any[] = [];
        if (strongBeatIndices.size > 0) {
          for (const idx of strongBeatIndices) impactCandidates.push(beats[idx]);
        } else {
          for (let i = 0; i < beats.length; i += 4) impactCandidates.push(beats[i]);
        }
        const usedBeats = new Set<number>();
        for (const peak of peaks) {
          if (scheduled >= maxEffects) break;
          let bestIdx = -1;
          let bestDist = Infinity;
          for (const candidate of impactCandidates) {
            const candIdx = beats.indexOf(candidate);
            if (usedBeats.has(candIdx)) continue;
            const dist = Math.abs(candidate.time - peak.time);
            if (dist < bestDist && dist < beatInterval * 4) { bestDist = dist; bestIdx = candIdx; }
          }
          if (bestIdx >= 0 && !usedBeats.has(bestIdx)) {
            usedBeats.add(bestIdx);
            const barBeat = Math.round(beats[bestIdx].time / beatInterval) % 4;
            const intensityFactor = Math.min(1, peak.intensity / 100);
            beats[bestIdx].tier = barBeat === 0 ? 1 : barBeat === 2 ? 2 : 3;
            beats[bestIdx].isDrop = true;
            const timingBonus = 1.0 - (bestDist / (beatInterval * 4));
            beats[bestIdx].mult = 1.0 + timingBonus * 0.8 + intensityFactor * 0.4;
            scheduled++;
          }
        }
      } else {
        for (const peak of peaks) {
          let bestIdx = -1;
          let bestDist = Infinity;
          for (let i = 0; i < beats.length; i++) {
            const dist = Math.abs(beats[i].time - peak.time);
            if (dist < bestDist && dist < beatInterval * 3) { bestDist = dist; bestIdx = i; }
          }
          if (bestIdx >= 0) {
            const barBeat = Math.round(beats[bestIdx].time / beatInterval) % 4;
            const intensityFactor = Math.min(1, peak.intensity / 100);
            beats[bestIdx].tier = barBeat === 0 ? 1 : barBeat === 2 ? 2 : 3;
            beats[bestIdx].isDrop = barBeat === 0 || barBeat === 2;
            beats[bestIdx].mult = 1.2 + intensityFactor * 0.6;
          }
        }
      }
    } else {
      const peakMoments = highlights.filter(h => h.intensity > 50).map(h => h.time);
      for (let i = 0; i < beats.length; i++) {
        const t = beats[i].time;
        const barBeat = Math.round(t / beatInterval) % 4;
        beats[i].tier = barBeat === 0 ? 1 : barBeat === 2 ? 2 : 3;
        const nearPeak = peakMoments.some(p => Math.abs(p - t) < beatInterval);
        beats[i].isDrop = nearPeak && (barBeat === 0 || barBeat === 2);
        beats[i].mult = nearPeak ? 1.4 : 1;
      }
    }
    return beats;
  }
}
