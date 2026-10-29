/**
 * AcetaView — Exact Dynamic Frame Engine
 * Explicitly sets 3D Vertical Tilt default to 108 frames matching Case 01 data.
 */

// 1. CASES DATA
window.CASES_DATA = [
  { id: "case-01", caseNumber: 1, title: "Case 01", folder: "Case01", slices: { axial: 120, sagittal: 105, coronal: 108 }, views3d: { horizontal: 40, vertical: 0 } },
  { id: "case-02", caseNumber: 2, title: "Case 02", folder: "Case02", slices: { axial: 130, sagittal: 126, coronal: 111 }, views3d: { horizontal: 50, vertical: 0 } },
  { id: "case-03", caseNumber: 3, title: "Case 03", folder: "Case03", slices: { axial: 125, sagittal: 132, coronal: 114 }, views3d: { horizontal: 32, vertical: 40 } },
  { id: "case-04", caseNumber: 4, title: "Case 04", folder: "Case04", slices: { axial: 113, sagittal: 112, coronal: 108 }, views3d: { horizontal: 20, vertical: 17 } },
  { id: "case-05", caseNumber: 5, title: "Case 05", folder: "Case05", slices: { axial: 130, sagittal: 108, coronal: 110 }, views3d: { horizontal: 25, vertical: 0 } },
  { id: "case-06", caseNumber: 6, title: "Case 06", folder: "Case06", slices: { axial: 112, sagittal: 99, coronal: 96 }, views3d: { horizontal: 40, vertical: 0 } },
  { id: "case-07", caseNumber: 7, title: "Case 07", folder: "Case07", slices: { axial: 111, sagittal: 95, coronal: 112 }, views3d: { horizontal: 44, vertical: 0 } },
  { id: "case-08", caseNumber: 8, title: "Case 08", folder: "Case08", slices: { axial: 105, sagittal: 104, coronal: 104 }, views3d: { horizontal: 35, vertical: 40 } },
  { id: "case-09", caseNumber: 9, title: "Case 09", folder: "Case09", slices: { axial: 110, sagittal: 100, coronal: 112 }, views3d: { horizontal: 23, vertical: 20 } },
  { id: "case-10", caseNumber: 10, title: "Case 10", folder: "Case10", slices: { axial: 100, sagittal: 96, coronal: 100 }, views3d: { horizontal: 18, vertical: 26 } }
];

function getCandidateUrls(folderName, plane, i) {
  const s3 = String(i).padStart(3, '0');

  // All dataset frames are named ezgif-frame-NNN.jpg (jpg is the only supported format).
  return [
    `./videos/${folderName}/${plane}/ezgif-frame-${s3}.jpg`
  ];
}


// 2. UNIVERSAL IMAGE SEQUENCE ENGINE WITH EXACT FRAME DETECTION
class ImageSequenceManager {
  constructor() {
    this.cache = {};
    this.available = {};
    this.detectedCounts = {};
  }

  clearCache() {
    this.cancelBackgroundPreload();
    Object.keys(this.cache).forEach(key => {
      if (Array.isArray(this.cache[key])) {
        this.cache[key].forEach(img => {
          if (img) {
            img.onload = null;
            img.onerror = null;
            img.src = '';
          }
        });
      }
    });

    this.cache = {};
    this.available = {};
    this.detectedCounts = {};
  }

  purgeCase(folderName) {
    if (!folderName) return;
    const planes = ['axial', 'sagittal', 'coronal', '3d_horizontal', '3d_vertical'];
    planes.forEach(plane => {
      const key = `${folderName}_${plane}`;
      if (Array.isArray(this.cache[key])) {
        this.cache[key].forEach(img => {
          if (img) {
            img.onload = null;
            img.onerror = null;
            img.src = '';
          }
        });
      }
      delete this.cache[key];
      delete this.available[key];
      delete this.detectedCounts[key];
    });
  }

  clearAllExcept(activeFolders) {
    const keep = new Set((activeFolders || []).filter(Boolean));
    Object.keys(this.cache).forEach(key => {
      const folder = key.split('_')[0];
      if (!keep.has(folder)) {
        if (Array.isArray(this.cache[key])) {
          this.cache[key].forEach(img => {
            if (img) {
              img.onload = null;
              img.onerror = null;
              img.src = '';
            }
          });
        }
        delete this.cache[key];
        delete this.available[key];
        delete this.detectedCounts[key];
      }
    });
  }

  cancelBackgroundPreload() {
    this.bgGeneration = (this.bgGeneration || 0) + 1;
    if (this.bgPreloadTimer) {
      clearTimeout(this.bgPreloadTimer);
      this.bgPreloadTimer = null;
    }
  }

  // Gentle, Zero-Spike Background Preload for Next Case
  preloadNextCaseGentle(folderName, slicesObj, views3dObj) {
    if (!folderName) return;
    this.cancelBackgroundPreload();
    const myBgGen = this.bgGeneration;

    const planes = ['axial', 'sagittal', 'coronal', '3d_horizontal', '3d_vertical'];
    const queue = [];

    planes.forEach(plane => {
      const key = `${folderName}_${plane}`;
      if (!this.cache[key]) this.cache[key] = [];

      let defaultCount = 100;
      if (plane === '3d_horizontal') {
        defaultCount = (views3dObj && views3dObj.horizontal) ? views3dObj.horizontal : 92;
      } else if (plane === '3d_vertical') {
        defaultCount = (views3dObj && typeof views3dObj.vertical === 'number') ? views3dObj.vertical : 108;
      } else if (slicesObj && slicesObj[plane]) {
        defaultCount = slicesObj[plane];
      }
      this.detectedCounts[key] = defaultCount;
      if (plane === '3d_vertical' && defaultCount === 0) return;

      // Phase 1: High priority initial frames (first 15 frames)
      const priorityCount = Math.min(15, defaultCount);
      for (let i = 1; i <= priorityCount; i++) {
        queue.push({ folderName, plane, index: i });
      }

      // Phase 2: Rest of frames
      for (let i = priorityCount + 1; i <= defaultCount; i++) {
        queue.push({ folderName, plane, index: i });
      }
    });

    let qIdx = 0;
    const processNext = () => {
      if (myBgGen !== this.bgGeneration) return;

      if (qIdx < queue.length) {
        const item = queue[qIdx++];
        this.loadSingleFrame(item.folderName, item.plane, item.index);
        // Gentle pacing: 1 frame every 200ms = ~30-50 KB/sec, zero traffic congestion
        this.bgPreloadTimer = setTimeout(processNext, 200);
      }
    };

    this.bgPreloadTimer = setTimeout(processNext, 400);
  }

