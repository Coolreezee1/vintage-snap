/* =========================================================================
   VINTAGESNAP — main booth logic
   Everything runs client-side. Settings are written by admin.html into
   localStorage under SETTINGS_KEY and read here. No server, no upload.
========================================================================= */

const SETTINGS_KEY = 'vintagesnap_settings_v1';

const DEFAULT_SETTINGS = {
  brandTitle: 'vintagesnap',
  tagline: 'step in · strike a pose · take it home',
  shotOptions: [3, 4, 5],
  defaultShots: 3,
  allowUserChooseShots: true,
  filters: [
    { id: 'none',    label: 'Classic', css: 'none' },
    { id: 'bw',      label: 'B&W',     css: 'grayscale(1) contrast(1.05)' },
    { id: 'sepia',   label: 'Sepia',   css: 'sepia(.75) contrast(1.05) saturate(1.1)' },
    { id: 'vintage', label: 'Vintage', css: 'contrast(1.1) saturate(.75) brightness(1.05) sepia(.25)' },
  ],
  allowUserChooseFilter: true,
  defaultFilter: 'none',
  countdownSeconds: 3,
  strip: {
    background: '#f3ead8',
    frameColor: '#241f1b',
    accentColor: '#e8a33d',
    headerText: 'VINTAGESNAP',
    footerText: '{date}',
    showDate: true,
    showPerforations: true,
    logoDataUrl: ''
  }
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    // shallow-merge with defaults so missing keys (older saved settings) don't break the page
    return {
      ...structuredCloneSafe(DEFAULT_SETTINGS),
      ...parsed,
      strip: { ...DEFAULT_SETTINGS.strip, ...(parsed.strip || {}) }
    };
  } catch (e) {
    console.warn('Could not read saved settings, using defaults.', e);
    return structuredCloneSafe(DEFAULT_SETTINGS);
  }
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

const settings = loadSettings();

/* ---------------- DOM refs ---------------- */
const video = document.getElementById('video');
const placeholder = document.getElementById('placeholder');
const stage = document.getElementById('stage');
const startBtn = document.getElementById('startBtn');
const captureBtn = document.getElementById('captureBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
const statusLine = document.getElementById('statusLine');
const recIndicator = document.getElementById('recIndicator');
const countdownEl = document.getElementById('countdown');
const flashEl = document.getElementById('flash');
const shotCounterEl = document.getElementById('shotCounter');
const shotPillsWrap = document.getElementById('shotPills');
const filterPillsWrap = document.getElementById('filterPills');
const stripSlot = document.getElementById('stripSlot');
const stripCanvasWrap = document.getElementById('stripCanvasWrap');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const retakeBtn = document.getElementById('retakeBtn');
const toastEl = document.getElementById('toast');
const brandTitleEl = document.getElementById('brandTitle');
const brandTaglineEl = document.getElementById('brandTagline');

/* ---------------- apply branding ---------------- */
brandTitleEl.textContent = settings.brandTitle || DEFAULT_SETTINGS.brandTitle;
brandTaglineEl.textContent = settings.tagline || DEFAULT_SETTINGS.tagline;
document.title = (settings.brandTitle || 'VintageSnap') + ' — Photobooth';

/* ---------------- state ---------------- */
let stream = null;
let facingMode = 'user';
let currentShots = clamp(settings.defaultShots, settings.shotOptions);
let currentFilter = settings.filters.find(f => f.id === settings.defaultFilter) || settings.filters[0];
let captures = [];
let lastStripBlobUrl = null;
let busy = false;

function clamp(val, options) {
  return options.includes(val) ? val : options[0];
}

/* ---------------- build option pills ---------------- */
function buildShotPills() {
  shotPillsWrap.innerHTML = '';
  if (!settings.allowUserChooseShots) {
    document.getElementById('shotCountGroup').style.display = 'none';
    return;
  }
  settings.shotOptions.forEach(n => {
    const b = document.createElement('button');
    b.className = 'pill' + (n === currentShots ? ' active' : '');
    b.textContent = n + 'x';
    b.type = 'button';
    b.addEventListener('click', () => {
      currentShots = n;
      [...shotPillsWrap.children].forEach(c => c.classList.remove('active'));
      b.classList.add('active');
    });
    shotPillsWrap.appendChild(b);
  });
}

function buildFilterPills() {
  filterPillsWrap.innerHTML = '';
  if (!settings.allowUserChooseFilter) {
    document.getElementById('filterGroup').style.display = 'none';
    return;
  }
  settings.filters.forEach(f => {
    const b = document.createElement('button');
    b.className = 'pill' + (f.id === currentFilter.id ? ' active' : '');
    b.textContent = f.label;
    b.type = 'button';
    b.addEventListener('click', () => {
      currentFilter = f;
      video.style.filter = mirrorSafeFilter(f.css);
      [...filterPillsWrap.children].forEach(c => c.classList.remove('active'));
      b.classList.add('active');
    });
    filterPillsWrap.appendChild(b);
  });
}
function mirrorSafeFilter(css) { return css === 'none' ? '' : css; }

buildShotPills();
buildFilterPills();

/* ---------------- camera ---------------- */
async function startCamera() {
  if (busy) return;
  busy = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Requesting camera…';
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = stream;
    placeholder.style.display = 'none';
    statusLine.textContent = 'CAMERA READY';
    startBtn.style.display = 'none';
    captureBtn.style.display = 'inline-block';
    switchCamBtn.style.display = 'inline-block';
    video.style.filter = mirrorSafeFilter(currentFilter.css);
  } catch (err) {
    console.error(err);
    statusLine.textContent = 'CAMERA BLOCKED';
    showToast('Camera access was blocked. Check your browser permissions and try again.');
    startBtn.disabled = false;
    startBtn.textContent = 'Turn on camera';
  }
  busy = false;
}

