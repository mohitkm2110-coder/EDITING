// ═══════════════════════════════════════════════════════════════
// DEEPWAVE — Smart Editor with Motion Analysis & Highlight Cuts
// ═══════════════════════════════════════════════════════════════

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const canvas = $('#processor'), ctx = canvas.getContext('2d');
const aCanvas = $('#analysisCanvas'), aCtx = aCanvas.getContext('2d');

let editMode = 'single', inputFiles = [], selectedPreset = 'gaming';
let autoCut = true, cutStrength = 'medium';
let intensity = 'balanced';
let musicFile = null, musicBuffer = null, selectedTrack = null;
let beatTimestamps = [], bpm = 0, isSynced = false;
let audioCtx = null;
let musicTrimStart = 0, musicTrimEnd = 0, musicTrimDrag = null, musicTrimZoom = 1;
let musicPreviewNode = null;
let exportAspect = '16:9', exportRes = 1080;
let storedVideoFile = null;
let editOptions = { cut: true, highlights: false, beatSync: false, captions: false, effects: false, transitions: false, zoom: false, color: false };

// ──────────────── CUT / TRIM ─────────────────
const CUT_RATIO = { low: 0.70, medium: 0.50, high: 0.25 };

function setAutoCut(val) {
autoCut = val;
$$('.trim-option').forEach(o => o.classList.toggle('active', (val && o.dataset.trim === 'auto') || (!val && o.dataset.trim === 'full')));
$('#cutStrengthRow').style.display = val ? 'flex' : 'none';
}

function setCutStrength(val) {
cutStrength = val;
$$('.cut-pill').forEach(p => p.classList.toggle('active', p.dataset.cut === val));
}

// ──────────────── EFFECTS INTENSITY ─────────────────
const INTENSITY_MULT = { light: 0.6, balanced: 1.0, heavy: 1.4 };

function setIntensity(val) {
intensity = val;
$$('.intensity-pill').forEach(p => p.classList.toggle('active', p.dataset.intensity === val));
}

// ──────────────── EDIT OPTIONS ─────────────────
function setEditOption(key, val) {
editOptions[key] = val;
const el = $('#opt' + key.charAt(0).toUpperCase() + key.slice(1));
if (el) el.classList.toggle('active', val);
// Sync autoCut variable when cut option toggles
if (key === 'cut') autoCut = val;
}

// ──────────────── MODE ─────────────────
function selectMode(m) {
editMode = m;
$$('.mode-card').forEach(c => c.classList.toggle('active', c.dataset.mode === m));
$('#workflowArea').style.display = 'block';
$('#heroSection').style.opacity = '0.3';
updateUploadZone(); autoSuggestTrack();
}

function goBack() { editMode = 'single'; inputFiles = []; $('#workflowArea').style.display = 'none'; $('#heroSection').style.opacity = '1'; resetEditorState(); if(analysisVideoUrl){URL.revokeObjectURL(analysisVideoUrl);analysisVideoUrl=null} analysisResults=[]; $('#highlightSection').style.display='none'; $('#highlightContent').style.display='none'; $('#highlightLoading').style.display='block'; const pv=$('#videoPreview');pv.pause();pv.src='';$('#videoPreviewBox').style.display='none'; }

function updateUploadZone() {
const inp = $('#fileInput');
$('#uploadIcon').textContent = '\u{1F3AE}';
$('#uploadTitle').textContent = 'Upload your gameplay';
$('#uploadDesc').textContent = 'or click to browse \u2022 MP4, MOV, MKV';
inp.multiple = false;
$('#uploadZone').style.display = 'block';
$('#videoPreviewBox').style.display = 'none';
$('#singleInfo').style.display = 'none'; $('#fileList').style.display = 'none';
$('#outputSection').style.display = 'none'; inp.value = '';
}

// ──────────────── UPLOAD ─────────────────
$('#uploadZone').addEventListener('click', () => $('#fileInput').click());
$('#uploadZone').addEventListener('dragover', e => { e.preventDefault(); $('#uploadZone').classList.add('dragover'); });
$('#uploadZone').addEventListener('dragleave', () => $('#uploadZone').classList.remove('dragover'));
$('#uploadZone').addEventListener('drop', e => { e.preventDefault(); $('#uploadZone').classList.remove('dragover'); if(e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files)); });
$('#fileInput').addEventListener('change', e => { if(e.target.files.length) handleFiles(Array.from(e.target.files)); });

function handleFiles(files) {
const vids = files.filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|mkv)$/i));
if (!vids.length) { alert('Please upload a gameplay video.'); return; }
storedVideoFile = vids[0];
inputFiles = [storedVideoFile];

// Show video preview
const previewBox = $('#videoPreviewBox'), previewVid = $('#videoPreview');
previewBox.style.display = 'block';
previewVid.src = URL.createObjectURL(storedVideoFile);
previewVid.load();
$('#videoPreviewName').textContent = storedVideoFile.name.replace(/\.[^.]+$/,'');
$('#videoPreviewSize').textContent = (storedVideoFile.size/1024/1024).toFixed(1)+' MB';
$('#uploadZone').style.display = 'none';

$('#singleInfo').style.display='none'; $('#fileList').style.display='none';
$('#outputSection').style.display='none'; $('#highlightSection').style.display='none'; $('#timelineSection').style.display='none';
$('#editorPanel').style.display = 'block';
autoSuggestTrack();
}

// ═══════════════════════════════════════════════════════════════
// SMART AI HIGHLIGHT ANALYSIS — Motion + Audio Processing
// ═══════════════════════════════════════════════════════════════

let analysisResults = []; // Array of highlight objects
let analysisVideoUrl = null;
let analysisVideoDuration = 0;

async function startVideoAnalysis(file) {
setProcStep(1, 'Analyzing video');
setProcStep(2, 'Detecting highlights');

const $section = $('#highlightSection'), $loading = $('#highlightLoading'), $content = $('#highlightContent');
$section.style.display = 'block'; $loading.style.display = 'block'; $content.style.display = 'none';
$('#timelineSection').style.display = 'none';
setHLStep('Loading video...');
// Revoke previous analysis URL if any
if (analysisVideoUrl) { URL.revokeObjectURL(analysisVideoUrl); analysisVideoUrl = null; }
analysisResults = [];

const url = URL.createObjectURL(file);
analysisVideoUrl = url;

// Load video metadata
const v = document.createElement('video'); v.playsInline = true; v.src = url;
await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
analysisVideoDuration = v.duration;
v.remove();

// Phase 1: Extract audio
setHLStep('Extracting audio track...');
let audioData = null;
try {
const c = new (window.AudioContext || window.webkitAudioContext)();
const v2 = document.createElement('video'); v2.src = url;
const src = c.createMediaElementSource(v2);
const dst = c.createMediaStreamDestination();
const g = c.createGain(); g.gain.value = 1;
src.connect(g); g.connect(dst);
v2.play();
const rec = new MediaRecorder(dst.stream, { mimeType: 'audio/webm' });
const chunks = [];
rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
rec.start();
await new Promise(r => setTimeout(r, Math.min(3000, v.duration * 1000)));
v2.pause(); rec.stop();
await new Promise(r => setTimeout(r, 200));
if (chunks.length) {
const blob = new Blob(chunks);
const ab = await blob.arrayBuffer();
const decoded = await c.decodeAudioData(ab);
audioData = decoded;
}
c.close(); v2.remove();
} catch(e) { console.warn('Audio extract:', e.message); }

// Phase 2: Audio volume analysis
setHLStep('Analyzing audio levels...');
let audioPeaks = [];
if (audioData) {
const d = audioData.getChannelData(0), sr = audioData.sampleRate;
const ws = Math.floor(sr * 0.05); // 50ms windows
for (let i = 0; i < d.length; i += ws) {
let sum = 0, cnt = 0;
for (let j = 0; j < ws && i + j < d.length; j++) { sum += d[i + j] * d[i + j]; cnt++; }
audioPeaks.push({ time: (i / sr), volume: Math.sqrt(sum / cnt) });
}
const maxV = Math.max(...audioPeaks.map(p => p.volume), 0.001);
audioPeaks.forEach(p => p.volume = (p.volume / maxV) * 100);
}

// Phase 3: Motion analysis
setHLStep('Analyzing motion & activity...');
const motionData = await analyzeMotionSampling(url, v.duration);

// Phase 4: Generate highlights
setHLStep('Generating highlights...');
await new Promise(r => setTimeout(r, 300));
const highlights = generateHighlights(audioPeaks, motionData, v.duration);
analysisResults = highlights;
showHighlightReview(highlights);
}

function setHLStep(text) {
$('#hlLoadingStep').textContent = text;
}

