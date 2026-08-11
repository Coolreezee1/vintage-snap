/* =========================================================================
   VINTAGESNAP — admin logic
   Client-side only. The login gate is a convenience lock for kiosk use,
   not a secure authentication system — see the note in the Account tab.
========================================================================= */

const SETTINGS_KEY = 'vintagesnap_settings_v1';
const AUTH_KEY = 'vintagesnap_admin_auth_v1';
const SESSION_KEY = 'vintagesnap_admin_signedin';

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

/* ---------------- crypto helpers ---------------- */
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureAuthSeed() {
  if (!localStorage.getItem(AUTH_KEY)) {
    const hash = await sha256Hex('admin123');
    localStorage.setItem(AUTH_KEY, JSON.stringify({ username: 'admin', hash }));
  }
}

function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); }
  catch { return null; }
}

/* ---------------- settings helpers ---------------- */
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredCloneSafe(DEFAULT_SETTINGS),
      ...parsed,
      strip: { ...DEFAULT_SETTINGS.strip, ...(parsed.strip || {}) }
    };
  } catch {
    return structuredCloneSafe(DEFAULT_SETTINGS);
  }
}
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

let settings = loadSettings();

/* ---------------- DOM refs ---------------- */
const loginView = document.getElementById('loginView');
const dashView = document.getElementById('dashView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const signedInAs = document.getElementById('signedInAs');
const logoutBtn = document.getElementById('logoutBtn');
const toastEl = document.getElementById('toast');

/* field refs */
const f = {
  brandTitle: document.getElementById('brandTitle'),
  tagline: document.getElementById('tagline'),
  stripBg: document.getElementById('stripBg'),
  stripBgVal: document.getElementById('stripBgVal'),
  stripFrame: document.getElementById('stripFrame'),
  stripFrameVal: document.getElementById('stripFrameVal'),
  stripAccent: document.getElementById('stripAccent'),
  stripAccentVal: document.getElementById('stripAccentVal'),
  stripHeader: document.getElementById('stripHeader'),
  stripFooter: document.getElementById('stripFooter'),
  showDate: document.getElementById('showDate'),
  showPerf: document.getElementById('showPerf'),
  logoPreview: document.getElementById('logoPreview'),
  logoInput: document.getElementById('logoInput'),
  clearLogoBtn: document.getElementById('clearLogoBtn'),
  shotOptions: document.getElementById('shotOptions'),
  defaultShots: document.getElementById('defaultShots'),
  allowChooseShots: document.getElementById('allowChooseShots'),
  countdownSeconds: document.getElementById('countdownSeconds'),
  allowChooseFilter: document.getElementById('allowChooseFilter'),
  defaultFilter: document.getElementById('defaultFilter'),
};

/* ---------------- boot ---------------- */
(async function boot() {
  await ensureAuthSeed();
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    showDashboard();
  }
})();

/* ---------------- login ---------------- */
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const auth = getAuth();
  const hash = await sha256Hex(pass);
  if (auth && user === auth.username && hash === auth.hash) {
    sessionStorage.setItem(SESSION_KEY, '1');
    showDashboard();
  } else {
    loginError.textContent = 'Incorrect username or password.';
  }
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  loginView.style.display = 'block';
  dashView.style.display = 'none';
  document.getElementById('loginPass').value = '';
});

function showDashboard() {
  loginView.style.display = 'none';
  dashView.style.display = 'block';
  const auth = getAuth();
  signedInAs.textContent = `signed in as ${auth ? auth.username : 'staff'}`;
  populateForm();
  renderPreview();
}

/* ---------------- tabs ---------------- */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ---------------- populate form from settings ---------------- */
function populateForm() {
  f.brandTitle.value = settings.brandTitle;
  f.tagline.value = settings.tagline;

  f.stripBg.value = settings.strip.background;
  f.stripBgVal.textContent = settings.strip.background;
  f.stripFrame.value = settings.strip.frameColor;
  f.stripFrameVal.textContent = settings.strip.frameColor;
  f.stripAccent.value = settings.strip.accentColor;
  f.stripAccentVal.textContent = settings.strip.accentColor;

  f.stripHeader.value = settings.strip.headerText;
  f.stripFooter.value = settings.strip.footerText;
  f.showDate.checked = !!settings.strip.showDate;
  f.showPerf.checked = !!settings.strip.showPerforations;
  renderLogoPreview();

  f.shotOptions.value = settings.shotOptions.join(',');
  f.allowChooseShots.checked = !!settings.allowUserChooseShots;
  f.countdownSeconds.value = settings.countdownSeconds;

  f.allowChooseFilter.checked = !!settings.allowUserChooseFilter;
  populateSelectOptions(f.defaultShots, settings.shotOptions.map(n => ({ value: n, label: n + ' shots' })), settings.defaultShots);
  populateSelectOptions(f.defaultFilter, settings.filters.map(fl => ({ value: fl.id, label: fl.label })), settings.defaultFilter);
}

