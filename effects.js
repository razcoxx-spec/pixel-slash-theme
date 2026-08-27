/* =============================================================
   effects.js — PHOTO SKIN & THEME PROCESSOR ENGINE
   Monochrome, Darkroom, Print, Glitch & Halftone Looks
   ============================================================= */

// ─── Math & Color Utility Helpers ────────────────────────────

function clamp(v, lo = 0, hi = 255) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t)  { return a + (b - a) * t; }
function getBrightness(r, g, b) { return r * 0.299 + g * 0.587 + b * 0.114; }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  function hue(t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  return [Math.round(hue(h + 1/3)*255), Math.round(hue(h)*255), Math.round(hue(h - 1/3)*255)];
}

function separableBoxBlur(src, w, h, r) {
  const temp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w) { s += src[y * w + nx]; n++; }
      }
      temp[y * w + x] = s / n;
    }
  }
  const dst = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < h) { s += temp[ny * w + x]; n++; }
      }
      dst[y * w + x] = s / n;
    }
  }
  return dst;
}


// ─── 1. Electron Scan (Luminous Floating Silhouette on Black) ─
function skinElectronScan(imageData) {
  const d = imageData.data;
  const w = imageData.width, h = imageData.height;

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = getBrightness(d[i*4], d[i*4+1], d[i*4+2]);
  }

  // Sobel edge detector
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -gray[(y-1)*w+(x-1)] + gray[(y-1)*w+(x+1)]
                 -2*gray[y*w+(x-1)]   + 2*gray[y*w+(x+1)]
                 -gray[(y+1)*w+(x-1)] + gray[(y+1)*w+(x+1)];
      const gy = -gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)]
                 +gray[(y+1)*w+(x-1)] + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)];
      edges[y*w+x] = Math.min(255, Math.sqrt(gx*gx + gy*gy) * 2.8);
    }
  }

  const glowR = Math.max(3, Math.floor(Math.min(w, h) / 130));
  const glow  = separableBoxBlur(edges, w, h, glowR);

  for (let i = 0; i < w * h; i++) {
    const leveled   = clamp((gray[i] - 50) / (170 - 50) * 255);
    const glowBoost = Math.min(130, glow[i] * 0.95);
    const v = clamp(leveled * 0.68 + glowBoost);
    d[i*4] = v; d[i*4+1] = v; d[i*4+2] = v;
  }
  return imageData;
}


// ─── 2. Screen Clash (Halftone CMYK / Color Fringing Print) ───
function skinScreenClash(imageData) {
  const d = imageData.data;
  const w = imageData.width, h = imageData.height;
  const src = new Uint8ClampedArray(d);

  // Pale paper background
  d.fill(250);
  for (let i = 3; i < d.length; i += 4) d[i] = 255;

  const cell = 5;
  const half = cell / 2;
  const maxR = cell * 0.62;

  const cOff = { x: -2, y: -2 };
  const mOff = { x:  2, y:  2 };
  const yOff = { x: -1, y:  1 };

  function getPx(x, y) {
    const px = clamp(Math.round(x), 0, w - 1);
    const py = clamp(Math.round(y), 0, h - 1);
    const idx = (py * w + px) * 4;
    return [src[idx], src[idx+1], src[idx+2]];
  }

  function drawDot(cx, cy, radius, inkR, inkG, inkB) {
    const ri = Math.ceil(radius);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx*dx + dy*dy <= radius*radius) {
          const px = Math.round(cx+dx), py = Math.round(cy+dy);
          if (px >= 0 && px < w && py >= 0 && py < h) {
            const i = (py*w+px)*4;
            d[i]   = Math.round(d[i]   * inkR / 255);
            d[i+1] = Math.round(d[i+1] * inkG / 255);
            d[i+2] = Math.round(d[i+2] * inkB / 255);
          }
        }
      }
    }
  }

  for (let cy = half; cy < h; cy += cell) {
    for (let cx = half; cx < w; cx += cell) {
      const cPx = getPx(cx + cOff.x, cy + cOff.y);
      const mPx = getPx(cx + mOff.x, cy + mOff.y);
      const yPx = getPx(cx + yOff.x, cy + yOff.y);

      const cInk = 1 - cPx[0]/255;
      const mInk = 1 - mPx[1]/255;
      const yInk = (1 - yPx[2]/255) * 0.85;

      if (cInk > 0.05) drawDot(cx + cOff.x, cy + cOff.y, cInk * maxR, 0, 240, 255);
      if (mInk > 0.05) drawDot(cx + mOff.x, cy + mOff.y, mInk * maxR, 255, 0, 180);
      if (yInk > 0.05) drawDot(cx + yOff.x, cy + yOff.y, yInk * maxR, 255, 230, 0);
    }
  }
  return imageData;
}


