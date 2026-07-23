import { Component } from '@angular/core';
import { StateService, TRACKS } from '../services/state-service';
import { AudioService } from '../services/audio-service';

@Component({
  selector: 'step-music',
  template: `
    <div class="step" id="stepMusic">
      <div class="step-header">
        <div class="step-badge">2</div>
        <h2>Select Music</h2>
      </div>
      <p class="step-desc">Upload your own track or choose a built-in beat</p>

      <div class="music-upload" (click)="onUploadClick($event)">
        <input #musicInput type="file" accept="audio/*" (change)="onFileChange($event)" hidden>
        <div class="upload-zone small" (dragover)="onDragOver($event)" (dragleave)="onDragLeave()" (drop)="onDrop($event)">
          <span class="upload-link">🎵 Click to upload or drag & drop audio</span>
        </div>
      </div>

      <div class="file-info" id="musicFileInfo" [class.show]="musicInfo" style="margin-bottom:16px">
        <span class="file-icon">🎵</span>
        <span>{{ musicInfo }}</span>
      </div>

      <div class="bpm-display" id="bpmDisplay">{{ bpmText }}</div>

      <div class="volume-controls" id="volumeControls" [style.display]="showVolume ? 'block' : 'none'">
        <div class="vol-row">
          <label>Music volume</label>
          <input type="range" min="0" max="100" [value]="musicVol" (input)="onMusicVol($event)" />
          <span class="vol-val" id="musicVolumeVal">{{ musicVol }}%</span>
        </div>
        <div class="vol-row">
          <label>Original audio</label>
          <input type="range" min="0" max="100" [value]="origVol" (input)="onOrigVol($event)" />
          <span class="vol-val" id="origVolumeVal">{{ origVol }}%</span>
        </div>
      </div>

      <div class="section-title">Built-in tracks</div>
      <div class="track-grid" id="trackGrid">
        <div *ngFor="let t of tracks" class="track-card" [class.active]="t.id === state.music().selectedTrack" (click)="selectTrack(t.id)">
          <div class="track-name">{{ t.label }}</div>
          <div class="track-bpm">{{ t.bpm }} BPM</div>
        </div>
      </div>

      <div class="step-nav">
        <button class="btn btn-ghost" (click)="goBack()">← Back</button>
        <button class="btn btn-glow" (click)="goNext()">Next →</button>
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
  standalone: false,
})
export class StepMusic {
  tracks = Object.entries(TRACKS).map(([id, t]) => ({ id, ...t }));
  musicInfo = '';
  bpmText = '';
  showVolume = false;
  musicVol = 70;
  origVol = 50;

  constructor(
    public state: StateService,
    private audio: AudioService,
  ) {
    const m = this.state.music();
    this.musicVol = Math.round(m.volume * 100);
    this.origVol = Math.round(m.origVolume * 100);
    if (m.bpm) this.bpmText = m.bpm + ' BPM';
  }

  onUploadClick(e: MouseEvent): void {
    const inp = document.getElementById('musicInput') as HTMLInputElement;
    if (e.target !== inp && !inp.contains(e.target as Node)) inp.click();
  }

  onDragOver(e: DragEvent): void { e.preventDefault(); (e.target as HTMLElement).style.borderColor = 'rgba(6,182,212,.3)'; }
  onDragLeave(): void { document.querySelector('.music-upload .upload-zone')?.removeAttribute('style'); }
  onDrop(e: DragEvent): void {
    e.preventDefault();
    const el = e.target as HTMLElement;
    el.style.borderColor = '';
    if (e.dataTransfer?.files.length) this.handleMusicFile(e.dataTransfer.files[0]);
  }
  onFileChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.handleMusicFile(input.files[0]);
  }

  async handleMusicFile(file: File): Promise<void> {
    const validExt = /\.(mp3|wav|aac|flac|ogg|m4a|wma)$/i;
    if (!file.type.startsWith('audio/') && !validExt.test(file.name)) {
      alert('Unsupported audio format. Use MP3, WAV, AAC, FLAC, OGG, or M4A.');
      return;
    }
    const m = this.state.music();
    m.file = file;
    m.selectedTrack = null;
    this.state.music.set(m);
    document.querySelectorAll('.track-card').forEach(x => x.classList.remove('active'));
    this.musicInfo = '🎵 ' + file.name + ' (' + this.state.fmtSize(file.size) + ')';
    await this.audio.analyzeMusicFile(file);
    this.bpmText = this.state.music().bpm + ' BPM';
    this.showVolume = true;
    const inp = document.getElementById('musicInput') as HTMLInputElement;
    if (inp) inp.value = '';
  }

  selectTrack(id: string): void {
    const track = TRACKS[id];
    if (!track) return;
    const m = this.state.music();
    m.selectedTrack = id;
    m.file = null;
    m.buffer = null;
    this.state.music.set(m);
    this.musicInfo = '';
    const inp = document.getElementById('musicInput') as HTMLInputElement;
    if (inp) inp.value = '';
    document.querySelectorAll('.track-card').forEach(x => x.classList.toggle('active', (x as HTMLElement).dataset['track'] === id));
    this.audio.generateBuiltInTrack(id);
    this.bpmText = track.bpm + ' BPM';
    this.showVolume = true;
  }

  onMusicVol(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.musicVol = parseInt(val);
    const m = this.state.music();
    m.volume = this.musicVol / 100;
    this.state.music.set(m);
  }

  onOrigVol(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.origVol = parseInt(val);
    const m = this.state.music();
    m.origVolume = this.origVol / 100;
    this.state.music.set(m);
  }

  goBack(): void {
    if (this.state.videoUrl()) { URL.revokeObjectURL(this.state.videoUrl()!); }
    this.state.videoUrl.set(null);
    this.state.videoFile.set(null);
    this.state.currentStep.set('stepUpload');
  }

  goNext(): void {
    const m = this.state.music();
    if (!m.buffer && !m.selectedTrack) {
      alert('Please select or upload a music track first.');
      return;
    }
    this.state.currentStep.set('stepTimeline');
  }
}
