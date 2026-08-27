/* =============================================================
   app.js — SKINZ-2000 Photo Skin Machine Controller
   ============================================================= */

const MAX_DIM = 1400; // Crisp resolution

const $ = id => document.getElementById(id);

const uploadZone         = $('uploadZone');
const uploadSection      = $('uploadSection');
const workspace          = $('workspace');
const fileInput          = $('fileInput');
const originalCanvas     = $('originalCanvas');
const resultCanvas       = $('resultCanvas');
const resultLabel        = $('resultLabel');
const panelTypeTag       = $('panelTypeTag');
const skinCategoryTag    = $('skinCategoryTag');
const editorialBadge     = $('editorialBadge');
const editorialBadgeText = $('editorialBadgeText');
const toggleBadgeBtn     = $('toggleBadgeBtn');
const toggleCrtBtn       = $('toggleCrtBtn');
const crtOverlay         = $('crtOverlay');
const themesGrid         = $('themesGrid');
const categoryFilterRow  = $('categoryFilterRow');
const downloadBtn        = $('downloadBtn');
const resetBtn           = $('resetBtn');
const loadingOverlay     = $('loadingOverlay');
const placeholderOverlay = $('placeholderOverlay');
const liveClock          = $('liveClock');

let currentEffectId = null;
let imageLoaded     = false;
let showBadge       = true;
let crtEnabled      = false;
let currentFilter   = 'all';

// ─── Retro Clock ──────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  if (liveClock) {
    liveClock.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
  }
}
setInterval(updateClock, 1000);
updateClock();

// ─── CRT Scanline Toggle ──────────────────────────────────────

if (toggleCrtBtn) {
  toggleCrtBtn.addEventListener('click', () => {
    crtEnabled = !crtEnabled;
    crtOverlay.classList.toggle('crt-active', crtEnabled);
    toggleCrtBtn.classList.toggle('active', crtEnabled);
    toggleCrtBtn.textContent = `📺 CRT SCANLINES: ${crtEnabled ? 'ON' : 'OFF'}`;
  });
}

// ─── Title Badge Toggle ───────────────────────────────────────

if (toggleBadgeBtn) {
  toggleBadgeBtn.addEventListener('click', () => {
    showBadge = !showBadge;
    editorialBadge.hidden = !showBadge || !currentEffectId;
    toggleBadgeBtn.textContent = `🏷️ TITLE BADGE: ${showBadge ? 'ON' : 'OFF'}`;
    toggleBadgeBtn.classList.toggle('active', showBadge);
  });
}

// ─── Category Filter Tabs ─────────────────────────────────────

if (categoryFilterRow) {
  categoryFilterRow.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      categoryFilterRow.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      filterSkinsGrid();
    });
  });
}

function filterSkinsGrid() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    const effect = EFFECTS[btn.dataset.effect];
    if (currentFilter === 'all' || effect.tag === currentFilter) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });
}

// ─── Theme Buttons Initialization ────────────────────────────

function buildThemeButtons() {
  themesGrid.innerHTML = '';
  Object.entries(EFFECTS).forEach(([id, effect]) => {
    const btn = document.createElement('button');
    btn.className = 'theme-btn';
    btn.dataset.effect = id;
    btn.innerHTML = `
      <div class="theme-btn-top">
        <span class="theme-tag-badge">${effect.tag}</span>
        <span class="theme-icon">${effect.icon}</span>
      </div>
      <span class="theme-name">${effect.name}</span>
      <span class="theme-desc">${effect.desc}</span>
    `;
    btn.addEventListener('click', () => applySkin(id));
    themesGrid.appendChild(btn);
  });
}

// ─── File Upload Handling ─────────────────────────────────────

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img  = new Image();
  img.onload = () => { URL.revokeObjectURL(url); loadImage(img); };
  img.onerror = () => alert('Could not load photo — please try another file.');
  img.src = url;
}