  preloadCase(folderName, slicesObj, views3dObj) {
    // Increment generation counter so stale scanNextBatch callbacks self-cancel
    this.generation = (this.generation || 0) + 1;
    const myGen = this.generation;

    const planes = ['axial', 'sagittal', 'coronal', '3d_horizontal', '3d_vertical'];
    
    planes.forEach(plane => {
      const key = `${folderName}_${plane}`;
      if (!this.cache[key]) {
        this.cache[key] = [];
      }
      
      let defaultCount = 100;
      if (plane === '3d_horizontal') {
        defaultCount = (views3dObj && views3dObj.horizontal) ? views3dObj.horizontal : 92;
      } else if (plane === '3d_vertical') {
        defaultCount = (views3dObj && typeof views3dObj.vertical === 'number') ? views3dObj.vertical : 108;
      } else if (slicesObj && slicesObj[plane]) {
        defaultCount = slicesObj[plane];
      }
      this.detectedCounts[key] = defaultCount;

      if (plane === '3d_vertical' && defaultCount === 0) {
        return;
      }

      // PHASE 1: Load initial frames immediately on case open if not yet loaded
      const initialLoad = Math.min(20, defaultCount);
      for (let i = 1; i <= initialLoad; i++) {
        this.loadSingleFrame(folderName, plane, i);
      }

      // PHASE 2: Background load of the remaining declared frames in small batches
      const batchSize = 4;
      const maxScan = defaultCount;
      let batchStart = initialLoad + 1;

      const scanNextBatch = () => {
        if (myGen !== this.generation) return;

        const batchEnd = Math.min(batchStart + batchSize - 1, maxScan);
        for (let i = batchStart; i <= batchEnd; i++) {
          this.loadSingleFrame(folderName, plane, i);
        }

        batchStart += batchSize;

        if (batchStart <= maxScan) {
          setTimeout(scanNextBatch, 250);
        }
      };

      if (batchStart <= maxScan) {
        setTimeout(scanNextBatch, 500);
      }
    });
  }

  loadSingleFrame(folderName, plane, index, onDone) {
    if (index < 1) return null;

    const key = `${folderName}_${plane}`;
    if (plane === '3d_vertical' && this.detectedCounts[key] === 0) {
      if (onDone) onDone(false);
      return null;
    }
    if (!this.cache[key]) this.cache[key] = [];
    
    if (this.cache[key][index - 1] !== undefined) {
      return this.cache[key][index - 1];
    }

    const is2D = (plane === 'axial' || plane === 'sagittal' || plane === 'coronal');
    const candidates = getCandidateUrls(folderName, plane, index);
    const img = new Image();
    let candidateIdx = 0;

    const tryNext = () => {
      if (candidateIdx < candidates.length) {
        img.src = candidates[candidateIdx++];
      } else {
        this.cache[key][index - 1] = null;
        // Frame counts in casesData.js may be stale (cases still change): if a frame inside the
        // declared range does not exist, shrink the count so sliders never show blank frames.
        const cur = this.detectedCounts[key];
        if (cur !== undefined && index > 1 && index <= cur) {
          this.detectedCounts[key] = index - 1;
          if (is2D || plane === '3d_vertical') window.updateSliderLimits(plane, index - 1);
        }
        if (onDone) onDone(false);
      }
    };

    img.onload = () => {
      this.available[key] = true;
      const curMax = this.detectedCounts[key] || 0;
      if (index > curMax) {
        this.detectedCounts[key] = index;
        if (is2D || plane === '3d_vertical') {
          window.updateSliderLimits(plane, index);
        }
      }

      // Debounce via rAF: cancel any pending frame before scheduling a new one
      // Only re-render if the loaded frame belongs to the currently active case!
      if (window.currentCaseObj && folderName === window.currentCaseObj.folder) {
        if (is2D) {
          cancelAnimationFrame(window._raf2D);
          window._raf2D = requestAnimationFrame(() => window.renderAll2D());
        } else {
          cancelAnimationFrame(window._raf3D);
          window._raf3D = requestAnimationFrame(() => window.render3D());
        }
      }
      if (onDone) onDone(true);
    };

    img.onerror = () => {
      tryNext();
    };

    tryNext();
    this.cache[key][index - 1] = img;
    return img;
  }

  drawFrame(ctx, folderName, plane, index, cW, cH) {
    const key = `${folderName}_${plane}`;
    const maxCount = this.detectedCounts[key] !== undefined
      ? this.detectedCounts[key]
      : ((plane === '3d_vertical') ? 0 : (plane === '3d_horizontal') ? 92 : 100);

    if (plane === '3d_vertical' && maxCount === 0) {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, cW, cH);
      ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('no 3d vertical data available', cW / 2, cH / 2);
      return true;
    }

    const isLooping = (plane === '3d_horizontal');
    const safeIndex = isLooping
      ? (((index - 1) % maxCount + maxCount) % maxCount) + 1
      : Math.max(1, Math.min(maxCount, index));
    
    let img = this.cache[key] ? this.cache[key][safeIndex - 1] : null;
    if (!img) {
      img = this.loadSingleFrame(folderName, plane, safeIndex);
    }

    if (img && img.complete && img.naturalWidth > 0) {
      const vW = img.naturalWidth;
      const vH = img.naturalHeight;

      const scale = Math.min(cW / vW, cH / vH);
      const drawW = vW * scale;
      const drawH = vH * scale;
      const drawX = (cW - drawW) / 2;
      const drawY = (cH - drawH) / 2;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cW, cH);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      if (maxCount > 1) {
        for (let k = -10; k <= 10; k++) {
          if (k === 0) continue;
          let targetIdx;
          if (isLooping) {
            targetIdx = ((safeIndex - 1 + k + maxCount) % maxCount + maxCount) % maxCount + 1;
          } else {
            targetIdx = safeIndex + k;
            if (targetIdx < 1 || targetIdx > maxCount) continue;
          }
          this.loadSingleFrame(folderName, plane, targetIdx);
        }
      }

      return true;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cW, cH);
    ctx.font = '700 18px Inter, sans-serif';
    ctx.fillStyle = '#48c79c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading...', cW / 2, cH / 2);

    return true;
  }
}

window.imageSequenceManager = new ImageSequenceManager();



// 3. TOUCH CONTROLLER ENGINE
class TouchController {
  static bindScrub(canvas, onStepChange) {
    if (!canvas) return () => {};
    let lastX = 0;
    let lastY = 0;
    let isDragging = false;
    let accum = 0;

    const onStart = (e) => {
      isDragging = true;
      accum = 0;
      const touch = e.touches ? e.touches[0] : e;
      lastX = touch.clientX;
      lastY = touch.clientY;

      const container = canvas.closest('.viewport-canvas-container');
      if (container) container.classList.add('active-dragging');
    };

    const onMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();

      const touch = e.touches ? e.touches[0] : e;
      const curX = touch.clientX;
      const curY = touch.clientY;

      const dx = lastX - curX;
      const dy = lastY - curY;
      lastX = curX;
      lastY = curY;

      // Dynamic sensitivity: 12px/step in Fullscreen mode for fine precision, 6px/step in normal mode
      const box = canvas.closest('.viewport-box');
      const isFullscreen = box ? box.classList.contains('fullscreen') : false;
      const pxPerStep = isFullscreen ? 12 : 6;

      // Allow scrubbing both horizontally (left/right) and vertically (up/down):
      // Dragging RIGHT or DOWN advances slice/frame forward (dx < 0 or dy < 0)
      // Dragging LEFT or UP moves slice/frame backward (dx > 0 or dy > 0)
      // Use dominant movement per delta to ensure natural diagonal & curved dragging without cancellation
      const dominant = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      accum += dominant;

      if (Math.abs(accum) >= pxPerStep) {
        const steps = Math.trunc(accum / pxPerStep);
        if (steps !== 0) {
          onStepChange(steps);
          accum -= steps * pxPerStep;
        }
      }
    };

    const onEnd = () => {
      isDragging = false;
      accum = 0;
      const container = canvas.closest('.viewport-canvas-container');
      if (container) container.classList.remove('active-dragging');
    };

