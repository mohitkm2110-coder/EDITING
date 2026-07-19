// ─── DOM Helpers ───
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => Array.from((p || document).querySelectorAll(s));

// ─── State ───
const State = {
  videoFile: null,
  videoUrl: null,
  videoDuration: 0,
  videoWidth: 0,
  videoHeight: 0,
  cancelling: false,

  settings: {
    platform: 'reels',
  },

  export: {
    resolution: 1080,
    fps: 30,
    quality: 'standard',
    format: 'mp4',
  },

  analysis: {
    scenes: [],
    highlights: [],
    audioEvents: [],
  },

  music: {
    file: null,
    buffer: null,
    selectedTrack: null,
    bpm: 120,
    beats: [],
    volume: 0.7,
    origVolume: 0.5,
    analysis: null,
  },
};

// ─── Built-in music tracks ───
const TRACKS = {
  neon: { label: 'Neon Nights', bpm: 128 },
  epic: { label: 'Epic Rise', bpm: 90 },
  urban: { label: 'Urban Flow', bpm: 140 },
  chill: { label: 'Chill Wave', bpm: 80 },
};

// ─── Formatting ───
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

function fmtSize(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb.toFixed(1) + ' MB';
}

// ─── Pill groups ───
function initPills(containerId) {
  const container = $('#' + containerId);
  if (!container) return;
  container.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    $$('.pill', container).forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  });
}

function getActivePill(containerId) {
  const active = $('#' + containerId + ' .pill.active');
  return active ? active.dataset.value : null;
}

// ─── Promise helpers ───
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForEvent(target, event, timeout = 5000) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, timeout);
    target.addEventListener(event, () => { clearTimeout(t); resolve(); }, { once: true });
  });
}