async function analyzeMotionSampling(url, duration) {
const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.src = url;
v.preload = 'auto';
await new Promise((res, rej) => { v.onloadedmetadata = res; setTimeout(rej, 5000); });
v.load();
await new Promise((res, rej) => { v.oncanplay = res; setTimeout(rej, 5000); });
v.currentTime = 0;

const aCtx2 = document.createElement('canvas').getContext('2d');
aCtx2.canvas.width = 120; aCtx2.canvas.height = 68;

const raw = [];
const sampleGap = Math.max(0.1, Math.min(0.3, duration / 200));
v.playbackRate = 4;
await v.play();

let prevFrame = null, lastSample = -sampleGap;

await new Promise(resolve => {
const tick = () => {
if (v.paused || v.ended) { resolve(); return; }
const ct = v.currentTime;
if (ct >= duration) { v.pause(); resolve(); return; }
if (ct - lastSample >= sampleGap) {
lastSample = ct;
aCtx2.drawImage(v, 0, 0, 120, 68);
const data = aCtx2.getImageData(0, 0, 120, 68).data;
let m = 0;
if (prevFrame) {
for (let i = 0; i < data.length; i += 8) m += Math.abs(data[i] - prevFrame[i]);
m /= (120 * 68 / 2);
}
prevFrame = new Uint8Array(data);
raw.push({ time: ct, motion: m });
}
requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
});
v.pause(); v.playbackRate = 1;

if (raw.length < 2) return [{ time: 0, motion: 10 }, { time: duration, motion: 10 }];
const maxM = Math.max(...raw.map(t => t.motion), 0.001);
raw.forEach(t => t.motion = (t.motion / maxM) * 100);
for (let i = 1; i < raw.length; i++) raw[i].delta = Math.abs(raw[i].motion - raw[i-1].motion);
raw[0].delta = 0;
return raw;
}

function generateHighlights(audio, motion, duration) {
const minHighlightDur = 3, maxHighlightDur = 18;
const hlList = [];

// Build combined score timeline
const scores = [];
const maxTime = Math.min(duration, 600);
const step = 0.25;
for (let t = 0; t < maxTime; t += step) {
// Motion score
const mMatch = motion.filter(m => Math.abs(m.time - t) < step);
const mScore = mMatch.length ? mMatch.reduce((s, x) => s + x.motion, 0) / mMatch.length : 0;
const dMatch = motion.filter(m => Math.abs(m.time - t) < step && m.delta !== undefined);
const dScore = dMatch.length ? dMatch.reduce((s, x) => s + x.delta, 0) / dMatch.length : 0;
// Audio score
const aMatch = audio.filter(a => Math.abs(a.time - t) < step);
const aScore = aMatch.length ? aMatch.reduce((s, x) => s + x.volume, 0) / aMatch.length : 0;
const total = mScore * 0.5 + dScore * 0.25 + aScore * 0.25;
scores.push({ time: t, score: total, motion: mScore, audio: aScore, delta: dScore });
}

if (scores.length < 2) {
hlList.push({ id: 'hl_0', start: 0, end: duration, label: 'Full Video', confidence: 50, type: 'clip', selected: true, icon: '\u{1F3AC}' });
return hlList;
}

// Smooth scores
for (let i = 1; i < scores.length - 1; i++) {
scores[i].score = (scores[i-1].score + scores[i].score * 2 + scores[i+1].score) / 4;
}

const maxScore = Math.max(...scores.map(s => s.score), 1);
scores.forEach(s => s.score = (s.score / maxScore) * 100);

// Find peaks
const threshold = 35;
const peaks = [];
for (let i = 2; i < scores.length - 2; i++) {
if (scores[i].score > threshold
&& scores[i].score >= scores[i-1].score && scores[i].score >= scores[i+1].score
&& scores[i].score >= scores[i-2].score && scores[i].score >= scores[i+2].score) {
peaks.push({ time: scores[i].time, score: scores[i].score, motion: scores[i].motion, audio: scores[i].audio, delta: scores[i].delta });
}
}

if (peaks.length < 1) {
// No strong peaks, just add the whole video as one highlight
hlList.push({ id: 'hl_0', start: 0, end: Math.min(duration, 60), label: 'Full Video', confidence: 50, type: 'clip', selected: true, icon: '\u{1F3AC}' });
return hlList;
}

// Sort peaks by score descending, pick top 20
const topPeaks = peaks.sort((a, b) => b.score - a.score).slice(0, 20);

// Build highlight regions around peaks
let hlId = 0;
for (const pk of topPeaks) {
const halfWindow = Math.max(minHighlightDur / 2, Math.min(maxHighlightDur / 2, 5 + (pk.score / 100) * 8));
let s = Math.max(0, pk.time - halfWindow);
let e = Math.min(duration, pk.time + halfWindow);

// Don't create overlapping highlights — merge nearby ones
let merged = false;
for (const existing of hlList) {
if ((s >= existing.start && s <= existing.end) || (e >= existing.start && e <= existing.end) || (s <= existing.start && e >= existing.end)) {
// Merge: keep the one with higher score
if (pk.score > (scores.find(x => Math.abs(x.time - (existing.start + existing.end)/2) < step)?.score || 0)) {
existing.start = Math.min(existing.start, s);
existing.end = Math.max(existing.end, e);
existing.confidence = Math.round(pk.score);
existing.peakTime = pk.time;
}
merged = true; break;
}
}
if (merged) continue;

const conf = Math.round(Math.min(99, Math.max(40, pk.score)));
// Assign label based on characteristics — honest confidence, generic when uncertain
const cat = pk.motion;
let label = 'Highlight', icon = '\u2B50';
if (cat > 85 && pk.delta > 55) { label = 'Epic Play'; icon = '\u{1F525}'; }
else if (cat > 75 && pk.delta > 45) { label = 'Elimination'; icon = '\u{1F5E1}'; }
else if (cat > 65 && pk.delta > 35) { label = 'High Action'; icon = '\u26A1'; }
else if (cat > 55 && pk.audio > 65) { label = 'Intense Fight'; icon = '\u{1F4A5}'; }
else if (cat > 50 && pk.audio > 55) { label = 'Multi Kill'; icon = '\u{2620}'; }
else if (pk.delta > 40 && cat < 30) { label = 'Sniper Highlight'; icon = '\u{1F3AF}'; }
else if (pk.delta > 30 && cat > 40) { label = 'Fast Gameplay'; icon = '\u{1F3C3}'; }
else if (pk.audio > 60 && cat < 25) { label = 'Cinematic Moment'; icon = '\u{1F3AC}'; }
else if (conf > 70) { label = 'Clutch Moment'; icon = '\u{1F451}'; }
else if (cat > 30) { label = 'Highlight'; icon = '\u{1F44D}'; }
// For low confidence, use generic labels only
if (conf < 55) { label = cat > 40 ? 'High Action' : 'Gameplay'; icon = '\u{1F3AE}'; }

hlList.push({
id: 'hl_' + (hlId++),
start: Math.round(s * 100) / 100,
end: Math.round(e * 100) / 100,
peakTime: pk.time,
label: label,
confidence: conf,
type: 'auto',
selected: true,
icon: icon,
motion: Math.round(pk.motion),
audio: Math.round(pk.audio)
});
}

// Sort by time
hlList.sort((a, b) => a.start - b.start);
return hlList;
}

// ── Highlight UI ──
function showHighlightReview(highlights) {
hideProcessing();
$('#highlightLoading').style.display = 'none';
$('#highlightContent').style.display = 'block';
renderHighlightTimeline(highlights);
renderHighlightList(highlights);
$('#hlSummaryCount').innerHTML = 'Detected <strong>' + highlights.length + '</strong> highlight' + (highlights.length !== 1 ? 's' : '');
}

function renderHighlightTimeline(highlights) {
const bar = $('#hlTimelineBar'); bar.innerHTML = '';
const dur = analysisVideoDuration || 60;

// Time ticks (every 10s)
const nTicks = Math.min(20, Math.ceil(dur / 10));
const tickWrap = document.createElement('div'); tickWrap.className = 'hl-timeline-ticks';
for (let i = 0; i < nTicks; i++) {
const t = document.createElement('div'); t.className = 'hl-timeline-tick'; tickWrap.appendChild(t);
const lbl = document.createElement('div'); lbl.className = 'hl-timeline-label';
lbl.style.left = (i / nTicks * 100) + '%'; lbl.textContent = Math.round(i * (dur / nTicks)) + 's';
bar.appendChild(lbl);
}
bar.appendChild(tickWrap);

// Markers for each highlight
for (const hl of highlights) {
const m = document.createElement('div'); m.className = 'hl-timeline-marker' + (hl.selected === false ? ' deselected' : ' selected');
const pctStart = Math.max(0, (hl.start / dur) * 100);
const pctEnd = Math.min(100, (hl.end / dur) * 100);
m.style.left = pctStart + '%'; m.style.width = Math.max(1, pctEnd - pctStart) + '%';
// Color by confidence
if (hl.confidence > 85) m.style.background = 'linear-gradient(90deg,#4f8,#8f8)';
else if (hl.confidence > 65) m.style.background = 'linear-gradient(90deg,#fa0,#ff8)';
else m.style.background = 'linear-gradient(90deg,#8888ff,#aa88ff)';
m.title = hl.label + ' (' + hl.confidence + '%) ' + fmtTime(hl.start) + '-' + fmtTime(hl.end);
m.addEventListener('click', () => { toggleHighlightSelection(hl.id); });
bar.appendChild(m);
}
}

function renderHighlightList(highlights) {
const list = $('#highlightList'); list.innerHTML = '';
for (let idx = 0; idx < highlights.length; idx++) {
const hl = highlights[idx];
const item = document.createElement('div');
item.className = 'highlight-item' + (hl.selected === false ? ' deselected' : ' selected');
item.id = 'hl_item_' + hl.id; item.draggable = true;
item.dataset.hlIdx = idx;

// Drag events
item.addEventListener('dragstart', e => { window._hlDragIdx = idx; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
item.addEventListener('dragend', () => { item.classList.remove('dragging'); $$('.highlight-item').forEach(x => x.classList.remove('drag-over')); });
item.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; $$('.highlight-item').forEach(x => x.classList.remove('drag-over')); item.classList.add('drag-over'); });
item.addEventListener('drop', e => {
e.preventDefault();
if (window._hlDragIdx !== undefined && window._hlDragIdx !== idx) {
const [moved] = analysisResults.splice(window._hlDragIdx, 1);
analysisResults.splice(idx, 0, moved);
renderHighlightTimeline(analysisResults);
renderHighlightList(analysisResults);
}
window._hlDragIdx = undefined;
});

const confClass = hl.confidence > 80 ? 'high' : hl.confidence > 60 ? 'medium' : 'low';
const durSec = (hl.end - hl.start).toFixed(1);
const thumbHtml = '<div class="hl-thumb" id="hl_thumb_' + hl.id + '"><div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:.6rem;color:rgba(255,255,255,.2)">\u{1F3AC}</div></div>';

item.innerHTML =
'<span class="hl-drag">\u2630</span>'
+ thumbHtml
+ '<span class="hl-icon">' + hl.icon + '</span>'
+ '<div class="hl-info">'
+ '<div class="hl-name">' + hl.label + '</div>'
+ '<div class="hl-meta">' + fmtTime(hl.start) + ' \u2013 ' + fmtTime(hl.end)
+ ' (' + durSec + 's)'
+ (hlTypeLabel(hl.type) ? ' \u00B7 ' + hlTypeLabel(hl.type) : '')
+ '</div>'
+ '<div class="hl-duration-ctrl">'
+ '<span>Dur:</span>'
+ '<input type="range" min="1.5" max="25" step="0.5" value="' + durSec + '" oninput="changeHighlightDuration(\'' + hl.id + '\', this.value)" title="Drag to change clip length">'
+ '<span class="dur-label" id="hl_dur_' + hl.id + '">' + durSec + 's</span>'
+ '</div></div>'
+ '<span class="hl-confidence ' + confClass + '">' + hl.confidence + '%</span>'
+ '<span class="hl-controls">'
+ '<button class="hl-btn keep' + (hl.selected !== false ? ' active' : '') + '" onclick="toggleHighlightSelection(\'' + hl.id + '\')">' + (hl.selected !== false ? '\u2713' : '\u25A1') + '</button>'
+ '<button class="hl-btn remove" onclick="removeHighlight(\'' + hl.id + '\')">\u2715</button>'
+ '<button class="hl-btn preview" onclick="previewHighlight(\'' + hl.id + '\')">\u25B6</button>'
+ '</span>';

item.addEventListener('click', e => {
if (e.target.closest('.hl-btn') || e.target.closest('.hl-drag') || e.target.closest('.hl-duration-ctrl') || e.target.closest('.hl-thumb')) return;
toggleHighlightSelection(hl.id);
});
list.appendChild(item);

// Generate thumbnail async
generateThumbnailForHighlight(hl);
}
$('#hlSummaryCount').innerHTML = 'Detected <strong>' + highlights.length + '</strong> highlight' + (highlights.length !== 1 ? 's' : '');
}

function generateThumbnailForHighlight(hl) {
if (!analysisVideoUrl) return;
const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.src = analysisVideoUrl;
v.currentTime = hl.start;
v.onloadeddata = () => {
v.currentTime = hl.start + (hl.end - hl.start) * 0.3;
};
v.onseeked = () => {
const c = document.createElement('canvas'); c.width = 120; c.height = 68;
const g = c.getContext('2d');
try { g.drawImage(v, 0, 0, 120, 68); } catch(e) { v.remove(); return; }
const thumbContainer = $('#hl_thumb_' + hl.id);
if (thumbContainer) {
const img = document.createElement('img');
img.src = c.toDataURL('image/jpeg', 0.7);
img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:5px';
thumbContainer.innerHTML = '';
thumbContainer.appendChild(img);
}
v.remove();
};
v.load();
}

function changeHighlightDuration(id, val) {
const hl = analysisResults.find(h => h.id === id);
if (!hl) return;
const mid = (hl.start + hl.end) / 2;
const half = parseFloat(val) / 2;
hl.start = Math.max(0, Math.round((mid - half) * 100) / 100);
hl.end = Math.min(analysisVideoDuration, Math.round((mid + half) * 100) / 100);
renderHighlightTimeline(analysisResults);
const lbl = $('#hl_dur_' + id);
if (lbl) lbl.textContent = (hl.end - hl.start).toFixed(1) + 's';
const meta = $('#hl_item_' + id)?.querySelector('.hl-meta');
if (meta) meta.textContent = fmtTime(hl.start) + ' \u2013 ' + fmtTime(hl.end) + ' (' + (hl.end - hl.start).toFixed(1) + 's)' + (hlTypeLabel(hl.type) ? ' \u00B7 ' + hlTypeLabel(hl.type) : '');
}

function hlTypeLabel(type) { return type === 'manual' ? 'Manual' : type === 'auto' ? 'AI' : ''; }

function toggleHighlightSelection(id) {
const hl = analysisResults.find(h => h.id === id);
if (!hl) return;
hl.selected = hl.selected === false ? true : false;
renderHighlightTimeline(analysisResults);
const item = $('#hl_item_' + id);
if (item) {
item.className = 'highlight-item' + (hl.selected === false ? ' deselected' : ' selected');
const btn = item.querySelector('.hl-btn.keep');
if (btn) { btn.textContent = hl.selected !== false ? '\u2713' : '\u25A1'; btn.classList.toggle('active', hl.selected !== false); }
}
}

function removeHighlight(id) {
analysisResults = analysisResults.filter(h => h.id !== id);
renderHighlightTimeline(analysisResults);
renderHighlightList(analysisResults);
if (!analysisResults.length) {
$('#highlightContent').innerHTML = '<p style="text-align:center;padding:1rem;color:rgba(255,255,255,.3)">No highlights remaining. <a href="#" onclick="showManualClipSelector();return false" style="color:#8888ff">Add a manual clip</a> or <a href="#" onclick="skipAnalysis();return false" style="color:#8888ff">skip to timeline</a>.</p>';
}
}

function previewHighlight(id) {
const hl = analysisResults.find(h => h.id === id);
if (!hl || !analysisVideoUrl) return;
const pv = $('#tlPreviewVideo');
pv.src = analysisVideoUrl; pv.dataset.srcIdx = 'hl';
pv.muted = true; pv.currentTime = hl.start; pv.play();
// Store highlight ref for preview overlay
window._hlPreview = { hl, ontimeupdate: null };
pv.ontimeupdate = () => { if (pv.currentTime >= hl.end) pv.currentTime = hl.start; };
$('#timelinePreview').style.display = 'block';
$('#tlBtnPlay').textContent = '\u23F8';
$('#tlPreviewLabel').textContent = hl.label + ' (' + hl.confidence + '%)';
$('#tlScrubStart').textContent = fmtTime(hl.start);
$('#tlScrubEnd').textContent = fmtTime(hl.end);
// Override the preview state to handle this highlight directly
if (previewState?.rafId) cancelAnimationFrame(previewState.rafId);
previewState = { segId: 'hl_preview', playing: true, loop: true, rafId: null };
const tick = () => {
const pv2 = $('#tlPreviewVideo'), h = window._hlPreview?.hl;
if (pv2 && h) {
const ct = Math.max(h.start, Math.min(pv2.currentTime, h.end));
const pct = h.end > h.start ? ((ct - h.start) / (h.end - h.start)) * 100 : 0;
$('#tlScrubberFill').style.width = pct + '%';
$('#tlScrubberThumb').style.left = pct + '%';
$('#tlScrubCurrent').textContent = fmtTime(ct);
$('#tlPreviewTime').textContent = fmtTime(ct - h.start) + ' / ' + fmtTime(h.end - h.start);
if (previewState?.playing && pv2.paused) { $('#tlBtnPlay').textContent = '\u25B6'; previewState.playing = false; }
}
previewState.rafId = requestAnimationFrame(tick);
};
tick();
// Custom scrub for this preview
const scrubWrap = $('#tlScrubberWrap');
scrubWrap.onmousedown = e => {
const r = scrubWrap.getBoundingClientRect();
const h2 = window._hlPreview?.hl; if (!h2) return;
const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
$('#tlPreviewVideo').currentTime = h2.start + pct * (h2.end - h2.start);
const m = function(e2) {
const r2 = scrubWrap.getBoundingClientRect();
const pct2 = Math.max(0, Math.min(1, (e2.clientX - r2.left) / r2.width));
$('#tlPreviewVideo').currentTime = h2.start + pct2 * (h2.end - h2.start);
};
document.addEventListener('mousemove', m);
document.addEventListener('mouseup', () => { document.removeEventListener('mousemove', m); }, { once: true });
};
// Override close to clean up
const oldClose = closeTimelinePreview;
window._restoreClose = oldClose;
closeTimelinePreview = function() {
if (previewState?.rafId) cancelAnimationFrame(previewState.rafId);
previewState = null; window._hlPreview = null;
const pv2 = $('#tlPreviewVideo');
pv2.pause(); pv2.removeAttribute('src'); pv2.dataset.srcIdx = ''; pv2.load();
$('#timelinePreview').style.display = 'none';
// Restore original scrub behavior
const sw = $('#tlScrubberWrap');
sw.onmousedown = null;
// Re-bind original
sw.addEventListener('mousedown', e => { scrubPreviewFromEvent(e); const m2 = e2 => { scrubPreviewFromEvent(e2); }; document.addEventListener('mousemove', m2); document.addEventListener('mouseup', () => { document.removeEventListener('mousemove', m2); }, { once: true }); });
closeTimelinePreview = window._restoreClose || oldClose;
};
}

function showManualClipSelector() {
if (!analysisVideoUrl) return;
const modal = $('#manualClipModal');
modal.classList.add('show');
const vid = $('#manualClipVideo');
vid.src = analysisVideoUrl;
vid.currentTime = 0;
vid.load();
$('#manualClipStart').value = '0';
$('#manualClipEnd').value = Math.min(10, Math.round(analysisVideoDuration / 2));
vid.ondurationchange = () => { $('#manualClipEnd').value = Math.min(10, Math.round(vid.duration / 2)); };
vid.ontimeupdate = () => {
if (vid.currentTime >= parseFloat($('#manualClipEnd').value)) vid.pause();
};
vid.play();
}

function closeManualClipSelector() {
const modal = $('#manualClipModal');
modal.classList.remove('show');
const vid = $('#manualClipVideo');
vid.pause(); vid.removeAttribute('src'); vid.load();
}

function addManualClip() {
const s = parseFloat($('#manualClipStart').value || '0');
const e = parseFloat($('#manualClipEnd').value || '10');
if (e <= s) { alert('End time must be after start time.'); return; }
const hl = {
id: 'hl_manual_' + Date.now(),
start: Math.max(0, Math.round(s * 100) / 100),
end: Math.min(analysisVideoDuration, Math.round(e * 100) / 100),
label: 'Manual Clip',
confidence: 100,
type: 'manual',
selected: true,
icon: '\u{1F3AC}',
motion: 0, audio: 0
};
analysisResults.push(hl);
analysisResults.sort((a, b) => a.start - b.start);
renderHighlightTimeline(analysisResults);
renderHighlightList(analysisResults);
closeManualClipSelector();
}

// ── Confirm / Skip Highlights ──
function confirmHighlights() {
const selected = analysisResults.filter(h => h.selected !== false);
if (!selected.length) { alert('Select at least one highlight to continue.'); return; }

// Build timeline segments from selected highlights
timelineSegments = [];
timelineVideos = [];
nextTimelineId = 0;

for (let i = 0; i < inputFiles.length; i++) {
if (editMode === 'single') {
const v = document.createElement('video'); v.playsInline = true;
v.src = analysisVideoUrl;
timelineVideos[0] = v;
// Load metadata before render
v.load();
for (const hl of selected) {
timelineSegments.push({
id: nextTimelineId++, clipIndex: 0,
start: hl.start, end: hl.end,
originalDuration: analysisVideoDuration,
name: hl.label + ' (' + hl.confidence + '%) ' + (inputFiles[0]?.name || 'Clip')
});
}
break;
}
}

$('#highlightSection').style.display = 'none';
renderTimeline();
$('#timelineSection').style.display = 'block';
$('#editorPanel').style.display = 'none';
// Ensure metadata is loaded before processing
const v = timelineVideos[0];
if (v && (!v.videoWidth || !v.videoHeight)) {
v.addEventListener('loadedmetadata', () => { /* metadata ready */ }, { once: true });
}
}

function skipAnalysis() {
$('#highlightSection').style.display = 'none';
analysisResults = [];
if (analysisVideoUrl) { URL.revokeObjectURL(analysisVideoUrl); analysisVideoUrl = null; }
initTimeline();
}

// ── Export Settings ──
function setAspectRatio(ar) {
exportAspect = ar;
$$('.export-pill[data-ar]').forEach(p => p.classList.toggle('active', p.dataset.ar === ar));
}
function setResolution(res) {
exportRes = parseInt(res);
$$('.export-pill[data-res]').forEach(p => p.classList.toggle('active', p.dataset.res === res));
}

function changeVideo() {
storedVideoFile = null; inputFiles = [];
const previewVid = $('#videoPreview');
previewVid.pause(); previewVid.src = '';
$('#videoPreviewBox').style.display = 'none';
$('#editorPanel').style.display = 'none';
$('#uploadZone').style.display = 'block';
$('#fileInput').value = '';
$('#singleInfo').style.display = 'none';
resetEditorState();
}

// ──────────────── TEMPLATE SYSTEM ─────────────────
$('#presetGrid').addEventListener('click', e => { const c=e.target.closest('.preset-card'); if(!c) return; $$('.preset-card').forEach(x=>x.classList.remove('active')); c.classList.add('active'); selectedPreset=c.dataset.preset; autoSuggestTrack(); });

const TEMPLATES = {
gaming: {
label:'Competitive',emoji:'🎮',
desc:'Fast-paced, beat-synced, speed ramps on eliminations, impact effects on multi-kills, clean transitions.',
filter:'contrast(1.4) saturate(1.7) brightness(1.08)',
overlay:null, rate:1.15,
shake:{max:8,decay:.85,cooldown:.5},
zoom:{max:.08,decay:.88},
flash:{maxOpacity:.25,decay:.82},
glowThreshold:1,
anticipation:false,
transition:{frames:2,opacity:.35},
leadIn:.2,leadOut:.3,mergeGap:.3,
tiers:{
1:{shake:6,flash:.2,zoom:.06},
2:{shake:3,flash:.12,zoom:.03},
3:{flash:.06,zoom:.01},
4:{flash:.03}
}
},
cinematic: {
label:'Cinematic',emoji:'🎬',
desc:'Smooth camera, dramatic transitions, slow-mo near clutch moments, film color grading, minimal effects.',
overlay:'vignette', rate:1.0,
shake:{max:0,decay:.95,cooldown:99},
zoom:{max:.04,decay:.95},
flash:{maxOpacity:.15,decay:.85},
glowThreshold:1,
anticipation:true,
transition:{frames:6,opacity:1},
leadIn:.8,leadOut:1.2,mergeGap:.8,
tiers:{
1:{flash:.12,zoom:.03},
2:{flash:.08,zoom:.02},
3:{flash:.04},
4:{}
}
},
action: {
label:'Montage Pro',emoji:'💥',
desc:'High-energy, impact shakes on every kill, aggressive zooms, flashes on multi-kills, heavy beat sync.',
filter:'contrast(1.6) saturate(.5) brightness(1.05) grayscale(.2)',
overlay:null, rate:1.2,
shake:{max:14,decay:.78,cooldown:.6},
zoom:{max:.18,decay:.8},
flash:{maxOpacity:.45,decay:.75},
glowThreshold:.2,
bassPulse:.04,
anticipation:true,
transition:{frames:4,opacity:.55},
leadIn:.3,leadOut:.5,mergeGap:.4,
tiers:{
1:{shake:12,flash:.4,zoom:.14,bass:.04},
2:{shake:7,flash:.22,zoom:.08},
3:{flash:.1,zoom:.02},
4:{flash:.04}
}
},
clean: {
label:'Clean / Minimal',emoji:'✨',
desc:'Subtle color grade, smooth pacing, focus on gameplay flow, professional clean cuts.',
filter:'contrast(1.1) saturate(1.1) brightness(1.02)',
overlay:'vignette', rate:1.0,
shake:{max:0,decay:.95,cooldown:99},
zoom:{max:.02,decay:.95},
flash:{maxOpacity:.08,decay:.9},
glowThreshold:1,
anticipation:false,
transition:{frames:5,opacity:1},
leadIn:.5,leadOut:.8,mergeGap:.6,
tiers:{
1:{flash:.06},
2:{flash:.04},
3:{},
4:{}
}
}
};

// ──────────────── MUSIC ─────────────────
$('#musicUpload').addEventListener('click', e => { if(e.target.tagName!=='INPUT') $('#musicInput').click(); });
$('#musicInput').addEventListener('change', e => { if(e.target.files.length) handleMusicFile(e.target.files[0]); });
$('#musicUpload').addEventListener('dragover', e => { e.preventDefault(); $('#musicUpload').style.borderColor='#8888ff'; });
$('#musicUpload').addEventListener('dragleave', () => $('#musicUpload').style.borderColor='');
$('#musicUpload').addEventListener('drop', e => { e.preventDefault(); $('#musicUpload').style.borderColor=''; if(e.dataTransfer.files.length && e.dataTransfer.files[0].type.startsWith('audio/')) handleMusicFile(e.dataTransfer.files[0]); });

function handleMusicFile(file) {
if(!file.type.startsWith('audio/')){alert('Upload an audio file.');return;}
musicFile=file;selectedTrack=null;
$$('.track-card').forEach(x=>x.classList.remove('active'));
$('#musicFileInfo').textContent='\u{1F3B5} '+file.name+' ('+(file.size/1024/1024).toFixed(1)+' MB)';
$('#musicFileInfo').style.display='block'; analyzeMusic(file);
}

const TRACKS={neon:{label:'Neon Nights',bpm:128},epic:{label:'Epic Rise',bpm:90},urban:{label:'Urban Flow',bpm:140},chill:{label:'Chill Wave',bpm:80}};

function autoSuggestTrack(){const m={gaming:'neon',cinematic:'epic',action:'urban',clean:'chill'};const s=m[selectedPreset]||'neon';if(!musicFile&&!selectedTrack)selectTrack(s);}
$('#trackGrid').addEventListener('click',e=>{const c=e.target.closest('.track-card');if(!c)return;selectTrack(c.dataset.track);});

function selectTrack(id){selectedTrack=id;musicFile=null;$('#musicFileInfo').style.display='none';$('#musicInput').value='';$$('.track-card').forEach(x=>x.classList.toggle('active',x.dataset.track===id));generateTrack(id);}

function generateTrack(id){const i=TRACKS[id];if(!i)return;const sr=44100;bpm=i.bpm;const bl=60/bpm,tb=64,dur=tb*bl;const oc=new OfflineAudioContext(2,sr*dur,sr);renderTrack(oc,id,bpm,dur,tb);oc.startRendering().then(b=>{musicBuffer=b;bpm=i.bpm;beatTimestamps=[];for(let t=0;t<b.duration;t+=60/bpm)beatTimestamps.push(t);drawWaveform(b);showMusicTrimmer();}).catch(console.error);}

function renderTrack(c,id,bpm,dur,tb){const bl=60/bpm,sr=c.sampleRate;function nb(l){const b=c.createBuffer(1,l,sr),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=Math.random()*2-1;return b}const n=nb(sr);function k(t){const o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(40,t+0.1);g.gain.setValueAtTime(1,t);g.gain.exponentialRampToValueAtTime(.001,t+0.15);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+0.15)}function s(t){const s=c.createBufferSource();s.buffer=n;const g=c.createGain(),o=c.createOscillator(),g2=c.createGain();o.frequency.setValueAtTime(180,t);g2.gain.setValueAtTime(.6,t);g2.gain.exponentialRampToValueAtTime(.001,t+0.12);g.gain.setValueAtTime(.7,t);g.gain.exponentialRampToValueAtTime(.001,t+0.15);s.connect(g);g.connect(c.destination);o.connect(g2);g2.connect(c.destination);s.start(t);s.stop(t+0.15);o.start(t);o.stop(t+0.12)}function h(t,ch){const s=c.createBufferSource();s.buffer=n;const f=c.createBiquadFilter();f.type='highpass';f.frequency.value=ch?8000:6000;const g=c.createGain();g.gain.setValueAtTime(ch?0.25:0.15,t);g.gain.exponentialRampToValueAtTime(.001,t+(ch?0.05:0.12));s.connect(f);f.connect(g);g.connect(c.destination);s.start(t);s.stop(t+(ch?0.05:0.12))}function b(t,n){const o=c.createOscillator();o.type='sawtooth';const g=c.createGain();o.frequency.setValueAtTime(n,t);g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+bl*2);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+bl*2)}function l(t,f,d){const o=c.createOscillator();o.type='triangle';const g=c.createGain(),fl=c.createBiquadFilter();fl.type='lowpass';fl.frequency.value=2000;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.15,t);g.gain.setValueAtTime(.15,t+d*.8);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(fl);fl.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d)}
switch(id){
case'neon':for(let i=0;i<tb;i++){const t=i*bl;if(i%4===0)k(t);if(i%4===2){k(t);s(t);for(let h2=0;h2<4;h2++)h(t+h2*bl/4,h2%2===0)}if(i%4===1||i%4===3)h(t+bl/4,1);if(i%8===0)b(t,65.4);if(i%8===4)b(t,73.4);if(i%16===0&&i<tb-8){const n2=[523,587,659,784,659,587,523,494];n2.forEach((f,j)=>l(t+j*bl/2,f,bl/2))}}break;
case'epic':for(let i=0;i<tb;i++){const t=i*bl;if(i%4===0)k(t);if(i%4===2)s(t);if(i%32===0){const o=c.createOscillator();o.type='sine';const g=c.createGain();o.frequency.setValueAtTime(130.8,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.12,t+8);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+8)}if(i%4===0)[262,330,392,523].forEach((f,j)=>{const o=c.createOscillator();o.type='sine';const g=c.createGain();o.frequency.setValueAtTime(f,t+j*0.08);g.gain.setValueAtTime(0.06,t+j*0.08);g.gain.exponentialRampToValueAtTime(.001,t+j*0.08+0.3);o.connect(g);g.connect(c.destination);o.start(t+j*0.08);o.stop(t+j*0.08+0.3)})}break;
case'urban':for(let i=0;i<tb;i++){const t=i*bl;if(i%4===0)k(t);if(i%4===2)s(t);if(i%8===0||i%8===6)k(t+bl/2);if(i%4===0)for(let h2=0;h2<8;h2++){const ht=t+h2*bl/8;h(ht,h2%2===0);if(h2===3||h2===7)k(ht+0.02)}if(i%8===0)b(t,43.7);if(i%8===4)b(t,49.0)}break;
case'chill':for(let i=0;i<tb;i++){const t=i*bl;if(i%4===0){k(t);h(t+bl/4,1);h(t+bl/2,1);h(t+bl*3/4,1)}if(i%8===0){const s=c.createBufferSource();s.buffer=n;const g=c.createGain();g.gain.setValueAtTime(0.02,t);g.gain.exponentialRampToValueAtTime(.001,t+0.3);s.connect(g);g.connect(c.destination);s.start(t);s.stop(t+0.3)}if(i%16===0)[262,330,392].forEach(f=>{const o=c.createOscillator();o.type='triangle';const g=c.createGain();o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(0.08,t);g.gain.exponentialRampToValueAtTime(.001,t+4);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+4)})}break;
}}

