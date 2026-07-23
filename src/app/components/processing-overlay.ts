import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'processing-overlay',
  template: `
    <div class="processing-overlay" [class.show]="visible">
      <div class="proc-card">
        <div class="proc-spinner"></div>
        <h3>Processing Your Video</h3>
        <div class="proc-steps">
          <div *ngFor="let label of stepLabels; let i = index" class="proc-step" [class.active]="i === currentStep" [class.done]="i < currentStep">
            <span class="proc-step-num">{{ i < currentStep ? '✓' : (i + 1) }}</span>
            <span>{{ label }}</span>
          </div>
        </div>
        <div class="proc-bar">
          <div class="proc-bar-fill" [style.width.%]="progress"></div>
        </div>
        <div class="proc-stage" id="procStage">{{ stageText }}</div>
        <button class="btn btn-ghost" (click)="onCancel()">Cancel</button>
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
  standalone: false,
})
export class ProcessingOverlay {
  @Input() visible = false;
  @Input() currentStep = 0;
  @Input() progress = 0;
  @Input() stageText = '';
  @Output() cancel = new EventEmitter<void>();

  stepLabels = [
    'Analyzing video content...',
    'Detecting scene changes...',
    'Analyzing audio track...',
    'Detecting highlights...',
    'Analyzing source characteristics...',
    'Applying effects...',
    'Rendering video...',
    'Finalizing...',
  ];

  onCancel(): void {
    if (confirm('Cancel rendering?')) {
      this.cancel.emit();
    }
  }
}
