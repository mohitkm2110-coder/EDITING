import { useState, useCallback } from 'react';
import type { Step, EditingOptions, GradePreset, JobStatus } from './types';
import { generateEdit, pollStatus, getDownloadUrl } from './api';
import StepUpload from './components/StepUpload';
import StepMusic from './components/StepMusic';
import StepOptions from './components/StepOptions';
import StepProcessing from './components/StepProcessing';
import StepPreview from './components/StepPreview';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState('');

  // Video
  const [videoFile, setVideoFile] = useState<{ filename: string; url: string; duration: number } | null>(null);

  // Music
  const [music, setMusic] = useState<{ filename: string; url: string; duration: number } | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(70);
  const [origVolume, setOrigVolume] = useState(70);

  // Options
  const [options, setOptions] = useState<EditingOptions>({
    auto_cut_boring_clips: false,
    auto_detect_highlights: false,
    auto_add_captions: false,
    auto_add_transitions: false,
    auto_add_effects: false,
    auto_zoom_effects: false,
    auto_beat_sync: true,
    ai_color_grading: false,
    music_sync: false,
    audio_enhancement: false,
    video_quality_enhancement: false,
  });
  const [gradePreset, setGradePreset] = useState<GradePreset>('natural');
  const [gradeIntensity, setGradeIntensity] = useState(50);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [procProgress, setProcProgress] = useState(0);
  const [procStage, setProcStage] = useState('');

  // Preview
  const [editedVideoUrl, setEditedVideoUrl] = useState('');

  const toggleOption = useCallback((key: keyof EditingOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleVideoUploaded = useCallback((filename: string, url: string, duration: number) => {
    setVideoFile({ filename, url, duration });
    setStep('music');
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!videoFile) return;
    setProcessing(true);
    setStep('processing');
    setError('');
    setProcStage('Generating AI editing plan...');
    setProcProgress(0.05);

    try {
      const musicFilename = music?.filename ? music.filename.split('/').pop() || null : null;
      const resp = await generateEdit(
        videoFile.filename, musicFilename, options,
        gradePreset, gradeIntensity / 100, 0, origVolume / 100, musicVolume / 100,
      );
      setProcStage('Processing video...');
      setProcProgress(0.15);

      await pollStatus(resp.job_id, (s: JobStatus) => {
        setProcProgress(s.progress);
        setProcStage(s.message);
      });

      const dlUrl = getDownloadUrl(`${resp.job_id}.mp4`);
      setEditedVideoUrl(dlUrl);
      setStep('preview');
    } catch (e: any) {
      setError(e.message || 'Processing failed');
      setStep('options');
    } finally {
      setProcessing(false);
    }
  }, [videoFile, music, options, gradePreset, gradeIntensity, origVolume, musicVolume]);

  const handleCancel = useCallback(() => {
    setProcessing(false);
    setStep('options');
  }, []);

  const handleExport = useCallback(() => {
    if (editedVideoUrl) {
      const a = document.createElement('a');
      a.href = editedVideoUrl;
      a.download = 'deepwave-edit.mp4';
      a.click();
    }
  }, [editedVideoUrl]);

  const handleNewEdit = useCallback(() => {
    if (videoFile?.url) URL.revokeObjectURL(videoFile.url);
    if (music?.url) URL.revokeObjectURL(music.url);
    setVideoFile(null);
    setMusic(null);
    setSelectedTrack(null);
    setEditedVideoUrl('');
    setStep('upload');
  }, [videoFile, music]);

  const canGenerate = !!videoFile && !!(music || selectedTrack);

  return (
    <div className="app">
      <header className="header">
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none"><path d="M10 80 Q 30 20, 50 50 T 90 30" stroke="url(#g)" strokeWidth="6" strokeLinecap="round" fill="none"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#a855f7"/></linearGradient></defs></svg>
        <span className="logo-text">Deep Wave</span>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {step === 'upload' && <StepUpload onVideoUploaded={handleVideoUploaded} />}

      {step === 'music' && (
        <StepMusic
          music={music} selectedTrack={selectedTrack}
          onMusicSelected={m => { setMusic(m); setSelectedTrack(null); }}
          onTrackSelected={id => { setSelectedTrack(id); setMusic(null); }}
          onBack={() => setStep('upload')}
          onNext={() => setStep('options')}
          musicVolume={musicVolume} origVolume={origVolume}
          onMusicVolume={setMusicVolume} onOrigVolume={setOrigVolume}
        />
      )}

      {step === 'options' && (
        <StepOptions
          options={options} onToggle={toggleOption}
          gradePreset={gradePreset} gradeIntensity={gradeIntensity}
          onGradePreset={setGradePreset} onGradeIntensity={setGradeIntensity}
          onBack={() => setStep('music')}
          onGenerate={handleGenerate}
          canGenerate={canGenerate} generating={processing}
        />
      )}

      {step === 'processing' && (
        <StepProcessing progress={procProgress} stage={procStage} onCancel={handleCancel} />
      )}

      {step === 'preview' && (
        <StepPreview
          originalUrl={videoFile?.url || ''}
          editedUrl={editedVideoUrl}
          onNewEdit={handleNewEdit}
          onExport={handleExport}
        />
      )}
    </div>
  );
}