    // Touch events (touch-action: none on canvas enables full dual-axis control)
    canvas.addEventListener('touchstart', onStart, { passive: true });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: true });
    canvas.addEventListener('touchcancel', onEnd, { passive: true });

    // Mouse drag events
    canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    // Wheel / Trackpad scroll (supports both horizontal deltaX and vertical deltaY)
    let wheelAccum = 0;
    const onWheel = (e) => {
      e.preventDefault();
      const dominant = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheelAccum += dominant;
      const threshold = (e.deltaMode === 1) ? 2 : 25;
      if (Math.abs(wheelAccum) >= threshold) {
        const steps = Math.sign(wheelAccum);
        wheelAccum = 0;
        onStepChange(-steps);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Returns a dispose function to cleanly remove all listeners if needed
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
      canvas.removeEventListener('mousedown', onStart);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      canvas.removeEventListener('wheel', onWheel);
    };
  }
}

// 4. MAIN WORKSPACE APP STATE
let currentCaseObj = window.CASES_DATA[0];
let slicesState = { axial: 1, sagittal: 1, coronal: 1 };
let rot3DState = { horiz: 0, vert: 1 };
let currentViewMode = 2; // 2 = 2-View Fit (default), 3 = 3-View Fit
let slotPlanes = { 1: 'axial', 2: 'coronal', 3: 'sagittal' };

// rAF handles — ensures canvas redraws sync with browser repaint cycle (60fps on iPad)
window._raf2D = null;
window._raf3D = null;

// Helper to update YouTube-style progress fill on slim range sliders
window.updateSliderProgress = function(sliderId) {
  const slider = document.getElementById(sliderId);
  if (!slider) return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || 0;
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  slider.style.setProperty('--progress', `${pct.toFixed(2)}%`);
};

window.updateSliderLimits = function(plane, maxCount) {
  if (plane === '3d_vertical') {
    const sliderV = document.getElementById('slider3DVert');
    if (sliderV && maxCount > 0) {
      sliderV.max = maxCount;
      if (rot3DState.vert > maxCount) rot3DState.vert = maxCount;
    }
    clearTimeout(window._slider3DDebounce);
    window._slider3DDebounce = setTimeout(() => window.render3D(), 16);
    return;
  }

  [1, 2, 3].forEach(slotNum => {
    if (slotPlanes[slotNum] === plane) {
      const slider = document.getElementById(`sliderSlot${slotNum}`);
      if (slider && maxCount > 0) {
        slider.max = maxCount;
        if (slicesState[plane] > maxCount) slicesState[plane] = maxCount;
      }
    }
  });
  // Debounce: slider limit updates can fire rapidly during batch load — coalesce into 1 render
  clearTimeout(window._sliderDebounce);
  window._sliderDebounce = setTimeout(() => window.renderAll2D(), 16);
};

// Global Navigation Functions
window.openCase = function(caseId) {
  // Disallow direct case opening from home view unless in admin mode or during active exam
  if (document.body.classList.contains('is-home-view') && !window.isAdminViewActive && (!window.examState || !window.examState.isExamActive)) {
    return;
  }

  document.body.classList.remove('is-home-view');
  document.body.classList.remove('is-admin-grid');

  const found = window.CASES_DATA.find(c => c.id === caseId);
  if (found) currentCaseObj = found;

  window.imageSequenceManager.preloadCase(currentCaseObj.folder, currentCaseObj.slices, currentCaseObj.views3d);

  // Close any active fullscreen mode when changing cases
  document.querySelectorAll('.viewport-box.fullscreen').forEach(box => {
    box.classList.remove('fullscreen');
    const icon = box.querySelector('.btn-fullscreen i');
    if (icon) { icon.classList.remove('fa-compress'); icon.classList.add('fa-expand'); }
  });
  document.body.classList.remove('has-fullscreen');

  const homeView = document.getElementById('homeView');
  const caseView = document.getElementById('caseView');

  if (homeView) homeView.style.display = 'none';
  if (caseView) caseView.style.display = 'block';

  const dropdown = document.getElementById('caseSelectDropdown');
  if (dropdown) dropdown.value = currentCaseObj.id;

  const currentIdx = window.CASES_DATA.findIndex(c => c.id === currentCaseObj.id);
  const btnPrev = document.getElementById('btnPrevCase');
  const btnNext = document.getElementById('btnNextCase');
  if (btnPrev) btnPrev.disabled = (currentIdx <= 0);
  if (btnNext) btnNext.disabled = (currentIdx >= window.CASES_DATA.length - 1);

  slicesState.axial = 1;
  slicesState.sagittal = 1;
  slicesState.coronal = 1;

  [1, 2, 3].forEach(slotNum => {
    const plane = slotPlanes[slotNum];
    const slider = document.getElementById(`sliderSlot${slotNum}`);
    const count = currentCaseObj.slices[plane] || 100;
    if (slider) {
      slider.max = count;
      slider.value = 1;
    }
  });

  rot3DState.horiz = 0;
  rot3DState.vert = 1;

  const slider3DH = document.getElementById('slider3DHoriz');
  const slider3DV = document.getElementById('slider3DVert');
  if (slider3DH) slider3DH.value = 0;

  const countV = (currentCaseObj.views3d && typeof currentCaseObj.views3d.vertical === 'number')
    ? currentCaseObj.views3d.vertical
    : (window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_3d_vertical`] || 0);

  if (slider3DV) {
    if (countV <= 0) {
      slider3DV.disabled = true;
      slider3DV.min = 0;
      slider3DV.max = 0;
      slider3DV.value = 0;
    } else {
      slider3DV.disabled = false;
      slider3DV.min = 1;
      slider3DV.max = countV;
      slider3DV.value = 1;
    }
    window.updateSliderProgress('slider3DVert');
  }

  const badgeV = document.getElementById('badge3DVert');
  if (badgeV) {
    badgeV.textContent = (countV <= 0) ? 'N/A' : `1/${countV}`;
  }

  window.update3DLayout(countV > 0);

  window.switchMode('2d');
};

window.prevCase = function() {
  if (document.body.classList.contains('is-home-view')) return;
  if (window.examState && window.examState.isExamActive) return;
  const currentIndex = window.CASES_DATA.findIndex(c => c.id === currentCaseObj.id);
  if (currentIndex > 0) {
    window.openCase(window.CASES_DATA[currentIndex - 1].id);
  }
};

window.nextCase = function() {
  if (document.body.classList.contains('is-home-view')) return;
  if (window.examState && window.examState.isExamActive) return;
  const currentIndex = window.CASES_DATA.findIndex(c => c.id === currentCaseObj.id);
  if (currentIndex >= 0 && currentIndex < window.CASES_DATA.length - 1) {
    window.openCase(window.CASES_DATA[currentIndex + 1].id);
  }
};

window.showHome = function() {
  window.isAdminViewActive = false;
  const homeView = document.getElementById('homeView');
  const caseView = document.getElementById('caseView');
  const adminCasesView = document.getElementById('adminCasesView');

  if (caseView) caseView.style.display = 'none';
  if (adminCasesView) adminCasesView.style.display = 'none';
  if (homeView) {
    homeView.style.display = 'block';
    homeView.scrollTop = 0;
  }
  document.body.classList.remove('test-mode-active');
  document.body.classList.remove('is-admin-grid');
  document.body.classList.add('is-home-view');

  // Cancel background preloads and preload Case 1 again
  window.imageSequenceManager.cancelBackgroundPreload();
  setTimeout(() => {
    const homeEl = document.getElementById('homeView');
    if (homeEl && homeEl.style.display !== 'none' && (!window.examState || !window.examState.isExamActive)) {
      const case01 = window.CASES_DATA[0];
      if (case01) {
        window.imageSequenceManager.preloadNextCaseGentle(case01.folder, case01.slices, case01.views3d);
      }
    }
  }, 1000);
};

window.switchMode = function(mode) {
  const btn2D = document.getElementById('btnMode2D');
  const btn3D = document.getElementById('btnMode3D');
  const layout2D = document.getElementById('layout2D');
  const layout3D = document.getElementById('layout3D');

  if (mode === '2d') {
    if (btn2D) btn2D.classList.add('active');
    if (btn3D) btn3D.classList.remove('active');
    if (layout2D) layout2D.style.display = 'grid';
    if (layout3D) layout3D.style.display = 'none';

    window.renderAll2D();
  } else {
    if (btn3D) btn3D.classList.add('active');
    if (btn2D) btn2D.classList.remove('active');
    if (layout2D) layout2D.style.display = 'none';
    if (layout3D) layout3D.style.display = 'block';

    const countV = (currentCaseObj.views3d && typeof currentCaseObj.views3d.vertical === 'number')
      ? currentCaseObj.views3d.vertical
      : (window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_3d_vertical`] || 0);
    window.update3DLayout(countV > 0);

    window.render3D();
  }
};

