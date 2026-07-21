// ─── Interactive Audio Timeline ───
// Video plays normally (visible). Music plays through AudioContext.
// Offset shifts where in the music buffer playback starts.

const tl = {
  video: null,
  audioCtx: null,
  musicSource: null,
  musicGain: null,
  playing: false,
  offset: 0,
  beatSync: true,
  muted: false,
  duration: 0,
};

function initTimeline() {
  tl.duration = State.videoDuration;
  if (!tl.duration) return;

  // Create visible video element
  const video = $('#tlVideo');
  if (!video) return;
  tl.video = video;
  video.src = State.videoUrl;
  video.load();
  video.volume = State.music.origVolume;
  video.muted = false;

  // Reset UI
  $('#tlTimeDisplay').textContent = '0:00 / ' + fmtTime(tl.duration);
  $('#tlTimeLabel').textContent = '0:00';
  $('#tlScrubFill').style.width = '0%';
  $('#tlPlayheadBar').style.left = '0%';
  hidePauseIcon();

  $('#tlOrigVol').value = Math.round(State.music.origVolume * 100);
  $('#tlOrigVolVal').textContent = Math.round(State.music.origVolume * 100) + '%';
  $('#tlMusicVol').value = Math.round(State.music.volume * 100);
  $('#tlMusicVolVal').textContent = Math.round(State.music.volume * 100) + '%';
  tl.offset = State.music.offset || 0;
  $('#tlOffset').value = tl.offset * 10;
  $('#tlOffsetVal').textContent = (tl.offset >= 0 ? '+' : '') + tl.offset.toFixed(1) + 's';
  tl.muted = false;
  $('#tlMuteOrig').innerHTML = '&#128264;';

  if (State.music.bpm) {
    $('#tlBpmDisplay').textContent = State.music.bpm + ' BPM';
  }

  // Setup audio
  setupAudio();

  // Draw timeline
  drawTimeline();

  // Events
  wireEvents();
}

// ─── Audio: music only, video plays natively ───
function setupAudio() {
  if (tl.audioCtx) return;
  try {
    tl.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    tl.musicGain = tl.audioCtx.createGain();
    tl.musicGain.gain.value = State.music.volume;
    tl.musicGain.connect(tl.audioCtx.destination);
  } catch (e) { console.warn('Audio:', e.message); }
}

function startMusic(fromTime) {
  if (!tl.audioCtx || !State.music.buffer) return;
  stopMusic();
  if (tl.audioCtx.state === 'suspended') tl.audioCtx.resume();

  const buffer = State.music.buffer;
  const offsetInBuffer = Math.max(0, fromTime + tl.offset) % buffer.duration;

  tl.musicSource = tl.audioCtx.createBufferSource();
  tl.musicSource.buffer = buffer;
  tl.musicSource.loop = true;
  tl.musicSource.connect(tl.musicGain);
  tl.musicSource.start(0, offsetInBuffer);
}

function stopMusic() {
  if (tl.musicSource) {
    try { tl.musicSource.stop(); tl.musicSource.disconnect(); } catch (e) {}
    tl.musicSource = null;
  }
}

function updateMusicGain(val) {
  if (tl.musicGain) tl.musicGain.gain.value = val;
}

// ─── Playback ───
function togglePlay() {
  if (tl.playing) { pause(); } else { play(); }
}

function play() {
  if (!tl.video || !tl.video.src) return;
  tl.video.play().then(() => {
    startMusic(tl.video.currentTime);
    tl.playing = true;
    showPauseIcon();
    frameLoop();
  }).catch(console.warn);
}

function pause() {
  if (!tl.playing) return;
  tl.playing = false;
  tl.video.pause();
  stopMusic();
  hidePauseIcon();
}

function stop() {
  pause();
  if (tl.video) tl.video.currentTime = 0;
  updateScrub(0);
}

function frameLoop() {
  if (!tl.playing) return;
  const ct = tl.video.currentTime;
  const pct = Math.min(1, ct / tl.duration);

  updateScrub(pct);
  $('#tlTimeDisplay').textContent = fmtTime(ct) + ' / ' + fmtTime(tl.duration);
  $('#tlTimeLabel').textContent = fmtTime(ct);

  if (ct >= tl.duration - 0.05) {
    stop();
    return;
  }
  requestAnimationFrame(frameLoop);
}

function showPauseIcon() {
  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('pauseIcon').style.display = '';
}

function hidePauseIcon() {
  document.getElementById('playIcon').style.display = '';
  document.getElementById('pauseIcon').style.display = 'none';
}

