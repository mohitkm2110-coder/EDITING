interface Props {
  progress: number;
  stage: string;
  onCancel: () => void;
}

export default function StepProcessing({ progress, stage, onCancel }: Props) {
  const pct = Math.round(progress * 100);
  return (
    <div className="processing-overlay">
      <div className="proc-card">
        <div className="proc-spinner"></div>
        <h3>AI is editing your video</h3>
        <p className="proc-stage">{stage}</p>
        <div className="proc-bar"><div className="proc-bar-fill" style={{ width: `${pct}%` }}></div></div>
        <p style={{ fontSize: '.65rem', color: 'var(--text3)', marginTop: '.5rem' }}>{pct}%</p>
        <button className="btn btn-ghost" style={{ marginTop: '1rem' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
