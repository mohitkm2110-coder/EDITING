import type { EditingOptions, GradePreset } from '../types';

interface Props {
  options: EditingOptions;
  onToggle: (key: keyof EditingOptions) => void;
  gradePreset: GradePreset;
  gradeIntensity: number;
  onGradePreset: (p: GradePreset) => void;
  onGradeIntensity: (v: number) => void;
  onBack: () => void;
  onGenerate: () => void;
  canGenerate: boolean;
  generating: boolean;
}

const OPTIONS: { key: keyof EditingOptions; label: string; desc: string }[] = [
  { key: 'auto_cut_boring_clips', label: 'Auto Cut Boring Clips', desc: 'Remove low-activity segments' },
  { key: 'auto_detect_highlights', label: 'Auto Detect Highlights', desc: 'Find and emphasize key moments' },
  { key: 'auto_add_captions', label: 'Auto Add Captions', desc: 'Generate speech captions' },
  { key: 'auto_add_transitions', label: 'Auto Add Transitions', desc: 'Smooth scene transitions' },
  { key: 'auto_add_effects', label: 'Auto Add Effects', desc: 'Context-aware visual effects' },
  { key: 'auto_zoom_effects', label: 'Auto Zoom Effects', desc: 'Dynamic zoom on impact moments' },
  { key: 'auto_beat_sync', label: 'Auto Beat Sync', desc: 'Synchronize edits with music' },
  { key: 'ai_color_grading', label: 'AI Color Grading', desc: 'Professional color enhancement' },
  { key: 'music_sync', label: 'Music Sync', desc: 'Align video timeline with music' },
  { key: 'audio_enhancement', label: 'Audio Enhancement', desc: 'Clean and balance audio' },
  { key: 'video_quality_enhancement', label: 'Video Quality Enhancement', desc: 'Upscale and denoise' },
];

const GRADE_PRESETS: { id: GradePreset; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'viral', label: 'Viral' },
];

export default function StepOptions({
  options, onToggle, gradePreset, gradeIntensity,
  onGradePreset, onGradeIntensity, onBack, onGenerate, canGenerate, generating,
}: Props) {
  return (
    <div className="step">
      <div className="step-header">
        <h2>Editing Options</h2>
      </div>
      <p className="step-desc">Choose what the AI should do — all options start OFF</p>

      <div className="section-title">Enhancements</div>
      <div className="option-group">
        {OPTIONS.map(o => (
          <div key={o.key} className={`option-row ${options[o.key] ? 'active' : ''}`} onClick={() => onToggle(o.key)}>
            <div className={`option-toggle ${options[o.key] ? 'on' : ''}`}></div>
            <div><div className="option-label">{o.label}</div><div className="option-desc">{o.desc}</div></div>
          </div>
        ))}
      </div>

      <div className="grade-section">
        <div className="grade-header"><span>Color Grading</span><span className="grade-label">{GRADE_PRESETS.find(p => p.id === gradePreset)?.label}</span></div>
        <div className="grade-presets">
          {GRADE_PRESETS.map(p => (
            <span key={p.id} className={`grade-preset ${gradePreset === p.id ? 'active' : ''}`} onClick={() => onGradePreset(p.id)}>{p.label}</span>
          ))}
        </div>
        <div className="grade-control">
          <input type="range" min={0} max={100} value={gradeIntensity} onChange={e => onGradeIntensity(+e.target.value)} />
          <span className="grade-val">{gradeIntensity}%</span>
        </div>
      </div>

      <div className="step-nav">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onGenerate} disabled={!canGenerate || generating}>
          {generating ? 'Generating...' : '✨ Generate Edit'}
        </button>
      </div>
    </div>
  );
}