// ─── Scrubber ───
function updateScrub(pct) {
  pct = Math.max(0, Math.min(1, pct));
  $('#tlScrubFill').style.width = (pct * 100) + '%';
  $('#tlScrubThumb').style.left = (pct * 100) + '%';
  $('#tlPlayheadBar').style.left = (pct * 100) + '%';
}

function seekTo(pct) {
  const ct = pct * tl.duration;
  if (tl.video && tl.video.readyState >= 1) {
    tl.video.currentTime = ct;
    // If currently playing, restart music at new position
    if (tl.playing) {
      startMusic(ct);
    }
  }
  updateScrub(pct);
  $('#tlTimeDisplay').textContent = fmtTime(ct) + ' / ' + fmtTime(tl.duration);
  $('#tlTimeLabel').textContent = fmtTime(ct);
}

// ─── Draw timeline ───
function drawTimeline() {
  drawRuler();
  drawWaveform();
  drawBeatMarkers();
}

function drawRuler() {
  const ruler = $('#tlRuler');
  if (!ruler) return;
  const dur = tl.duration;
  let html = '';
  for (let t = 0; t < dur; t += 2) {
    const pct = (t / dur) * 100;
    if (t % 10 === 0) {
      html += '<div class="tl-ruler-mark" style="left:' + pct + '%"><span>' + fmtTime(t) + '</span></div>';
    } else if (t % 4 === 0) {
      html += '<div class="tl-ruler-tick" style="left:' + pct + '%"></div>';
    }
  }
  ruler.innerHTML = html;
}

function drawWaveform() {
  const canvas = $('#tlWaveform');
  if (!canvas) return;
  const wrap = $('#tlWaveformWrap');
  const w = wrap.offsetWidth || 600;
  const h = 80;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const c = canvas.getContext('2d');
  c.scale(2, 2);
  c.clearRect(0, 0, w, h);

  if (!State.music.buffer) {
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('No music selected — waveform will appear here', w / 2, h / 2 + 4);
    return;
  }

  const buf = State.music.buffer;
  const dur = tl.duration;
  const musicDur = buf.duration;
  const sr = buf.sampleRate;
  const ch = buf.getChannelData(0);
  const totalSamples = ch.length;
  const offsetSec = tl.offset;

  // Update region dimming
  const regionL = $('#tlRegionLeft');
  const regionR = $('#tlRegionRight');
  if (offsetSec >= 0) {
    const gapPct = (offsetSec / dur) * 100;
    const musicEndPct = Math.min(100, ((offsetSec + musicDur) / dur) * 100);
    regionL.style.width = gapPct + '%';
    regionL.style.display = gapPct > 0.5 ? '' : 'none';
    regionR.style.left = musicEndPct + '%';
    regionR.style.width = (100 - musicEndPct) + '%';
    regionR.style.display = (100 - musicEndPct) > 0.5 ? '' : 'none';
  } else {
    regionL.style.width = '0%';
    regionL.style.display = 'none';
    const musicEndPct = Math.min(100, (musicDur / dur) * 100);
    regionR.style.left = musicEndPct + '%';
    regionR.style.width = (100 - musicEndPct) + '%';
    regionR.style.display = (100 - musicEndPct) > 0.5 ? '' : 'none';
  }

  // Draw waveform bars
  const pxPerSec = w / dur;
  const totalPx = Math.ceil(dur * pxPerSec);
  const barW = Math.max(1, w / totalPx);
  const midY = h / 2;

  for (let px = 0; px < totalPx; px++) {
    const videoTime = (px / totalPx) * dur;
    const musicTime = videoTime + offsetSec;
    let energy = 0;
    if (musicTime >= 0 && musicTime < musicDur) {
      const startS = Math.floor(musicTime * sr);
      const nSamples = Math.max(1, Math.floor(totalSamples / totalPx));
      let sum = 0, cnt = 0;
      for (let s = startS; s < Math.min(startS + nSamples, totalSamples); s++) {
        sum += ch[s] * ch[s]; cnt++;
      }
      energy = cnt ? Math.sqrt(sum / cnt) * 3 : 0;
    }
    const barH = Math.min(h * 0.45, energy * h * 0.8);
    const x = px * barW;
    const active = musicTime >= 0 && musicTime < musicDur;
    c.fillStyle = active
      ? 'rgba(6,182,212,' + (0.2 + energy * 0.5) + ')'
      : 'rgba(255,255,255,0.03)';
    c.fillRect(x, midY - barH, Math.max(1, barW - 0.5), Math.max(1, barH * 2));
  }

  // Center line
  c.fillStyle = 'rgba(255,255,255,0.04)';
  c.fillRect(0, midY - 0.5, w, 1);
}

