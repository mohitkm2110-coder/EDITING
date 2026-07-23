import { useState } from 'react';

const TRACKS = [
  { id: 'neon', label: 'Neon Nights', bpm: 128 },
  { id: 'epic', label: 'Epic Rise', bpm: 90 },
  { id: 'urban', label: 'Urban Flow', bpm: 140 },
  { id: 'chill', label: 'Chill Wave', bpm: 80 },
];

interface MusicInfo {
  filename: string;
  url: string;
  duration: number;
}

interface Props {
  music: MusicInfo | null;
  selectedTrack: string | null;
  onMusicSelected: (m: MusicInfo) => void;
  onTrackSelected: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  musicVolume: number;
  origVolume: number;
  onMusicVolume: (v: number) => void;
  onOrigVolume: (v: number) => void;
}

export default function StepMusic({
  music, selectedTrack, onMusicSelected, onTrackSelected,
  onBack, onNext, musicVolume, origVolume, onMusicVolume, onOrigVolume,
}: Props) {
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    const validExt = /\.(mp3|wav|aac|flac|ogg|m4a|wma)$/i;
    if (!file.type.startsWith('audio/') && !validExt.test(file.name)) {
      setError('Unsupported audio format. Use MP3, WAV, AAC, FLAC, OGG, or M4A.');
      return;
    }
    onMusicSelected({ filename: file.name, url: URL.createObjectURL(file), duration: 0 });
  };

  const hasMusic = music || selectedTrack;

  return (
    <div className="step">
      <div className="step-header">
        <h2>Select Music</h2>
      </div>
      <p className="step-desc">Upload your own track or choose a built-in beat</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="music-upload" onClick={() => document.getElementById('musicInput')?.click()}>
        <span className="upload-link">🎵 Click to upload or drag & drop audio</span>
        <input id="musicInput" type="file" accept="audio/*" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>

      {music && <div className="file-info show">🎵 {music.filename}</div>}

      <div className="section-title">Built-in tracks</div>
      <div className="track-grid">
        {TRACKS.map(t => (
          <div key={t.id} className={`track-card ${selectedTrack === t.id ? 'active' : ''}`} onClick={() => onTrackSelected(t.id)}>
            <div className="track-name">{t.label}</div>
            <div className="track-bpm">{t.bpm} BPM</div>
          </div>
        ))}
      </div>

      {hasMusic && (
        <div className="vol-row"><label>Music volume</label>
          <input type="range" min={0} max={100} value={musicVolume} onChange={e => onMusicVolume(+e.target.value)} />
          <span className="vol-val">{musicVolume}%</span>
        </div>
      )}
      {hasMusic && (
        <div className="vol-row"><label>Original audio</label>
          <input type="range" min={0} max={100} value={origVolume} onChange={e => onOrigVolume(+e.target.value)} />
          <span className="vol-val">{origVolume}%</span>
        </div>
      )}

      <div className="step-nav">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={!hasMusic}>Next →</button>
      </div>
    </div>
  );
}