// ─── 3. Pixel Sort (Glitch Art Luminance Sorter) ──────────────
function skinPixelSort(imageData) {
  const d = imageData.data;
  const w = imageData.width, h = imageData.height;
  const THRESHOLD = 52;

  for (let x = 0; x < w; x++) {
    let segStart = -1;
    for (let y = 0; y <= h; y++) {
      const bright = y < h
        ? getBrightness(d[(y*w+x)*4], d[(y*w+x)*4+1], d[(y*w+x)*4+2])
        : -1;
      if (bright > THRESHOLD && segStart === -1) {
        segStart = y;
      } else if ((bright <= THRESHOLD || y === h) && segStart !== -1) {
        const segLen = y - segStart;
        if (segLen > 1) {
          const pixels = [];
          for (let sy = segStart; sy < y; sy++) {
            const si = (sy*w+x)*4;
            pixels.push([d[si], d[si+1], d[si+2], d[si+3]]);
          }
          pixels.sort((a, b) => getBrightness(a[0],a[1],a[2]) - getBrightness(b[0],b[1],b[2]));
          for (let j = 0; j < segLen; j++) {
            const di = ((segStart+j)*w+x)*4;
            d[di]=pixels[j][0]; d[di+1]=pixels[j][1];
            d[di+2]=pixels[j][2]; d[di+3]=pixels[j][3];
          }
        }
        segStart = -1;
      }
    }
  }
  return imageData;
}


// ─── 4. Pixel Lace (Woven Cross-Stitch Embroidery) ────────────
function skinPixelLace(srcCanvas, dstCtx, dstW, dstH) {
  const srcCtx = srcCanvas.getContext('2d');
  const srcW = srcCanvas.width, srcH = srcCanvas.height;
  const pxData = srcCtx.getImageData(0, 0, srcW, srcH).data;

  dstCtx.save();
  dstCtx.scale(dstW / srcW, dstH / srcH);

  // Charcoal linen background
  dstCtx.fillStyle = '#101018';
  dstCtx.fillRect(0, 0, srcW, srcH);

  const cell = 6;

  // Weave lines
  dstCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  dstCtx.lineWidth = 0.35;
  for (let x = 0; x < srcW; x += cell) {
    dstCtx.beginPath(); dstCtx.moveTo(x, 0); dstCtx.lineTo(x, srcH); dstCtx.stroke();
  }
  for (let y = 0; y < srcH; y += cell) {
    dstCtx.beginPath(); dstCtx.moveTo(0, y); dstCtx.lineTo(srcW, y); dstCtx.stroke();
  }

  dstCtx.lineCap = 'round';

  for (let cy = cell/2; cy < srcH; cy += cell) {
    for (let cx = cell/2; cx < srcW; cx += cell) {
      const px = clamp(Math.round(cx), 0, srcW-1);
      const py = clamp(Math.round(cy), 0, srcH-1);
      const i  = (py * srcW + px) * 4;
      const r = pxData[i], g = pxData[i+1], b = pxData[i+2];
      const bright = getBrightness(r, g, b) / 255;
      if (bright < 0.06) continue;

      const sz    = bright * cell * 0.88;
      const alpha = Math.min(1, 0.40 + bright * 0.60);

      dstCtx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      dstCtx.lineWidth   = 0.85 + bright * 0.60;

      // X stitch
      dstCtx.beginPath();
      dstCtx.moveTo(cx - sz/2, cy - sz/2); dstCtx.lineTo(cx + sz/2, cy + sz/2);
      dstCtx.stroke();
      dstCtx.beginPath();
      dstCtx.moveTo(cx + sz/2, cy - sz/2); dstCtx.lineTo(cx - sz/2, cy + sz/2);
      dstCtx.stroke();

      // Dense cross in highlights
      if (bright > 0.55) {
        dstCtx.lineWidth = 0.60;
        dstCtx.strokeStyle = `rgba(255,255,255,${(alpha*0.75).toFixed(2)})`;
        dstCtx.beginPath();
        dstCtx.moveTo(cx - sz/2, cy); dstCtx.lineTo(cx + sz/2, cy); dstCtx.stroke();
        dstCtx.beginPath();
        dstCtx.moveTo(cx, cy - sz/2); dstCtx.lineTo(cx, cy + sz/2); dstCtx.stroke();
      }
    }
  }
  dstCtx.restore();
}


