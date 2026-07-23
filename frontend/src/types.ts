export interface EditingOptions {
  auto_cut_boring_clips: boolean;
  auto_detect_highlights: boolean;
  auto_add_captions: boolean;
  auto_add_transitions: boolean;
  auto_add_effects: boolean;
  auto_zoom_effects: boolean;
  auto_beat_sync: boolean;
  ai_color_grading: boolean;
  music_sync: boolean;
  audio_enhancement: boolean;
  video_quality_enhancement: boolean;
}

export interface UploadResponse {
  filename: string;
  url: string;
  duration: number;
  width: number;
  height: number;
}

export interface GenerateResponse {
  job_id: string;
  plan: EditPlan;
}

export interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  message: string;
}

export interface EditPlan {
  original_duration: number;
  music_duration: number | null;
  detected_moments: any[];
  detected_beats: any[];
  enabled_options: Record<string, boolean>;
  planned_edits: any[];
  planned_effects: any[];
  planned_transitions: any[];
  color_grading: Record<string, any>;
  audio_settings: Record<string, any>;
  expected_final_duration: number;
}

export type Step = 'upload' | 'music' | 'options' | 'processing' | 'preview';
export type GradePreset = 'natural' | 'gaming' | 'cinematic' | 'viral';
