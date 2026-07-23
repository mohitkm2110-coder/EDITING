import { Injectable, signal } from '@angular/core';

export interface Track { label: string; bpm: number; }
export const TRACKS: Record<string, Track> = {
  neon: { label: 'Neon Nights', bpm: 128 },
  epic: { label: 'Epic Rise', bpm: 90 },
  urban: { label: 'Urban Flow', bpm: 140 },
  chill: { label: 'Chill Wave', bpm: 80 },
};

export interface Scene { start: number; end: number; }
export interface Highlight { time: number; intensity: number; }
export interface AudioEvent { time: number; volume: number; }

export interface GradePixel {
  shadows: { lift: number; compress: number };
  highlights: { rolloff: number; boost: number };
  gamma: number;
  warmth: number;
}

export interface GradePreset {
  label: string;
  filter: (i: number) => string;
  shadows: { lift: number; compress: number };
  highlights: { rolloff: number; boost: number };
  gamma: number;
  warmth: number;
}

export const GRADE_PRESETS: Record<string, GradePreset> = {
  gaming: {
    label: 'Gaming — Clean, crisp, vibrant',
    filter: (i: number) => `contrast(${1 + 0.12 * i}) saturate(${1 + 0.15 * i}) brightness(${1 - 0.01 * i})`,
    shadows: { lift: 0, compress: 0 },
    highlights: { rolloff: 0, boost: 0 },
    gamma: 1,
    warmth: 0,
  },
  cinematic: {
    label: 'Cinematic — Film-like, moody, controlled',
    filter: (i: number) => `contrast(${1 + 0.06 * i}) saturate(${1 - 0.14 * i}) brightness(${1 - 0.06 * i})`,
    shadows: { lift: 14, compress: 0 },
    highlights: { rolloff: -8, boost: 0 },
    gamma: 1 - 0.02,
    warmth: 6,
  },
  viral: {
    label: 'Viral — Punchy, eye-catching, bold',
    filter: (i: number) => `contrast(${1 + 0.2 * i}) saturate(${1 + 0.24 * i}) brightness(${1 + 0.02 * i})`,
    shadows: { lift: -4, compress: 8 },
    highlights: { rolloff: 0, boost: 10 },
    gamma: 1 - 0.08,
    warmth: 0,
  },
};

export const CATEGORY_MAP: Record<string, { preset: string; platform: string; videoType: string; intensity: string; intMult: number }> = {
  gaming: { preset: 'gaming', platform: 'youtube', videoType: 'gaming', intensity: 'medium', intMult: 1.0 },
  cinematic: { preset: 'cinematic', platform: 'reels', videoType: 'cinematic', intensity: 'medium', intMult: 1.0 },
  viral: { preset: 'viral', platform: 'tiktok', videoType: 'viral', intensity: 'high', intMult: 1.5 },
};

export interface BeatInfo { time: number; energy: number; smooth: number; energyDelta: number; isImpact: boolean; isDrop: boolean; }

@Injectable({ providedIn: 'root' })
export class StateService {
  currentStep = signal<string>('stepUpload');
  videoFile = signal<File | null>(null);
  videoUrl = signal<string | null>(null);
  videoDuration = signal<number>(0);
  videoWidth = signal<number>(1920);
  videoHeight = signal<number>(1080);
  cancelling = signal<boolean>(false);

  settings = signal<{ platform: string; gradeIntensity: number }>({ platform: 'youtube', gradeIntensity: 70 });

  export = signal<{ resolution: number; fps: number; quality: string; format: string }>({ resolution: 1080, fps: 30, quality: 'standard', format: 'mp4' });

  analysis = signal<{ scenes: Scene[]; highlights: Highlight[]; audioEvents: AudioEvent[]; sourceGradeMod: number }>({ scenes: [], highlights: [], audioEvents: [], sourceGradeMod: 1 });

  music = signal<{ file: File | null; buffer: AudioBuffer | null; selectedTrack: string | null; bpm: number; beats: number[]; volume: number; origVolume: number; offset: number; analysis: { beats: BeatInfo[]; impactThreshold: number } | null }>({
    file: null, buffer: null, selectedTrack: null, bpm: 120, beats: [], volume: 0.7, origVolume: 0.5, offset: 0, analysis: null,
  });

