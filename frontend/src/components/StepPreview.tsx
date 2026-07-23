interface Props {
  originalUrl: string;
  editedUrl: string;
  onNewEdit: () => void;
  onExport: () => void;
}

export default function StepPreview({ originalUrl, editedUrl, onNewEdit, onExport }: Props) {
  return (
    <div className="step">
      <div className="step-header">
        <h2>Your Edit is Ready!</h2>
      </div>

      <div className="preview-grid">
        <div className="preview-col">
          <div className="preview-label">Original</div>
          <video src={originalUrl} controls playsInline></video>
        </div>
        <div className="preview-col">
          <div className="preview-label edited">Edited</div>
          <video src={editedUrl} controls playsInline></video>
        </div>
      </div>

      <div className="step-nav">
        <button className="btn btn-ghost" onClick={onNewEdit}>← New Edit</button>
        <button className="btn btn-primary" onClick={onExport}>⬇ Download</button>
      </div>
    </div>
  );
}
