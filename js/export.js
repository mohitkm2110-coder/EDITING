// ─── Render & Export Engine ───

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

// ─── Main render function (rAF + frame-accurate) ───
async function renderEdit(videoEl, scenes, highlights, audioEvents, onProgress) {
  const tmpl = getTemplate();
  const exportOpts = readExport();

  // Canvas size
  let canvasW, canvasH;
  if (platformIsVertical()) {
    canvasW = Math.round(exportOpts.resolution * 9 / 16);
    canvasH = exportOpts.resolution;
  } else {
    canvasW = Math.round(exportOpts.resolution * 16 / 9);
    canvasH = exportOpts.resolution;
  }
  const qualMap = { standard: 'low', high: 'medium', ultra: 'high' };
  setupCanvas(canvas, ctx, canvasW, canvasH, qualMap[exportOpts.quality] || 'medium');

  const duration = videoEl.duration;
  const fps = exportOpts.fps;
  const frameDur = 1 / fps;
  const totalFrames = Math.round(duration * fps);

  // Beat timeline
  const beatTimes = generateBeats(duration, audioEvents, highlights);

  // Audio setup
  let audioTracks = [];
  let procCtx = null;
  let audioDest = null;
  let musicSource = null;

  try {
    procCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (procCtx.state === 'suspended') await procCtx.resume();
    audioDest = procCtx.createMediaStreamDestination();

    const origGain = procCtx.createGain();
    origGain.gain.value = State.music.origVolume;
    procCtx.createMediaElementSource(videoEl).connect(origGain).connect(audioDest);

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

  // MediaRecorder
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
  recorder.start(100);

  // Effect state
  const efState = createEffectState();
  let beatIdx = 0;
  let prevSceneIdx = -1;

  // Frame-accurate render via rAF
  let frameCount = 0;
  videoEl.muted = true;
  videoEl.currentTime = 0;
  await new Promise(r => { videoEl.onseeked = r; setTimeout(r, 300); });
  await videoEl.play();
  await delay(50);

  await new Promise((resolve) => {
    function renderFrame() {
      if (State.cancelling) { videoEl.pause(); resolve(); return; }

      if (videoEl.paused && frameCount < totalFrames) {
        requestAnimationFrame(renderFrame);
        return;
      }

      const videoTime = videoEl.currentTime;

      while (frameCount < totalFrames &&
             (frameCount === 0 || videoTime >= (frameCount + 0.5) / fps)) {
        const ct = frameCount / fps;

        const sceneIdx = scenes.findIndex(s => ct >= s.start && ct < s.end);
        const isNewScene = sceneIdx !== prevSceneIdx && prevSceneIdx >= 0;
        prevSceneIdx = sceneIdx;

        while (beatIdx < beatTimes.length && beatTimes[beatIdx].time <= ct) {
          const b = beatTimes[beatIdx];
          triggerBeatEffect(efState, tmpl, b.isDrop ? 1 : b.tier, ct, b.mult || 1);
          beatIdx++;
        }

        applyEffects(ctx, canvas, videoEl, tmpl, efState, ct, isNewScene);
        frameCount++;
        onProgress(frameCount / totalFrames);
      }

      if (frameCount < totalFrames) {
        requestAnimationFrame(renderFrame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(renderFrame);
  });

  // Stop recording
  videoEl.pause();
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  await delay(200);

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
