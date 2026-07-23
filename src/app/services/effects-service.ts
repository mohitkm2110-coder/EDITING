import { Injectable } from '@angular/core';
import { StateService, GradePixel } from './state-service';

export interface EffectState {
  shake: number; shakeX: number; shakeY: number;
  zoom: number; flash: number;
  transition: number;
  lastEffectTime: number;
  lastTransitionTime: number;
}

@Injectable({ providedIn: 'root' })
export class EffectsService {
  constructor(private state: StateService) {}

  createEffectState(): EffectState {
    return { shake: 0, shakeX: 0, shakeY: 0, zoom: 0, flash: 0, transition: 0, lastEffectTime: -99, lastTransitionTime: -99 };
  }

  async analyzeSourceVideo(videoEl: HTMLVideoElement, sampleFrames = 8): Promise<{ avgLuma: number; avgSat: number; mod: number }> {
    const c = document.createElement('canvas');
    const cx = c.getContext('2d')!;
    c.width = 320; c.height = 180;
    const dur = videoEl.duration;
    if (!dur || dur < 0.5) return { avgLuma: 0.5, avgSat: 0.4, mod: 1 };
    let totalLuma = 0, totalSat = 0, count = 0;
    for (let i = 0; i < sampleFrames; i++) {
      const t = (i / sampleFrames) * Math.min(dur, 10);
      videoEl.currentTime = t;
      await new Promise<void>(r => { videoEl.onseeked = () => r(); setTimeout(r, 500); });
      cx.drawImage(videoEl, 0, 0, 320, 180);
      const d = cx.getImageData(0, 0, 320, 180).data;
      let l = 0, s = 0, n = 0;
      for (let j = 0; j < d.length; j += 4) {
        const r = d[j], g = d[j + 1], b = d[j + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        l += luma; s += sat; n++;
      }
      totalLuma += l / n; totalSat += s / n; count++;
    }
    const avgLuma = totalLuma / (count * 255);
    const avgSat = totalSat / count;
    let mod = 1;
    if (avgLuma > 0.65) mod *= 0.8;
    else if (avgLuma < 0.3) mod *= 0.9;
    if (avgSat > 0.5) mod *= 0.7;
    else if (avgSat < 0.15) mod *= 1.3;
    mod = Math.max(0.4, Math.min(1.5, mod));
    return { avgLuma, avgSat, mod };
  }

  applyPixelGrade(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, grade: GradePixel | null | undefined): void {
    if (!grade) return;
    const { shadows, highlights, gamma, warmth } = grade;
    if (!shadows.lift && !shadows.compress && !highlights.rolloff && !highlights.boost && gamma >= 1 && gamma <= 1 && !warmth) return;
    const w = canvas.width, h = canvas.height;
    const d = ctx.getImageData(0, 0, w, h);
    const pix = d.data;
    const len = pix.length;
    for (let i = 0; i < len; i += 4) {
      let r = pix[i], g = pix[i + 1], b = pix[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < 85) {
        const f = (85 - luma) / 85;
        const lift = shadows.lift || 0;
        const compress = (shadows.compress || 0) * f;
        r += lift; g += lift; b += lift;
        r -= compress; g -= compress; b -= compress;
      }
      if (luma > 170) {
        const f = (luma - 170) / 85;
        const rolloff = (highlights.rolloff || 0) * f;
        const boostVal = (highlights.boost || 0) * f;
        r -= rolloff; g -= rolloff; b -= rolloff;
        r += boostVal; g += boostVal; b += boostVal;
      }
      if (gamma !== 1) {
        const normalized = luma / 255;
        const mapped = Math.pow(normalized, gamma) * 255;
        const scale = normalized > 0 ? mapped / normalized : 1;
        r *= scale; g *= scale; b *= scale;
      }
      if (warmth) { r += warmth; b -= warmth; }
      pix[i] = Math.max(0, Math.min(255, r));
      pix[i + 1] = Math.max(0, Math.min(255, g));
      pix[i + 2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(d, 0, 0);
  }

  applyEffects(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, videoEl: HTMLVideoElement, tmpl: any, state: EffectState, ct: number, isNewScene: boolean): void {
    if (state.shake > 0.5) {
      state.shakeX = (Math.random() - 0.5) * state.shake * 2;
      state.shakeY = (Math.random() - 0.5) * state.shake * 2;
      state.shake *= tmpl.shake.decay;
      if (state.shake < 0.5) { state.shake = 0; state.shakeX = 0; state.shakeY = 0; }
    } else { state.shakeX = 0; state.shakeY = 0; }
    if (state.zoom > 0) {
      state.zoom = 1 + (state.zoom - 1) * tmpl.zoom.decay;
      if (state.zoom < 1.003) state.zoom = 0;
    }
    if (state.flash > 0.005) {
      state.flash *= tmpl.flash.decay;
      if (state.flash < 0.005) state.flash = 0;
    }
    if (isNewScene && state.transition <= 0 && ct - state.lastTransitionTime > 1.5) {
      state.transition = tmpl.transition.frames;
      state.lastTransitionTime = ct;
    }
    ctx.save();
    if (state.shake >= 0.5) ctx.translate(state.shakeX, state.shakeY);
    const currentZoom = state.zoom > 0 ? state.zoom : 1;
    const srcAR = videoEl.videoWidth / videoEl.videoHeight;
    const dstAR = canvas.width / canvas.height;
    let sx = 0, sy = 0, sw = videoEl.videoWidth, sh = videoEl.videoHeight;
    if (srcAR > dstAR) { sw = videoEl.videoHeight * dstAR; sx = (videoEl.videoWidth - sw) / 2; }
    else { sh = videoEl.videoWidth / dstAR; sy = (videoEl.videoHeight - sh) / 2; }
    if (videoEl.readyState >= 2) {
      ctx.filter = tmpl.filter;
      if (currentZoom > 1.002) {
        const nw = canvas.width / currentZoom, nh = canvas.height / currentZoom;
        ctx.drawImage(videoEl, sx, sy, sw, sh, (canvas.width - nw) / 2, (canvas.height - nh) / 2, nw, nh);
      } else {
        ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      }
      ctx.filter = 'none';
      this.applyPixelGrade(ctx, canvas, tmpl.grade);
    }
    if (tmpl.vignette) {
      const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.3, canvas.width / 2, canvas.height / 2, canvas.height * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (state.flash > 0.005) {
      const alpha = Math.min(state.flash, tmpl.flash.maxOpacity);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (state.transition > 0) {
      const t = state.transition / tmpl.transition.frames;
      const alpha = tmpl.transition.opacity * (1 - t * t);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      state.transition--;
    }
    ctx.restore();
  }

  triggerBeatEffect(state: EffectState, tmpl: any, tier: number, ct: number, mult: number): void {
    const t = tmpl.tiers[tier] || tmpl.tiers[4];
    if (!t) return;
    const fullMult = mult * tmpl.intMult;
    if (t.shake && ct - state.lastEffectTime >= tmpl.shake.cooldown) state.shake = t.shake * fullMult;
    if (t.flash) state.flash = t.flash * fullMult;
    if (t.zoom) state.zoom = 1 + t.zoom * fullMult;
    if (state.shake > 0 || state.flash > 0.005) state.lastEffectTime = ct;
  }

  setupCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number, quality: string): void {
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = quality === 'high' ? 'medium' : quality === 'ultra' ? 'high' : 'low' as ImageSmoothingQuality;
  }
}