function drawBeatMarkers() {
  const overlay = $('#tlBeatsOverlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  if (!tl.beatSync || !State.music.buffer) return;

  const bpm = State.music.bpm || 120;
  const beatInt = 60 / bpm;
  const dur = tl.duration;
  const musicDur = State.music.buffer.duration;
  const offsetSec = tl.offset;

  let impactTimes = new Set();
  if (State.music.analysis) {
    State.music.analysis.beats.forEach(mb => { if (mb.isImpact) impactTimes.add(mb.time); });
  }

  const totalBeats = Math.ceil(dur / beatInt) + 4;
  for (let i = 0; i < totalBeats; i++) {
    const beatTime = i * beatInt;
    const musicTime = beatTime + offsetSec;
    if (musicTime < 0 || musicTime > musicDur) continue;
    const pct = (beatTime / dur) * 100;
    if (pct > 100) break;
    const m = document.createElement('div');
    m.className = 'tl-beat-marker' + (impactTimes.has(musicTime) ? ' impact' : '');
    m.style.left = pct + '%';
    overlay.appendChild(m);
  }
}

// ─── Events ───
function wireEvents() {
  // Play button
  $('#btnPlay').addEventListener('click', togglePlay);

  // Scrub bar
  const scrubBar = $('#tlScrubBar');
  if (scrubBar) {
    let dragging = false;
    function scrub(e) {
      const rect = scrubBar.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      seekTo(pct);
    }
    scrubBar.addEventListener('mousedown', e => { dragging = true; scrub(e); });
    document.addEventListener('mousemove', e => { if (dragging) scrub(e); });
    document.addEventListener('mouseup', () => { dragging = false; });
    scrubBar.addEventListener('touchstart', e => { dragging = true; scrub(e); }, { passive: true });
    document.addEventListener('touchmove', e => { if (dragging) scrub(e); }, { passive: true });
    document.addEventListener('touchend', () => { dragging = false; });
  }

  // Waveform click-to-seek
  const waveformWrap = $('#tlWaveformWrap');
  if (waveformWrap) {
    let dragging = false;
    function seekWaveform(e) {
      const rect = waveformWrap.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      seekTo(pct);
    }
    waveformWrap.addEventListener('mousedown', e => { dragging = true; seekWaveform(e); });
    document.addEventListener('mousemove', e => { if (dragging) seekWaveform(e); });
    document.addEventListener('mouseup', () => { dragging = false; });
    waveformWrap.addEventListener('touchstart', e => { dragging = true; seekWaveform(e); }, { passive: true });
    document.addEventListener('touchmove', e => { if (dragging) seekWaveform(e); }, { passive: true });
    document.addEventListener('touchend', () => { dragging = false; });
  }

  // Offset — persisted to State immediately
  $('#tlOffset').addEventListener('input', function() {
    tl.offset = this.value / 10;
    State.music.offset = tl.offset;
    const sign = tl.offset >= 0 ? '+' : '';
    $('#tlOffsetVal').textContent = sign + tl.offset.toFixed(1) + 's';
    if (tl.playing && tl.video) {
      startMusic(tl.video.currentTime);
    }
    drawWaveform();
    drawBeatMarkers();
  });

  // Beat sync toggle
  $('#tlBeatSync').addEventListener('change', function() {
    tl.beatSync = this.checked;
    drawBeatMarkers();
  });

  // Volume: video audio (native volume)
  $('#tlOrigVol').addEventListener('input', function() {
    const val = this.value / 100;
    State.music.origVolume = val;
    $('#tlOrigVolVal').textContent = this.value + '%';
    if (tl.video) tl.video.volume = tl.muted ? 0 : val;
  });

  // Volume: music (AudioContext gain)
  $('#tlMusicVol').addEventListener('input', function() {
    const val = this.value / 100;
    State.music.volume = val;
    $('#tlMusicVolVal').textContent = this.value + '%';
    updateMusicGain(val);
  });

  // Mute video audio
  $('#tlMuteOrig').addEventListener('click', function() {
    tl.muted = !tl.muted;
    if (tl.video) tl.video.muted = tl.muted;
    this.innerHTML = tl.muted ? '&#128263;' : '&#128264;';
  });

  // Keyboard shortcut: space
  document.addEventListener('keydown', function keyHandler(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' && $('#stepTimeline.active')) {
      e.preventDefault();
      togglePlay();
    }
  });
}

// ─── Cleanup ───
function destroyTimeline() {
  pause();
  stopMusic();
  if (tl.video) {
    tl.video.pause();
    tl.video.src = '';
    tl.video.load();
    tl.video = null;
  }
  // Keep audioCtx alive for future use, close on page unload
}

// ─── Expose ───
window.initTimeline = initTimeline;
window.destroyTimeline = destroyTimeline;