// ─── 5. Cyanotype (Prussian Blue Archival Blueprint) ──────────
function skinCyanotype(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = getBrightness(d[i], d[i+1], d[i+2]);
    const c = clamp((gray - 135) * 2.4 + 90);
    const t = c / 255;
    const grain = (Math.random() - 0.5) * 8;

    // Deep Prussian blue shadows -> pale cyan/white highlights
    d[i]   = clamp(lerp(2,   195, t) + grain);
    d[i+1] = clamp(lerp(14,  232, t) + grain);
    d[i+2] = clamp(lerp(55,  255, t) + grain);
  }
  return imageData;
}


// ─── 6. X-Ray Scan (Technical Radiograph) ─────────────────────
function skinXRayScan(imageData) {
  const d = imageData.data;
  const w = imageData.width, h = imageData.height;

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = getBrightness(d[i*4], d[i*4+1], d[i*4+2]);
  }

  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -gray[(y-1)*w+(x-1)] + gray[(y-1)*w+(x+1)]
                 -2*gray[y*w+(x-1)]   + 2*gray[y*w+(x+1)]
                 -gray[(y+1)*w+(x-1)] + gray[(y+1)*w+(x+1)];
      const gy = -gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)]
                 +gray[(y+1)*w+(x-1)] + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)];
      edges[y*w+x] = Math.min(255, Math.sqrt(gx*gx + gy*gy) * 2.6);
    }
  }
  const glow = separableBoxBlur(edges, w, h, Math.max(3, Math.floor(Math.min(w, h) / 120)));

  for (let i = 0; i < w * h; i++) {
    const inv = 255 - gray[i];
    const lum = clamp((inv - 60) * 1.8 + glow[i] * 0.85);
    const t = lum / 255;
    const noise = (Math.random() - 0.5) * 6;

    d[i*4]   = clamp(lerp(6, 215, t) + noise);
    d[i*4+1] = clamp(lerp(14, 235, t) + noise);
    d[i*4+2] = clamp(lerp(35, 255, t) + noise);
  }
  return imageData;
}


// ─── 7. Aerochrome (Infrared False Color) ─────────────────────
function skinAerochrome(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    let [h, s, l] = rgbToHsl(r, g, b);

    if (h >= 0.16 && h <= 0.48 && s > 0.15) {
      h = 0.94;
      s = Math.min(1, s * 1.8);
      l = clamp(l * 1.15, 0, 1);
    } else if (h >= 0.49 && h <= 0.65) {
      h = 0.54;
      s = Math.min(1, s * 1.3);
    }

    const [nr, ng, nb] = hslToRgb(h, s, l);
    const grain = (Math.random() - 0.5) * 8;
    d[i]   = clamp(nr + grain);
    d[i+1] = clamp(ng + grain);
    d[i+2] = clamp(nb + grain);
  }
  return imageData;
}