// ──────────────── BEAT DETECTION ─────────────────
function detectBeatsFromBuffer(buf) {
const d=buf.getChannelData(0),sr=buf.sampleRate,ws=1024,hs=512,nw=Math.floor((d.length-ws)/hs);
let e=[];for(let w=0;w<nw;w++){let s=0;const o=w*hs;for(let i=0;i<ws;i++){const v=d[o+i];s+=v*v}e.push(s/ws)}
const aw=Math.round(sr/hs*0.5);let p=[];
for(let i=1;i<e.length-1;i++){let s=0,c=0;for(let j=Math.max(0,i-aw);j<Math.min(e.length,i+aw);j++){s+=e[j];c++}const r=e[i]/(s/c+1e-10);if(r>1.8&&e[i]>e[i-1]&&e[i]>e[i+1])p.push({time:(i*hs)/sr})}
if(p.length<4){beatTimestamps=[];for(let t=0;t<buf.duration;t+=60/bpm)beatTimestamps.push(t);return}
let iv=[];for(let i=1;i<p.length;i++)iv.push(p[i].time-p[i-1].time)
let hi={};iv.forEach(v=>{const k=Math.round(v/0.01)*0.01;hi[k]=(hi[k]||0)+1})
let bi=0,bc=0;for(const[k,co]of Object.entries(hi)){if(co>bc){bc=co;bi=parseFloat(k)}}
const db=Math.round(60/(bi||60/bpm));if(db>50&&db<220)bpm=db
beatTimestamps=[];for(let t=0;t<buf.duration;t+=60/bpm)beatTimestamps.push(t)
}

