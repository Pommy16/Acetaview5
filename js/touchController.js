/**
 * iPad Touch & Gesture Controller for Acetabulum Research Platform
 */

window.TouchController = class TouchController {
  /**
   * Bind Touch Scrubbing to a 2D Viewport Canvas
   */
  static bind2DScrub(canvas, onSliceChange) {
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
      canvas.classList.add('active-dragging');
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

      const pxPerSlice = 6;
      const dominant = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      accum += dominant;

      if (Math.abs(accum) >= pxPerSlice) {
        const sliceSteps = Math.trunc(accum / pxPerSlice);
        if (sliceSteps !== 0) {
          onSliceChange(sliceSteps);
          accum -= sliceSteps * pxPerSlice;
        }
      }
    };

    const onEnd = () => {
      isDragging = false;
      accum = 0;
      canvas.classList.remove('active-dragging');
    };

    canvas.addEventListener('touchstart', onStart, { passive: true });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: true });
    canvas.addEventListener('touchcancel', onEnd, { passive: true });

    canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }

  /**
   * Bind Dual-Axis Touch Drag for 3D Reconstruction Rotation
   */
  static bind3DRotation(canvas, onRotateChange) {
    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const sensitivityH = 0.65;
    const sensitivityV = 0.50;

    const onStart = (e) => {
      isDragging = true;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      canvas.classList.add('active-dragging');
    };

    const onMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();

      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = startY - touch.clientY;

      const deltaRotH = dx * sensitivityH;
      const deltaRotV = dy * sensitivityV;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        onRotateChange(deltaRotH, deltaRotV);
        startX = touch.clientX;
        startY = touch.clientY;
      }
    };

    const onEnd = () => {
      isDragging = false;
      canvas.classList.remove('active-dragging');
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);

    canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }
};