// ─── 8. Banknote Engraving (Currency Guilloche) ───────────────
function skinBanknote(srcCanvas, dstCtx, dstW, dstH) {
  const srcCtx = srcCanvas.getContext('2d');
  const srcW = srcCanvas.width, srcH = srcCanvas.height;
  const data = srcCtx.getImageData(0, 0, srcW, srcH).data;

  dstCtx.save();
  dstCtx.scale(dstW / srcW, dstH / srcH);

  dstCtx.fillStyle = '#e5ece1';
  dstCtx.fillRect(0, 0, srcW, srcH);

  const lineSpacing = 4;
  dstCtx.strokeStyle = '#18382c';

  for (let y = 0; y < srcH; y += lineSpacing) {
    dstCtx.beginPath();
    let started = false;
    for (let x = 0; x < srcW; x += 2) {
      const pi = (y * srcW + x) * 4;
      const darkness = 1 - getBrightness(data[pi], data[pi+1], data[pi+2]) / 255;
      const wave = Math.sin(x * 0.15) * (darkness * 2.8);
      const drawY = y + wave;

      if (!started) { dstCtx.moveTo(x, drawY); started = true; }
      else { dstCtx.lineTo(x, drawY); }
    }
    dstCtx.lineWidth = 0.75;
    dstCtx.stroke();
  }
  dstCtx.restore();
}


// ─── 9. Wire Photo (1970s Press Telephoto Facsimile) ──────────
function skinWirePhoto(imageData) {
  const d = imageData.data;
  const w = imageData.width, h = imageData.height;

  for (let y = 0; y < h; y++) {
    const scanMod = (y % 2 === 0) ? 0.72 : 1.15;
    const jitter = Math.sin(y * 0.8) * 3;

    for (let x = 0; x < w; x++) {
      const sampleX = clamp(Math.round(x + jitter), 0, w - 1);
      const i = (y * w + sampleX) * 4;
      const gray = getBrightness(d[i], d[i+1], d[i+2]);
      const boosted = clamp((gray - 120) * 1.9 + 120);
      const noise = (Math.random() - 0.5) * 18;
      const v = clamp((boosted + noise) * scanMod);

      const di = (y * w + x) * 4;
      d[di]   = clamp(v * 1.02);
      d[di+1] = clamp(v * 0.98);
      d[di+2] = clamp(v * 0.88);
    }
  }
  return imageData;
}


// ─── 10. Night Vision (Military Phosphor NVG) ─────────────────
function skinNightVision(imageData) {
  const d = imageData.data;
  const w = imageData.width, h = imageData.height;
  const cx = w / 2, cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const gray = getBrightness(d[i], d[i+1], d[i+2]);
      const dist = Math.sqrt((x-cx)*(x-cx) + (y-cy)*(y-cy));
      const vignette = Math.max(0.15, 1 - Math.pow(dist / maxR, 2.2));
      const noise = (Math.random() + Math.random() - 1) * 28;
      const boosted = clamp((gray - 40) * 1.6 + 60);
      const intensity = clamp((boosted + noise) * vignette);

      d[i]   = clamp(intensity * 0.20);
      d[i+1] = clamp(intensity * 0.98);
      d[i+2] = clamp(intensity * 0.28);
    }
  }
  return imageData;
}


// ─── 11. LED Matrix (RGB Diode Monitor) ───────────────────────
function skinLEDMatrix(imageData) {
  const d = imageData.data;
  const w = imageData.width, h = imageData.height;
  const src = new Uint8ClampedArray(d);

  d.fill(0);
  for (let i = 3; i < d.length; i += 4) d[i] = 255;

  const cell = 4;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const pi = (y * w + x) * 4;
      const r = src[pi], g = src[pi+1], b = src[pi+2];

      for (let dy = 0; dy < cell - 1; dy++) {
        const py = y + dy;
        if (py >= h) continue;
        if (x < w) {
          const idx = (py * w + x) * 4;
          d[idx] = r; d[idx+1] = 0; d[idx+2] = 0;
        }
        if (x + 1 < w) {
          const idx = (py * w + (x + 1)) * 4;
          d[idx] = 0; d[idx+1] = g; d[idx+2] = 0;
        }
        if (x + 2 < w) {
          const idx = (py * w + (x + 2)) * 4;
          d[idx] = 0; d[idx+1] = 0; d[idx+2] = b;
        }
      }
    }
  }
  return imageData;
}