function analyzeMusic(file){const r=new FileReader();r.onload=async e=>{try{const c=new(window.AudioContext||window.webkitAudioContext)();const b=await c.decodeAudioData(e.target.result);c.close();musicBuffer=b;detectBeatsFromBuffer(b);drawWaveform(b);showMusicTrimmer()}catch(err){console.error(err);alert('Could not read audio.')}};r.readAsArrayBuffer(file)}

function drawWaveform(buf){const c=$('#waveform'),w=c.parentElement.clientWidth||600,h=50;c.width=w;c.height=h;const g=c.getContext('2d'),d=buf.getChannelData(0),st=Math.ceil(d.length/w);g.fillStyle='rgba(255,255,255,0.02)';g.fillRect(0,0,w,h);g.strokeStyle='#8888ff';g.lineWidth=1.5;g.beginPath();for(let x=0;x<w;x++){let m=0;const o=Math.floor(x*st);for(let i=0;i<st&&o+i<d.length;i++){const a=Math.abs(d[o+i]);if(a>m)m=a}g.lineTo(x,h/2-m*h/2*0.9)}g.stroke();g.beginPath();for(let x=0;x<w;x++){let m=0;const o=Math.floor(x*st);for(let i=0;i<st&&o+i<d.length;i++){const a=Math.abs(d[o+i]);if(a>m)m=a}g.lineTo(x,h/2+m*h/2*0.9)}g.stroke();if(beatTimestamps.length){g.fillStyle='rgba(255,68,170,0.4)';beatTimestamps.forEach(bt=>{const x=(bt/buf.duration)*w;g.fillRect(x-0.5,0,1,h)})}$('#waveformWrap').classList.add('show')}
$('#syncToggle').addEventListener('change',()=>{isSynced=$('#syncToggle').checked});

