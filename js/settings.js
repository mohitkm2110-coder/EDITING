// ─── Category mapping ───
const CATEGORY_MAP = {
  gaming: { preset: 'gaming', platform: 'youtube', videoType: 'gaming', intensity: 'medium', intMult: 1.0 },
  cinematic: { preset: 'cinematic', platform: 'reels', videoType: 'cinematic', intensity: 'medium', intMult: 1.0 },
  viral: { preset: 'viral', platform: 'tiktok', videoType: 'viral', intensity: 'high', intMult: 1.5 },
};

let currentCategory = 'cinematic';

function getCategory() {
  return CATEGORY_MAP[currentCategory];
}

// ─── Category card selection ───
$('#stepSettings').addEventListener('click', e => {
  const card = e.target.closest('.category-card');
  if (!card) return;
  $$('.category-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  currentCategory = card.dataset.category;
  State.settings.platform = CATEGORY_MAP[currentCategory].platform;
});

// ─── Export settings (pills) ───
['exportRes', 'exportFps', 'exportQuality', 'exportFormat'].forEach(initPills);

function readExport() {
  return {
    resolution: parseInt(getActivePill('exportRes')) || 1080,
    fps: parseInt(getActivePill('exportFps')) || 30,
    quality: getActivePill('exportQuality'),
    format: getActivePill('exportFormat'),
  };
}

// ─── Get template config from category ───
function getTemplate() {
  const cat = getCategory();
  const presets = {
    gaming: {
      filter: 'contrast(1.12) saturate(1.1) brightness(0.93)',
      shake: { max: 2.5, decay: 0.9, cooldown: 1.5 },
      zoom: { max: 0.035, decay: 0.92, cooldown: 1.5 },
      flash: { maxOpacity: 0.06, decay: 0.88 },
      vignette: false,
      transition: { frames: 2, opacity: 0.1 },
      beatSync: 'high',
      tiers: {
        1: { shake: 2.5, flash: 0.06, zoom: 0.035 },
        2: { shake: 1.5, flash: 0.04, zoom: 0.02 },
        3: { flash: 0.025, zoom: 0.01 },
        4: {},
      },
    },
    cinematic: {
      filter: 'contrast(1.08) saturate(1.05) brightness(0.92)',
      shake: { max: 2, decay: 0.92, cooldown: 1.2 },
      zoom: { max: 0.04, decay: 0.93, cooldown: 1.0 },
      flash: { maxOpacity: 0.07, decay: 0.88 },
      vignette: true,
      transition: { frames: 4, opacity: 0.12 },
      beatSync: 'normal',
      tiers: {
        1: { flash: 0.06, zoom: 0.04 },
        2: { flash: 0.04, zoom: 0.02 },
        3: { flash: 0.025 },
        4: { flash: 0.015 },
      },
    },
    viral: {
      filter: 'contrast(1.12) saturate(1.15) brightness(0.93)',
      shake: { max: 6, decay: 0.84, cooldown: 0.35 },
      zoom: { max: 0.1, decay: 0.85, cooldown: 0.35 },
      flash: { maxOpacity: 0.15, decay: 0.8 },
      vignette: true,
      transition: { frames: 2, opacity: 0.15 },
      beatSync: 'normal',
      tiers: {
        1: { shake: 6, flash: 0.15, zoom: 0.1 },
        2: { shake: 3.5, flash: 0.1, zoom: 0.05 },
        3: { flash: 0.06, zoom: 0.025 },
        4: { flash: 0.03 },
      },
    },
  };

  return { ...presets[cat.preset], intMult: cat.intMult };
}

// ═══════════════════════════════════════════════════════════════
// MUSIC
// ═══════════════════════════════════════════════════════════════

// ─── Upload music file ───
$('#musicUpload').addEventListener('click', e => {
  if (e.target.tagName !== 'INPUT') $('#musicInput').click();
});
$('#musicInput').addEventListener('change', e => {
  if (e.target.files.length) handleMusicFile(e.target.files[0]);
});
$('#musicUpload').addEventListener('dragover', e => { e.preventDefault(); $('#musicUpload').style.borderColor = 'rgba(6,182,212,.3)'; });
$('#musicUpload').addEventListener('dragleave', () => $('#musicUpload').style.borderColor = '');
$('#musicUpload').addEventListener('drop', e => {
  e.preventDefault();
  $('#musicUpload').style.borderColor = '';
  if (e.dataTransfer.files.length && e.dataTransfer.files[0].type.startsWith('audio/')) handleMusicFile(e.dataTransfer.files[0]);
});

function handleMusicFile(file) {
  if (!file.type.startsWith('audio/')) return;
  State.music.file = file;
  State.music.selectedTrack = null;
  $$('.track-card').forEach(x => x.classList.remove('active'));
  const info = $('#musicFileInfo');
  info.textContent = '\u{1F3B5} ' + file.name + ' (' + fmtSize(file.size) + ')';
  info.classList.add('show');
  analyzeMusicFile(file);
}

async function analyzeMusicFile(file) {
  try {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    await new Promise(r => { reader.onload = r; });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await ctx.decodeAudioData(reader.result);
    ctx.close();
    State.music.buffer = buffer;
    detectBeatsFromBuffer(buffer);
    showVolumeControls();
  } catch (err) {
    console.warn('Music analysis:', err.message);
  }
}

// ─── Built-in track selection ───
$('#trackGrid').addEventListener('click', e => {
  const card = e.target.closest('.track-card');
  if (!card) return;
  selectTrack(card.dataset.track);
});

function selectTrack(id) {
  const track = TRACKS[id];
  if (!track) return;
  State.music.selectedTrack = id;
  State.music.file = null;
  State.music.buffer = null;
  $('#musicFileInfo').classList.remove('show');
  $('#musicInput').value = '';
  $$('.track-card').forEach(x => x.classList.toggle('active', x.dataset.track === id));
  generateBuiltInTrack(id);
}

function generateBuiltInTrack(id) {
  const track = TRACKS[id];
  if (!track) return;
  const sr = 44100;
  const bpm = track.bpm;
  const beatLen = 60 / bpm;
  const totalBeats = 64;
  const dur = totalBeats * beatLen;

  const ctx = new OfflineAudioContext(2, sr * dur, sr);
  renderTrack(ctx, id, bpm, dur, totalBeats);
  ctx.startRendering().then(buffer => {
    State.music.buffer = buffer;
    State.music.bpm = bpm;
    State.music.beats = [];
    for (let t = 0; t < dur; t += beatLen) State.music.beats.push(t);
    showVolumeControls();
    $('#bpmDisplay').textContent = bpm + ' BPM';
    $('#bpmDisplay').classList.add('show');
  }).catch(console.error);
}

function renderTrack(ctx, id, bpm, dur, tb) {
  const bl = 60 / bpm, sr = ctx.sampleRate;
  const noise = (() => { const b = ctx.createBuffer(1, sr, sr), d = b.getChannelData(0); for (let i = 0; i < sr; i++) d[i] = Math.random() * 2 - 1; return b; })();

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.15);
  }
  function snare(t) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const g = ctx.createGain(), o = ctx.createOscillator(), g2 = ctx.createGain();
    o.frequency.setValueAtTime(180, t); g2.gain.setValueAtTime(0.6, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    s.connect(g); g.connect(ctx.destination); o.connect(g2); g2.connect(ctx.destination);
    s.start(t); s.stop(t + 0.15); o.start(t); o.stop(t + 0.12);
  }
  function hat(t, ch) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = ch ? 8000 : 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(ch ? 0.25 : 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + (ch ? 0.05 : 0.12));
    s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + (ch ? 0.05 : 0.12));
  }
  function bass(t, n) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(n, t); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + bl * 2);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + bl * 2);
  }
  function lead(t, f, d) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    const g = ctx.createGain(), fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 2000;
    o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.15, t); g.gain.setValueAtTime(0.15, t + d * 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(fl); fl.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d);
  }

  switch (id) {
    case 'neon':
      for (let i = 0; i < tb; i++) {
        const t = i * bl;
        if (i % 4 === 0) kick(t);
        if (i % 4 === 2) { kick(t); snare(t); for (let h = 0; h < 4; h++) hat(t + h * bl / 4, h % 2 === 0); }
        if (i % 4 === 1 || i % 4 === 3) hat(t + bl / 4, 1);
        if (i % 8 === 0) bass(t, 65.4);
        if (i % 8 === 4) bass(t, 73.4);
        if (i % 16 === 0 && i < tb - 8) {
          const notes = [523, 587, 659, 784, 659, 587, 523, 494];
          notes.forEach((f, j) => lead(t + j * bl / 2, f, bl / 2));
        }
      }
      break;
    case 'epic':
      for (let i = 0; i < tb; i++) {
        const t = i * bl;
        if (i % 4 === 0) kick(t);
        if (i % 4 === 2) snare(t);
        if (i % 32 === 0) {
          const o = ctx.createOscillator(); o.type = 'sine';
          const g = ctx.createGain(); o.frequency.setValueAtTime(130.8, t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 8);
          o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 8);
        }
        if (i % 4 === 0) [262, 330, 392, 523].forEach((f, j) => {
          const o = ctx.createOscillator(); o.type = 'sine';
          const g = ctx.createGain(); o.frequency.setValueAtTime(f, t + j * 0.08); g.gain.setValueAtTime(0.06, t + j * 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + j * 0.08 + 0.3);
          o.connect(g); g.connect(ctx.destination); o.start(t + j * 0.08); o.stop(t + j * 0.08 + 0.3);
        });
      }
      break;
    case 'urban':
      for (let i = 0; i < tb; i++) {
        const t = i * bl;
        if (i % 4 === 0) kick(t);
        if (i % 4 === 2) snare(t);
        if (i % 8 === 0 || i % 8 === 6) kick(t + bl / 2);
        if (i % 4 === 0) for (let h = 0; h < 8; h++) { const ht = t + h * bl / 8; hat(ht, h % 2 === 0); if (h === 3 || h === 7) kick(ht + 0.02); }
        if (i % 8 === 0) bass(t, 43.7);
        if (i % 8 === 4) bass(t, 49.0);
      }
      break;
    case 'chill':
      for (let i = 0; i < tb; i++) {
        const t = i * bl;
        if (i % 4 === 0) { kick(t); hat(t + bl / 4, 1); hat(t + bl / 2, 1); hat(t + bl * 3 / 4, 1); }
        if (i % 8 === 0) {
          const s = ctx.createBufferSource(); s.buffer = noise;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.02, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          s.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + 0.3);
        }
        if (i % 16 === 0) [262, 330, 392].forEach(f => {
          const o = ctx.createOscillator(); o.type = 'triangle';
          const g = ctx.createGain(); o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 4);
          o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 4);
        });
      }
      break;
  }
}

