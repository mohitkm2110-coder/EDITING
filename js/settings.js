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
  updateGradeLabel();
});

function updateGradeLabel() {
  const cat = getCategory();
  const preset = GRADE_PRESETS[cat.preset];
  const el = $('#gradeLabel');
  if (el && preset) el.textContent = preset.label;
}

// ─── Export settings (pills) ───
['exportRes', 'exportFps', 'exportQuality', 'exportFormat'].forEach(initPills);
updateGradeLabel();

function readExport() {
  return {
    resolution: parseInt(getActivePill('exportRes')) || 1080,
    fps: parseInt(getActivePill('exportFps')) || 30,
    quality: getActivePill('exportQuality'),
    format: getActivePill('exportFormat'),
  };
}

// ─── Color grading presets (per category, dynamic by intensity 0-1) ───
const GRADE_PRESETS = {
  gaming: {
    label: 'Gaming — Clean, crisp, vibrant',
    filter: (i) => `contrast(${1 + 0.12 * i}) saturate(${1 + 0.15 * i}) brightness(${1 - 0.01 * i})`,
    shadows: { lift: 0, compress: 0 },
    highlights: { rolloff: 0, boost: 0 },
    gamma: 1,
    warmth: 0,
  },
  cinematic: {
    label: 'Cinematic — Film-like, moody, controlled',
    filter: (i) => `contrast(${1 + 0.06 * i}) saturate(${1 - 0.14 * i}) brightness(${1 - 0.06 * i})`,
    shadows: { lift: 14 * i, compress: 0 },
    highlights: { rolloff: -8 * i, boost: 0 },
    gamma: 1 - 0.02 * i,
    warmth: 6 * i,
  },
  viral: {
    label: 'Viral — Punchy, eye-catching, bold',
    filter: (i) => `contrast(${1 + 0.2 * i}) saturate(${1 + 0.24 * i}) brightness(${1 + 0.02 * i})`,
    shadows: { lift: -4 * i, compress: 8 * i },
    highlights: { rolloff: 0, boost: 10 * i },
    gamma: 1 - 0.08 * i,
    warmth: 0,
  },
};

function getGradeFilter(intensity) {
  const cat = getCategory();
  const preset = GRADE_PRESETS[cat.preset];
  if (!preset) return { filter: 'none', pixel: null };
  const i = Math.max(0, Math.min(1, intensity));
  return {
    filter: preset.filter(i),
    pixel: {
      shadows: { lift: preset.shadows.lift * i, compress: preset.shadows.compress * i },
      highlights: { rolloff: preset.highlights.rolloff * i, boost: preset.highlights.boost * i },
      gamma: 1 - (1 - preset.gamma) * i,
      warmth: preset.warmth * i,
    },
  };
}