  currentCategory = signal<string>('cinematic');

  fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  fmtSize(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  getCategory() {
    return CATEGORY_MAP[this.currentCategory()];
  }

  getGradeFilter(intensity: number): { filter: string; pixel: GradePixel | null } {
    const cat = this.getCategory();
    const preset = GRADE_PRESETS[cat.preset];
    if (!preset) return { filter: 'none', pixel: null };
    const i = Math.max(0, Math.min(1, intensity));
    return {
      filter: preset.filter(i),
      pixel: {
        shadows: { lift: preset.shadows.lift * i, compress: preset.shadows.compress * i },
        highlights: { rolloff: preset.highlights.rolloff * i, boost: preset.highlights.boost * i },
        gamma: 1 - (1 - preset.gamma) * i,
        warmth: preset.warmth * i,
      },
    };
  }

  getTemplate() {
    const cat = this.getCategory();
    const gi = this.settings().gradeIntensity / 100;
    const mod = this.analysis().sourceGradeMod || 1;
    const effectiveIntensity = Math.max(0, Math.min(1, gi * mod));
    const appGrade = this.getGradeFilter(effectiveIntensity);

    const presets: Record<string, any> = {
      gaming: {
        filter: appGrade.filter,
        shake: { max: 2, decay: 0.92, cooldown: 2.0 },
        zoom: { max: 0.025, decay: 0.93, cooldown: 2.0 },
        flash: { maxOpacity: 0.05, decay: 0.9 },
        vignette: true,
        transition: { frames: 3, opacity: 0.08 },
        beatSync: 'high',
        sparseEffects: true,
        grade: appGrade.pixel,
        tiers: { 1: { shake: 2, flash: 0.05, zoom: 0.025 }, 2: { flash: 0.03, zoom: 0.015 }, 3: { zoom: 0.008 }, 4: {} },
      },
      cinematic: {
        filter: appGrade.filter,
        shake: { max: 2, decay: 0.92, cooldown: 1.2 },
        zoom: { max: 0.04, decay: 0.93, cooldown: 1.0 },
        flash: { maxOpacity: 0.07, decay: 0.88 },
        vignette: true,
        transition: { frames: 4, opacity: 0.12 },
        beatSync: 'normal',
        grade: appGrade.pixel,
        tiers: { 1: { flash: 0.06, zoom: 0.04 }, 2: { flash: 0.04, zoom: 0.02 }, 3: { flash: 0.025 }, 4: { flash: 0.015 } },
      },
      viral: {
        filter: appGrade.filter,
        shake: { max: 6, decay: 0.84, cooldown: 0.35 },
        zoom: { max: 0.1, decay: 0.85, cooldown: 0.35 },
        flash: { maxOpacity: 0.15, decay: 0.8 },
        vignette: true,
        transition: { frames: 2, opacity: 0.15 },
        beatSync: 'normal',
        grade: appGrade.pixel,
        tiers: { 1: { shake: 6, flash: 0.15, zoom: 0.1 }, 2: { shake: 3.5, flash: 0.1, zoom: 0.05 }, 3: { flash: 0.06, zoom: 0.025 }, 4: { flash: 0.03 } },
      },
    };

    return { ...presets[cat.preset], intMult: cat.intMult };
  }

  platformIsVertical(): boolean {
    const p = this.settings().platform;
    return p === 'shorts' || p === 'reels' || p === 'tiktok';
  }

  resetAll(): void {
    if (this.videoUrl()) { URL.revokeObjectURL(this.videoUrl()!); }
    this.videoFile.set(null);
    this.videoUrl.set(null);
    this.videoDuration.set(0);
    this.analysis.set({ scenes: [], highlights: [], audioEvents: [], sourceGradeMod: 1 });
    this.music.set({ file: null, buffer: null, selectedTrack: null, bpm: 120, beats: [], volume: 0.7, origVolume: 0.5, offset: 0, analysis: null });
    this.currentStep.set('stepUpload');
  }
}