// ─── Beat detection from uploaded audio ───
function detectBeatsFromBuffer(buf) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, ws = 1024, hs = 512, nw = Math.floor((d.length - ws) / hs);
  let e = [];
  for (let w = 0; w < nw; w++) { let s = 0; const o = w * hs; for (let i = 0; i < ws; i++) s += d[o + i] * d[o + i]; e.push(s / ws); }
  const aw = Math.round(sr / hs * 0.5);
  let peaks = [];
  for (let i = 1; i < e.length - 1; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - aw); j < Math.min(e.length, i + aw); j++) { s += e[j]; c++; }
    const r = e[i] / (s / c + 1e-10);
    if (r > 1.8 && e[i] > e[i - 1] && e[i] > e[i + 1]) peaks.push({ time: (i * hs) / sr });
  }
  if (peaks.length < 4) {
    State.music.beats = [];
    for (let t = 0; t < buf.duration; t += 60 / (State.music.bpm || 120)) State.music.beats.push(t);
    return;
  }
  let intervals = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i].time - peaks[i - 1].time);
  let hist = {};
  intervals.forEach(v => { const k = Math.round(v / 0.01) * 0.01; hist[k] = (hist[k] || 0) + 1; });
  let bestInterval = 0, bestCount = 0;
  for (const [k, c] of Object.entries(hist)) { if (c > bestCount) { bestCount = c; bestInterval = parseFloat(k); } }
  const detectedBpm = Math.round(60 / (bestInterval || 0.5));
  if (detectedBpm > 50 && detectedBpm < 220) State.music.bpm = detectedBpm;
  State.music.beats = [];
  for (let t = 0; t < buf.duration; t += 60 / State.music.bpm) State.music.beats.push(t);
  $('#bpmDisplay').textContent = State.music.bpm + ' BPM';
  $('#bpmDisplay').classList.add('show');
}

// ─── Volume controls ───
function showVolumeControls() {
  const ctrl = $('#volumeControls');
  ctrl.style.display = 'block';
  ctrl.style.animation = 'fadeUp .35s ease';
}

$('#musicVolume').addEventListener('input', function() {
  State.music.volume = this.value / 100;
  $('#musicVolumeVal').textContent = this.value + '%';
});

$('#origVolume').addEventListener('input', function() {
  State.music.origVolume = this.value / 100;
  $('#origVolumeVal').textContent = this.value + '%';
});
