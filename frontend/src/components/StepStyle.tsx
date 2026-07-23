import type { EditStyle } from '../types';

interface Props {
  style: EditStyle;
  onStyleChange: (s: EditStyle) => void;
  onBack: () => void;
  onGenerate: () => void;
  canGenerate: boolean;
  generating: boolean;
}

const STYLES: { id: EditStyle; label: string; icon: string; desc: string }[] = [
  { id: 'gaming', label: 'Gaming', icon: '🎮', desc: 'Clean, sharp, optimized for gameplay highlights with beat-sync' },
  { id: 'viral', label: 'Viral', icon: '🚀', desc: 'Energetic, punchy, attention-grabbing with bold effects' },
  { id: 'cinematic', label: 'Cinematic', icon: '🎬', desc: 'Polished, film-like with smooth transitions and mood' },
];

export default function StepStyle({ style, onStyleChange, onBack, onGenerate, canGenerate, generating }: Props) {
  return (
    <div className="step">
      <div className="step-header">
        <h2>Choose Editing Style</h2>
      </div>
      <p className="step-desc">The AI will automatically edit your video based on this style</p>

      <div className="style-grid">
        {STYLES.map(s => (
          <div key={s.id} className={`style-card ${style === s.id ? 'active' : ''}`} onClick={() => onStyleChange(s.id)}>
            <div className="style-icon">{s.icon}</div>
            <div className="style-name">{s.label}</div>
            <div className="style-desc">{s.desc}</div>
          </div>
        ))}
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
