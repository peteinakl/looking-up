// Compass rose — lower right corner.
// Rotates with state.viewport.rotation so N always points to actual north.
// Dims when north is up (default), brightens when the view is rotated.

const TWO_PI = 2 * Math.PI;

let _state = null;
let _el    = null;
let _ring  = null;

export function initCompass(state) {
  _state = state;
  _el    = document.getElementById('compass');
  _ring  = _el?.querySelector('.compass-ring');
  if (!_el || !_ring) return;

  setInterval(_update, 80);
}

function _update() {
  if (!_state || !_ring) return;
  const rot = _state.viewport.rotation;

  _ring.style.transform = `rotate(${rot}rad)`;

  // Brighten when meaningfully rotated (> ~5° from any north-up position)
  const norm = ((rot % TWO_PI) + TWO_PI) % TWO_PI;
  _el.classList.toggle('compass-rotated', norm > 0.087 && norm < 6.196);
}
