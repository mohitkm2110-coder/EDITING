import { Component, signal, effect } from '@angular/core';
import { StateService } from './services/state-service';
import { VideoAnalysisService } from './services/video-analysis-service';
import { EffectsService } from './services/effects-service';
import { ExportService } from './services/export-service';

@Component({
  selector: 'app-root',
  template: `
    <div class="app-container">
      <header class="app-header">
        <div class="logo">
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 80 Q 30 20, 50 50 T 90 30" stroke="url(#logoGrad)" stroke-width="6" stroke-linecap="round" fill="none"/>
            <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs>
          </svg>
          <span class="logo-text">Deep Wave</span>
        </div>
      </header>

      <main>
        <step-upload *ngIf="state.currentStep() === 'stepUpload'"></step-upload>
        <step-music *ngIf="state.currentStep() === 'stepMusic'"></step-music>
        <step-timeline *ngIf="state.currentStep() === 'stepTimeline'"></step-timeline>
        <step-settings *ngIf="state.currentStep() === 'stepSettings'"></step-settings>
        <step-preview *ngIf="state.currentStep() === 'stepPreview'" [originalUrl]="originalUrl" [editedUrl]="editedUrl" [exportUrl]="exportUrl" [exportExt]="exportExt"></step-preview>
      </main>

      <processing-overlay [visible]="state.currentStep() === 'stepProcessing'" [currentStep]="procStep" [progress]="procProgress" [stageText]="procStage" (cancel)="cancelRender()"></processing-overlay>
    </div>
  `,
  styles: [':host { display: contents; }'],
  standalone: false,
})
export class App {
  procStep = 0;
  procProgress = 0;
  procStage = '';
  originalUrl = '';
  editedUrl = '';
  exportUrl = '';
  exportExt = 'mp4';

  private finishedProcessing = signal(false);

  constructor(
    public state: StateService,
    private videoAnalysis: VideoAnalysisService,
    private effects: EffectsService,
    private exportService: ExportService,
  ) {
    effect(() => {
      const step = state.currentStep();
      if (step === 'stepProcessing' && !this.finishedProcessing()) {
        this.startEditing();
      }
      if (step === 'stepTimeline') {
        this.finishedProcessing.set(false);
      }
    });
  }

  private setProcStep(step: number): void {
    this.procStep = step;
    const labels = [
      'Analyzing video content...',
      'Detecting scene changes...',
      'Analyzing audio track...',
      'Detecting highlights...',
      'Analyzing source characteristics...',
      'Applying effects...',
      'Rendering video...',
      'Finalizing...',
    ];
    this.procStage = labels[step] || '';
  }

  async startEditing(): Promise<void> {
    if (!this.state.videoFile()) return;
    this.state.cancelling.set(false);
    this.finishedProcessing.set(false);
    this.setProcStep(0);
    this.procProgress = 0;

    try {
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.preload = 'auto';
      video.src = this.state.videoUrl()!;
      video.load();
      const hidden = document.createElement('div');
      hidden.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden';
      hidden.append(video);
      document.body.append(hidden);
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        setTimeout(() => reject(new Error('Timeout loading video')), 10000);
      });
      await new Promise<void>(r => {
        if (video.readyState >= 2) r();
        else { video.oncanplaythrough = () => r(); setTimeout(r, 15000); }
      });

      this.setProcStep(1);
      await new Promise(r => setTimeout(r, 300));

      this.setProcStep(2);
      const scenes = await this.videoAnalysis.detectScenes(video, pct => {
        this.procProgress = pct * 30;
      });

      this.setProcStep(3);
      const audioEvents = await this.videoAnalysis.analyzeAudio(video, pct => {
        this.procProgress = 30 + pct * 15;
      });

      this.setProcStep(4);
      const highlights = await this.videoAnalysis.detectHighlights(video, pct => {
        this.procProgress = 45 + pct * 15;
      });

      const analysis = this.state.analysis();
      analysis.scenes = scenes;
      analysis.highlights = highlights;
      analysis.audioEvents = audioEvents;
      this.state.analysis.set(analysis);

      this.setProcStep(5);
      const sourceInfo = await this.effects.analyzeSourceVideo(video, 6);
      const a = this.state.analysis();
      a.sourceGradeMod = sourceInfo.mod;
      this.state.analysis.set(a);
      await new Promise(r => setTimeout(r, 200));

      this.setProcStep(6);
      await new Promise(r => setTimeout(r, 200));

      this.setProcStep(7);
      const result = await this.exportService.renderEdit(video, scenes, highlights, audioEvents, pct => {
        this.procProgress = 60 + pct * 35;
      });

      this.setProcStep(8);
      this.procProgress = 100;
      await new Promise(r => setTimeout(r, 500));

      video.pause();
      video.src = '';
      hidden.remove();

      this.originalUrl = this.state.videoUrl()!;
      this.editedUrl = result.url;
      this.exportUrl = result.url;
      this.exportExt = result.ext;
      this.finishedProcessing.set(true);
      this.state.currentStep.set('stepPreview');

    } catch (err: any) {
      console.error(err);
      alert('Error: ' + (err.message || 'Processing failed'));
      this.state.currentStep.set('stepSettings');
    }
  }

  cancelRender(): void {
    this.exportService.cancelRender();
    this.state.currentStep.set('stepSettings');
  }
}
