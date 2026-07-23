import { useRef, useState } from 'react';
import { uploadVideo } from '../api';

interface Props {
  onVideoUploaded: (filename: string, serverUrl: string, localUrl: string, duration: number) => void;
}

export default function StepUpload({ onVideoUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    const validExt = /\.(mp4|mov|avi|mkv|webm)$/i;
    if (!validExt.test(file.name)) {
      setError('Unsupported format. Use MP4, MOV, AVI, MKV, or WEBM.');
      return;
    }
    setUploading(true);
    setProgress(0);

    try {
      // Upload to backend
      const resp = await uploadVideo(file);
      setProgress(50);

      // Create local preview URL
      const localUrl = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = localUrl;
      await new Promise<void>(r => { v.onloadedmetadata = () => r(); setTimeout(r, 8000); });
      const duration = v.duration;
      v.remove();

      setProgress(100);
      onVideoUploaded(resp.filename, resp.url, localUrl, duration);
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="step">
      <div className="step-header">
        <h2>Upload Your Video</h2>
      </div>
      <p className="step-desc">Drag & drop or click to select a video file</p>
      {error && <div className="error-banner">{error}</div>}
      <div
        className={`upload-zone ${dragging ? 'dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); }}
      >
        <div className="upload-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(6,182,212,0.7)" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </div>
        <p className="upload-text">Drop your video here or <span className="upload-link">browse</span></p>
        <p className="upload-hint">MP4, MOV, AVI, MKV, WEBM</p>
        <input ref={inputRef} type="file" accept="video/*" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      <div className={`progress-bar ${uploading ? 'show' : ''}`}>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }}></div></div>
        <span className="progress-text">{progress}%</span>
      </div>
    </div>
  );
}
