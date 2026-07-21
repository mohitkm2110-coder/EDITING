// ─── Interactive Audio Timeline ───

const tl = {
  video: null,
  ctx: null,
  audioCtx: null,
  musicSource: null,
  musicGain: null,
  origGain: null,
  playing: false,
  offset: 0,
  beatSync: true,
  muted: false,
};

// ─── Init timeline when step shows ───
function initTimeline() {
  const canvas = $('#tlWaveform');
  if (!canvas) return;

  // Fresh video element each time (createMediaElementSource can only be called once)
  tl.video = document.createElement('video');
  tl.video.playsInline = true;
  tl.video.preload = 'auto';
  tl.video.src = State.videoUrl;
  tl.video.load();
  tl.video.muted = true;
  tl._videoSource = null;
  tl._videoConnected = false;

  $('#tlTime').textContent = '0:00 / ' + fmtTime(State.videoDuration);

  drawRuler();
  drawWaveform();
  updateBeatInfo();

  $('#tlOrigVol').value = Math.round(State.music.origVolume * 100);
  $('#tlOrigVolVal').textContent = Math.round(State.music.origVolume * 100) + '%';
  $('#tlMusicVol').value = Math.round(State.music.volume * 100);
  $('#tlMusicVolVal').textContent = Math.round(State.music.volume * 100) + '%';
  $('#tlOffset').value = 0;
  $('#tlOffsetDisplay').textContent = '+0.0s';
  tl.offset = 0;

  setupAudioGraph();
  setupScrubber();
}

function drawRuler() {
  const ruler = $('#tlRuler');
  if (!ruler) return;
  const dur = State.videoDuration;
  const w = ruler.parentElement.offsetWidth || 600;
  let html = '';
  // Show a marker every 2 seconds, label every 10
  for (let t = 0; t <= dur; t += 2) {
    const pct = (t / dur) * 100;
    if (t % 10 === 0) {
      html += '<div class="tl-ruler-mark" style="left:' + pct + '%"><span>' + fmtTime(t) + '</span></div>';
    } else {
      html += '<div class="tl-ruler-tick" style="left:' + pct + '%"></div>';
    }
  }
  ruler.innerHTML = html;
}

function drawWaveform() {
  const canvas = $('#tlWaveform');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const w = wrap.offsetWidth || 600;
  const h = 80;
  canvas.width = w * 2;  // retina
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const c = canvas.getContext('2d');
  c.scale(2, 2);

  c.fillStyle = 'transparent';
  c.clearRect(0, 0, w, h);

  // If no music buffer, draw "No music selected" text
  if (!State.music.buffer) {
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('Select music above to see waveform', w / 2, h / 2 + 4);
    return;
  }

  const buf = State.music.buffer;
  const dur = State.videoDuration;
  const bpm = State.music.bpm || 120;
  const beatInterval = 60 / bpm;
  const sr = buf.sampleRate;
  const ch = buf.getChannelData(0);
  const totalSamples = ch.length;
  const musicDur = buf.duration;

  // Compute samples per pixel column
  const pixelsPerSecond = w / dur;
  const totalPixels = Math.ceil(dur * pixelsPerSecond);

  // Track the music offset region
  const offsetSec = tl.offset;
  const regionLeft = document.getElementById('tlRegionLeft');
  const regionBody = document.getElementById('tlRegionBody');
  const regionRight = document.getElementById('tlRegionRight');

  if (offsetSec >= 0) {
    // Music starts after video start: gap on left
    const gapPct = (offsetSec / dur) * 100;
    const musicEndPct = Math.min(100, ((offsetSec + musicDur) / dur) * 100);
    regionLeft.style.width = gapPct + '%';
    regionBody.style.left = gapPct + '%';
    regionBody.style.width = (musicEndPct - gapPct) + '%';
    regionRight.style.left = musicEndPct + '%';
    regionRight.style.width = (100 - musicEndPct) + '%';
  } else {
    // Music starts before video: no gap on left
    regionLeft.style.width = '0%';
    const musicEndPct = Math.min(100, (musicDur / dur) * 100);
    regionBody.style.left = '0%';
    regionBody.style.width = musicEndPct + '%';
    regionRight.style.left = musicEndPct + '%';
    regionRight.style.width = (100 - musicEndPct) + '%';
  }

  // Draw waveform as bars
  const barW = Math.max(1, w / totalPixels);
  const midY = h / 2;

  for (let px = 0; px < totalPixels; px++) {
    const videoTime = (px / totalPixels) * dur;
    const musicTime = videoTime - offsetSec;

    let energy = 0;
    if (musicTime >= 0 && musicTime < musicDur) {
      const startS = Math.floor(musicTime * sr);
      const endS = Math.min(Math.floor((musicTime + 1 / pixelsPerSecond) * sr), totalSamples);
      let sum = 0, cnt = 0;
      for (let s = startS; s < endS; s++) { sum += ch[s] * ch[s]; cnt++; }
      energy = cnt ? Math.sqrt(sum / cnt) * 3 : 0;
    }

    const barH = Math.min(h * 0.45, energy * h * 0.8);
    const x = px * barW;

    // Color: cyan for active music region, dim for gaps
    const inMusic = musicTime >= 0 && musicTime < musicDur;
    c.fillStyle = inMusic
      ? 'rgba(6,182,212,' + (0.25 + energy * 0.45) + ')'
      : 'rgba(255,255,255,0.04)';
    c.fillRect(x, midY - barH, Math.max(1, barW - 0.5), barH * 2);
  }

  // Center line
  c.fillStyle = 'rgba(255,255,255,0.04)';
  c.fillRect(0, midY - 0.5, w, 1);

  // Draw beat markers if beat sync is on
  drawBeatMarkers(c, w, h, dur, bpm, beatInterval, offsetSec, musicDur, pixelsPerSecond);
}

