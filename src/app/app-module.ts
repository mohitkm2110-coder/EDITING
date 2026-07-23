import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { StepUpload } from './components/step-upload';
import { StepMusic } from './components/step-music';
import { StepTimeline } from './components/step-timeline';
import { StepSettings } from './components/step-settings';
import { StepPreview } from './components/step-preview';
import { ProcessingOverlay } from './components/processing-overlay';

@NgModule({
  declarations: [
    App,
    StepUpload,
    StepMusic,
    StepTimeline,
    StepSettings,
    StepPreview,
    ProcessingOverlay,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
  ],
  bootstrap: [App]
})
export class AppModule { }
