import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { StateService } from '../services/state-service';
import { AudioService } from '../services/audio-service';

@Component({
  selector: 'step-timeline',
  template: `
    <div class="step" id="stepTimeline">
      <div class="step-header">
        <div class="step-badge">3</div>
        <h2>Audio Adjustment</h2>
      </div>
      <p class="step-desc">Fine-tune the music offset and audio mix</p>

      <div class="tl-video-wrap">
        <video #tlVideo id="tlVideo" playsinline></video>
      </div>

      <div class="tl-playback">
        <button class="btn btn-sm btn-ghost" (click)="togglePlay()" id="btnPlay">
          <span id="playIcon">▶</span><span id="pauseIcon" style="display:none">⏸</span>
        </button>
        <span class="tl-time" id="tlTimeDisplay">{{ timeDisplay }}</span>
      </div>

      <div class="tl-scrub-bar" #tlScrubBar id="tlScrubBar">
        <div class="tl-scrub-fill" #tlScrubFill id="tlScrubFill" [style.width.%]="scrubPct"></div>
        <div class="tl-scrub-thumb" #tlScrubThumb id="tlScrubThumb" [style.left.%]="scrubPct"></div>
      </div>

      <div class="tl-time-label" id="tlTimeLabel">{{ timeLabel }}</div>

      <div class="tl-ruler" #tlRuler id="tlRuler"></div>

      <div class="tl-waveform-wrap" #tlWaveformWrap id="tlWaveformWrap">
        <canvas #tlWaveform id="tlWaveform"></canvas>
        <div class="tl-beats-overlay" #tlBeatsOverlay id="tlBeatsOverlay"></div>
        <div class="tl-region-left" #tlRegionLeft id="tlRegionLeft"></div>
        <div class="tl-region-right" #tlRegionRight id="tlRegionRight"></div>
      </div>

      <div class="tl-controls">
        <div class="tl-control-row">
          <label>Offset</label>
          <input type="range" min="-100" max="100" #tlOffset id="tlOffset" [value]="offsetVal" (input)="onOffset($event)" />
          <span class="tl-offset-val" #tlOffsetVal id="tlOffsetVal">{{ offsetText }}</span>
        </div>
        <div class="tl-control-row">
          <label>Beat sync</label>
          <input type="checkbox" #tlBeatSync id="tlBeatSync" [checked]="beatSync" (change)="onBeatSync($event)" />
        </div>
        <div class="tl-control-row">
          <label>Video audio</label>
          <input type="range" min="0" max="100" #tlOrigVol id="tlOrigVol" [value]="origVolVal" (input)="onOrigVol($event)" />
          <span class="vol-val" #tlOrigVolVal id="tlOrigVolVal">{{ origVolVal }}%</span>
          <button class="btn btn-xs btn-ghost" (click)="toggleMute()" id="tlMuteOrig">{{ muted ? '🔇' : '🔊' }}</button>
        </div>
        <div class="tl-control-row">
          <label>Music volume</label>
          <input type="range" min="0" max="100" #tlMusicVol id="tlMusicVol" [value]="musicVolVal" (input)="onMusicVol($event)" />
          <span class="vol-val" #tlMusicVolVal id="tlMusicVolVal">{{ musicVolVal }}%</span>
        </div>
      </div>

      <div class="tl-bpm" id="tlBpmDisplay">{{ bpmText }}</div>

      <div class="step-nav">
        <button class="btn btn-ghost" (click)="goBack()">← Back</button>
        <button class="btn btn-glow" (click)="goNext()">Next →</button>
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
  standalone: false,
})
export class StepTimeline implements AfterViewInit, OnDestroy {
  @ViewChild('tlVideo') tlVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('tlScrubBar') tlScrubBar!: ElementRef;
  @ViewChild('tlScrubFill') tlScrubFill!: ElementRef;
  @ViewChild('tlScrubThumb') tlScrubThumb!: ElementRef;
  @ViewChild('tlRuler') tlRuler!: ElementRef;
  @ViewChild('tlWaveformWrap') tlWaveformWrap!: ElementRef;
  @ViewChild('tlWaveform') tlWaveform!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tlBeatsOverlay') tlBeatsOverlay!: ElementRef;
  @ViewChild('tlRegionLeft') tlRegionLeft!: ElementRef;
  @ViewChild('tlRegionRight') tlRegionRight!: ElementRef;

  scrubPct = 0;
  timeDisplay = '0:00 / 0:00';
  timeLabel = '0:00';
  offsetVal = 0;
  offsetText = '+0.0s';
  beatSync = true;
  origVolVal = 50;
  musicVolVal = 70;
  muted = false;
  bpmText = '';
  playing = false;

  private animFrameId = 0;

  constructor(
    private state: StateService,
    private audio: AudioService,
  ) {
    const m = this.state.music();
    this.origVolVal = Math.round(m.origVolume * 100);
    this.musicVolVal = Math.round(m.volume * 100);
    this.offsetVal = Math.round((m.offset || 0) * 10);
    const sign = m.offset >= 0 ? '+' : '';
    this.offsetText = sign + (m.offset || 0).toFixed(1) + 's';
    if (m.bpm) this.bpmText = m.bpm + ' BPM';
  }

  ngAfterViewInit(): void {
    this.initTimeline();
  }

  ngOnDestroy(): void {
    this.destroyTimeline();
  }

  private initTimeline(): void {
    const dur = this.state.videoDuration();
    if (!dur) return;
    const video = this.tlVideo.nativeElement;
    video.src = this.state.videoUrl()!;
    video.load();
    video.volume = this.state.music().origVolume;
    video.muted = false;
    this.timeDisplay = '0:00 / ' + this.state.fmtTime(dur);
    this.drawRuler();
    this.drawWaveform();
    this.drawBeatMarkers();
    this.audio.setupMusicGain();
    this.setupScrubEvents();
    this.setupKeyboard();
  }

  private destroyTimeline(): void {
    cancelAnimationFrame(this.animFrameId);
    this.playing = false;
    this.audio.stopMusic();
    const video = this.tlVideo?.nativeElement;
    if (video) { video.pause(); video.src = ''; video.load(); }
  }

  private setupKeyboard(): void {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
    };
    document.addEventListener('keydown', handler);
    // Store reference for cleanup — using destroy zone
    (this as any).__keyHandler = handler;
  }

  private setupScrubEvents(): void {
    const bar = this.tlScrubBar?.nativeElement;
    if (!bar) return;
    let dragging = false;
    const scrub = (e: MouseEvent | TouchEvent) => {
      const rect = bar.getBoundingClientRect();
      const x = ('touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX) - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      this.seekTo(pct);
    };
    bar.addEventListener('mousedown', (e: MouseEvent) => { dragging = true; scrub(e); });
    document.addEventListener('mousemove', (e: MouseEvent) => { if (dragging) scrub(e); });
    document.addEventListener('mouseup', () => { dragging = false; });

    const ww = this.tlWaveformWrap?.nativeElement;
    if (ww) {
      let wDragging = false;
      const wScrub = (e: MouseEvent | TouchEvent) => {
        const rect = ww.getBoundingClientRect();
        const x = ('touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX) - rect.left;
        this.seekTo(Math.max(0, Math.min(1, x / rect.width)));
      };
      ww.addEventListener('mousedown', (e: MouseEvent) => { wDragging = true; wScrub(e); });
      document.addEventListener('mousemove', (e: MouseEvent) => { if (wDragging) wScrub(e); });
      document.addEventListener('mouseup', () => { wDragging = false; });
    }
  }

  togglePlay(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  private play(): void {
    const video = this.tlVideo?.nativeElement;
    if (!video || !video.src) return;
    video.play().then(() => {
      this.audio.startMusic(video.currentTime, this.state.music().offset);
      this.playing = true;
      this.frameLoop();
    }).catch(console.warn);
  }

  private pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.tlVideo.nativeElement.pause();
    this.audio.stopMusic();
  }

  private frameLoop(): void {
    if (!this.playing) return;
    const video = this.tlVideo.nativeElement;
    const ct = video.currentTime;
    const dur = this.state.videoDuration();
    const pct = Math.min(1, ct / dur);
    this.scrubPct = pct * 100;
    this.timeDisplay = this.state.fmtTime(ct) + ' / ' + this.state.fmtTime(dur);
    this.timeLabel = this.state.fmtTime(ct);
    if (ct >= dur - 0.05) { this.stop(); return; }
    this.animFrameId = requestAnimationFrame(() => this.frameLoop());
  }

  private stop(): void {
    this.pause();
    if (this.tlVideo) this.tlVideo.nativeElement.currentTime = 0;
    this.scrubPct = 0;
  }

  private seekTo(pct: number): void {
    const dur = this.state.videoDuration();
    const ct = pct * dur;
    const video = this.tlVideo?.nativeElement;
    if (video && video.readyState >= 1) {
      video.currentTime = ct;
      if (this.playing) this.audio.startMusic(ct, this.state.music().offset);
    }
    this.scrubPct = pct * 100;
    this.timeDisplay = this.state.fmtTime(ct) + ' / ' + this.state.fmtTime(dur);
    this.timeLabel = this.state.fmtTime(ct);
  }

  onOffset(e: Event): void {
    const val = parseFloat((e.target as HTMLInputElement).value);
    this.offsetVal = val;
    const offset = val / 10;
    const m = this.state.music();
    m.offset = offset;
    this.state.music.set(m);
    const sign = offset >= 0 ? '+' : '';
    this.offsetText = sign + offset.toFixed(1) + 's';
    if (this.playing && this.tlVideo) {
      this.audio.startMusic(this.tlVideo.nativeElement.currentTime, offset);
    }
    this.drawWaveform();
    this.drawBeatMarkers();
  }

  onBeatSync(e: Event): void {
    this.beatSync = (e.target as HTMLInputElement).checked;
    this.drawBeatMarkers();
  }

  onOrigVol(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value);
    this.origVolVal = val;
    const m = this.state.music();
    m.origVolume = val / 100;
    this.state.music.set(m);
    if (this.tlVideo) this.tlVideo.nativeElement.volume = this.muted ? 0 : val / 100;
  }

  onMusicVol(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value);
    this.musicVolVal = val;
    const m = this.state.music();
    m.volume = val / 100;
    this.state.music.set(m);
    this.audio.updateMusicGain(val / 100);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.tlVideo) this.tlVideo.nativeElement.muted = this.muted;
  }

  private drawRuler(): void {
    const ruler = this.tlRuler?.nativeElement;
    if (!ruler) return;
    const dur = this.state.videoDuration();
    let html = '';
    for (let t = 0; t < dur; t += 2) {
      const pct = (t / dur) * 100;
      if (t % 10 === 0) html += '<div class="tl-ruler-mark" style="left:' + pct + '%"><span>' + this.state.fmtTime(t) + '</span></div>';
      else if (t % 4 === 0) html += '<div class="tl-ruler-tick" style="left:' + pct + '%"></div>';
    }
    ruler.innerHTML = html;
  }

  private drawWaveform(): void {
    const canvas = this.tlWaveform?.nativeElement;
    if (!canvas) return;
    const wrap = this.tlWaveformWrap.nativeElement as HTMLElement;
    const w = wrap.offsetWidth || 600;
    const h = 80;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const c = canvas.getContext('2d')!;
    c.scale(2, 2);
    c.clearRect(0, 0, w, h);
    const buf = this.state.music().buffer;
    if (!buf) {
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('No music selected — waveform will appear here', w / 2, h / 2 + 4);
      return;
    }
    const dur = this.state.videoDuration();
    const musicDur = buf.duration;
    const sr = buf.sampleRate;
    const ch = buf.getChannelData(0);
    const totalSamples = ch.length;
    const offsetSec = this.state.music().offset;

    const regionL = this.tlRegionLeft?.nativeElement as HTMLElement;
    const regionR = this.tlRegionRight?.nativeElement as HTMLElement;
    if (regionL && regionR) {
      if (offsetSec >= 0) {
        const gapPct = (offsetSec / dur) * 100;
        const musicEndPct = Math.min(100, ((offsetSec + musicDur) / dur) * 100);
        regionL.style.width = gapPct + '%';
        regionL.style.display = gapPct > 0.5 ? '' : 'none';
        regionR.style.left = musicEndPct + '%';
        regionR.style.width = (100 - musicEndPct) + '%';
        regionR.style.display = (100 - musicEndPct) > 0.5 ? '' : 'none';
      } else {
        regionL.style.width = '0%'; regionL.style.display = 'none';
        const musicEndPct = Math.min(100, (musicDur / dur) * 100);
        regionR.style.left = musicEndPct + '%';
        regionR.style.width = (100 - musicEndPct) + '%';
        regionR.style.display = (100 - musicEndPct) > 0.5 ? '' : 'none';
      }
    }

    const pxPerSec = w / dur;
    const totalPx = Math.ceil(dur * pxPerSec);
    const barW = Math.max(1, w / totalPx);
    const midY = h / 2;
    for (let px = 0; px < totalPx; px++) {
      const videoTime = (px / totalPx) * dur;
      const musicTime = videoTime + offsetSec;
      let energy = 0;
      if (musicTime >= 0 && musicTime < musicDur) {
        const startS = Math.floor(musicTime * sr);
        const nSamples = Math.max(1, Math.floor(totalSamples / totalPx));
        let sum = 0, cnt = 0;
        for (let s = startS; s < Math.min(startS + nSamples, totalSamples); s++) { sum += ch[s] * ch[s]; cnt++; }
        energy = cnt ? Math.sqrt(sum / cnt) * 3 : 0;
      }
      const barH = Math.min(h * 0.45, energy * h * 0.8);
      const x = px * barW;
      const active = musicTime >= 0 && musicTime < musicDur;
      c.fillStyle = active ? 'rgba(6,182,212,' + (0.2 + energy * 0.5) + ')' : 'rgba(255,255,255,0.03)';
      c.fillRect(x, midY - barH, Math.max(1, barW - 0.5), Math.max(1, barH * 2));
    }
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(0, midY - 0.5, w, 1);
  }

  private drawBeatMarkers(): void {
    const overlay = this.tlBeatsOverlay?.nativeElement as HTMLElement;
    if (!overlay) return;
    overlay.innerHTML = '';
    if (!this.beatSync || !this.state.music().buffer) return;
    const bpm = this.state.music().bpm || 120;
    const beatInt = 60 / bpm;
    const dur = this.state.videoDuration();
    const musicDur = this.state.music().buffer!.duration;
    const offsetSec = this.state.music().offset;
    const impactTimes = new Set<number>();
    if (this.state.music().analysis) {
      this.state.music().analysis!.beats.forEach(mb => { if (mb.isImpact) impactTimes.add(mb.time); });
    }
    const totalBeats = Math.ceil(dur / beatInt) + 4;
    for (let i = 0; i < totalBeats; i++) {
      const beatTime = i * beatInt;
      const musicTime = beatTime + offsetSec;
      if (musicTime < 0 || musicTime > musicDur) continue;
      const pct = (beatTime / dur) * 100;
      if (pct > 100) break;
      const m = document.createElement('div');
      m.className = 'tl-beat-marker' + (impactTimes.has(musicTime) ? ' impact' : '');
      m.style.left = pct + '%';
      overlay.appendChild(m);
    }
  }

  goBack(): void {
    this.destroyTimeline();
    this.state.currentStep.set('stepMusic');
  }

  goNext(): void {
    this.destroyTimeline();
    this.state.currentStep.set('stepSettings');
  }
}
