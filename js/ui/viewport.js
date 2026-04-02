import { screenToAltAz } from '../render/projection.js';

// Manages zoom, pan, rotation interactions and hit-testing.
// All mouse/touch events are in CSS pixels; canvas uses physical pixels.
// Hit-test must scale by devicePixelRatio.

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 8.0;
const ZOOM_SPEED = 0.001;

let _canvas = null;
let _state  = null;
let _dpr    = 1;

// Interaction state
let _drag      = { active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 };
let _rotate    = { active: false, startAngle: 0, startRotation: 0 };
let _pinch     = { active: false, startDist: 0, startZoom: 0, startAngle: 0, startRotation: 0 };
let _resetAnim = null;

export function initViewport(canvas, state) {
  _canvas = canvas;
  _state  = state;
  _dpr    = window.devicePixelRatio || 1;

  window.addEventListener('resize', () => { _dpr = window.devicePixelRatio || 1; });

  // Mouse events
  canvas.addEventListener('wheel',       _onWheel,     { passive: false });
  canvas.addEventListener('mousedown',   _onMouseDown);
  canvas.addEventListener('mousemove',   _onMouseMove);
  canvas.addEventListener('mouseup',     _onMouseUp);
  canvas.addEventListener('dblclick',    _onDblClick);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Touch events
  canvas.addEventListener('touchstart',  _onTouchStart, { passive: false });
  canvas.addEventListener('touchmove',   _onTouchMove,  { passive: false });
  canvas.addEventListener('touchend',    _onTouchEnd);

  // Click (hit-test) — handled in mouseup/touchend
  // Reset button
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => _animateReset());
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

function _applyZoom(delta, pivotCssX, pivotCssY) {
  const vp     = _state.viewport;
  const prev   = vp.zoom;
  const next   = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * (1 - delta * ZOOM_SPEED)));

  // Adjust pan so the pivot point stays fixed under cursor
  const scale = next / prev;
  const pcx   = (pivotCssX - vp.cx) / prev - vp.panX;
  const pcy   = (pivotCssY - vp.cy) / prev - vp.panY;

  vp.panX = (pivotCssX - vp.cx) / next - pcx;
  vp.panY = (pivotCssY - vp.cy) / next - pcy;
  vp.zoom = next;

  _clampPan();
}

function _clampPan() {
  const { zoom, radius } = _state.viewport;
  // At min zoom, allow panning up to 55% of radius so users can look around
  // without losing the sky entirely. At higher zoom, standard formula applies.
  const maxPan = zoom <= MIN_ZOOM
    ? radius * 0.55
    : radius * (zoom - 1) / zoom;
  _state.viewport.panX = Math.max(-maxPan, Math.min(maxPan, _state.viewport.panX));
  _state.viewport.panY = Math.max(-maxPan, Math.min(maxPan, _state.viewport.panY));
}

// ─── Mouse ───────────────────────────────────────────────────────────────────

function _onWheel(e) {
  e.preventDefault();
  const rect = _canvas.getBoundingClientRect();
  _applyZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
}

function _onMouseDown(e) {
  e.preventDefault();
  const { panX, panY, rotation } = _state.viewport;

  if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
    // Right-click or Ctrl+drag → rotate
    _rotate.active = true;
    _rotate.startAngle    = Math.atan2(e.clientY - _state.viewport.cy, e.clientX - _state.viewport.cx);
    _rotate.startRotation = rotation;
  } else if (e.button === 0) {
    _drag.active  = true;
    _drag.startX  = e.clientX;
    _drag.startY  = e.clientY;
    _drag.startPanX = panX;
    _drag.startPanY = panY;
  }
}

function _onMouseMove(e) {
  if (_drag.active) {
    _state.viewport.panX = _drag.startPanX + (e.clientX - _drag.startX) / _state.viewport.zoom;
    _state.viewport.panY = _drag.startPanY + (e.clientY - _drag.startY) / _state.viewport.zoom;
    _clampPan();
  } else if (_rotate.active) {
    const angle = Math.atan2(e.clientY - _state.viewport.cy, e.clientX - _state.viewport.cx);
    _state.viewport.rotation = _rotate.startRotation + (angle - _rotate.startAngle);
  }
}