// ═══════════════════════════════════════════════════════════════
// MUSIC TRIMMER — Select a portion of the music track
// ═══════════════════════════════════════════════════════════════

function showMusicTrimmer() {
if (!musicBuffer) return;
musicTrimStart = 0; musicTrimEnd = musicBuffer.duration; musicTrimZoom = 1;
isSynced = false; $('#syncToggle').checked = false;
$('#bpmBadge').classList.remove('show');
$('#musicTrimSection').style.display = 'block';
$('#musicTrimStatus').style.display = 'none';
updateMusicTrimUI();
// Attach drag events
const hL = $('#musicTrimHandleL'), hR = $('#musicTrimHandleR');
hL.onmousedown = e => { e.preventDefault(); startMusicTrimDrag('left', e); };
hR.onmousedown = e => { e.preventDefault(); startMusicTrimDrag('right', e); };
}

function updateMusicTrimUI() {
if (!musicBuffer) return;
const totalDur = musicBuffer.duration;
const leftPct = (musicTrimStart / totalDur) * 100;
const rightPct = ((totalDur - musicTrimEnd) / totalDur) * 100;
const overlay = $('#musicTrimOverlay');
overlay.style.left = leftPct + '%';
overlay.style.width = (100 - leftPct - rightPct) + '%';
$('#musicTrimTimes').textContent = fmtTime(musicTrimStart) + ' \u2014 ' + fmtTime(musicTrimEnd);
$('#musicTrimDur').textContent = (musicTrimEnd - musicTrimStart).toFixed(1) + 's selected';
}

function startMusicTrimDrag(side, e) {
if (!musicBuffer) return;
const waveform = $('#musicTrimWaveform');
const rect = waveform.getBoundingClientRect();
musicTrimDrag = { side, startX: e.clientX, waveW: rect.width, dur: musicBuffer.duration, origStart: musicTrimStart, origEnd: musicTrimEnd };
document.addEventListener('mousemove', onMusicTrimMove);
document.addEventListener('mouseup', stopMusicTrimDrag);
}

function onMusicTrimMove(e) {
if (!musicTrimDrag || !musicBuffer) return;
const dx = e.clientX - musicTrimDrag.startX;
const delta = (dx / musicTrimDrag.waveW) * musicTrimDrag.dur;
if (musicTrimDrag.side === 'left') {
musicTrimStart = Math.max(0, Math.min(musicTrimDrag.origEnd - 0.5, musicTrimDrag.origStart + delta));
} else {
musicTrimEnd = Math.min(musicTrimDrag.dur, Math.max(musicTrimDrag.origStart + 0.5, musicTrimDrag.origEnd + delta));
}
musicTrimStart = Math.round(musicTrimStart * 100) / 100;
musicTrimEnd = Math.round(musicTrimEnd * 100) / 100;
updateMusicTrimUI();
}

function stopMusicTrimDrag() { musicTrimDrag = null; document.removeEventListener('mousemove', onMusicTrimMove); document.removeEventListener('mouseup', stopMusicTrimDrag); }

function confirmMusicTrim() {
if (!musicBuffer) return;
const trimmed = beatTimestamps.filter(t => t >= musicTrimStart && t <= musicTrimEnd).map(t => t - musicTrimStart);
if (trimmed.length < 2) {
$('#musicTrimStatus').textContent = 'Selection too short for beat sync. Widen the range.';
$('#musicTrimStatus').style.display = 'block';
return;
}
beatTimestamps = trimmed;
isSynced = true; $('#syncToggle').checked = true;
$('#bpmBadge').textContent = bpm + ' BPM'; $('#bpmBadge').classList.add('show');
$('#musicTrimStatus').textContent = '\u2713 ' + beatTimestamps.length + ' beats in selection \u2022 ' + bpm + ' BPM';
$('#musicTrimStatus').style.display = 'block';
}

function previewMusicTrim() {
if (!musicBuffer) return;
stopMusicPreview();
const c = new (window.AudioContext || window.webkitAudioContext)();
const src = c.createBufferSource(); src.buffer = musicBuffer;
const g = c.createGain(); g.gain.value = 0.5;
src.connect(g); g.connect(c.destination);
src.loop = true; src.loopStart = musicTrimStart; src.loopEnd = musicTrimEnd;
src.start(0, musicTrimStart);
musicPreviewNode = { ctx: c, src: src };
$('#musicAudioPreview').style.display = 'block';
}

function stopMusicPreview() {
if (musicPreviewNode) {
try { musicPreviewNode.src.stop(); musicPreviewNode.ctx.close(); } catch(e) {}
musicPreviewNode = null;
}
$('#musicAudioPreview').style.display = 'none';
}

function resetMusicTrim() {
if (!musicBuffer) return;
musicTrimStart = 0; musicTrimEnd = musicBuffer.duration;
beatTimestamps = []; for (let t = 0; t < musicBuffer.duration; t += 60 / bpm) beatTimestamps.push(t);
isSynced = false; $('#syncToggle').checked = false;
$('#bpmBadge').classList.remove('show');
$('#musicTrimStatus').style.display = 'none';
updateMusicTrimUI();
}

function zoomMusicTrim(dir) {
if (!musicBuffer) return;
const center = (musicTrimStart + musicTrimEnd) / 2;
const range = musicTrimEnd - musicTrimStart;
const newRange = dir > 1 ? range / 1.5 : range * 1.5;
const clampedRange = Math.min(musicBuffer.duration, Math.max(2, newRange));
musicTrimStart = Math.max(0, center - clampedRange / 2);
musicTrimEnd = Math.min(musicBuffer.duration, center + clampedRange / 2);
updateMusicTrimUI();
}

let timelineSegments = [];
let nextTimelineId = 0;
let timelineVideos = [];
let trimDragging = null; // { id, side:'left'|'right', startX, trackWidth, origStart, origEnd, origDur }

function fmtTime(s) { const m=Math.floor(s/60); return String(m)+':'+String(Math.floor(s%60)).padStart(2,'0'); }

async function initTimeline() {
timelineSegments=[]; timelineVideos=[]; nextTimelineId=0;
closeTimelinePreview();
$('#timelinePreview').style.display='none';
for (let i=0;i<inputFiles.length;i++) {
const v=document.createElement('video'); v.playsInline=true;
v.src=URL.createObjectURL(inputFiles[i]);
await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=rej});
timelineVideos.push(v);
timelineSegments.push({id:nextTimelineId++,clipIndex:i,start:0,end:v.duration,originalDuration:v.duration,name:inputFiles[i].name});
}
renderTimeline();
$('#timelineSection').style.display='block'; $('#editorPanel').style.display='none';
}

function renderTimeline() {
renderTimelineBars(); renderTimelineList(); updateTimelineSummary();
if (previewState) { const seg = timelineSegments.find(s => s.id === previewState.segId); if (seg) updatePreviewScrubRange(seg); else closeTimelinePreview(); }
}

function renderTimelineBars() {
const container=$('#timelineBars'); container.innerHTML='';
for (let i=0;i<timelineSegments.length;i++) {
const seg=timelineSegments[i];
const origDur=seg.originalDuration;
const pStart=seg.start/origDur*100, pEnd=seg.end/origDur*100, pW=pEnd-pStart;
const bar=document.createElement('div'); bar.className='timeline-bar'; bar.style.height='34px';
const label=document.createElement('div'); label.className='timeline-bar-label'; label.textContent=inputFiles[seg.clipIndex]?.name.replace(/\.[^.]+$/,'').slice(0,12)||'Clip';
const track=document.createElement('div'); track.className='timeline-bar-track'; track.style.height='20px';
const fill=document.createElement('div'); fill.className='timeline-bar-fill';
fill.style.left=pStart+'%'; fill.style.width=pW+'%';
const hL=document.createElement('div'); hL.className='timeline-handle left';
hL.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();startTrimDrag(seg.id,'left',e);});
const hR=document.createElement('div'); hR.className='timeline-handle right';
hR.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();startTrimDrag(seg.id,'right',e);});
fill.appendChild(hL); fill.appendChild(hR);
const timeLabel=document.createElement('div');
timeLabel.style.cssText='position:absolute;top:-13px;left:'+pStart+'%;font-size:.6rem;color:rgba(136,136,255,.4);transform:translateX(-50%)';
timeLabel.textContent=fmtTime(seg.start);
const timeLabelR=document.createElement('div');
timeLabelR.style.cssText='position:absolute;top:-13px;left:'+pEnd+'%;font-size:.6rem;color:rgba(136,136,255,.4);transform:translateX(-50%)';
timeLabelR.textContent=fmtTime(seg.end);
fill.appendChild(timeLabel); fill.appendChild(timeLabelR);
track.appendChild(fill);
bar.appendChild(label); bar.appendChild(track); container.appendChild(bar);
}
document.addEventListener('mousemove',onTrimDragMove); document.addEventListener('mouseup',stopTrimDrag);
}