// ─── 12. Giallo Gels (70s Italian Cinema Lighting) ────────────
function skinGialloGels(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = getBrightness(d[i], d[i+1], d[i+2]) / 255;
    const cLum = clamp((lum - 0.5) * 1.8 + 0.5, 0, 1);
    d[i]   = clamp(lerp(10, 255, Math.pow(cLum, 1.4)));
    d[i+1] = clamp(lerp(180, 20, Math.pow(cLum, 0.8)));
    d[i+2] = clamp(lerp(160, 90, cLum));
  }
  return imageData;
}


// ─── THEMES & PHOTO SKINS REGISTRY ───────────────────────────

const EFFECTS = {
  // ── Requested Core Themes ──
  'electron-scan': {
    name: 'Electron Scan',
    badge: 'ELECTRON SCAN',
    icon: '🔬',
    tag: 'DARKROOM',
    desc: 'Luminous edge luminescence on obsidian void',
    type: 'pixel',
    fn: skinElectronScan,
  },
  'screen-clash': {
    name: 'Screen Clash',
    badge: 'SCREEN CLASH',
    icon: '🖨️',
    tag: 'PRINT',
    desc: 'Halftone CMYK color misregistration print',
    type: 'pixel',
    fn: skinScreenClash,
  },
  'pixel-sort': {
    name: 'Pixel Sort',
    badge: 'PIXEL SORT',
    icon: '⚡',
    tag: 'GLITCH',
    desc: 'Column streak glitch sorted by luminance',
    type: 'pixel',
    fn: skinPixelSort,
  },
  'pixel-lace': {
    name: 'Pixel Lace',
    badge: 'PIXEL LACE',
    icon: '🕸️',
    tag: 'TEXTILE',
    desc: 'Delicate woven cross-stitch on dark linen',
    type: 'canvas',
    fn: skinPixelLace,
  },
  'cyanotype': {
    name: 'Cyanotype',
    badge: 'CYANOTYPE',
    icon: '🫐',
    tag: 'DARKROOM',
    desc: 'Deep Prussian blueprint archival exposure',
    type: 'pixel',
    fn: skinCyanotype,
  },

  // ── Skinz2000 Curated Looks ──
  'xray-scan': {
    name: 'X-Ray Scan',
    badge: 'X-RAY SCAN',
    icon: '💀',
    tag: 'DARKROOM',
    desc: 'Technical radiograph with skeletal edge glow',
    type: 'pixel',
    fn: skinXRayScan,
  },
  'aerochrome': {
    name: 'Aerochrome',
    badge: 'AEROCHROME',
    icon: '🌺',
    tag: 'INFRARED',
    desc: 'Kodak EIR false-color infrared film',
    type: 'pixel',
    fn: skinAerochrome,
  },
  'banknote': {
    name: 'Banknote',
    badge: 'BANKNOTE',
    icon: '💵',
    tag: 'PRINT',
    desc: 'Steel-plate currency line engraving',
    type: 'canvas',
    fn: skinBanknote,
  },
  'wire-photo': {
    name: 'Wire Photo',
    badge: 'WIRE PHOTO',
    icon: '📠',
    tag: 'TELECOM',
    desc: '1970s press facsimile scanline transmission',
    type: 'pixel',
    fn: skinWirePhoto,
  },
  'night-vision': {
    name: 'Night Vision',
    badge: 'NIGHT VISION',
    icon: '🥽',
    tag: 'SCREEN',
    desc: 'Military green phosphor NVG with tube flare',
    type: 'pixel',
    fn: skinNightVision,
  },
  'led-matrix': {
    name: 'LED Matrix',
    badge: 'LED MATRIX',
    icon: '🚥',
    tag: 'SCREEN',
    desc: 'Micro RGB sub-pixel diode monitor grid',
    type: 'pixel',
    fn: skinLEDMatrix,
  },
  'giallo-gels': {
    name: 'Giallo Gels',
    badge: 'GIALLO GELS',
    icon: '🩸',
    tag: 'CINEMA',
    desc: 'Italian horror dual-gel lighting wash',
    type: 'pixel',
    fn: skinGialloGels,
  },
};