function drawBeatMarkers(c, w, h, dur, bpm, beatInterval, offsetSec, musicDur, pxPerSec) {
  const beatsContainer = $('#tlBeats');
  if (!beatsContainer) return;
  beatsContainer.innerHTML = '';

  if (!tl.beatSync || !State.music.buffer) return;

  // Get impact beats from music analysis if available
  let impactTimes = new Set();
  if (State.music.analysis) {
    State.music.analysis.beats.forEach((mb, i) => {
      if (mb.isImpact) impactTimes.add(mb.time);
    });
  }

  // Draw beat markers as DOM elements (for crisp rendering)
  const totalBeats = Math.ceil(dur / beatInterval) + 4;  // extra for offset
  for (let i = 0; i < totalBeats; i++) {
    const beatTime = i * beatInterval;
    const musicTime = beatTime + offsetSec;
    if (musicTime < 0 || musicTime > musicDur) continue;
    const videoTime = beatTime;
    if (videoTime > dur) break;

    const pct = (videoTime / dur) * 100;
    const isImpact = impactTimes.has(musicTime);

    const marker = document.createElement('div');
    marker.className = 'tl-beat-marker' + (isImpact ? ' impact' : '');
    marker.style.left = pct + '%';
    beatsContainer.appendChild(marker);
  }
}

// ─── Audio graph for preview ───
function setupAudioGraph() {
  if (tl.audioCtx) return;
  try {
    tl.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    tl.origGain = tl.audioCtx.createGain();
    tl.origGain.gain.value = State.music.origVolume;
    tl.musicGain = tl.audioCtx.createGain();
    tl.musicGain.gain.value = State.music.volume;
  } catch (e) { console.warn('Audio setup:', e.message); }
}

function connectAudio() {
  if (!tl.audioCtx || !tl.video) return;
  try {
    // Disconnect old
    if (tl.musicSource) { try { tl.musicSource.stop(); tl.musicSource.disconnect(); } catch(e) {} }
    // Video audio source (must only be called once per video element)
    if (!tl._videoSource) {
      tl._videoSource = tl.audioCtx.createMediaElementSource(tl.video);
      tl._videoSource.connect(tl.origGain);
    }
    tl.origGain.connect(tl.audioCtx.destination);
    tl._videoConnected = true;

    // Music source
    if (State.music.buffer) {
      tl.musicSource = tl.audioCtx.createBufferSource();
      tl.musicSource.buffer = State.music.buffer;
      tl.musicSource.loop = true;
      tl.musicSource.connect(tl.musicGain);
      tl.musicGain.connect(tl.audioCtx.destination);
    }
  } catch (e) { console.warn('Connect audio:', e.message); }
}

// ─── Preview play/pause ───
function togglePreview() {
  if (tl.playing) {
    stopPreview();
    return;
  }
  startPreview();
}

function startPreview() {
  if (!tl.video) return;

  const playBtn = $('#btnPreviewPlay');
  playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Stop</span>';

  tl.video.muted = false;
  tl.video.currentTime = 0;

  // Reconnect audio with fresh graph for clean playback
  if (tl.audioCtx && tl.audioCtx.state === 'suspended') tl.audioCtx.resume();
  connectAudio();

  tl.video.play();
  if (tl.musicSource) {
    // Offset the music by adjusting start time in the buffer
    const offset = Math.max(0, tl.offset);
    tl.musicSource.start(0, offset);
  }

  tl.playing = true;
  updatePlayhead();
}