function populateSelectOptions(selectEl, options, selectedValue) {
  selectEl.innerHTML = '';
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (String(o.value) === String(selectedValue)) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function renderLogoPreview() {
  if (settings.strip.logoDataUrl) {
    f.logoPreview.innerHTML = `<img src="${settings.strip.logoDataUrl}" alt="logo preview">`;
  } else {
    f.logoPreview.innerHTML = 'no logo';
  }
}

/* live label updates for color pickers */
[['stripBg', 'stripBgVal'], ['stripFrame', 'stripFrameVal'], ['stripAccent', 'stripAccentVal']].forEach(([inputId, labelId]) => {
  f[inputId].addEventListener('input', () => {
    f[labelId].textContent = f[inputId].value;
    renderPreview();
  });
});

['stripHeader', 'stripFooter', 'showDate', 'showPerf'].forEach(id => {
  f[id].addEventListener('input', renderPreview);
  f[id].addEventListener('change', renderPreview);
});

/* re-render preview and shot dropdown when shot options text changes */
f.shotOptions.addEventListener('change', () => {
  const opts = parseShotOptions(f.shotOptions.value);
  populateSelectOptions(f.defaultShots, opts.map(n => ({ value: n, label: n + ' shots' })), opts[0]);
});

function parseShotOptions(str) {
  const nums = str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0 && n <= 10);
  return nums.length ? [...new Set(nums)] : [3, 4, 5];
}

/* ---------------- logo upload ---------------- */
f.logoInput.addEventListener('change', () => {
  const file = f.logoInput.files[0];
  if (!file) return;
  if (file.size > 800 * 1024) {
    showToast('That logo is a bit large — try an image under 800KB.');
    f.logoInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    settings.strip.logoDataUrl = reader.result;
    renderLogoPreview();
    renderPreview();
  };
  reader.readAsDataURL(file);
});

f.clearLogoBtn.addEventListener('click', () => {
  settings.strip.logoDataUrl = '';
  f.logoInput.value = '';
  renderLogoPreview();
  renderPreview();
});

/* ---------------- collect form -> settings ---------------- */
function collectSettingsFromForm() {
  const shotOptions = parseShotOptions(f.shotOptions.value);
  const defaultShots = clampToOptions(parseInt(f.defaultShots.value, 10), shotOptions);

  settings.brandTitle = f.brandTitle.value.trim() || DEFAULT_SETTINGS.brandTitle;
  settings.tagline = f.tagline.value.trim();

  settings.strip.background = f.stripBg.value;
  settings.strip.frameColor = f.stripFrame.value;
  settings.strip.accentColor = f.stripAccent.value;
  settings.strip.headerText = f.stripHeader.value.trim() || 'VINTAGESNAP';
  settings.strip.footerText = f.stripFooter.value;
  settings.strip.showDate = f.showDate.checked;
  settings.strip.showPerforations = f.showPerf.checked;
  // logoDataUrl already kept live on settings object via upload handler

  settings.shotOptions = shotOptions;
  settings.defaultShots = defaultShots;
  settings.allowUserChooseShots = f.allowChooseShots.checked;
  settings.countdownSeconds = Math.min(10, Math.max(1, parseInt(f.countdownSeconds.value, 10) || 3));

  settings.allowUserChooseFilter = f.allowChooseFilter.checked;
  settings.defaultFilter = f.defaultFilter.value;

  return settings;
}
function clampToOptions(val, options) { return options.includes(val) ? val : options[0]; }

/* ---------------- save ---------------- */
document.getElementById('saveBtn').addEventListener('click', () => {
  collectSettingsFromForm();
  saveSettings(settings);
  showToast('Settings saved. Reload the booth page to see changes.');
  document.getElementById('saveHint').textContent = 'Saved just now.';
  renderPreview();
});

/* ---------------- live preview ---------------- */
function renderPreview() {
  collectSettingsFromForm();
  const box = document.getElementById('stripPreviewBox');
  box.innerHTML = '';
  const canvas = buildPreviewStrip(settings, 3);
  box.appendChild(canvas);
}