window.setSlotPlane = function(slotNum, plane, shouldRender = true) {
  slotPlanes[slotNum] = plane;

  const slotEl = document.getElementById(`viewportSlot${slotNum}`);
  if (slotEl) {
    const buttons = slotEl.querySelectorAll('.btn-plane-toggle');
    buttons.forEach(btn => {
      if (btn.dataset.plane === plane) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  const count = window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_${plane}`] || (currentCaseObj.slices ? currentCaseObj.slices[plane] : 100);
  const slider = document.getElementById(`sliderSlot${slotNum}`);
  if (slider) {
    slider.max = count;
    slider.value = slicesState[plane] || 1;
  }

  if (shouldRender) {
    window.renderAll2D();
  }
};

window.toggleViewOption = function() {
  currentViewMode = (currentViewMode === 2) ? 3 : 2;
  const layout2D = document.getElementById('layout2D');
  const btn = document.getElementById('btnViewOption');

  if (layout2D) {
    if (currentViewMode === 3) {
      layout2D.classList.remove('mode-2view');
      layout2D.classList.add('mode-3view');
      window.setSlotPlane(1, 'axial', false);
      window.setSlotPlane(2, 'coronal', false);
      window.setSlotPlane(3, 'sagittal', false);
    } else {
      layout2D.classList.remove('mode-3view');
      layout2D.classList.add('mode-2view');
      window.setSlotPlane(1, 'axial', false);
      window.setSlotPlane(2, 'coronal', false);
    }
  }

  if (btn) {
    const icon = btn.querySelector('i');
    if (currentViewMode === 3) {
      btn.classList.add('active');
      btn.title = 'Current: 3-View Fit (Click for 2-View Fit)';
      if (icon) icon.className = 'fa-solid fa-table-cells';
    } else {
      btn.classList.remove('active');
      btn.title = 'Current: 2-View Fit (Click for 3-View Fit)';
      if (icon) icon.className = 'fa-solid fa-table-columns';
    }
  }

  window.renderAll2D();
  window.render3D();
};

window.toggleFullscreen = function(btn) {
  const box = btn.closest('.viewport-box');
  if (!box) return;

  const isFullscreen = box.classList.toggle('fullscreen');
  document.body.classList.toggle('has-fullscreen', document.querySelectorAll('.viewport-box.fullscreen').length > 0);

  const icon = btn.querySelector('i');

  if (isFullscreen) {
    if (icon) {
      icon.classList.remove('fa-expand');
      icon.classList.add('fa-compress');
    }
  } else {
    if (icon) {
      icon.classList.remove('fa-compress');
      icon.classList.add('fa-expand');
    }
  }

  window.renderAll2D();
  window.render3D();
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.viewport-box.fullscreen').forEach(box => {
      box.classList.remove('fullscreen');
      const icon = box.querySelector('.btn-fullscreen i');
      if (icon) {
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
      }
    });
    document.body.classList.remove('has-fullscreen');
    window.renderAll2D();
    window.render3D();
  }
});

window.renderAll2D = function() {
  cancelAnimationFrame(window._raf2D);
  window._raf2D = requestAnimationFrame(() => {
    const activeSlots = (currentViewMode === 3) ? [1, 2, 3] : [1, 2];
    activeSlots.forEach(slotNum => {
      const canvas = document.getElementById(`canvasSlot${slotNum}`);
      if (!canvas) return;

      window.resizeCanvas(canvas);
      const ctx = canvas.getContext('2d');
      const plane = slotPlanes[slotNum] || (slotNum === 1 ? 'axial' : slotNum === 2 ? 'coronal' : 'sagittal');
      const sliceIdx = slicesState[plane] || 1;
      const count = window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_${plane}`] || (currentCaseObj.slices ? currentCaseObj.slices[plane] : 100);

      window.imageSequenceManager.drawFrame(ctx, currentCaseObj.folder, plane, sliceIdx, canvas.width, canvas.height);

      const badge = document.getElementById(`badgeSlot${slotNum}`);
      if (badge) badge.textContent = `${sliceIdx}/${count}`;

      const slider = document.getElementById(`sliderSlot${slotNum}`);
      if (slider) {
        slider.max = count;
        slider.value = sliceIdx;
      }
      window.updateSliderProgress(`sliderSlot${slotNum}`);
    });
  });
};

window.update3DLayout = function(hasVertical) {
  const grid3D = document.getElementById('grid3D') || document.querySelector('#layout3D .view-3d-grid');
  const boxV = document.getElementById('box3DVert');

  if (grid3D) {
    if (hasVertical) {
      grid3D.classList.remove('single-3d-view');
    } else {
      grid3D.classList.add('single-3d-view');
    }
  }

  if (boxV) {
    boxV.style.display = hasVertical ? '' : 'none';
  }
};

