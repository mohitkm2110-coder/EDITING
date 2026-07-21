function createEffectState() {
  return {
    shake: 0, shakeX: 0, shakeY: 0,
    zoom: 0, flash: 0,
    transition: 0,
    lastEffectTime: -99,
    lastTransitionTime: -99,
  };
}

function applyEffects(ctx, canvas, videoEl, tmpl, state, ct, isNewScene) {
  const intMult = tmpl.intMult;

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

  if (state.shake >= 0.5) {
    ctx.translate(state.shakeX, state.shakeY);
  }

  let currentZoom = state.zoom > 0 ? state.zoom : 1;

  const srcAR = videoEl.videoWidth / videoEl.videoHeight;
  const dstAR = canvas.width / canvas.height;
  let sx = 0, sy = 0, sw = videoEl.videoWidth, sh = videoEl.videoHeight;
  if (srcAR > dstAR) { sw = videoEl.videoHeight * dstAR; sx = (videoEl.videoWidth - sw) / 2; }
  else { sh = videoEl.videoWidth / dstAR; sy = (videoEl.videoHeight - sh) / 2; }

  if (videoEl.readyState >= 2) {
    ctx.filter = tmpl.filter;
    if (currentZoom > 1.002) {
      const nw = canvas.width / currentZoom, nh = canvas.height / currentZoom;
      ctx.drawImage(videoEl, sx, sy, sw, sh,
        (canvas.width - nw) / 2, (canvas.height - nh) / 2, nw, nh);
    } else {
      ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }
    ctx.filter = 'none';
  }

  // Vignette
  if (tmpl.vignette) {
    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.85
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Flash - subtle overlay using soft-light blending
  if (state.flash > 0.005) {
    const alpha = Math.min(state.flash, tmpl.flash.maxOpacity);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Transition - short dissolve
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

function triggerBeatEffect(state, tmpl, tier, ct, mult) {
  const t = tmpl.tiers[tier] || tmpl.tiers[4];
  if (!t) return;
  const fullMult = mult * tmpl.intMult;
  if (t.shake && ct - state.lastEffectTime >= tmpl.shake.cooldown) {
    state.shake = t.shake * fullMult;
  }
  if (t.flash) {
    state.flash = t.flash * fullMult;
  }
  if (t.zoom) {
    state.zoom = 1 + t.zoom * fullMult;
  }
  if (state.shake > 0 || state.flash > 0.005) {
    state.lastEffectTime = ct;
  }
}

function setupCanvas(canvas, ctx, width, height, quality) {
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = quality === 'high' ? 'medium' : quality === 'ultra' ? 'high' : 'low';
}