function renderTimelineList() {
const container=$('#timelineList'); container.innerHTML='';
for (let i=0;i<timelineSegments.length;i++) {
const seg=timelineSegments[i]; const dur=seg.end-seg.start;
const item=document.createElement('div'); item.className='timeline-item';
item.draggable=true; item.dataset.idx=i;
item.addEventListener('dragstart',e=>{draggingItem=i;item.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
item.addEventListener('dragend',()=>{item.classList.remove('dragging');$$('.timeline-item').forEach(x=>x.classList.remove('drag-over'));});
item.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';$$('.timeline-item').forEach(x=>x.classList.remove('drag-over'));item.classList.add('drag-over');});
item.addEventListener('drop',e=>{e.preventDefault();if(draggingItem!==null&&draggingItem!==i){moveTimelineSegment(draggingItem,i);}draggingItem=null;});
item.innerHTML='<span class="drag-handle">&#x2630;</span>'
+'<span class="tl-name">'+seg.name.replace(/\.[^.]+$/,'')+'</span>'
+'<span class="tl-time">'+fmtTime(seg.start)+' &ndash; '+fmtTime(seg.end)+'</span>'
+'<span class="tl-dur">'+dur.toFixed(1)+'s</span>'
+'<span class="tl-actions">'
+'<button class="timeline-btn preview" onclick="startTimelinePreview('+seg.id+')">&#9654;</button>'
+(timelineSegments.length>1?'<button class="timeline-btn split" onclick="splitTimelineSegment('+seg.id+')">&#9886;&#65039;</button>':'')
+'<button class="timeline-btn remove" onclick="removeTimelineSegment('+seg.id+')">&#10005;</button>'
+'</span>';
container.appendChild(item);
}
}

function updateTimelineSummary() {
const total=timelineSegments.reduce((s,seg)=>s+(seg.end-seg.start),0);
$('#timelineSummary').innerHTML='<strong>'+timelineSegments.length+'</strong> segment'+(timelineSegments.length!==1?'s':'')+' &middot; <strong>'+total.toFixed(1)+'s</strong> total &middot; Drag cards to reorder, drag handles to trim';
$('#btnContinueEdit').disabled=timelineSegments.length===0;
}

// ── Trim dragging ──
function startTrimDrag(id,side,e) {
const seg=timelineSegments.find(s=>s.id===id); if(!seg)return;
const track=e.target.closest('.timeline-bar-track'); if(!track)return;
const rect=track.getBoundingClientRect();
trimDragging={id,side,startX:e.clientX,trackW:rect.width,origStart:seg.start,origEnd:seg.end,origDur:seg.originalDuration};
}

function onTrimDragMove(e) {
if(!trimDragging)return;
const seg=timelineSegments.find(s=>s.id===trimDragging.id); if(!seg)return;
const dx=e.clientX-trimDragging.startX;
const delta=(dx/trimDragging.trackW)*trimDragging.origDur;
if(trimDragging.side==='left') {
const newStart=Math.max(0,Math.min(trimDragging.origEnd-0.1,trimDragging.origStart+delta));
seg.start=Math.round(newStart*100)/100;
} else {
const newEnd=Math.min(trimDragging.origDur,Math.max(trimDragging.origStart+0.1,trimDragging.origEnd+delta));
seg.end=Math.round(newEnd*100)/100;
}
renderTimelineBars(); updateTimelineSummary();
if (previewState) { const seg2 = timelineSegments.find(s => s.id === previewState.segId); if (seg2) updatePreviewScrubRange(seg2); }
}

function stopTrimDrag() { trimDragging=null; renderTimelineList(); }

// ── Segment operations ──
function splitTimelineSegment(id) {
const idx=timelineSegments.findIndex(s=>s.id===id); if(idx===-1)return;
const seg=timelineSegments[idx]; const mid=seg.start+(seg.end-seg.start)/2;
const newSeg={id:nextTimelineId++,clipIndex:seg.clipIndex,start:Math.round(mid*100)/100,end:seg.end,originalDuration:seg.originalDuration,name:seg.name};
seg.end=Math.round(mid*100)/100;
timelineSegments.splice(idx+1,0,newSeg);
if (previewState?.segId === id) { // keep preview on left half, update scrub
updatePreviewScrubRange(seg);
}
renderTimeline();
}

function removeTimelineSegment(id) {
const idx=timelineSegments.findIndex(s=>s.id===id); if(idx===-1)return;
timelineSegments.splice(idx,1);
if (previewState?.segId === id) closeTimelinePreview();
renderTimeline();
}

function moveTimelineSegment(fromIdx,toIdx) {
const item=timelineSegments.splice(fromIdx,1)[0];
timelineSegments.splice(toIdx,0,item);
renderTimeline();
}

// ── Preview System ──
let previewState = null; // { segId, playing, loop, rafId }

function startTimelinePreview(id) {
const seg = timelineSegments.find(s => s.id === id); if (!seg) return;
const v = timelineVideos[seg.clipIndex]; if (!v) return;
const pv = $('#tlPreviewVideo');

// Don't reload video source if same clip
if (pv.dataset.srcIdx !== String(seg.clipIndex)) {
pv.src = v.src; pv.dataset.srcIdx = String(seg.clipIndex);
}
pv.muted = true;
pv.currentTime = seg.start;
pv.play();
previewState = { segId: id, playing: true, loop: false, rafId: null };
pv.ontimeupdate = () => { if (pv.currentTime >= seg.end && !previewState?.loop) pv.pause(); };
$('#timelinePreview').style.display = 'block';
$('#tlBtnPlay').textContent = '\u23F8';
$('#tlPreviewLabel').textContent = seg.name.replace(/\.[^.]+$/,'');

updatePreviewScrubRange(seg);
startPreviewScrubRAF();
}

function updatePreviewScrubRange(seg) {
$('#tlScrubStart').textContent = fmtTime(seg.start);
$('#tlScrubEnd').textContent = fmtTime(seg.end);
}

function startPreviewScrubRAF() {
if (previewState?.rafId) cancelAnimationFrame(previewState.rafId);
const tick = () => {
const pv = $('#tlPreviewVideo'); const seg = timelineSegments.find(s => s.id === previewState?.segId);
if (pv && seg) {
const ct = Math.max(seg.start, Math.min(pv.currentTime, seg.end));
const pct = seg.end > seg.start ? ((ct - seg.start) / (seg.end - seg.start)) * 100 : 0;
$('#tlScrubberFill').style.width = pct + '%';
$('#tlScrubberThumb').style.left = pct + '%';
$('#tlScrubCurrent').textContent = fmtTime(ct);
const total = seg.end - seg.start; const cur = ct - seg.start;
$('#tlPreviewTime').textContent = fmtTime(cur) + '.' + Math.floor((cur%1)*10) + ' / ' + fmtTime(total) + '.' + Math.floor((total%1)*10);
if (previewState?.playing && pv.paused) { $('#tlBtnPlay').textContent = '\u25B6'; previewState.playing = false; }
}
previewState.rafId = requestAnimationFrame(tick);
};
tick();
}

function togglePreviewPlay() {
const pv = $('#tlPreviewVideo'); const seg = timelineSegments.find(s => s.id === previewState?.segId);
if (!pv || !seg) return;
if (previewState?.playing) { pv.pause(); previewState.playing = false; $('#tlBtnPlay').textContent = '\u25B6'; }
else {
if (pv.currentTime >= seg.end) pv.currentTime = seg.start;
pv.play(); previewState.playing = true; $('#tlBtnPlay').textContent = '\u23F8';
}
}

function togglePreviewLoop() {
if (!previewState) return;
previewState.loop = !previewState.loop;
$('#tlBtnLoop').classList.toggle('active');
const pv = $('#tlPreviewVideo'); const seg = timelineSegments.find(s => s.id === previewState?.segId);
if (!pv || !seg) return;
if (previewState.loop) {
pv.ontimeupdate = () => { if (pv.currentTime >= seg.end) pv.currentTime = seg.start; };
} else {
pv.ontimeupdate = () => { if (pv.currentTime >= seg.end && !previewState?.loop) pv.pause(); };
}
}

function skipPreview(delta) {
const pv = $('#tlPreviewVideo'); const seg = timelineSegments.find(s => s.id === previewState?.segId);
if (!pv || !seg) return;
let t = pv.currentTime + delta;
if (t < seg.start) t = seg.start; if (t > seg.end) t = seg.end;
pv.currentTime = t;
}

function stepPreview(dir) {
const pv = $('#tlPreviewVideo'); const seg = timelineSegments.find(s => s.id === previewState?.segId);
if (!pv || !seg) return;
const frame = 1 / 30;
let t = pv.currentTime + frame * dir;
if (t < seg.start) t = seg.start; if (t > seg.end) t = seg.end;
pv.currentTime = t;
if (previewState?.playing) { pv.pause(); previewState.playing = false; $('#tlBtnPlay').textContent = '\u25B6'; }
}

function scrubPreviewFromEvent(e) {
const wrap = $('#tlScrubberWrap'); const seg = timelineSegments.find(s => s.id === previewState?.segId);
if (!wrap || !seg) return;
const r = wrap.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
const t = seg.start + pct * (seg.end - seg.start);
$('#tlPreviewVideo').currentTime = t;
}

function closeTimelinePreview() {
const pv = $('#tlPreviewVideo');
pv.pause(); pv.removeAttribute('src'); pv.dataset.srcIdx = ''; pv.load();
if (previewState?.rafId) cancelAnimationFrame(previewState.rafId);
previewState = null;
$('#timelinePreview').style.display = 'none';
}

// Scrubber click/drag
$('#tlScrubberWrap')?.addEventListener('mousedown', e => { scrubPreviewFromEvent(e); const m = e => { scrubPreviewFromEvent(e); }; document.addEventListener('mousemove', m); document.addEventListener('mouseup', () => { document.removeEventListener('mousemove', m); }, { once: true }); });

// ── Navigation ──
function goBackFromTimeline() {
timelineVideos.forEach(v=>{v.pause();try{URL.revokeObjectURL(v.src)}catch(e){}});
timelineSegments=[]; timelineVideos=[]; nextTimelineId=0;
$('#timelineSection').style.display='none'; $('#editorPanel').style.display='none'; $('#outputSection').style.display='none';
// If we came from highlight analysis, go back to highlight review
if (analysisResults.length > 0 && editMode === 'single') {
$('#highlightSection').style.display = 'block';
$('#highlightContent').style.display = 'block';
if (storedVideoFile) { $('#videoPreviewBox').style.display = 'block'; } else { $('#uploadZone').style.display = 'block'; }
return;
}
// Show video preview if we have a stored file
if (storedVideoFile) {
$('#videoPreviewBox').style.display = 'block';
} else {
$('#uploadZone').style.display='block';
}
$('#uploadZone h3').textContent=editMode==='montage'?'Upload your video clips':'Upload your video';
$('#uploadZone p').textContent='or click to browse \u2022 MP4, MOV, WebM';
$('#fileList').style.display='none'; $('#singleInfo').style.display='none';
}

function continueToEdit() {
if(timelineSegments.length===0)return;
$('#timelineSection').style.display='none';
$('#editorPanel').style.display='block';
$('#btnProcess').disabled=false;
autoSuggestTrack();
}

// ═══════════════════════════════════════════════════════════════
// PROCESSING OVERLAY
// ═══════════════════════════════════════════════════════════════

function showProcessing(title, sub) {
const o = $('#processingOverlay');
o.classList.add('show');
$('#procTitle').textContent = title || 'Processing your video';
$('#procSub').textContent = sub || 'This may take a moment';
$$('.processing-step').forEach(s => s.classList.remove('active', 'done'));
$('#procBarFill').style.width = '0%';
}

function setProcStep(step, label) {
const steps = $$('.processing-step');
steps.forEach((s, i) => {
s.classList.remove('active', 'done');
if (i < step) s.classList.add('done');
if (i === step) s.classList.add('active');
});
if (label) {
const activeStep = steps[step];
if (activeStep) activeStep.innerHTML = '<span class="step-icon">&#9679;</span> ' + label;
}
$('#procBarFill').style.width = Math.min(100, (step / 6) * 100) + '%';
}

function hideProcessing() {
$('#processingOverlay').classList.remove('show');
}

// ═══════════════════════════════════════════════════════════════
// SMART PROCESSING ENGINE — Motion Analysis + Highlight Cuts
// ═══════════════════════════════════════════════════════════════

$('#btnProcess').addEventListener('click', async () => {
if (!inputFiles.length) return;
const btn = $('#btnProcess'), prog = $('#progressWrap'), bar = $('#progressBar');
const status = $('#statusText'), outSec = $('#outputSection'), outVid = $('#outputVideo'), dl = $('#downloadLink');

// If Auto Cut is OFF → render full video immediately (no analysis, no trimming)
if (!editOptions.cut) {
btn.disabled = true; btn.textContent = 'Rendering...';
$('#editorPanel').style.display = 'none';
showProcessing('Creating your AI Edit', 'Applying effects to full video');
setProcStep(0, 'Preparing video');
// Create a single full-video segment
const v = document.createElement('video'); v.playsInline = true;
v.src = URL.createObjectURL(storedVideoFile);
await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
v.currentTime = 0;
timelineVideos = [v];
timelineSegments = [{ id: 0, clipIndex: 0, start: 0, end: v.duration, originalDuration: v.duration, name: storedVideoFile.name }];
renderFullEdit();
return;
}

// Auto Cut is ON → run analysis, show highlights for review
if (!timelineSegments.length && !analysisVideoUrl) {
btn.disabled = true; btn.textContent = 'Analyzing video...';
$('#editorPanel').style.display = 'none';
showProcessing('Analyzing your video', 'Detecting highlights and events');
setProcStep(0, 'Uploading video');
if (storedVideoFile) await startVideoAnalysis(storedVideoFile);
return; // Wait for user to confirm highlights → timeline → continueToEdit
}

// Second click (after timeline review): render the final edit
btn.disabled = true; btn.textContent = 'Rendering...';
prog.style.display = 'block'; bar.style.width = '0%';
status.textContent = 'Rendering...'; outSec.style.display = 'none';
$('#editorPanel').style.display = 'none';
renderFullEdit();
});

// ── Render Engine ──
async function renderFullEdit() {
const btn = $('#btnProcess'), prog = $('#progressWrap'), bar = $('#progressBar');
const status = $('#statusText'), outSec = $('#outputSection'), outVid = $('#outputVideo'), dl = $('#downloadLink');

showProcessing('Creating your AI Edit', 'Applying effects and rendering');
setProcStep(0, 'Uploading video');

const tmpl = TEMPLATES[selectedPreset];
const isMontage = editMode === 'montage';
const intMult = INTENSITY_MULT[intensity];
const cutRatio = autoCut ? CUT_RATIO[cutStrength] : 1.0;

// ──────────── PHASE 1: PREPARE VIDEOS ────────────
setProcStep(1, 'Analyzing video');
let videos = timelineVideos;
try {
// Set canvas dimensions based on export settings
const srcW = videos[0].videoWidth || 1920, srcH = videos[0].videoHeight || 1080;
if (exportAspect === '16:9') {
canvas.width = exportRes * 16 / 9;
canvas.height = exportRes;
} else {
canvas.width = exportRes * 9 / 16;
canvas.height = exportRes;
}
aCanvas.width = 120; aCanvas.height = 68;

// ──────────── PHASE 2: BUILD & REFINE SEGMENTS ────────────
setProcStep(2, 'Detecting highlights');
// Start from user's timeline selections
let merged = timelineSegments.map(seg => ({
clipIndex: seg.clipIndex, start: seg.start, end: seg.end,
peakTime: seg.start + (seg.end - seg.start) / 2, intensity: 80
}));

// Optionally refine with event detection within each segment
if (autoCut && merged.length > 0) {
status.textContent = 'Refining segments with event detection...';
const allRefined = [];
for (let mi = 0; mi < merged.length; mi++) {
const seg = merged[mi];
const video = videos[seg.clipIndex];
bar.style.width = (40 + (mi / merged.length) * 20) + '%';
status.textContent = 'Scanning segment ' + (mi+1) + '/' + merged.length + ' for events...';
video.playbackRate = 6;
video.currentTime = seg.start;
await video.play();
const raw = [];
const sampleInterval = 0.1;
let prevFrame = null;
let lastSample = -sampleInterval;
await new Promise(resolve => {
const frame = () => {
if (video.paused || video.ended) { resolve(); return; }
const ct = video.currentTime;
if (ct > seg.end) { video.pause(); resolve(); return; }
if (ct - lastSample >= sampleInterval) {
lastSample = ct;
aCtx.drawImage(video, 0, 0, 120, 68);
const data = aCtx.getImageData(0, 0, 120, 68).data;
let m = 0;
if (prevFrame) {
for (let i = 0; i < data.length; i += 8) m += Math.abs(data[i] - prevFrame[i]);
m /= (120 * 68 / 2);
}
prevFrame = new Uint8Array(data);
raw.push({ time: ct, motion: m });
}
requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
});
video.pause();
video.playbackRate = 1;
if (raw.length < 2) { allRefined.push(seg); continue; }
const maxM = Math.max(...raw.map(t => t.motion), 0.001);
raw.forEach(t => { t.motion = (t.motion / maxM) * 100; });
for (let i = 1; i < raw.length; i++) raw[i].delta = raw[i].motion - raw[i-1].motion;
raw[0].delta = 0;
const cutMult = cutStrength === 'low' ? 1.5 : cutStrength === 'high' ? 0.6 : 1.0;
const spikeThreshold = 22 * cutMult;
const motionThreshold = 60 * cutMult;
const events = [];
let ei = 1;
while (ei < raw.length - 1) {
if (raw[ei].delta > spikeThreshold || raw[ei].motion > motionThreshold) {
let s = ei; while (s > 0 && raw[s].motion > 5 && (ei - s) < 6) s--;
let en = ei; while (en < raw.length - 1 && raw[en].motion > 5 && (en - ei) < 12) en++;
const pk = raw.slice(s, en + 1).reduce((a, b) => a.motion > b.motion ? a : b);
events.push({ startTime: raw[s].time, endTime: raw[en].time, peakTime: pk.time, intensity: pk.motion });
ei = en + 1;
} else { ei++; }
}
if (events.length > 0) {
events.sort((a, b) => a.startTime - b.startTime);
const me = [];
for (const ev of events) {
if (me.length && ev.startTime <= me[me.length-1].endTime + 0.4) {
const l = me[me.length-1]; l.endTime = Math.max(l.endTime, ev.endTime);
l.intensity = Math.max(l.intensity, ev.intensity);
if (ev.intensity > l.intensity) l.peakTime = ev.peakTime;
} else { me.push({...ev}); }
}
for (const ev of me) {
allRefined.push({
clipIndex: seg.clipIndex,
start: Math.max(seg.start, ev.startTime - tmpl.leadIn),
end: Math.min(seg.end, ev.endTime + tmpl.leadOut),
peakTime: ev.peakTime, intensity: ev.intensity
});
}
} else {
allRefined.push(seg);
}
}
merged = allRefined;
merged.sort((a, b) => a.clipIndex !== b.clipIndex ? a.clipIndex - b.clipIndex : a.start - b.start);
const m2 = [];
for (const s of merged) {
if (m2.length && m2[m2.length-1].clipIndex === s.clipIndex && s.start <= m2[m2.length-1].end) {
m2[m2.length-1].end = Math.max(m2[m2.length-1].end, s.end);
m2[m2.length-1].intensity = Math.max(m2[m2.length-1].intensity, s.intensity||0);
} else { m2.push({...s}); }
}
merged = m2;
console.log('Timeline segments after refinement:', merged.length);
}

if (!merged.length) {
merged.push({ clipIndex: 0, start: 0, end: videos[0].duration, peakTime: videos[0].duration/2, intensity: 50 });
}

// ──────────── PHASE 4: RENDER ────────────
setProcStep(3, 'Syncing music');
setProcStep(4, 'Applying effects');
setProcStep(5, 'Rendering');
status.textContent = 'Rendering edit (' + merged.length + ' highlights)...';
bar.style.width = '60%';

// Audio setup
let audioTracks = [], procCtx = null, audioDest = null, musicNode = null;

// Extract video audio for playback if no music
let videoAudioBuffer = null;
if (!isMontage) {
try {
// Try to get video audio via media element source (if we play the video)
const c = new (window.AudioContext||window.webkitAudioContext)();
const src = c.createMediaElementSource(videos[0]);
const dst = c.createMediaStreamDestination();
const g = c.createGain(); g.gain.value = 0.8;
src.connect(g); g.connect(dst);
audioTracks = dst.stream.getAudioTracks();
procCtx = c; audioDest = dst;
} catch(e) { console.warn('Audio:', e.message); }
}

const hasMusic = musicBuffer !== null;
if (hasMusic && isSynced) {
try {
if (!procCtx || procCtx.state === 'closed') procCtx = new (window.AudioContext||window.webkitAudioContext)();
if (procCtx.state === 'suspended') await procCtx.resume();
const src = procCtx.createBufferSource(); src.buffer = musicBuffer;
const g = procCtx.createGain(); g.gain.value = 0.85;
if (!audioDest) audioDest = procCtx.createMediaStreamDestination();
src.connect(g); g.connect(audioDest); src.loop = true;
src.loopStart = musicTrimStart; src.loopEnd = musicTrimEnd;
src.start(0, musicTrimStart); musicNode = src;
audioTracks = audioDest.stream.getAudioTracks();
} catch(e) { console.warn('Music:', e.message); }
}

// Recorder
const cStream = canvas.captureStream(30);
const tracks = [...cStream.getVideoTracks(), ...audioTracks];
let mime = '';
['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm','video/mp4'].forEach(t => { if(MediaRecorder.isTypeSupported(t)) mime = t; });
const chunks = [];
const recorder = new MediaRecorder(new MediaStream(tracks), mime?{mimeType:mime}:{});
recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
recorder.start(1000);

// ── Time-based Render Loop ──
const beatMode = hasMusic && isSynced && beatTimestamps.length > 0;

// Build beat metadata with tier labels
const beatMeta = [];
if (beatMode) {
const beatLen = 60 / bpm;
for (let i = 0; i < beatTimestamps.length; i++) {
const barBeat = i % 4;
const tier = barBeat === 0 ? 'main' : barBeat === 2 ? 'strong' : 'normal';
beatMeta.push({ time: beatTimestamps[i], tier, index: i, isDrop: i > 0 && i % 32 === 0 });
}
}

const FPS = 30, frameDur = 1 / FPS;
let frameIndex = 0, segIdx = 0, transition = 0;
let flash = 0, zoom = 0, shake = 0, shakeX = 0, shakeY = 0;
let beatIdx = 0, bassPulse = 0, anticipationZoom = 0, anticipationDark = 0;
let lastEffectTime = -99;
let totalHighlightDuration = 0;
for (const seg of merged) totalHighlightDuration += (seg.end - seg.start);
let currentClip = null;

function getEventIntensity(clipIdx, time) {
const seg = merged[segIdx];
if (seg && seg.clipIndex === clipIdx) return seg.intensity || 80;
return 80;
}

function getEventTier(clipIdx, time, intensity) {
if (intensity > 80) return 'major';
if (intensity > 60) return 'normal';
if (intensity > 30) return 'minor';
return 'none';
}

// Compute segment start frames (in render time, frameIndex * frameDur)
const segStartFrames = [];
let accumFrames = 0;
for (let i = 0; i < merged.length; i++) {
segStartFrames.push(accumFrames);
accumFrames += Math.round((merged[i].end - merged[i].start) / frameDur);
}

function startSegment(idx) {
if (idx >= merged.length) return;
const seg = merged[idx];
const v = videos[seg.clipIndex];
v.currentTime = seg.start;
v.playbackRate = 1.0;
v.play();
currentClip = v;
segIdx = idx;
transition = tmpl.transition.frames;
}

// Start first segment
if (merged.length) startSegment(0);

const renderLoop = () => {
if (segIdx >= merged.length) { stopRec(); return; }

// Determine current segment based on frame index
let curSeg = segIdx;
for (let i = 0; i < merged.length - 1; i++) {
if (frameIndex >= segStartFrames[i] && frameIndex < segStartFrames[i + 1]) {
curSeg = i; break;
}
}
if (frameIndex >= segStartFrames[segStartFrames.length - 1] + Math.round((merged[merged.length-1].end - merged[merged.length-1].start) / frameDur)) {
stopRec(); return;
}

// Segment changed
if (curSeg !== segIdx) {
startSegment(curSeg);
}

const seg = merged[segIdx];
const v = currentClip;
const renderElapsed = frameIndex * frameDur;
const segElapsedFrames = frameIndex - segStartFrames[segIdx];
const segElapsed = segElapsedFrames * frameDur;
const ct = Math.min(seg.start + segElapsed, seg.end - 0.01);

// Keep video synced to computed position
if (v && Math.abs(v.currentTime - ct) > 0.1 && v.readyState >= 1) {
v.currentTime = ct;
}

// Use render-time for music
const musicTime = beatMode ? renderElapsed % (musicTrimEnd - musicTrimStart) : renderElapsed;

const intensity = getEventIntensity(seg.clipIndex, ct);
const eventTier = getEventTier(seg.clipIndex, ct, intensity);
const nearPeak = seg.peakTime !== undefined && Math.abs(ct - seg.peakTime) < 0.3;
const timeSinceLastEffect = ct - lastEffectTime;

let newShake = 0, newZoom = 0, newFlash = 0;

// ── Anticipation ──
let nextMainBeat = null;
if (beatMode && tmpl.anticipation) {
for (let i = beatIdx; i < beatMeta.length; i++) {
if (beatMeta[i].tier === 'main' && beatMeta[i].time > musicTime) {
nextMainBeat = beatMeta[i]; break;
}
}
}
if (nextMainBeat) {
const timeToBeat = nextMainBeat.time - musicTime;
if (timeToBeat > 0 && timeToBeat < 0.3) {
anticipationZoom = 1 + (0.3 - timeToBeat) * 0.06 * intMult;
anticipationDark = (0.3 - timeToBeat) * 0.12 * intMult;
} else { anticipationZoom = 0; anticipationDark = 0; }
} else { anticipationZoom = 0; anticipationDark = 0; }

// ── Beat-synced effects ──
if (beatMode) {
while (beatIdx < beatMeta.length && beatMeta[beatIdx].time <= musicTime + 0.03) {
const beat = beatMeta[beatIdx];
const tierKey = beat.isDrop ? 1 : beat.tier === 'main' ? 2 : beat.tier === 'strong' ? 3 : 4;
const isMajorEvent = eventTier === 'major' || (eventTier === 'normal' && nearPeak);
let effTier = tierKey;
if (isMajorEvent) {
if (tierKey === 4 && tmpl.tiers[3]) effTier = 3;
else if (tierKey === 3 && tmpl.tiers[2]) effTier = 2;
else if (tierKey === 2 && tmpl.tiers[1]) effTier = 1;
} else if (eventTier !== 'none' && tierKey === 4 && tmpl.tiers[3]) {
effTier = 3;
}
const t = tmpl.tiers[effTier];
if (!t) { beatIdx++; continue; }
newShake = (t.shake || 0) * intMult;
newFlash = (t.flash || 0) * intMult;
newZoom = t.zoom ? 1 + t.zoom * intMult : 0;
if (t.bass) bassPulse = 1 + t.bass * intMult;
if (newShake > 0 && timeSinceLastEffect < tmpl.shake.cooldown) newShake = 0;
if (newZoom > 0 && timeSinceLastEffect < (tmpl.zoom.cooldown || 0.3)) newZoom = 0;
beatIdx++;
}
} else if (nearPeak && intensity > 55) {
newFlash = 0.15;
}

if (newShake > 0) { shake = newShake; lastEffectTime = ct; }
if (newZoom > 0) { zoom = newZoom; }
if (newFlash > 0) { flash = newFlash; }

// ── Draw frame ──
ctx.save();

// Shake
if (shake > 0.5) {
shakeX = (Math.random() - 0.5) * shake * 2;
shakeY = (Math.random() - 0.5) * shake * 2;
shake *= tmpl.shake.decay;
if (shake < 0.5) { shake = 0; shakeX = 0; shakeY = 0; }
} else { shakeX = 0; shakeY = 0; }

// Zoom
let currentZoom = 1;
if (zoom > 0) currentZoom = zoom;
if (anticipationZoom > 0) currentZoom = Math.max(currentZoom, anticipationZoom);
if (bassPulse > 0) currentZoom = Math.max(currentZoom, bassPulse);

// Aspect-ratio-aware source rect
const srcAR = v.videoWidth / v.videoHeight, dstAR = canvas.width / canvas.height;
let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
if (srcAR > dstAR) { sw = v.videoHeight * dstAR; sx = (v.videoWidth - sw) / 2; }
else { sh = v.videoWidth / dstAR; sy = (v.videoHeight - sh) / 2; }

// Only draw if video has data
const canDraw = v && v.readyState >= 2;
if (canDraw) {
if (currentZoom > 1.002) {
const cx = canvas.width/2, cy = canvas.height/2;
const nw = canvas.width/currentZoom, nh = canvas.height/currentZoom;
ctx.filter = tmpl.filter;
ctx.drawImage(v, sx, sy, sw, sh, cx - nw/2, cy - nh/2, nw, nh);
} else {
ctx.filter = tmpl.filter;
ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}
}

// Decay
if (zoom > 0) { zoom = 1 + (zoom - 1) * tmpl.zoom.decay; if (zoom < 1.005) zoom = 0; }
if (bassPulse > 0) { bassPulse = 1 + (bassPulse - 1) * tmpl.zoom.decay; if (bassPulse < 1.005) bassPulse = 0; }

// Template overlay
if (tmpl.overlay === 'vignette') {
const g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height*0.35, canvas.width/2, canvas.height/2, canvas.height*0.85);
g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.45)');
ctx.filter='none'; ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
}

// Anticipation dark overlay
if (anticipationDark > 0.005) {
ctx.filter = 'none';
ctx.fillStyle = `rgba(0,0,0,${anticipationDark})`;
ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Flash overlay
if (flash > 0.01) {
ctx.filter = 'none';
ctx.fillStyle = `rgba(255,255,255,${Math.min(flash, tmpl.flash.maxOpacity)})`;
ctx.fillRect(0, 0, canvas.width, canvas.height);
flash *= tmpl.flash.decay;
if (flash < 0.01) flash = 0;
}

// Glow bar
if (flash > tmpl.glowThreshold) {
const g = ctx.createLinearGradient(0, canvas.height-14, 0, canvas.height);
g.addColorStop(0, 'rgba(136,136,255,0)');
g.addColorStop(1, `rgba(136,136,255,${Math.min(flash * 0.4, 0.3)})`);
ctx.fillStyle = g; ctx.fillRect(0, canvas.height - 14, canvas.width, 14);
}

// Shake offset
if (shakeX !== 0 || shakeY !== 0) ctx.translate(shakeX, shakeY);

// Transition
if (transition > 0) {
ctx.filter = 'none';
ctx.fillStyle = `rgba(255,255,255,${tmpl.transition.opacity * (transition / tmpl.transition.frames)})`;
ctx.fillRect(0, 0, canvas.width, canvas.height);
transition--;
}

ctx.restore();

// Progress
const totalFrames = segStartFrames[segStartFrames.length-1] + Math.round((merged[merged.length-1].end - merged[merged.length-1].start) / frameDur);
const pct = Math.min(99, Math.round((frameIndex / totalFrames) * 100));
bar.style.width = (60 + pct * 0.35) + '%';
status.textContent = 'Editing: ' + pct + '%' + (merged.length > 1 ? ' (' + (segIdx+1) + '/' + merged.length + ')' : '');

frameIndex++;
requestAnimationFrame(renderLoop);
};

const stopRec = () => {
if (recorder.state !== 'inactive') recorder.stop();
status.textContent = 'Finalizing...'; setProcStep(6, 'Finalizing');
window._prevFrameData = null;
};

requestAnimationFrame(renderLoop);

// Wait for completion
const maxWait = (totalHighlightDuration + 30) * 1000;
await new Promise(resolve => {
const check = setInterval(() => {
if (recorder.state === 'inactive') { clearInterval(check); resolve(); }
}, 200);
setTimeout(() => { clearInterval(check); resolve(); }, maxWait);
});

await new Promise(r => setTimeout(r, 300));

const ext = mime.includes('mp4') ? 'mp4' : 'webm';
const blob = new Blob(chunks, { type: mime||'video/webm' });
const url = URL.createObjectURL(blob);

outVid.src = url; dl.href = url; dl.download = 'rr-montage-' + exportRes + 'p-' + exportAspect.replace(':','x') + '.' + ext;
outSec.style.display = 'block';

const origDur = videos.reduce((s,v) => s + v.duration, 0);
const ratio = (totalHighlightDuration / origDur * 100).toFixed(0);
status.textContent = '\u2713 Complete! ' + (blob.size/1024/1024).toFixed(1) + ' MB \u2022 ' + ratio + '% of original length';
hideProcessing();
btn.textContent = '\u2705 Done'; btn.disabled = false;

videos.forEach(v => { v.pause(); try{URL.revokeObjectURL(v.src)}catch(e){} });
if (musicNode) try{musicNode.stop()}catch(e){}
if (procCtx) try{procCtx.close()}catch(e){}

} catch (err) {
console.error(err);
status.textContent = 'Error: ' + (err.message||'Processing failed');
hideProcessing();
btn.textContent = '\u{1F504} Retry'; btn.disabled = false;
if (procCtx) try{procCtx.close()}catch(e){}
}
} // /renderFullEdit

// ──────────────── RESET ─────────────────
function resetEditorState() {
inputFiles=[];musicFile=null;musicBuffer=null;selectedTrack=null;beatTimestamps=[];bpm=0;
timelineSegments=[];timelineVideos=[];nextTimelineId=0;
musicTrimStart=0;musicTrimEnd=0;musicTrimDrag=null;musicTrimZoom=1;
stopMusicPreview();
$('#fileInput').value='';$('#musicInput').value='';
const pv = $('#videoPreview'); pv.pause(); pv.src = '';
$('#videoPreviewBox').style.display='none';
$('#singleInfo').style.display='none';$('#fileList').style.display='none';
$('#waveformWrap').classList.remove('show');$('#bpmBadge').classList.remove('show');
$$('.track-card').forEach(x=>x.classList.remove('active'));
$('#editorPanel').style.display='none';
$('#timelineSection').style.display='none';$('#timelinePreview').style.display='none';
$('#musicTrimSection').style.display='none';$('#musicAudioPreview').style.display='none';
$('#outputSection').style.display='none';$('#progressWrap').style.display='none';
$('#statusText').textContent='';$('#btnProcess').disabled=true;
$('#btnProcess').textContent='\u{1F4F9} Generate Edit';$('#outputVideo').src='';
$('#uploadZone h3').textContent=editMode==='montage'?'Upload your video clips':'Upload your video';
$('#uploadZone p').textContent='or click to browse \u2022 MP4, MOV, WebM';
$('#uploadZone').style.display='block';try{if(audioCtx){audioCtx.close();audioCtx=null}}catch(e){}
if(analysisVideoUrl){URL.revokeObjectURL(analysisVideoUrl);analysisVideoUrl=null}
analysisResults=[];$('#highlightSection').style.display='none';
$('#highlightContent').style.display='none';$('#highlightLoading').style.display='block';
exportAspect='16:9';exportRes=1080;
// Reset edit options
editOptions = { cut: true, highlights: false, beatSync: false, captions: false, effects: false, transitions: false, zoom: false, color: false };
$$('.edit-opt').forEach(e => e.classList.toggle('active', e.id === 'optCut'));
$$('.edit-opt input').forEach(i => i.checked = i.closest('#optCut') !== null);
closeManualClipSelector();
}

function fullReset(){goBack()}