window.render3D = function() {
  cancelAnimationFrame(window._raf3D);
  window._raf3D = requestAnimationFrame(() => {
    const canvasH = document.getElementById('canvas3DHoriz');
    const canvasV = document.getElementById('canvas3DVert');

    const countV = (currentCaseObj.views3d && typeof currentCaseObj.views3d.vertical === 'number')
      ? currentCaseObj.views3d.vertical
      : (window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_3d_vertical`] || 0);

    const hasVertical = countV > 0;
    window.update3DLayout(hasVertical);

    window.resizeCanvas(canvasH);

    const countH = window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_3d_horizontal`] || (currentCaseObj.views3d ? currentCaseObj.views3d.horizontal : 92);
    const ratioH = Math.max(0, Math.min(0.9999, (rot3DState.horiz % 360) / 360));
    const frameH = Math.floor(ratioH * countH) + 1;

    const ctxH = canvasH.getContext('2d');
    window.imageSequenceManager.drawFrame(ctxH, currentCaseObj.folder, '3d_horizontal', frameH, canvasH.width, canvasH.height);

    if (hasVertical && canvasV) {
      window.resizeCanvas(canvasV);
      const frameV = Math.max(1, Math.min(countV, rot3DState.vert || 1));
      const ctxV = canvasV.getContext('2d');
      window.imageSequenceManager.drawFrame(ctxV, currentCaseObj.folder, '3d_vertical', frameV, canvasV.width, canvasV.height);

      const badgeV = document.getElementById('badge3DVert');
      if (badgeV) badgeV.textContent = `${frameV}/${countV}`;

      const sliderV = document.getElementById('slider3DVert');
      if (sliderV) {
        sliderV.disabled = false;
        sliderV.max = countV;
        sliderV.value = frameV;
      }
      window.updateSliderProgress('slider3DVert');
    }

    window.updateSliderProgress('slider3DHoriz');
  });
};
window.resizeCanvas = function(canvas) {
  if (!canvas || !canvas.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const targetW = rect.width > 0 ? Math.floor(rect.width * (window.devicePixelRatio || 1)) : 400;
  const targetH = rect.height > 0 ? Math.floor(rect.height * (window.devicePixelRatio || 1)) : 400;

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
};

// Setup Event Listeners after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('caseSelectDropdown');
  if (dropdown) dropdown.addEventListener('change', (e) => {
    if (document.body.classList.contains('is-home-view')) {
      e.preventDefault();
      return;
    }
    if (window.examState && window.examState.isExamActive) return;
    window.openCase(e.target.value);
  });

  const btnPrev = document.getElementById('btnPrevCase');
  const btnNext = document.getElementById('btnNextCase');
  if (btnPrev) btnPrev.addEventListener('click', () => window.prevCase());
  if (btnNext) btnNext.addEventListener('click', () => window.nextCase());

  const btnHome = document.getElementById('btnBackHome');
  if (btnHome) btnHome.addEventListener('click', () => window.handleHomeClick());

  const btnInfo = document.getElementById('btnClassificationInfo');
  if (btnInfo) btnInfo.addEventListener('click', () => window.openClassificationModal());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const lightbox = document.getElementById('imageLightboxModal');
      if (lightbox && lightbox.style.display !== 'none') {
        window.closeImageLightbox();
        return;
      }
      window.closeClassificationModal();
      window.closeAdminModal();
      window.closePasscodeModal();
      window.closeExitPasscodeModal();
      window.closeAdminAccessModal();
      window.closeSkipConfirmModal();
    }
  });

  const btn2D = document.getElementById('btnMode2D');
  const btn3D = document.getElementById('btnMode3D');
  if (btn2D) btn2D.addEventListener('click', () => window.switchMode('2d'));
  if (btn3D) btn3D.addEventListener('click', () => window.switchMode('3d'));

  // Sliders for 2D Slots 1, 2, 3
  const sliderSlot1 = document.getElementById('sliderSlot1');
  const sliderSlot2 = document.getElementById('sliderSlot2');
  const sliderSlot3 = document.getElementById('sliderSlot3');
  const slider3DH = document.getElementById('slider3DHoriz');
  const slider3DV = document.getElementById('slider3DVert');

  if (sliderSlot1) sliderSlot1.addEventListener('input', (e) => {
    const plane = slotPlanes[1];
    slicesState[plane] = parseInt(e.target.value);
    window.renderAll2D();
  });
  if (sliderSlot2) sliderSlot2.addEventListener('input', (e) => {
    const plane = slotPlanes[2];
    slicesState[plane] = parseInt(e.target.value);
    window.renderAll2D();
  });
  if (sliderSlot3) sliderSlot3.addEventListener('input', (e) => {
    const plane = slotPlanes[3];
    slicesState[plane] = parseInt(e.target.value);
    window.renderAll2D();
  });
  if (slider3DH) slider3DH.addEventListener('input', (e) => { rot3DState.horiz = parseInt(e.target.value); window.render3D(); });
  if (slider3DV) slider3DV.addEventListener('input', (e) => {
    if (slider3DV.disabled) return;
    rot3DState.vert = parseInt(e.target.value, 10);
    window.render3D();
  });

  // Touch Scrubbing for 2D Slots 1, 2, 3
  TouchController.bindScrub(document.getElementById('canvasSlot1'), (step) => {
    const plane = slotPlanes[1];
    const count = window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_${plane}`] || currentCaseObj.slices[plane];
    slicesState[plane] = Math.max(1, Math.min(count, slicesState[plane] - step));
    window.renderAll2D();
  });

  TouchController.bindScrub(document.getElementById('canvasSlot2'), (step) => {
    const plane = slotPlanes[2];
    const count = window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_${plane}`] || currentCaseObj.slices[plane];
    slicesState[plane] = Math.max(1, Math.min(count, slicesState[plane] - step));
    window.renderAll2D();
  });

  TouchController.bindScrub(document.getElementById('canvasSlot3'), (step) => {
    const plane = slotPlanes[3];
    const count = window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_${plane}`] || currentCaseObj.slices[plane];
    slicesState[plane] = Math.max(1, Math.min(count, slicesState[plane] - step));
    window.renderAll2D();
  });

  TouchController.bindScrub(document.getElementById('canvas3DHoriz'), (step) => {
    const countH = window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_3d_horizontal`] || (currentCaseObj.views3d ? currentCaseObj.views3d.horizontal : 92);
    const degreePerFrame = 360 / countH;
    rot3DState.horiz = (rot3DState.horiz - step * degreePerFrame + 360) % 360;
    document.getElementById('slider3DHoriz').value = rot3DState.horiz;
    window.render3D();
  });

  TouchController.bindScrub(document.getElementById('canvas3DVert'), (step) => {
    const countV = (currentCaseObj.views3d && typeof currentCaseObj.views3d.vertical === 'number')
      ? currentCaseObj.views3d.vertical
      : (window.imageSequenceManager.detectedCounts[`${currentCaseObj.folder}_3d_vertical`] || 0);
    if (countV <= 0) return;
    rot3DState.vert = Math.max(1, Math.min(countV, (rot3DState.vert || 1) - step));
    const sliderV = document.getElementById('slider3DVert');
    if (sliderV) sliderV.value = rot3DState.vert;
    window.render3D();
  });
  // 5. STABILITY: Re-render when user returns from lock screen or app switch
  // Safari may suspend tab rendering; visibilitychange ensures canvas is always up-to-date
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentCaseObj) {
      window.renderAll2D();
      window.render3D();
    }
  });

  // 6. DEEP-LINKING: Handle URL query parameters (e.g. ?case=case-01&mode=2d&view=2&slice=50)
  const urlParams = new URLSearchParams(window.location.search);
  const targetCase = urlParams.get('case');
  if (targetCase) {
    window.openCase(targetCase);
    const targetMode = urlParams.get('mode');
    if (targetMode === '3d') {
      window.switchMode('3d');
    }
    const targetView = urlParams.get('view');
    if (targetView === '3' && currentViewMode !== 3) {
      window.toggleViewOption();
    }
    const targetSlice = parseInt(urlParams.get('slice'), 10);
    if (!isNaN(targetSlice)) {
      slicesState.axial = targetSlice;
      slicesState.coronal = targetSlice;
      slicesState.sagittal = targetSlice;
      rot3DState.vert = targetSlice;
      window.renderAll2D();
      window.render3D();
    }
    if (urlParams.get('fullscreen') === 'true') {
      const fsBtn = document.querySelector('#layout2D .viewport-box .btn-fullscreen');
      if (fsBtn) window.toggleFullscreen(fsBtn);
    }
    if (urlParams.get('modal') === 'classification') {
      window.openClassificationModal();
    }
  }

  // Check and restore active test session if page reloaded
  window.checkAndResumeExamSession();

  // Progressive Preload Optimization:
  // On home page, gently preload Case 1 in background so it opens instantly
  setTimeout(() => {
    if (!window.examState || !window.examState.isExamActive) {
      const case01 = window.CASES_DATA[0];
      if (case01) {
        window.imageSequenceManager.preloadNextCaseGentle(case01.folder, case01.slices, case01.views3d);
      }
    }
  }, 1200);
});