switchCamBtn.addEventListener('click', () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  startCamera();
});

startBtn.addEventListener('click', startCamera);

/* ---------------- capture sequence ---------------- */
captureBtn.addEventListener('click', runCaptureSequence);

async function runCaptureSequence() {
  if (busy || !stream) return;
  busy = true;
  captures = [];
  captureBtn.disabled = true;
  switchCamBtn.style.display = 'none';
  recIndicator.style.visibility = 'visible';
  shotCounterEl.style.display = 'inline-block';

  for (let i = 0; i < currentShots; i++) {
    shotCounterEl.textContent = `${i + 1} / ${currentShots}`;
    await countdown(settings.countdownSeconds);
    await flashAndCapture();
    await wait(450);
  }

  shotCounterEl.style.display = 'none';
  recIndicator.style.visibility = 'hidden';
  captureBtn.disabled = false;
  busy = false;

  buildStrip();
}

function countdown(seconds) {
  return new Promise(resolve => {
    countdownEl.style.display = 'flex';
    let n = seconds;
    countdownEl.textContent = n;
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(iv);
        countdownEl.style.display = 'none';
        resolve();
      } else {
        countdownEl.textContent = n;
      }
    }, 1000);
  });
}

function flashAndCapture() {
  return new Promise(resolve => {
    flashEl.classList.remove('go');
    void flashEl.offsetWidth; // restart animation
    flashEl.classList.add('go');

    const off = document.createElement('canvas');
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;
    off.width = vw;
    off.height = vh;
    const ctx = off.getContext('2d');
    ctx.filter = mirrorSafeFilter(currentFilter.css) || 'none';
    // mirror horizontally to match what the user sees in the preview
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);
    captures.push(off.toDataURL('image/jpeg', 0.92));

    setTimeout(resolve, 220);
  });
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------------- strip compositing ---------------- */
function buildStrip() {
  const cfg = settings.strip;
  const cellAspect = 4 / 3; // matches capture request
  const stripWidth = 480;
  const margin = 26;
  const gap = 14;
  const cellW = stripWidth - margin * 2;
  const cellH = cellW / cellAspect;
  const headerH = 74;
  const footerH = 64;
  const perfSize = cfg.showPerforations ? 16 : 0;

  const stripHeight = headerH + footerH + captures.length * cellH + (captures.length - 1) * gap + margin;

  const canvas = document.createElement('canvas');
  canvas.width = stripWidth;
  canvas.height = stripHeight;
  const ctx = canvas.getContext('2d');

  // background
  ctx.fillStyle = cfg.background || '#f3ead8';
  ctx.fillRect(0, 0, stripWidth, stripHeight);

  // outer frame
  ctx.strokeStyle = cfg.frameColor || '#241f1b';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, stripWidth - 6, stripHeight - 6);

  // perforations along both sides
  if (perfSize) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    const step = 34;
    for (let y = step / 2; y < stripHeight; y += step) {
      ctx.beginPath();
      ctx.arc(18, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(stripWidth - 18, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // header
  ctx.fillStyle = cfg.frameColor || '#241f1b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (cfg.logoDataUrl) {
    drawHeaderWithLogo(ctx, cfg, stripWidth, headerH);
  } else {
    ctx.font = '700 30px Anton, Arial Narrow, sans-serif';
    ctx.fillText(cfg.headerText || settings.brandTitle || 'VINTAGESNAP', stripWidth / 2, headerH / 2 + 6, stripWidth - margin * 2);
  }

  // accent rule under header
  ctx.strokeStyle = cfg.accentColor || '#e8a33d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(margin, headerH - 6);
  ctx.lineTo(stripWidth - margin, headerH - 6);
  ctx.stroke();

  // photo cells + then draw images async
  let y = headerH + (margin - headerH > 0 ? 0 : 8);
  y = headerH + 10;
  const positions = [];
  for (let i = 0; i < captures.length; i++) {
    positions.push(y);
    y += cellH + gap;
  }

  const loaders = captures.map((src, i) => loadImage(src).then(img => {
    const py = positions[i];
    ctx.save();
    roundedRectPath(ctx, margin, py, cellW, cellH, 6);
    ctx.clip();
    drawImageCover(ctx, img, margin, py, cellW, cellH);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    roundedRectPath(ctx, margin, py, cellW, cellH, 6);
    ctx.stroke();
  }));

  Promise.all(loaders).then(() => {
    // footer text
    const footerY = headerH + captures.length * cellH + (captures.length - 1) * gap + 24;
    ctx.fillStyle = cfg.frameColor || '#241f1b';
    ctx.font = '700 15px "Space Mono", monospace';
    let footerText = cfg.footerText || '';
    if (cfg.showDate) {
      const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      footerText = footerText.replace('{date}', dateStr);
      if (!footerText.includes(dateStr) && !cfg.footerText) footerText = dateStr;
    } else {
      footerText = footerText.replace('{date}', '').trim();
    }
    ctx.fillText(footerText, stripWidth / 2, footerY, stripWidth - margin * 2);

    finalizeStrip(canvas);
  });
}

function drawHeaderWithLogo(ctx, cfg, stripWidth, headerH) {
  const img = new Image();
  img.src = cfg.logoDataUrl;
  // draw synchronously if already cached; else fall back to text now and redraw when loaded
  const drawText = () => {
    ctx.font = '700 30px Anton, Arial Narrow, sans-serif';
    ctx.fillText(cfg.headerText || 'VINTAGESNAP', stripWidth / 2, headerH / 2 + 6);
  };
  if (img.complete && img.naturalWidth) {
    const h = headerH - 20;
    const w = h * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, stripWidth / 2 - w / 2, 10, w, h);
  } else {
    drawText();
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawImageCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const dr = w / h;
  let sx, sy, sw, sh;
  if (ir > dr) {
    sh = img.height;
    sw = sh * dr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / dr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function finalizeStrip(canvas) {
  stripCanvasWrap.innerHTML = '';
  stripCanvasWrap.appendChild(canvas);
  stripSlot.style.display = 'block';
  stripSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });

  canvas.toBlob(blob => {
    if (lastStripBlobUrl) URL.revokeObjectURL(lastStripBlobUrl);
    lastStripBlobUrl = URL.createObjectURL(blob);
    downloadBtn.dataset.ready = '1';
  }, 'image/png', 0.95);
}

/* ---------------- download / share / retake ---------------- */
downloadBtn.addEventListener('click', () => {
  const canvas = stripCanvasWrap.querySelector('canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `${(settings.brandTitle || 'vintagesnap').toLowerCase().replace(/\s+/g, '-')}-strip.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Strip saved to your downloads.');
});

shareBtn.addEventListener('click', async () => {
  const canvas = stripCanvasWrap.querySelector('canvas');
  if (!canvas) return;
  canvas.toBlob(async blob => {
    const fileName = `${(settings.brandTitle || 'vintagesnap').toLowerCase().replace(/\s+/g, '-')}-strip.png`;
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: settings.brandTitle || 'VintageSnap',
          text: 'My photobooth strip!'
        });
      } catch (err) {
        if (err.name !== 'AbortError') showToast('Could not open the share sheet. Try downloading instead.');
      }
    } else {
      // fallback: copy image to clipboard if possible, else just download
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Sharing isn\u2019t supported here — copied the image instead, paste it anywhere.');
      } catch {
        showToast('Sharing isn\u2019t supported on this browser — use Download instead.');
      }
    }
  }, 'image/png', 0.95);
});

retakeBtn.addEventListener('click', () => {
  captures = [];
  stripSlot.style.display = 'none';
  stripCanvasWrap.innerHTML = '';
  switchCamBtn.style.display = stream ? 'inline-block' : 'none';
});

/* ---------------- toast ---------------- */
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
}

/* stop camera cleanly if the tab is closed/hidden for a long time */
window.addEventListener('beforeunload', () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
});
