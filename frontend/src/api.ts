import type { UploadResponse, GenerateResponse, JobStatus } from './types';

const API = import.meta.env.VITE_API_URL || '';

export async function uploadVideo(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch(`${API}/api/upload-video`, { method: 'POST', body: form });
  if (!resp.ok) throw new Error(`Upload failed: ${await resp.text()}`);
  return resp.json();
}

export async function uploadMusic(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch(`${API}/api/upload-music`, { method: 'POST', body: form });
  if (!resp.ok) throw new Error(`Music upload failed: ${await resp.text()}`);
  return resp.json();
}

export async function generateEdit(
  videoFilename: string,
  musicFilename: string | null,
  style: string,
  musicOffset: number,
  origVol: number,
  musicVol: number,
): Promise<GenerateResponse> {
  const resp = await fetch(`${API}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_filename: videoFilename,
      music_filename: musicFilename,
      style,
      music_offset: musicOffset,
      original_audio_volume: origVol,
      music_volume: musicVol,
    }),
  });
  if (!resp.ok) throw new Error(`Generate failed: ${await resp.text()}`);
  return resp.json();
}

export async function pollStatus(jobId: string, onUpdate: (s: JobStatus) => void): Promise<JobStatus> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const resp = await fetch(`${API}/api/status/${jobId}`);
        if (!resp.ok) throw new Error('Status failed');
        const data: JobStatus = await resp.json();
        onUpdate(data);
        if (data.status === 'completed') resolve(data);
        else if (data.status === 'failed') reject(new Error(data.message));
        else setTimeout(poll, 1000);
      } catch (e) { reject(e); }
    };
    poll();
  });
}

export function getDownloadUrl(filename: string): string {
  return `${API}/api/download/${filename}`;
}

export function getMediaUrl(filename: string): string {
  return `${API}/api/media/${filename}`;
}
