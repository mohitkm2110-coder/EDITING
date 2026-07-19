// ─── Video Analysis Engine ───
// Scene detection, highlight detection, audio analysis

const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 90;

// ─── Scene Change Detection ───
async function detectScenes(videoEl, onProgress) {
  const ac = document.createElement('canvas');
  ac.width = ANALYSIS_WIDTH;
  ac.height = ANALYSIS_HEIGHT;
  const actx = ac.getContext('2d');
  const duration = videoEl.duration;
  const scenes = [{ start: 0, end: duration }];
  const step = 0.5; // check every 0.5s
  let prev = null;
  const changes = [];

  for (let t = 0; t < duration; t += step) {
    if (State.cancelling) return scenes;
    videoEl.currentTime = t;
    await new Promise(r => { videoEl.onseeked = r; setTimeout(r, 200); });
    actx.drawImage(videoEl, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    const d = actx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT).data;

    if (prev) {
      let diff = 0;
      for (let i = 0; i < d.length; i += 4) {
        diff += Math.abs(d[i] - prev[i]) + Math.abs(d[i+1] - prev[i+1]) + Math.abs(d[i+2] - prev[i+2]);
      }
      diff /= (ANALYSIS_WIDTH * ANALYSIS_HEIGHT * 3);
      if (diff > 35) changes.push(t);
    }
    prev = new Uint8Array(d);

    if (onProgress) onProgress(t / duration);
  }

  // Group nearby changes into scenes
  if (changes.length > 0) {
    scenes.length = 0;
    let start = 0;
    for (const ct of changes) {
      if (ct - start > 2) { scenes.push({ start: Math.round(start * 10) / 10, end: Math.round(ct * 10) / 10 }); start = ct; }
    }
    if (duration - start > 0.5) {
      scenes.push({ start: Math.round(start * 10) / 10, end: duration });
    }
  }
  return scenes;
}

// ─── Motion/Highlight Detection ───
async function detectHighlights(videoEl, onProgress) {
  const ac = document.createElement('canvas');
  ac.width = ANALYSIS_WIDTH;
  ac.height = ANALYSIS_HEIGHT;
  const actx = ac.getContext('2d');
  const duration = videoEl.duration;
  const highlights = [];
  const step = 0.3;
  let prev = null;

  for (let t = 0; t < duration; t += step) {
    if (State.cancelling) return highlights;
    videoEl.currentTime = t;
    await new Promise(r => { videoEl.onseeked = r; setTimeout(r, 150); });
    actx.drawImage(videoEl, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    const d = actx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT).data;

    if (prev) {
      let motion = 0;
      for (let i = 0; i < d.length; i += 8) {
        motion += Math.abs(d[i] - prev[i]);
      }
      motion /= (ANALYSIS_WIDTH * ANALYSIS_HEIGHT / 2);
      if (motion > 8) {
        highlights.push({ time: t, intensity: Math.min(100, motion * 3) });
      }
    }
    prev = new Uint8Array(d);
    if (onProgress) onProgress(t / duration);
  }
  return highlights;
}

// ─── Audio Analysis (volume peaks) ───
async function analyzeAudio(videoEl, onProgress) {
  const events = [];
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const v = document.createElement('video');
    v.src = videoEl.src;
    await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 5000); });
    const src = ctx.createMediaElementSource(v);
    const dst = ctx.createMediaStreamDestination();
    src.connect(ctx.createGain()).connect(dst);
    v.play();
    const rec = new MediaRecorder(dst.stream, { mimeType: 'audio/webm' });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.start();
    const sampleTime = Math.min(3000, videoEl.duration * 1000);
    await new Promise(r => setTimeout(r, sampleTime));
    v.pause(); rec.stop();
    await delay(200);
    ctx.close();
    v.remove();

    if (chunks.length) {
      const blob = new Blob(chunks);
      const ab = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(ab);
      const d = decoded.getChannelData(0);
      const sr = decoded.sampleRate;
      const ws = Math.floor(sr * 0.05);
      for (let i = 0; i < d.length; i += ws) {
        let sum = 0, cnt = 0;
        for (let j = 0; j < ws && i + j < d.length; j++) { sum += d[i + j] * d[i + j]; cnt++; }
        events.push({ time: (i / sr), volume: Math.sqrt(sum / cnt) });
      }
      const maxV = Math.max(...events.map(p => p.volume), 0.001);
      events.forEach(p => p.volume = (p.volume / maxV) * 100);
      audioCtx.close();
    }
  } catch (e) { console.warn('Audio analysis:', e.message); }
  return events;
}