// ==========================================
// 6. CONFIDENTIAL ADMIN CASE METADATA SYSTEM
// ==========================================
let homeClickCount = 0;
let homeClickTimer = null;

window.handleHomeClick = function() {
  if (window.examState && window.examState.isExamActive) {
    window.openExitPasscodeModal();
    return;
  }

  if (window.isAdminViewActive) {
    const caseView = document.getElementById('caseView');
    if (caseView && caseView.style.display !== 'none') {
      window.showAdminCases();
      return;
    }
    const adminCasesView = document.getElementById('adminCasesView');
    if (adminCasesView && adminCasesView.style.display !== 'none') {
      window.showHome();
      return;
    }
  }

  homeClickCount++;
  clearTimeout(homeClickTimer);

  if (homeClickCount >= 8) {
    homeClickCount = 0;
    window.openAdminAccessModal();
    return;
  } else {
    homeClickTimer = setTimeout(() => {
      homeClickCount = 0;
    }, 2500); // 2.5 seconds window for 8 rapid clicks
  }

  window.showHome();
};

window.getAdminData = function() {
  const saved = localStorage.getItem('acetaview_admin_cases');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.error('Error parsing admin data:', e);
    }
  }
  return window.CASES_DATA.map(c => ({
    id: c.id,
    title: c.title,
    patientName: '',
    hn: '',
    diagnosis: ''
  }));
};

window.openAdminModal = function() {
  const modal = document.getElementById('adminModal');
  if (!modal) return;
  window.renderAdminCasesList();
  modal.style.display = 'flex';
};

window.closeAdminModal = function() {
  const modal = document.getElementById('adminModal');
  if (modal) modal.style.display = 'none';
};

window.openClassificationModal = function() {
  const modal = document.getElementById('classificationModal');
  if (modal) modal.style.display = 'flex';
};

window.closeClassificationModal = function() {
  window.closeImageLightbox();
  const modal = document.getElementById('classificationModal');
  if (modal) modal.style.display = 'none';
};

window.handleClassificationBackdrop = function(e) {
  if (e.target.id === 'classificationModal' || e.target.classList.contains('classification-modal-body')) {
    window.closeClassificationModal();
  }
};

window.openImageLightbox = function(src, title) {
  const modal = document.getElementById('imageLightboxModal');
  const imgEl = document.getElementById('imageLightboxImg');
  const titleEl = document.getElementById('imageLightboxTitleText');
  if (!modal || !imgEl) return;

  imgEl.src = src;
  imgEl.alt = title || 'Enlarged Image';
  if (titleEl) {
    titleEl.textContent = title || 'รูปภาพขยายเต็มจอ';
  }
  modal.style.display = 'flex';
  const bodyEl = modal.querySelector('.image-lightbox-body');
  if (bodyEl) bodyEl.scrollTop = 0;
};

window.closeImageLightbox = function() {
  const modal = document.getElementById('imageLightboxModal');
  if (modal) modal.style.display = 'none';
};

window.renderAdminCasesList = function() {
  const container = document.getElementById('adminCasesList');
  if (!container) return;

  const data = window.getAdminData();
  container.innerHTML = '';

  data.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'admin-case-item';
    card.innerHTML = `
      <div class="admin-case-tag">
        <i class="fa-solid fa-folder-medical"></i> ${item.title || ('Case ' + String(index + 1).padStart(2, '0'))}
      </div>
      <div class="admin-input-group">
        <label class="admin-input-label">ชื่อ - นามสกุล (Patient Name)</label>
        <input type="text" class="admin-input" id="admin_name_${item.id}" placeholder="เช่น นายสมชาย ใจดี" value="${item.patientName || ''}">
      </div>
      <div class="admin-input-group">
        <label class="admin-input-label">HN (Hospital No.)</label>
        <input type="text" class="admin-input" id="admin_hn_${item.id}" placeholder="เช่น 10024567" value="${item.hn || ''}">
      </div>
      <div class="admin-input-group">
        <label class="admin-input-label">Diag (การวินิจฉัยโรค)</label>
        <input type="text" class="admin-input" id="admin_diag_${item.id}" placeholder="เช่น Acetabulum Posterior Wall Fracture" value="${item.diagnosis || ''}">
      </div>
    `;
    container.appendChild(card);
  });
};

window.saveAdminData = function() {
  const currentData = window.getAdminData();
  const updatedData = currentData.map(item => {
    const nameInput = document.getElementById(`admin_name_${item.id}`);
    const hnInput = document.getElementById(`admin_hn_${item.id}`);
    const diagInput = document.getElementById(`admin_diag_${item.id}`);

    return {
      id: item.id,
      title: item.title,
      patientName: nameInput ? nameInput.value.trim() : (item.patientName || ''),
      hn: hnInput ? hnInput.value.trim() : (item.hn || ''),
      diagnosis: diagInput ? diagInput.value.trim() : (item.diagnosis || '')
    };
  });

  localStorage.setItem('acetaview_admin_cases', JSON.stringify(updatedData, null, 2));
  window.showAdminToast('บันทึกข้อมูลลง Browser Storage สำเร็จแล้ว');
};

let _adminFileHandle = null;

window.openLocalFile = async function() {
  try {
    if ('showOpenFilePicker' in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] }
        }],
        multiple: false
      });
      _adminFileHandle = handle;
      const file = await _adminFileHandle.getFile();
      const contents = await file.text();
      const parsed = JSON.parse(contents);
      if (Array.isArray(parsed)) {
        localStorage.setItem('acetaview_admin_cases', JSON.stringify(parsed, null, 2));
        window.renderAdminCasesList();
        window.showAdminToast(`โหลดข้อมูลจากไฟล์ "${file.name}" สำเร็จแล้ว`);
      }
    } else {
      // Fallback for Safari / mobile: invisible file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            if (Array.isArray(parsed)) {
              localStorage.setItem('acetaview_admin_cases', JSON.stringify(parsed, null, 2));
              window.renderAdminCasesList();
              window.showAdminToast(`โหลดข้อมูลจาก "${file.name}" สำเร็จแล้ว`);
            }
          } catch (err) {
            alert('ไฟล์ JSON ไม่ถูกต้อง');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
};

