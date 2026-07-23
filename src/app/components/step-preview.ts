import { Component, Input } from '@angular/core';
import { StateService } from '../services/state-service';

@Component({
  selector: 'step-preview',
  template: `
    <div class="step" id="stepPreview">
      <div class="step-header">
        <div class="step-badge">✓</div>
        <h2>Your Edit is Ready!</h2>
      </div>

      <div class="preview-grid">
        <div class="preview-col">
          <div class="preview-label">Original</div>
          <video [src]="originalUrl" controls playsinline></video>
        </div>
        <div class="preview-col">
          <div class="preview-label">Edited</div>
          <video [src]="editedUrl" controls playsinline></video>
        </div>
      </div>

      <div class="step-nav">
        <button class="btn btn-glow" (click)="download()">⬇ Download</button>
        <button class="btn btn-ghost" (click)="newEdit()">New Edit</button>
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
  standalone: false,
})
export class StepPreview {
  @Input() originalUrl = '';
  @Input() editedUrl = '';
  @Input() exportUrl = '';
  @Input() exportExt = 'mp4';

  constructor(private state: StateService) {}

  download(): void {
    if (!this.exportUrl) return;
    const a = document.createElement('a');
    a.href = this.exportUrl;
    a.download = 'deepwave-edit.' + this.exportExt;
    a.click();
  }

  newEdit(): void {
    if (this.exportUrl) URL.revokeObjectURL(this.exportUrl);
    this.state.resetAll();
  }
}
