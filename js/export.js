// ─── Render & Export Engine ───
// Plays video through, applies effects in real-time, captures to file

const canvas = document.getElementById('processor');
const ctx = canvas.getContext('2d');

let recorder = null;
let chunks = [];

function cancelRender() {
  State.cancelling = true;
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); } catch (e) {}
  }
}

// ─── Main render function ───
async function renderEdit(videoEl, scenes, highlights, audioEvents, onProgress) {
  const tmpl = getTemplate();
  const exportOpts = readExport();

  // Canvas setup
  const ar = State.settings.platform === 'shorts' || State.settings.platform === 'reels' || State.settings.platform === 'tiktok' ? 9 / 16 : 16 / 9;
  const w = exportOpts.resolution * (ar > 1 ? ar : 1);
  const h = exportOpts.resolution * (ar < 1 ? ar : 1);
  const width = Math.round(ar >= 1 ? w : exportOpts.resolution * 16 / 9);
  const height = Math.round(ar >= 1 ? exportOpts.resolution : exportOpts.resolution * 9 / 16);
  // Simplified: use 16:9 or 9:16 based on platform
  let canvasW, canvasH;
  if (platformIsVertical()) {
    canvasW = exportOpts.resolution * 9 / 16;
    canvasH = exportOpts.resolution;
  } else {
    canvasW = exportOpts.resolution * 16 / 9;
    canvasH = exportOpts.resolution;
  }
  canvasW = Math.round(canvasW);
  canvasH = Math.round(canvasH);

  const qualMap = { standard: 'low', high: 'medium', ultra: 'high' };
  setupCanvas(canvas, ctx, canvasW, canvasH, qualMap[exportOpts.quality] || 'medium');

  const duration = videoEl.duration;
  const fps = exportOpts.fps;
  const frameDur = 1 / fps;

  // Audio setup
  let audioTracks = [];
  let procCtx = null;
  let audioDest = null;
  let musicSource = null;

  try {
    procCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (procCtx.state === 'suspended') await procCtx.resume();
    audioDest = procCtx.createMediaStreamDestination();

    // Video audio with volume control
    const origGain = procCtx.createGain();
    origGain.gain.value = State.music.origVolume;
    procCtx.createMediaElementSource(videoEl).connect(origGain).connect(audioDest);

    // Music track with volume control
    if (State.music.buffer) {
      musicSource = procCtx.createBufferSource();
      musicSource.buffer = State.music.buffer;
      musicSource.loop = true;
      const musicGain = procCtx.createGain();
      musicGain.gain.value = State.music.volume;
      musicSource.connect(musicGain).connect(audioDest);
      musicSource.start();
    }

    audioTracks = audioDest.stream.getAudioTracks();
  } catch (e) { console.warn('Audio setup:', e.message); }

  // MediaRecorder setup
  const cStream = canvas.captureStream(fps);
  const tracks = [...cStream.getVideoTracks(), ...audioTracks];
  let mime = '';
  const codecs = exportOpts.format === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/quicktime', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm'];
  codecs.forEach(t => { if (MediaRecorder.isTypeSupported(t)) mime = t; });

  chunks = [];
  recorder = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : {});
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.start(1000);

  // Build beat timeline (simulated from highlights/audio)
  const beatTimes = generateBeats(duration, audioEvents, highlights);

  // Effect state
  const efState = createEffectState();
  let beatIdx = 0;
  let prevSceneIdx = -1;

  // Play through
  videoEl.currentTime = 0;
  await videoEl.play();
  const frameMs = 1000 / fps;

  // Main render loop
  while (true) {
    if (State.cancelling) { videoEl.pause(); break; }

    const ct = videoEl.currentTime;
    if (ct >= duration - 0.05) break;

    // Check for scene change
    const sceneIdx = scenes.findIndex(s => ct >= s.start && ct < s.end);
    const isNewScene = sceneIdx !== prevSceneIdx && prevSceneIdx >= 0;
    prevSceneIdx = sceneIdx;

    // Beat-synced effects
    while (beatIdx < beatTimes.length && beatTimes[beatIdx].time <= ct + 0.05) {
      const b = beatTimes[beatIdx];
      const tier = b.isDrop ? 1 : b.tier;
      triggerBeatEffect(efState, tmpl, tier, ct, b.mult || 1);
      beatIdx++;
    }

    // Draw frame
    applyEffects(ctx, canvas, videoEl, tmpl, efState, ct, isNewScene);

    // Progress
    const pct = ct / duration;
    onProgress(pct);

    // Wait for next frame
    const startTime = performance.now();
    await new Promise(r => setTimeout(r, Math.max(0, frameMs - (performance.now() - startTime))));
  }

  // Stop recording
  await delay(500);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  await delay(600);

  // Create blob
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('quicktime') ? 'mov' : 'webm';
  const blob = new Blob(chunks, { type: mime || 'video/webm' });
  const url = URL.createObjectURL(blob);

  if (musicSource) try { musicSource.stop(); } catch (e) {}
  if (procCtx) try { procCtx.close(); } catch (e) {}

  return { blob, url, ext, mime };
}

function platformIsVertical() {
  const p = State.settings.platform;
  return p === 'shorts' || p === 'reels' || p === 'tiktok';
}

// ─── Generate beat timestamps ───
function generateBeats(duration, audioEvents, highlights) {
  const beats = [];

  // Use actual beat timestamps from music track if available
  if (State.music.beats.length > 0) {
    const peakMoments = highlights.filter(h => h.intensity > 50).map(h => h.time);
    State.music.beats.forEach(t => {
      if (t > duration) return;
      const barBeat = Math.round(t / (60 / State.music.bpm)) % 4;
      const tier = barBeat === 0 ? 1 : barBeat === 2 ? 2 : 3;
      const nearPeak = peakMoments.some(p => Math.abs(p - t) < 60 / State.music.bpm);
      const isDrop = nearPeak && barBeat === 0;
      const mult = nearPeak ? 1.5 : 1;
      beats.push({ time: t, tier, isDrop, mult });
    });
    return beats.length ? beats : [];
  }

  // Fallback: steady beat from configured bpm
  const bpm = State.music.bpm || 120;
  const beatInterval = 60 / bpm;
  const totalBeats = Math.ceil(duration / beatInterval);
  const peakMoments = highlights.filter(h => h.intensity > 50).map(h => h.time);

  for (let i = 0; i < totalBeats; i++) {
    const t = i * beatInterval;
    const barBeat = i % 4;
    const tier = barBeat === 0 ? 1 : barBeat === 2 ? 2 : 3;
    const nearPeak = peakMoments.some(p => Math.abs(p - t) < beatInterval);
    const isDrop = nearPeak && barBeat === 0;
    const mult = nearPeak ? 1.5 : 1;
    beats.push({ time: t, tier, isDrop, mult });
  }
  return beats;
}
