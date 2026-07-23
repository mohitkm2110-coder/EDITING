import { Component, ElementRef, ViewChild } from '@angular/core';
import { StateService } from '../services/state-service';

@Component({
  selector: 'step-upload',
  template: `
    <div class="step" id="stepUpload">
      <div class="step-header">
        <div class="step-badge">1</div>
        <h2>Upload Your Video</h2>
      </div>
      <p class="step-desc">Drag & drop or click to select a video file</p>

      <div #uploadZone class="upload-zone" (click)="fileInput.click()" (dragover)="onDragOver($event)" (dragleave)="onDragLeave()" (drop)="onDrop($event)">
        <div class="upload-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(6,182,212,0.7)" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </div>
        <p class="upload-text">Drop your video here or <span class="upload-link">browse</span></p>
        <p class="upload-hint">MP4, MOV, AVI, MKV, WEBM</p>
        <input #fileInput type="file" accept="video/*" (change)="onFileChange($event)" hidden>
      </div>

      <div class="progress-bar" id="uploadProgress" [class.show]="uploading">
        <div class="progress-fill" #uploadFill style="width:0%"></div>
        <span class="progress-text" #uploadText>0%</span>
      </div>

      <div class="file-info" id="fileInfo" [class.show]="fileInfo">
        <span class="file-icon">🎬</span>
        <span>{{ fileInfo }}</span>
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
  standalone: false,
})
export class StepUpload {
  @ViewChild('uploadFill') uploadFill!: ElementRef;
  @ViewChild('uploadText') uploadText!: ElementRef;
  uploading = false;
  fileInfo = '';

  constructor(private state: StateService) {}

  onDragOver(e: DragEvent): void { e.preventDefault(); (e.target as HTMLElement).classList.add('dragover'); }
  onDragLeave(): void { document.querySelector('.upload-zone')?.classList.remove('dragover'); }
  onDrop(e: DragEvent): void {
    e.preventDefault();
    document.querySelector('.upload-zone')?.classList.remove('dragover');
    if (e.dataTransfer?.files.length) this.handleFile(e.dataTransfer.files[0]);
  }
  onFileChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.handleFile(input.files[0]);
  }

  async handleFile(file: File): Promise<void> {
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
    const validExt = /\.(mp4|mov|avi|mkv|webm)$/i;
    if (!validTypes.includes(file.type) && !validExt.test(file.name)) {
      alert('Unsupported format. Use MP4, MOV, AVI, MKV, or WEBM.');
      return;
    }
    this.uploading = true;
    const fill = this.uploadFill.nativeElement;
    const text = this.uploadText.nativeElement;
    for (let p = 0; p <= 100; p += 5) {
      fill.style.width = p + '%';
      text.textContent = p + '%';
      await this.delay(30);
    }
    this.state.videoFile.set(file);
    const url = URL.createObjectURL(file);
    this.state.videoUrl.set(url);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    await new Promise<void>(r => { v.onloadedmetadata = () => r(); setTimeout(r, 8000); });
    this.state.videoDuration.set(v.duration);
    this.state.videoWidth.set(v.videoWidth || 1920);
    this.state.videoHeight.set(v.videoHeight || 1080);
    v.remove();
    this.fileInfo = file.name + ' • ' + this.state.fmtSize(file.size) + ' • ' + this.state.fmtTime(v.duration);
    await this.delay(400);
    this.uploading = false;
    this.state.currentStep.set('stepMusic');
  }

  private delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
}
