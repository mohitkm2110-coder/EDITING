import { useState, useCallback } from 'react';
import type { Step, EditStyle, JobStatus } from './types';
import { generateEdit, pollStatus, getDownloadUrl } from './api';
import StepUpload from './components/StepUpload';
import StepMusic from './components/StepMusic';
import StepStyle from './components/StepStyle';
import StepProcessing from './components/StepProcessing';
import StepPreview from './components/StepPreview';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState('');

  // Video
  const [video, setVideo] = useState<{ filename: string; url: string; duration: number } | null>(null);

  // Music
  const [music, setMusic] = useState<{ filename: string; url: string; duration: number } | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [musicVol, setMusicVol] = useState(70);
  const [origVol, setOrigVol] = useState(70);

  // Style
  const [style, setStyle] = useState<EditStyle>('gaming');

  // Processing
  const [processing, setProcessing] = useState(false);
  const [procProgress, setProcProgress] = useState(0);
  const [procStage, setProcStage] = useState('');

  // Preview
  const [editedUrl, setEditedUrl] = useState('');

  const handleGenerate = useCallback(async () => {
    if (!video) return;
    setProcessing(true);
    setStep('processing');
    setError('');
    setProcStage('AI is analyzing your video and music...');
    setProcProgress(0.05);

    try {
      const musicFn = music?.filename || selectedTrack;
      const resp = await generateEdit(video.filename, musicFn, style, 0, origVol / 100, musicVol / 100);
      setProcStage('Processing video...');
      setProcProgress(0.15);

      await pollStatus(resp.job_id, (s: JobStatus) => {
        setProcProgress(s.progress);
        setProcStage(s.message);
      });

      setEditedUrl(getDownloadUrl(`${resp.job_id}.mp4`));
      setStep('preview');
    } catch (e: any) {
      setError(e.message || 'Processing failed');
      setStep('style');
    } finally {
      setProcessing(false);
    }
  }, [video, music, style, origVol, musicVol]);

  const handleExport = useCallback(() => {
    if (editedUrl) {
      const a = document.createElement('a');
      a.href = editedUrl;
      a.download = 'deepwave-edit.mp4';
      a.click();
    }
  }, [editedUrl]);

  const handleNewEdit = useCallback(() => {
    if (video?.url) URL.revokeObjectURL(video.url);
    if (music?.url) URL.revokeObjectURL(music.url);
    setVideo(null); setMusic(null); setSelectedTrack(null); setEditedUrl('');
    setStep('upload');
  }, [video, music]);

  const hasMusic = !!(music || selectedTrack);

  return (
    <div className="app">
      <header className="header">
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none"><path d="M10 80 Q 30 20, 50 50 T 90 30" stroke="url(#g)" strokeWidth="6" strokeLinecap="round" fill="none"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#a855f7"/></linearGradient></defs></svg>
        <span className="logo-text">Deep Wave</span>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {step === 'upload' && <StepUpload onVideoUploaded={(fn, _serverUrl, localUrl, dur) => { setVideo({ filename: fn, url: localUrl, duration: dur }); setStep('music'); }} />}

      {step === 'music' && (
        <StepMusic
          music={music} selectedTrack={selectedTrack}
          onMusicSelected={m => { setMusic(m); setSelectedTrack(null); }}
          onTrackSelected={id => { setSelectedTrack(id); setMusic(null); }}
          onBack={() => { if (video?.url) URL.revokeObjectURL(video.url); setVideo(null); setStep('upload'); }}
          onNext={() => setStep('style')}
          musicVolume={musicVol} origVolume={origVol}
          onMusicVolume={setMusicVol} onOrigVolume={setOrigVol}
        />
      )}

      {step === 'style' && (
        <StepStyle
          style={style} onStyleChange={setStyle}
          onBack={() => setStep('music')}
          onGenerate={handleGenerate}
          canGenerate={!!video && hasMusic}
          generating={processing}
        />
      )}

      {step === 'processing' && <StepProcessing progress={procProgress} stage={procStage} onCancel={() => { setProcessing(false); setStep('style'); }} />}

      {step === 'preview' && <StepPreview originalUrl={video?.url || ''} editedUrl={editedUrl} onNewEdit={handleNewEdit} onExport={handleExport} />}
    </div>
  );
}