window.saveDirectlyToFile = async function() {
  window.saveAdminData();
  const data = window.getAdminData();
  const jsonStr = JSON.stringify(data, null, 2);

  try {
    if ('showSaveFilePicker' in window) {
      if (!_adminFileHandle) {
        _adminFileHandle = await window.showSaveFilePicker({
          suggestedName: 'cases_metadata.json',
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] }
          }]
        });
      }
      const writable = await _adminFileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      window.showAdminToast('✅ บันทึกลงไฟล์ในเครื่องเรียบร้อยแล้ว!');
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('File System Access API error:', err);
  }

  // Fallback direct download if File System Access API is not supported in the current browser
  window.downloadAdminDataJson(jsonStr);
};

window.exportAdminData = function() {
  window.saveAdminData();
  const data = window.getAdminData();
  const jsonStr = JSON.stringify(data, null, 2);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(jsonStr).then(() => {
      window.showAdminToast('คัดลอก JSON Data ลง Clipboard แล้ว');
    }).catch(() => {
      window.downloadAdminDataJson(jsonStr);
    });
  } else {
    window.downloadAdminDataJson(jsonStr);
  }
};

window.downloadAdminDataJson = function(jsonStr) {
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cases_metadata.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  window.showAdminToast('ดาวน์โหลดไฟล์ cases_metadata.json เรียบร้อยแล้ว');
};

window.showAdminToast = function(msg) {
  const toast = document.getElementById('adminToast');
  const toastText = document.getElementById('adminToastText');
  if (!toast) return;

  if (toastText && msg) toastText.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
};

// ==========================================
// 7. SEQUENTIAL CASE EXAM TIMER SYSTEM (5 MIN/CASE)
// ==========================================
const EXAM_CASE_DURATION_SEC = 300; // 5 minutes
const EXAM_PASSCODE = '1314';
const EXAM_EXIT_PASSCODE = '8888';

window.examState = {
  isExamActive: false,
  currentCaseIndex: 0,
  caseEndTime: 0
};

let examTimerInterval = null;
let lastRenderedSeconds = -1;

// Passcode Modal
window.openPasscodeModal = function() {
  const modal = document.getElementById('passcodeModal');
  const input = document.getElementById('passcodeInput');
  const error = document.getElementById('passcodeError');
  if (!modal) return;
  if (input) {
    input.value = '';
  }
  if (error) {
    error.style.display = 'none';
  }
  modal.style.display = 'flex';
  setTimeout(() => {
    if (input) input.focus();
  }, 100);
};

window.closePasscodeModal = function() {
  const modal = document.getElementById('passcodeModal');
  if (modal) modal.style.display = 'none';
};

window.handlePasscodeBackdrop = function(e) {
  if (e.target && e.target.id === 'passcodeModal') {
    window.closePasscodeModal();
  }
};

window.handlePasscodeKeyDown = function(e) {
  if (e.key === 'Enter') {
    window.verifyPasscodeAndStart();
  }
};

window.verifyPasscodeAndStart = function() {
  const input = document.getElementById('passcodeInput');
  const error = document.getElementById('passcodeError');
  const val = input ? input.value.trim() : '';

  if (val === EXAM_PASSCODE) {
    window.closePasscodeModal();
    window.startExamSession(0);
  } else {
    if (error) error.style.display = 'flex';
    if (input) {
      input.focus();
    }
  }
};

// Admin Untimed 10-Case System (Activated by 8 rapid clicks on Home + Code: 8888)
window.isAdminViewActive = false;

window.openAdminAccessModal = function() {
  const modal = document.getElementById('adminAccessModal');
  const input = document.getElementById('adminAccessInput');
  const error = document.getElementById('adminAccessError');
  if (!modal) return;
  if (input) {
    input.value = '';
  }
  if (error) {
    error.style.display = 'none';
  }
  modal.style.display = 'flex';
  setTimeout(() => {
    if (input) input.focus();
  }, 100);
};

window.closeAdminAccessModal = function() {
  const modal = document.getElementById('adminAccessModal');
  if (modal) modal.style.display = 'none';
};

window.handleAdminAccessBackdrop = function(e) {
  if (e.target && e.target.id === 'adminAccessModal') {
    window.closeAdminAccessModal();
  }
};

window.handleAdminAccessKeyDown = function(e) {
  if (e.key === 'Enter') {
    window.verifyAdminAccessAndOpen();
  }
};

window.verifyAdminAccessAndOpen = function() {
  const input = document.getElementById('adminAccessInput');
  const error = document.getElementById('adminAccessError');
  const val = input ? input.value.trim() : '';

  if (val === EXAM_EXIT_PASSCODE) {
    window.closeAdminAccessModal();
    window.showAdminCases();
  } else {
    if (error) error.style.display = 'flex';
    if (input) {
      input.focus();
    }
  }
};

window.showAdminCases = function() {
  window.isAdminViewActive = true;
  const homeView = document.getElementById('homeView');
  const caseView = document.getElementById('caseView');
  const adminCasesView = document.getElementById('adminCasesView');

  if (homeView) homeView.style.display = 'none';
  if (caseView) caseView.style.display = 'none';
  if (adminCasesView) adminCasesView.style.display = 'block';

  document.body.classList.remove('test-mode-active');
  document.body.classList.remove('is-home-view');
  document.body.classList.add('is-admin-grid');
};

window.openAdminCase = function(caseId) {
  if (examTimerInterval) {
    clearInterval(examTimerInterval);
    examTimerInterval = null;
  }
  window.examState.isExamActive = false;
  window.clearExamState();
  document.body.classList.remove('test-mode-active');
  window.isAdminViewActive = true;

  const adminCasesView = document.getElementById('adminCasesView');
  if (adminCasesView) adminCasesView.style.display = 'none';

  window.openCase(caseId);
};

// Exit Exam Passcode Modal (Code: 8888)
window.openExitPasscodeModal = function() {
  const modal = document.getElementById('exitPasscodeModal');
  const input = document.getElementById('exitPasscodeInput');
  const error = document.getElementById('exitPasscodeError');
  if (!modal) return;
  if (input) {
    input.value = '';
  }
  if (error) {
    error.style.display = 'none';
  }
  modal.style.display = 'flex';
  setTimeout(() => {
    if (input) input.focus();
  }, 100);
};

window.closeExitPasscodeModal = function() {
  const modal = document.getElementById('exitPasscodeModal');
  if (modal) modal.style.display = 'none';
};

window.handleExitPasscodeBackdrop = function(e) {
  if (e.target && e.target.id === 'exitPasscodeModal') {
    window.closeExitPasscodeModal();
  }
};

window.handleExitPasscodeKeyDown = function(e) {
  if (e.key === 'Enter') {
    window.verifyExitPasscodeAndReturn();
  }
};

window.verifyExitPasscodeAndReturn = function() {
  const input = document.getElementById('exitPasscodeInput');
  const error = document.getElementById('exitPasscodeError');
  const val = input ? input.value.trim() : '';

  if (val === EXAM_EXIT_PASSCODE) {
    window.closeExitPasscodeModal();
    if (examTimerInterval) {
      clearInterval(examTimerInterval);
      examTimerInterval = null;
    }
    window.examState.isExamActive = false;
    window.clearExamState();
    document.body.classList.remove('test-mode-active');
    window.showHome();
  } else {
    if (error) error.style.display = 'flex';
    if (input) {
      input.focus();
    }
  }
};

// Exam State Storage
window.saveExamState = function() {
  try {
    sessionStorage.setItem('acetaview_exam_state', JSON.stringify(window.examState));
  } catch (e) {
    console.error('Failed to save exam state:', e);
  }
};

