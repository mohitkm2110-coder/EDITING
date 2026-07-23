import { Component, OnInit } from '@angular/core';
import { StateService, CATEGORY_MAP, GRADE_PRESETS } from '../services/state-service';

@Component({
  selector: 'step-settings',
  template: `
    <div class="step" id="stepSettings">
      <div class="step-header">
        <div class="step-badge">4</div>
        <h2>Editing Options</h2>
      </div>

      <div class="section-title">Category</div>
      <div class="category-grid">
        <div *ngFor="let c of categories" class="category-card" [class.active]="c.id === state.currentCategory()" [attr.data-category]="c.id" (click)="selectCategory(c.id)">
          <div class="cat-icon">{{ c.icon }}</div>
          <div class="cat-name">{{ c.name }}</div>
          <div class="cat-desc">{{ c.desc }}</div>
        </div>
      </div>

      <div class="grade-section">
        <div class="grade-header">
          <span>Color Grade</span>
          <span class="grade-label" id="gradeLabel">{{ gradeLabel }}</span>
        </div>
        <div class="grade-control">
          <input type="range" min="0" max="100" id="gradeIntensity" [value]="state.settings().gradeIntensity" (input)="onGradeIntensity($event)" />
          <span class="grade-val" id="gradeIntensityVal">{{ state.settings().gradeIntensity }}%</span>
        </div>
      </div>

      <div class="section-title">Export Settings</div>
      <div class="pill-group" id="exportRes">
        <span *ngFor="let r of resolutions" class="pill" [class.active]="r === activeRes" [attr.data-value]="r" (click)="setPill('exportRes', r)">{{ r }}p</span>
      </div>
      <div class="pill-group" id="exportFps">
        <span *ngFor="let f of fpsOptions" class="pill" [class.active]="f === activeFps" [attr.data-value]="f" (click)="setPill('exportFps', f)">{{ f }} FPS</span>
      </div>
      <div class="pill-group" id="exportQuality">
        <span *ngFor="let q of qualities" class="pill" [class.active]="q === activeQuality" [attr.data-value]="q" (click)="setPill('exportQuality', q)">{{ q }}</span>
      </div>
      <div class="pill-group" id="exportFormat">
        <span *ngFor="let f of formats" class="pill" [class.active]="f === activeFormat" [attr.data-value]="f" (click)="setPill('exportFormat', f)">{{ f.toUpperCase() }}</span>
      </div>

      <div class="step-nav">
        <button class="btn btn-ghost" (click)="goBack()">← Back</button>
        <button class="btn btn-glow" (click)="generate()">Generate Edit</button>
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
  standalone: false,
})
export class StepSettings implements OnInit {
  categories = [
    { id: 'gaming', name: 'Gaming', icon: '🎮', desc: 'Clean, crisp, vibrant' },
    { id: 'cinematic', name: 'Cinematic', icon: '🎬', desc: 'Film-like, moody, controlled' },
    { id: 'viral', name: 'Viral', icon: '🚀', desc: 'Punchy, eye-catching, bold' },
  ];
  resolutions = [720, 1080, 1440, 2160];
  fpsOptions = [24, 30, 60];
  qualities = ['standard', 'high', 'ultra'];
  formats = ['mp4', 'mov'];

  activeRes = 1080;
  activeFps = 30;
  activeQuality = 'standard';
  activeFormat = 'mp4';
  gradeLabel = '';

  constructor(public state: StateService) {}

  ngOnInit(): void {
    const exp = this.state.export();
    this.activeRes = exp.resolution;
    this.activeFps = exp.fps;
    this.activeQuality = exp.quality;
    this.activeFormat = exp.format;
    this.updateGradeLabel();
  }

  selectCategory(id: string): void {
    this.state.currentCategory.set(id);
    const s = this.state.settings();
    s.platform = CATEGORY_MAP[id].platform;
    this.state.settings.set(s);
    this.updateGradeLabel();
  }

  updateGradeLabel(): void {
    const cat = CATEGORY_MAP[this.state.currentCategory()];
    const preset = GRADE_PRESETS[cat.preset];
    this.gradeLabel = preset ? preset.label : '';
  }

  onGradeIntensity(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value);
    const s = this.state.settings();
    s.gradeIntensity = val;
    this.state.settings.set(s);
  }

  setPill(group: string, value: string | number): void {
    const exp = this.state.export();
    const key = group.replace('export', '').toLowerCase();
    (exp as any)[key] = typeof value === 'string' && key !== 'format' ? value : value;
    this.state.export.set(exp);
    if (key === 'resolution') this.activeRes = value as number;
    if (key === 'fps') this.activeFps = value as number;
    if (key === 'quality') this.activeQuality = value as string;
    if (key === 'format') this.activeFormat = value as string;
  }

  goBack(): void {
    this.state.currentStep.set('stepTimeline');
  }

  generate(): void {
    this.state.currentStep.set('stepProcessing');
  }
}
