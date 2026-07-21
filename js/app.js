// ─── App Orchestrator ───

// ─── Step navigation ───
function showStep(id) {
  // Cleanup timeline when leaving audio adjustment step
  if ($('#stepTimeline.active') && id !== 'stepTimeline') {
    destroyTimeline();
  }
  $$('.step').forEach(s => s.classList.remove('active'));
  const step = $('#' + id);
  if (step) step.classList.add('active');
}

// ─── Upload handling ───
const uploadZone = $('#uploadZone');
const fileInput = $('#fileInput');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

async function handleFile(file) {
  const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
  const validExt = /\.(mp4|mov|avi|mkv|webm)$/i;
  if (!validTypes.includes(file.type) && !validExt.test(file.name)) {
    alert('Unsupported format. Use MP4, MOV, AVI, MKV, or WEBM.');
    return;
  }

  // Show progress
  const prog = $('#uploadProgress');
  const fill = $('#uploadFill');
  const text = $('#uploadText');
  prog.classList.add('show');

  // Simulate upload progress
  for (let p = 0; p <= 100; p += 5) {
    fill.style.width = p + '%';
    text.textContent = p + '%';
    await delay(30);
  }

  State.videoFile = file;
  State.videoUrl = URL.createObjectURL(file);

  // Load metadata
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.src = State.videoUrl;
  await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 8000); });
  State.videoDuration = v.duration;
  State.videoWidth = v.videoWidth || 1920;
  State.videoHeight = v.videoHeight || 1080;
  v.remove();

  // Show file info
  const info = $('#fileInfo');
  info.textContent = file.name + ' \u2022 ' + fmtSize(file.size) + ' \u2022 ' + fmtTime(v.duration);
  info.classList.add('show');

  // Move to music selection
  await delay(400);
  prog.classList.remove('show');
  showStep('stepMusic');
}

// ─── Music step navigation ───
$('#btnMusicBack').addEventListener('click', () => {
  showStep('stepUpload');
  if (State.videoUrl) { URL.revokeObjectURL(State.videoUrl); State.videoUrl = null; }
  State.videoFile = null;
  $('#fileInfo').classList.remove('show');
  $('#uploadProgress').classList.remove('show');
  State.music.file = null;
  State.music.buffer = null;
  State.music.selectedTrack = null;
});

$('#btnMusicNext').addEventListener('click', () => {
  if (!State.music.buffer && !State.music.selectedTrack) {
    alert('Please select or upload a music track first.');
    return;
  }
  showStep('stepTimeline');
  initTimeline();
});

// ─── Timeline (Audio Adjustment) navigation ───
$('#btnTimelineBack').addEventListener('click', () => {
  destroyTimeline();
  showStep('stepMusic');
});

$('#btnTimelineNext').addEventListener('click', () => {
  destroyTimeline();
  showStep('stepSettings');
});

// ─── Settings (Editing Options) navigation ───
$('#btnSettingsBack').addEventListener('click', () => {
  showStep('stepTimeline');
  initTimeline();
});

$('#btnGenerate').addEventListener('click', () => {
  startEditing();
});

// ─── Color grading intensity slider ───
$('#gradeIntensity').addEventListener('input', function() {
  State.settings.gradeIntensity = parseInt(this.value) || 70;
  $('#gradeIntensityVal').textContent = this.value + '%';
});