function _onMouseUp(e) {
  const wasDragging = _drag.active && (
    Math.abs(e.clientX - _drag.startX) > 4 ||
    Math.abs(e.clientY - _drag.startY) > 4
  );
  _drag.active   = false;
  _rotate.active = false;

  if (!wasDragging && e.button === 0) {
    _hitTest(e.clientX, e.clientY);
  }
}

function _onDblClick() {
  _animateReset();
}

// ─── Touch ───────────────────────────────────────────────────────────────────

let _lastTap = 0;

function _onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t    = e.touches[0];
    const now  = Date.now();
    if (now - _lastTap < 300) { _animateReset(); _lastTap = 0; return; }
    _lastTap = now;

    _drag.active  = true;
    _drag.startX  = t.clientX;
    _drag.startY  = t.clientY;
    _drag.startPanX = _state.viewport.panX;
    _drag.startPanY = _state.viewport.panY;

  } else if (e.touches.length === 2) {
    _drag.active  = false;
    _pinch.active = true;
    _pinch.startDist     = _touchDist(e.touches);
    _pinch.startZoom     = _state.viewport.zoom;
    _pinch.startAngle    = _touchAngle(e.touches);
    _pinch.startRotation = _state.viewport.rotation;
  }
}

function _onTouchMove(e) {
  e.preventDefault();
  if (_pinch.active && e.touches.length === 2) {
    const dist  = _touchDist(e.touches);
    const angle = _touchAngle(e.touches);

    _state.viewport.zoom     = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, _pinch.startZoom * dist / _pinch.startDist));
    _state.viewport.rotation = _pinch.startRotation + (angle - _pinch.startAngle);
    _clampPan();

  } else if (_drag.active && e.touches.length === 1) {
    const t = e.touches[0];
    _state.viewport.panX = _drag.startPanX + (t.clientX - _drag.startX) / _state.viewport.zoom;
    _state.viewport.panY = _drag.startPanY + (t.clientY - _drag.startY) / _state.viewport.zoom;
    _clampPan();
  }
}

function _onTouchEnd(e) {
  const wasDragging = _drag.active && e.changedTouches.length === 1 && (
    Math.abs(e.changedTouches[0].clientX - _drag.startX) > 8 ||
    Math.abs(e.changedTouches[0].clientY - _drag.startY) > 8
  );

  if (!wasDragging && !_pinch.active && e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    _hitTest(t.clientX, t.clientY);
  }

  if (e.touches.length < 2) _pinch.active = false;
  if (e.touches.length === 0) _drag.active = false;
}

function _touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _touchAngle(touches) {
  return Math.atan2(
    touches[1].clientY - touches[0].clientY,
    touches[1].clientX - touches[0].clientX
  );
}

// ─── Hit-test ────────────────────────────────────────────────────────────────

function _hitTest(cssX, cssY) {
  const objects = _state.renderedObjects;
  if (!objects.length) { _state.selectedObject = null; return; }

  // Tolerances in CSS pixels — generous to compensate for small rendered sizes
  const TOLERANCE = {
    star:      14,
    planet:    22,
    moon:      22,
    iss:       20,
    satellite: 16,
  };

  let best = null, bestDist = Infinity;

  for (const obj of objects) {
    const dx  = cssX - obj.x;
    const dy  = cssY - obj.y;
    const d   = Math.sqrt(dx * dx + dy * dy);
    const tol = TOLERANCE[obj.type] ?? 14;

    if (d < tol && d < bestDist) {
      best = obj;
      bestDist = d;
    }
  }

  _state.selectedObject = best || null;
}

// ─── Animated reset ──────────────────────────────────────────────────────────

function _animateReset() {
  if (_resetAnim) cancelAnimationFrame(_resetAnim);

  const start    = performance.now();
  const duration = 400;
  const from     = { ...(_state.viewport) };
  const to       = { zoom: 1.0, panX: 0, panY: 0, rotation: 0 };

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const e = _easeOut(t);

    _state.viewport.zoom     = from.zoom     + (to.zoom     - from.zoom)     * e;
    _state.viewport.panX     = from.panX     + (to.panX     - from.panX)     * e;
    _state.viewport.panY     = from.panY     + (to.panY     - from.panY)     * e;
    _state.viewport.rotation = from.rotation + (to.rotation - from.rotation) * e;

    if (t < 1) _resetAnim = requestAnimationFrame(step);
    else        _resetAnim = null;
  }

  _resetAnim = requestAnimationFrame(step);
}

function _easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}
