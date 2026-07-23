export interface UploadResponse {
  filename: string;
  url: string;
  duration: number;
  width: number;
  height: number;
}

export interface GenerateResponse {
  job_id: string;
  plan: any;
}

export interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  message: string;
}

export type Step = 'upload' | 'music' | 'style' | 'processing' | 'preview';
export type EditStyle = 'gaming' | 'viral' | 'cinematic';