async function startEditing() {
  if (!State.videoFile) return;
  State.cancelling = false;

  const overlay = $('#processingOverlay');
  overlay.classList.add('show');
  setProcStepAdv(0);

  try {
    // Create hidden video for analysis
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.preload = 'auto';
    video.src = State.videoUrl;
    video.load();
    const hidden = document.createElement('div');
    hidden.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden';
    hidden.append(video);
    document.body.append(hidden);
    await waitForEvent(video, 'loadedmetadata', 10000);
    await new Promise(r => { if (video.readyState >= 2) r(); else { video.oncanplaythrough = r; setTimeout(r, 15000); } });

    // Step 1: Analyze video
    setProcStepAdv(1);
    await delay(300);

    // Step 2: Detect scenes
    setProcStepAdv(2);
    const scenes = await detectScenes(video, pct => {
      const fill = $('#procBarFill');
      fill.style.width = (pct * 30) + '%';
    });

    // Step 3: Detect audio
    setProcStepAdv(3);
    const audioEvents = await analyzeAudio(video, pct => {
      const fill = $('#procBarFill');
      fill.style.width = (30 + pct * 15) + '%';
    });

    // Step 4: Detect highlights
    setProcStepAdv(4);
    const highlights = await detectHighlights(video, pct => {
      const fill = $('#procBarFill');
      fill.style.width = (45 + pct * 15) + '%';
    });

    // Store analysis results
    State.analysis.scenes = scenes;
    State.analysis.highlights = highlights;
    State.analysis.audioEvents = audioEvents;

    // Step 5: Analyze source video characteristics for adaptive grading
    setProcStepAdv(5);
    const sourceInfo = await analyzeSourceVideo(video, 6);
    State.analysis.sourceGradeMod = sourceInfo.mod;
    await delay(200);

    const fill = $('#procBarFill');

    // Step 7: Render
    setProcStepAdv(7);
    const result = await renderEdit(video, scenes, highlights, audioEvents, pct => {
      fill.style.width = (60 + pct * 35) + '%';
    });

    // Step 8: Finalize
    setProcStepAdv(8);
    fill.style.width = '100%';
    await delay(500);

    // Cleanup
    video.pause();
    video.src = '';
    hidden.remove();

    // Show preview
    overlay.classList.remove('show');
    showStep('stepPreview');

    // Set up preview videos
    const origVid = $('#originalVideo');
    const editVid = $('#editedVideo');
    origVid.src = State.videoUrl;
    origVid.load();
    editVid.src = result.url;
    editVid.load();

    // Set up export
    setupExport(result);

  } catch (err) {
    console.error(err);
    alert('Error: ' + (err.message || 'Processing failed'));
    overlay.classList.remove('show');
  }
}

// ─── Progress UI ───
function setProcStepAdv(step) {
  const steps = $$('.proc-step');
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i < step) s.classList.add('done');
    if (i === step) s.classList.add('active');
  });
  const labels = [
    'Uploading video...',
    'Analyzing video content...',
    'Detecting scene changes...',
    'Analyzing audio track...',
    'Detecting highlights...',
    'Analyzing source characteristics...',
    'Applying effects...',
    'Rendering video...',
    'Finalizing...',
  ];
  const stage = $('#procStage');
  if (stage && labels[step]) stage.textContent = labels[step];
}

// ─── Cancel ───
$('#btnCancelRender').addEventListener('click', () => {
  if (confirm('Cancel rendering?')) {
    cancelRender();
    $('#processingOverlay').classList.remove('show');
  }
});

// ─── Export ───
let exportResult = null;

function setupExport(result) {
  exportResult = result;
}

$('#btnExport').addEventListener('click', () => {
  if (!exportResult) return;
  const a = document.createElement('a');
  a.href = exportResult.url;
  a.download = 'deepwave-edit.' + exportResult.ext;
  a.click();
});

// ─── New Edit ───
$('#btnNewEdit').addEventListener('click', () => {
  if (State.videoUrl) { URL.revokeObjectURL(State.videoUrl); State.videoUrl = null; }
  if (exportResult && exportResult.url) { URL.revokeObjectURL(exportResult.url); }
  State.videoFile = null;
  State.analysis = { scenes: [], highlights: [], audioEvents: [] };
  exportResult = null;
  $('#fileInfo').classList.remove('show');
  $('#uploadProgress').classList.remove('show');
  $('#originalVideo').src = '';
  $('#editedVideo').src = '';
  showStep('stepUpload');
});