function loadImage(img) {
  let w = img.naturalWidth, h = img.naturalHeight;
  if (w > MAX_DIM || h > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  originalCanvas.width  = w;
  originalCanvas.height = h;
  resultCanvas.width    = w;
  resultCanvas.height   = h;

  originalCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
  resultCanvas.getContext('2d').clearRect(0, 0, w, h);

  imageLoaded = true;
  currentEffectId = null;
  downloadBtn.disabled = true;
  resultLabel.textContent = 'ACTIVE SKIN';
  skinCategoryTag.textContent = 'READY';
  editorialBadge.hidden = true;

  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));

  placeholderOverlay.hidden = false;
  loadingOverlay.hidden     = true;
  uploadSection.hidden      = true;
  workspace.hidden          = false;

  // Auto-apply Electron Scan on load
  applySkin('electron-scan');
}

// ─── Apply Skin Effect ────────────────────────────────────────

async function applySkin(id) {
  if (!imageLoaded) return;
  currentEffectId = id;

  const effect = EFFECTS[id];

  // Update active state in grid
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-effect="${id}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  placeholderOverlay.hidden = true;
  loadingOverlay.hidden     = false;
  downloadBtn.disabled      = true;
  resultLabel.textContent   = effect.name.toUpperCase();
  skinCategoryTag.textContent = effect.tag;
  editorialBadgeText.textContent = effect.badge || effect.name.toUpperCase();

  if (showBadge) {
    editorialBadge.hidden = false;
  }

  // Yield frame so loading state appears on high-res photos
  await new Promise(r => setTimeout(r, 25));

  try {
    const rCtx = resultCanvas.getContext('2d');
    rCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    if (effect.type === 'pixel') {
      rCtx.drawImage(originalCanvas, 0, 0);
      const imgData = rCtx.getImageData(0, 0, resultCanvas.width, resultCanvas.height);
      effect.fn(imgData);
      rCtx.putImageData(imgData, 0, 0);
    } else if (effect.type === 'canvas') {
      effect.fn(originalCanvas, rCtx, resultCanvas.width, resultCanvas.height);
    }

    downloadBtn.disabled = false;
  } catch (err) {
    console.error('Error applying skin:', err);
    alert(`Could not process skin "${effect.name}".`);
  }

  loadingOverlay.hidden = true;
}

// ─── Download Visual Snapshot ─────────────────────────────────

downloadBtn.addEventListener('click', () => {
  if (!currentEffectId) return;
  const effect = EFFECTS[currentEffectId];

  const outCanvas = document.createElement('canvas');
  const outCtx = outCanvas.getContext('2d');
  outCanvas.width = resultCanvas.width;
  outCanvas.height = resultCanvas.height;

  outCtx.drawImage(resultCanvas, 0, 0);

  // Draw reference style editorial badge onto exported PNG if enabled
  if (showBadge) {
    const badgeText = effect.badge || effect.name.toUpperCase();
    const padX = outCanvas.width * 0.045;
    const padY = outCanvas.height * 0.02;
    const fontSize = Math.max(16, Math.round(outCanvas.width * 0.04));

    outCtx.font = `900 ${fontSize}px 'Syne', sans-serif`;
    const textMetrics = outCtx.measureText(badgeText);
    const boxW = textMetrics.width + padX * 2;
    const boxH = fontSize * 1.6 + padY;
    const boxX = (outCanvas.width - boxW) / 2;
    const boxY = outCanvas.height * 0.12;

    // Dark pill container
    outCtx.fillStyle = 'rgba(8, 8, 14, 0.88)';
    outCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    outCtx.lineWidth = Math.max(2, outCanvas.width * 0.002);

    outCtx.beginPath();
    outCtx.roundRect(boxX, boxY, boxW, boxH, boxH * 0.35);
    outCtx.fill();
    outCtx.stroke();

    // White bold typography
    outCtx.fillStyle = '#ffffff';
    outCtx.textAlign = 'center';
    outCtx.textBaseline = 'middle';
    outCtx.fillText(badgeText, outCanvas.width / 2, boxY + boxH / 2);
  }

  const a = document.createElement('a');
  a.download = `skinz2000-${effect.name.toLowerCase().replace(/[\s\W]+/g, '-')}.png`;
  a.href = outCanvas.toDataURL('image/png');
  a.click();
});

// ─── Reset / Eject ────────────────────────────────────────────

resetBtn.addEventListener('click', () => {
  uploadSection.hidden = false;
  workspace.hidden     = true;
  fileInput.value      = '';
  imageLoaded          = false;
  currentEffectId      = null;
  editorialBadge.hidden = true;
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
});

// ─── Init ─────────────────────────────────────────────────────

buildThemeButtons();