function buildPreviewStrip(cfgAll, shotCount) {
  const cfg = cfgAll.strip;
  const stripWidth = 320;
  const margin = 18;
  const gap = 10;
  const cellW = stripWidth - margin * 2;
  const cellH = cellW / (4 / 3);
  const headerH = 50;
  const footerH = 44;

  const stripHeight = headerH + footerH + shotCount * cellH + (shotCount - 1) * gap + margin;
  const canvas = document.createElement('canvas');
  canvas.width = stripWidth;
  canvas.height = stripHeight;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = cfg.background;
  ctx.fillRect(0, 0, stripWidth, stripHeight);
  ctx.strokeStyle = cfg.frameColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, stripWidth - 4, stripHeight - 4);

  if (cfg.showPerforations) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    const step = 26;
    for (let y = step / 2; y < stripHeight; y += step) {
      ctx.beginPath(); ctx.arc(12, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(stripWidth - 12, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cfg.frameColor;

  const drawHeader = () => {
    ctx.font = '700 20px Anton, Arial Narrow, sans-serif';
    ctx.fillText(cfg.headerText || 'VINTAGESNAP', stripWidth / 2, headerH / 2 + 4, stripWidth - margin * 2);
    drawRuleAndBody();
  };

  const drawRuleAndBody = () => {
    ctx.strokeStyle = cfg.accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, headerH - 5);
    ctx.lineTo(stripWidth - margin, headerH - 5);
    ctx.stroke();

    let y = headerH + 8;
    for (let i = 0; i < shotCount; i++) {
      ctx.fillStyle = '#c9c0aa';
      roundedRectPath(ctx, margin, y, cellW, cellH, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(36,31,27,0.45)';
      ctx.font = '600 12px "Space Mono", monospace';
      ctx.fillText('photo ' + (i + 1), stripWidth / 2, y + cellH / 2);
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.lineWidth = 1;
      roundedRectPath(ctx, margin, y, cellW, cellH, 5);
      ctx.stroke();
      y += cellH + gap;
    }

    const footerY = headerH + shotCount * cellH + (shotCount - 1) * gap + 20;
    ctx.fillStyle = cfg.frameColor;
    ctx.font = '700 11px "Space Mono", monospace';
    let footerText = cfg.footerText || '';
    if (cfg.showDate) {
      const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      footerText = footerText.includes('{date}') ? footerText.replace('{date}', dateStr) : (footerText || dateStr);
    } else {
      footerText = footerText.replace('{date}', '').trim();
    }
    ctx.fillText(footerText, stripWidth / 2, footerY, stripWidth - margin * 2);
  };

  if (cfg.logoDataUrl) {
    const img = new Image();
    img.onload = () => {
      const h = headerH - 14;
      const w = h * (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, stripWidth / 2 - w / 2, 7, w, h);
      drawRuleAndBody();
    };
    img.onerror = drawHeader;
    img.src = cfg.logoDataUrl;
    if (img.complete && img.naturalWidth) { // cached
      const h = headerH - 14;
      const w = h * (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, stripWidth / 2 - w / 2, 7, w, h);
      drawRuleAndBody();
    }
  } else {
    drawHeader();
  }

  return canvas;
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

/* ---------------- change credentials ---------------- */
document.getElementById('changeCredsBtn').addEventListener('click', async () => {
  const msg = document.getElementById('credsMsg');
  msg.style.color = '#e08585';
  msg.textContent = '';

  const curPass = document.getElementById('curPass').value;
  const newUser = document.getElementById('newUser').value.trim();
  const newPass = document.getElementById('newPass').value;
  const newPass2 = document.getElementById('newPass2').value;

  const auth = getAuth();
  const curHash = await sha256Hex(curPass);
  if (!auth || curHash !== auth.hash) {
    msg.textContent = 'Current password is incorrect.';
    return;
  }
  if (!newPass && !newUser) {
    msg.textContent = 'Enter a new username and/or password to update.';
    return;
  }
  if (newPass && newPass.length < 6) {
    msg.textContent = 'New password should be at least 6 characters.';
    return;
  }
  if (newPass && newPass !== newPass2) {
    msg.textContent = 'New passwords do not match.';
    return;
  }

  const updated = {
    username: newUser || auth.username,
    hash: newPass ? await sha256Hex(newPass) : auth.hash
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
  signedInAs.textContent = `signed in as ${updated.username}`;
  document.getElementById('curPass').value = '';
  document.getElementById('newUser').value = '';
  document.getElementById('newPass').value = '';
  document.getElementById('newPass2').value = '';
  msg.style.color = '#8fbf8f';
  msg.textContent = 'Login updated.';
});

/* ---------------- export / import / reset ---------------- */
document.getElementById('exportBtn').addEventListener('click', () => {
  collectSettingsFromForm();
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vintagesnap-settings.json';
  a.click();
});

document.getElementById('importInput').addEventListener('change', () => {
  const file = document.getElementById('importInput').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      settings = {
        ...structuredCloneSafe(DEFAULT_SETTINGS),
        ...parsed,
        strip: { ...DEFAULT_SETTINGS.strip, ...(parsed.strip || {}) }
      };
      saveSettings(settings);
      populateForm();
      renderPreview();
      showToast('Settings imported and saved.');
    } catch {
      showToast('That file could not be read as valid settings JSON.');
    }
  };
  reader.readAsText(file);
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset all booth settings to defaults? This cannot be undone.')) return;
  settings = structuredCloneSafe(DEFAULT_SETTINGS);
  saveSettings(settings);
  populateForm();
  renderPreview();
  showToast('Settings reset to defaults.');
});

/* ---------------- toast ---------------- */
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
}
