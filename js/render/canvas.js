// Canvas setup and render loop.
// Uses setTimeout at ~12.5fps (80ms) — not requestAnimationFrame.
// Pauses automatically when tab is hidden.

const FRAME_INTERVAL_MS = 80;

let _loopHandle = null;
let _drawFn     = null;
let _state      = null;
let _ctx        = null;
let _dpr        = 1;

export function initCanvas(canvas, state) {
  _ctx = canvas.getContext('2d');

  function resize() {
    _dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width  = Math.round(w * _dpr);
    canvas.height = Math.round(h * _dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';

    // setTransform instead of scale() — prevents DPR accumulation on resize
    _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);

    // Sky dome geometry in CSS pixels.
    // Radius = screen diagonal so the hemisphere fills the canvas edge-to-edge
    // with no visible horizon circle (corners land at ~0° altitude).
    const radius = Math.hypot(w / 2, h / 2);

    state.viewport.cx     = w / 2;
    state.viewport.cy     = h / 2;
    state.viewport.radius = radius;
  }

  resize();
  window.addEventListener('resize', resize);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) _pause();
    else _resume();
  });
}

export function startRenderLoop(state, drawFn) {
  _state  = state;
  _drawFn = drawFn;
  _schedule();
}

function _tick() {
  _loopHandle = null;
  if (document.hidden) return;

  _state.timestamp = Date.now();

  try {
    _drawFn(_ctx, _state);
  } catch (err) {
    console.error('[canvas] draw error:', err);
  }

  _schedule();
}

function _schedule() {
  if (_loopHandle !== null) return;
  _loopHandle = setTimeout(_tick, FRAME_INTERVAL_MS);
}

function _pause() {
  if (_loopHandle !== null) { clearTimeout(_loopHandle); _loopHandle = null; }
}

function _resume() {
  if (_state) _state.timestamp = Date.now();
  _schedule();
}

export function getCtx() { return _ctx; }