window.loadExamState = function() {
  try {
    const raw = sessionStorage.getItem('acetaview_exam_state');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

window.clearExamState = function() {
  try {
    sessionStorage.removeItem('acetaview_exam_state');
  } catch (e) {}
};

// Start or Resume Exam Session
window.startExamSession = function(caseIndex = 0, resumeEndTime = null) {
  window.examState.isExamActive = true;
  window.examState.currentCaseIndex = caseIndex;
  window.examState.caseEndTime = resumeEndTime || (Date.now() + EXAM_CASE_DURATION_SEC * 1000);

  document.body.classList.add('test-mode-active');
  window.saveExamState();

  // Load the target case
  window.loadExamCase(caseIndex);

  // Start the drift-free timer interval
  if (examTimerInterval) clearInterval(examTimerInterval);
  examTimerInterval = setInterval(window.tickExamTimer, 250);
  window.tickExamTimer();
};

// Load a specific exam case
window.loadExamCase = function(index) {
  if (index < 0 || index >= window.CASES_DATA.length) {
    window.finishExam();
    return;
  }

  const caseObj = window.CASES_DATA[index];
  const nextCaseObj = (index + 1 < window.CASES_DATA.length) ? window.CASES_DATA[index + 1] : null;

  // 1. Immediately purge previous cases from cache (e.g. Case 1 when starting Case 2)
  if (index > 0) {
    const prevCase = window.CASES_DATA[index - 1];
    window.imageSequenceManager.purgeCase(prevCase.folder);
  }
  // Clear any old lingering caches except active case and next preloaded case
  window.imageSequenceManager.clearAllExcept([caseObj.folder, nextCaseObj ? nextCaseObj.folder : null]);

  // 2. Open active case
  window.openCase(caseObj.id);

  // 3. Update timer bar badges
  const badge = document.getElementById('timerCaseBadge');
  const step = document.getElementById('timerStepBadge');
  if (badge) badge.textContent = caseObj.title;
  if (step) step.textContent = `เคส ${index + 1} จาก ${window.CASES_DATA.length}`;

  // Reset 30s alert UI
  const timerBar = document.getElementById('testTimerBar');
  const warnBadge = document.getElementById('timerWarningBadge');
  if (timerBar) timerBar.classList.remove('warning-alert');
  if (warnBadge) warnBadge.style.display = 'none';

  lastRenderedSeconds = -1;

  // 4. Progressively preload next case in the background gently (if available)
  if (nextCaseObj) {
    setTimeout(() => {
      if (window.examState && window.examState.isExamActive && window.examState.currentCaseIndex === index) {
        window.imageSequenceManager.preloadNextCaseGentle(nextCaseObj.folder, nextCaseObj.slices, nextCaseObj.views3d);
      }
    }, 1200);
  }
};

// Drift-free, Zero-traffic Timer Tick
window.tickExamTimer = function() {
  if (!window.examState || !window.examState.isExamActive) return;

  const now = Date.now();
  const remainingMs = Math.max(0, window.examState.caseEndTime - now);
  const remainingSec = Math.ceil(remainingMs / 1000);

  // Time expired: auto-advance
  if (remainingSec <= 0) {
    window.advanceExamCase();
    return;
  }

  // Update DOM only when whole second changes (avoids layout thrashing)
  if (remainingSec !== lastRenderedSeconds) {
    lastRenderedSeconds = remainingSec;

    const m = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const s = String(remainingSec % 60).padStart(2, '0');

    const countdownEl = document.getElementById('timerCountdown');
    if (countdownEl) countdownEl.textContent = `${m}:${s}`;

    const progressEl = document.getElementById('timerProgressBar');
    if (progressEl) {
      const pct = Math.min(100, Math.max(0, (remainingSec / EXAM_CASE_DURATION_SEC) * 100));
      progressEl.style.width = `${pct}%`;
    }

    // 30-Second Warning (Non-intrusive)
    const timerBar = document.getElementById('testTimerBar');
    const warnBadge = document.getElementById('timerWarningBadge');
    if (remainingSec <= 30) {
      if (timerBar && !timerBar.classList.contains('warning-alert')) {
        timerBar.classList.add('warning-alert');
      }
      if (warnBadge) warnBadge.style.display = 'inline-flex';
    } else {
      if (timerBar && timerBar.classList.contains('warning-alert')) {
        timerBar.classList.remove('warning-alert');
      }
      if (warnBadge) warnBadge.style.display = 'none';
    }
  }
};

// Advance to Next Exam Case
window.advanceExamCase = function() {
  if (window.examState.currentCaseIndex < window.CASES_DATA.length - 1) {
    window.examState.currentCaseIndex++;
    window.examState.caseEndTime = Date.now() + EXAM_CASE_DURATION_SEC * 1000;
    window.saveExamState();
    window.loadExamCase(window.examState.currentCaseIndex);
  } else {
    window.finishExam();
  }
};

// Skip Case Confirmation Modal
window.openSkipConfirmModal = function() {
  const modal = document.getElementById('skipConfirmModal');
  if (modal) modal.style.display = 'flex';
};

window.closeSkipConfirmModal = function() {
  const modal = document.getElementById('skipConfirmModal');
  if (modal) modal.style.display = 'none';
};

window.handleSkipBackdrop = function(e) {
  if (e.target && e.target.id === 'skipConfirmModal') {
    window.closeSkipConfirmModal();
  }
};

window.confirmSkipCase = function() {
  window.closeSkipConfirmModal();
  window.advanceExamCase();
};

// Finish Exam Session
window.finishExam = function() {
  if (examTimerInterval) {
    clearInterval(examTimerInterval);
    examTimerInterval = null;
  }
  window.examState.isExamActive = false;
  window.clearExamState();
  document.body.classList.remove('test-mode-active');
  window.imageSequenceManager.cancelBackgroundPreload();

  const modal = document.getElementById('testCompleteModal');
  if (modal) modal.style.display = 'flex';
};

window.resetToHome = function() {
  const completeModal = document.getElementById('testCompleteModal');
  if (completeModal) completeModal.style.display = 'none';
  window.showHome();
};

// Resume exam session if tab refreshed
window.checkAndResumeExamSession = function() {
  const saved = window.loadExamState();
  if (saved && saved.isExamActive) {
    const now = Date.now();
    if (now < saved.caseEndTime) {
      window.startExamSession(saved.currentCaseIndex, saved.caseEndTime);
    } else {
      const elapsedSinceExpiry = now - saved.caseEndTime;
      const extraCasesSkipped = Math.floor(elapsedSinceExpiry / (EXAM_CASE_DURATION_SEC * 1000)) + 1;
      const targetIndex = saved.currentCaseIndex + extraCasesSkipped;
      if (targetIndex < window.CASES_DATA.length) {
        const remInSlot = (EXAM_CASE_DURATION_SEC * 1000) - (elapsedSinceExpiry % (EXAM_CASE_DURATION_SEC * 1000));
        window.startExamSession(targetIndex, now + remInSlot);
      } else {
        window.finishExam();
      }
    }
  }
};

// Prevent accidental window close/reload during active exam
window.addEventListener('beforeunload', (e) => {
  if (window.examState && window.examState.isExamActive) {
    e.preventDefault();
    e.returnValue = 'กำลังอยู่ในระหว่างทำแบบทดสอบ ต้องการออกจากหน้านี้หรือไม่?';
    return e.returnValue;
  }
});