function stopPreview() {
  if (!tl.playing) return;
  tl.playing = false;
  tl.video.pause();
  if (tl.musicSource) { try { tl.musicSource.stop(); tl.musicSource.disconnect(); } catch(e) {} tl.musicSource = null; }
  if (tl._videoSource) { try { tl._videoSource.disconnect(); } catch(e) {} tl._videoSource = null; }
  tl._videoConnected = false;

  const playBtn = $('#btnPreviewPlay');
  playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg><span>Preview</span>';
}

function updatePlayhead() {
  if (!tl.playing) return;
  const ct = tl.video.currentTime;
  const dur = State.videoDuration;
  const pct = Math.min(100, (ct / dur) * 100);
  const playhead = $('#tlPlayhead');
  if (playhead) playhead.style.left = pct + '%';
  $('#tlTime').textContent = fmtTime(ct) + ' / ' + fmtTime(dur);

  if (ct < dur) {
    requestAnimationFrame(updatePlayhead);
  } else {
    stopPreview();
  }
}

// ─── Scrubber dragging ───
function setupScrubber() {
  const wrap = $('.tl-waveform-wrap');
  if (!wrap) return;
  let dragging = false;

  function scrub(e) {
    const rect = wrap.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const ct = pct * State.videoDuration;
    const playhead = $('#tlPlayhead');
    if (playhead) playhead.style.left = (pct * 100) + '%';

    if (!tl.playing) {
      $('#tlTime').textContent = fmtTime(ct) + ' / ' + fmtTime(State.videoDuration);
      // Seek video
      if (tl.video && tl.video.readyState >= 1) {
        tl.video.currentTime = ct;
      }
    }
  }

  wrap.addEventListener('mousedown', e => { dragging = true; scrub(e); });
  document.addEventListener('mousemove', e => { if (dragging) scrub(e); });
  document.addEventListener('mouseup', () => { dragging = false; });
  wrap.addEventListener('touchstart', e => { dragging = true; scrub(e); }, { passive: true });
  document.addEventListener('touchmove', e => { if (dragging) scrub(e); }, { passive: true });
  document.addEventListener('touchend', () => { dragging = false; });
}

// ─── Update beat info display ───
function updateBeatInfo() {
  const info = $('#tlBeatInfo');
  if (!info) return;
  if (State.music.buffer && State.music.bpm) {
    info.textContent = State.music.bpm + ' BPM \u2022 ' + State.music.beats.length + ' beats';
  } else {
    info.textContent = '';
  }
}

// ─── Wire events ───
$('#btnPreviewPlay').addEventListener('click', togglePreview);

$('#tlOrigVol').addEventListener('input', function() {
  const val = this.value / 100;
  State.music.origVolume = val;
  $('#tlOrigVolVal').textContent = this.value + '%';
  if (tl.origGain) tl.origGain.gain.value = val;
});

$('#tlMusicVol').addEventListener('input', function() {
  const val = this.value / 100;
  State.music.volume = val;
  $('#tlMusicVolVal').textContent = this.value + '%';
  if (tl.musicGain) tl.musicGain.gain.value = val;
});

$('#tlMuteOrig').addEventListener('click', function() {
  tl.muted = !tl.muted;
  const val = tl.muted ? 0 : (State.music.origVolume || 0.5);
  if (tl.origGain) tl.origGain.gain.value = val;
  $('#tlOrigVol').value = tl.muted ? 0 : Math.round(State.music.origVolume * 100);
  $('#tlOrigVolVal').textContent = tl.muted ? '0%' : Math.round(State.music.origVolume * 100) + '%';
  this.innerHTML = tl.muted ? '&#128263;' : '&#128264;';
});

$('#tlOffset').addEventListener('input', function() {
  tl.offset = this.value / 10;  // -5.0 to +5.0 seconds
  const sign = tl.offset >= 0 ? '+' : '';
  $('#tlOffsetDisplay').textContent = sign + tl.offset.toFixed(1) + 's';
  // Redraw waveform with new offset
  drawWaveform();
});

$('#tlBeatSync').addEventListener('change', function() {
  tl.beatSync = this.checked;
  drawWaveform();
});

// ─── Cleanup on step hide ───
function destroyTimeline() {
  stopPreview();
  // Remove video element to release MediaElementSource for next init
  if (tl.video) {
    tl.video.pause();
    tl.video.src = '';
    tl.video.load();
    tl.video = null;
  }
  if (tl.audioCtx) {
    try { tl.audioCtx.close(); } catch(e) {}
    tl.audioCtx = null;
  }
  tl._videoSource = null;
  tl._videoConnected = false;
  tl.musicSource = null;
}

// ─── Expose ───
window.initTimeline = initTimeline;
window.destroyTimeline = destroyTimeline;
window.setupScrubber = setupScrubber;