// ─── Get template config from category ───
function getTemplate() {
  const cat = getCategory();
  const gi = (State.settings.gradeIntensity || 70) / 100;
  const grade = getGradeFilter(gi);
  // Modulate intensity based on source video analysis
  const mod = State.analysis.sourceGradeMod || 1;
  const effectiveIntensity = Math.max(0, Math.min(1, gi * mod));
  const appliedGrade = getGradeFilter(effectiveIntensity);

  const presets = {
    gaming: {
      filter: appliedGrade.filter,
      shake: { max: 2, decay: 0.92, cooldown: 2.0 },
      zoom: { max: 0.025, decay: 0.93, cooldown: 2.0 },
      flash: { maxOpacity: 0.05, decay: 0.9 },
      vignette: true,
      transition: { frames: 3, opacity: 0.08 },
      beatSync: 'high',
      sparseEffects: true,
      grade: appliedGrade.pixel,
      tiers: {
        1: { shake: 2, flash: 0.05, zoom: 0.025 },
        2: { flash: 0.03, zoom: 0.015 },
        3: { zoom: 0.008 },
        4: {},
      },
    },
    cinematic: {
      filter: appliedGrade.filter,
      shake: { max: 2, decay: 0.92, cooldown: 1.2 },
      zoom: { max: 0.04, decay: 0.93, cooldown: 1.0 },
      flash: { maxOpacity: 0.07, decay: 0.88 },
      vignette: true,
      transition: { frames: 4, opacity: 0.12 },
      beatSync: 'normal',
      grade: appliedGrade.pixel,
      tiers: {
        1: { flash: 0.06, zoom: 0.04 },
        2: { flash: 0.04, zoom: 0.02 },
        3: { flash: 0.025 },
        4: { flash: 0.015 },
      },
    },
    viral: {
      filter: appliedGrade.filter,
      shake: { max: 6, decay: 0.84, cooldown: 0.35 },
      zoom: { max: 0.1, decay: 0.85, cooldown: 0.35 },
      flash: { maxOpacity: 0.15, decay: 0.8 },
      vignette: true,
      transition: { frames: 2, opacity: 0.15 },
      beatSync: 'normal',
      grade: appliedGrade.pixel,
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

function getGradeIntensity() {
  return (State.settings.gradeIntensity || 70) / 100;
}

function setGradeIntensity(val) {
  State.settings.gradeIntensity = Math.max(0, Math.min(100, val));
}

// ═══════════════════════════════════════════════════════════════
// MUSIC
// ═══════════════════════════════════════════════════════════════

// ─── Upload music file ───
$('#musicUpload').addEventListener('click', e => {
  const inp = $('#musicInput');
  if (e.target !== inp && !inp.contains(e.target)) {
    inp.click();
  }
});
$('#musicInput').addEventListener('change', e => {
  if (e.target.files.length) handleMusicFile(e.target.files[0]);
});
$('#musicUpload').addEventListener('dragover', e => { e.preventDefault(); $('#musicUpload').style.borderColor = 'rgba(6,182,212,.3)'; });
$('#musicUpload').addEventListener('dragleave', () => $('#musicUpload').style.borderColor = '');
$('#musicUpload').addEventListener('drop', e => {
  e.preventDefault();
  $('#musicUpload').style.borderColor = '';
  if (e.dataTransfer.files.length) handleMusicFile(e.dataTransfer.files[0]);
});

function handleMusicFile(file) {
  const validExt = /\.(mp3|wav|aac|flac|ogg|m4a|wma)$/i;
  const isValidMime = file.type.startsWith('audio/');
  const isValidExt = validExt.test(file.name);
  if (!isValidMime && !isValidExt) {
    alert('Unsupported audio format. Use MP3, WAV, AAC, FLAC, OGG, or M4A.');
    return;
  }
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
    detectMusicStructure(buffer);
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
    detectMusicStructure(buffer);
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

// ─── Music structure analysis (energy levels per beat) ───
function detectMusicStructure(buf) {
  const bpm = State.music.bpm || 120;
  const beatInterval = 60 / bpm;
  const sr = buf.sampleRate;
  const ch = buf.getChannelData(0);
  const totalBeats = Math.min(Math.ceil(buf.duration / beatInterval), 1024);
  const beats = [];

  for (let i = 0; i < totalBeats; i++) {
    const start = Math.floor(i * beatInterval * sr);
    const end = Math.min(Math.floor((i + 1) * beatInterval * sr), ch.length);
    let energy = 0, count = 0;
    for (let j = start; j < end; j++) { energy += ch[j] * ch[j]; count++; }
    beats.push({ time: i * beatInterval, energy: count ? Math.sqrt(energy / count) : 0 });
  }

  const maxE = Math.max(...beats.map(b => b.energy), 0.001);
  beats.forEach(b => b.energy = b.energy / maxE);

  // Smooth energy with moving average
  const smooth = beats.map((b, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 2); j < Math.min(beats.length, i + 3); j++) { s += beats[j].energy; c++; }
    return s / c;
  });

  beats.forEach((b, i) => {
    b.smooth = smooth[i];
    b.energyDelta = i > 0 ? smooth[i] - smooth[i - 1] : 0;
    // Classify: energy >= 80th percentile = impact, energyDelta > 0.15 and energy > 0.5 = drop
    b.isImpact = false;
    b.isDrop = false;
  });

  // Mark top 12% as impact beats
  const sorted = [...beats].sort((a, b) => b.smooth - a.smooth);
  const impactThreshold = sorted[Math.max(2, Math.floor(sorted.length * 0.12))].smooth;
  beats.forEach(b => { b.isImpact = b.smooth >= impactThreshold; });

  // Mark drops: sudden energy jump on a medium+ energy beat
  for (let i = 2; i < beats.length; i++) {
    if (beats[i].energyDelta > 0.12 && beats[i].smooth > 0.4) {
      beats[i].isDrop = true;
    }
  }

  State.music.analysis = { beats, impactThreshold };
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
