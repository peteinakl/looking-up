import { enableStarlink } from '../data/satellites.js';

let _state    = null;
let _el       = null;
let _interval = null;
let _fabAdded = false;

const LAYERS = [
  { key: 'stars',        label: 'Stars',          countKey: null       },
  { key: 'constellations',label: 'Constellations', countKey: null       },
  { key: 'satellites',   label: 'Satellites',      countKey: 'active'   },
  { key: 'iss',          label: 'ISS',             countKey: null       },
  { key: 'planets',      label: 'Planets',         countKey: null       },
];

const STARLINK_LAYER = { key: 'starlink', label: 'Starlink', countKey: 'starlink' };
const EXTRA_LAYERS = [
  { key: 'grid',        label: 'Grid lines',  countKey: null },
  { key: 'visibleOnly', label: 'Visible only',countKey: null },
];

export function initToggles(state) {
  _state = state;
  _el    = document.getElementById('toggles');
  _el.classList.add('glass');
  _buildDOM();
  _setupFAB();
  _interval = setInterval(_updateCounts, 2000);
}

function _buildDOM() {
  let html = '';
  for (const layer of LAYERS) {
    html += _toggleRow(layer);
  }
  html += '<div class="toggle-starlink-divider"></div>';
  html += _toggleRow(STARLINK_LAYER, 'starlink');
  html += '<div class="toggle-starlink-divider"></div>';
  for (const layer of EXTRA_LAYERS) {
    html += _toggleRow(layer);
  }
  _el.innerHTML = html;

  _el.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', _onToggle);
  });
}

function _toggleRow(layer, extra = '') {
  const checked = _state.layers[layer.key] ? 'checked' : '';
  const countHtml = layer.countKey !== null
    ? `<span class="toggle-count loading" data-count="${layer.countKey}"></span>`
    : '';
  // No `for` attribute — input is nested inside label, which is sufficient.
  // Adding `for` when input is already inside the label causes double-fire
  // (click toggles once directly, bubbles to label which fires again → net zero).
  return `
    <label class="toggle-row ${extra}">
      <span class="toggle-name">${layer.label}</span>
      ${countHtml}
      <span class="toggle-switch ${extra}">
        <input type="checkbox" id="toggle-${layer.key}" data-key="${layer.key}" ${checked}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </span>
    </label>
  `;
}

function _onToggle(e) {
  const key = e.target.dataset.key;
  _state.layers[key] = e.target.checked;

  if (key === 'starlink' && e.target.checked) {
    // First activation: fetch Starlink data; reset fade-in
    _state.layers.starlinkFadeIn = 0;
    enableStarlink();
  }
}

function _updateCounts() {
  if (!_state || !_el) return;
  const counts = _state.satellites.counts;
  const loading = _state.satellites.loading;

  _el.querySelectorAll('[data-count]').forEach(el => {
    const key = el.dataset.count;
    const isLoading = loading[key];

    if (isLoading) {
      el.classList.add('loading');
      el.textContent = '';
    } else {
      el.classList.remove('loading');
      const n = key === 'active'
        ? counts.aboveHorizon
        : counts[key] || 0;
      el.textContent = n > 0 ? `(${n.toLocaleString()})` : '';
    }
  });

  // Show error banner if needed
  _updateErrorBanner();
}

function _updateErrorBanner() {
  let banner = _el.querySelector('.error-banner');
  if (_state.satellites.error) {
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'error-banner';
      _el.appendChild(banner);
    }
    banner.textContent = _state.satellites.error;
  } else if (banner) {
    banner.remove();
  }
}

function _setupFAB() {
  if (_fabAdded) return;
  _fabAdded = true;

  const fab = document.createElement('button');
  fab.id = 'toggles-fab';
  fab.setAttribute('aria-label', 'Toggle layers');
  fab.textContent = '☰';
  document.body.appendChild(fab);

  fab.addEventListener('click', () => {
    _el.classList.toggle('open');
  });

  // Close if clicking outside on mobile
  document.addEventListener('click', e => {
    if (!_el.contains(e.target) && e.target !== fab) {
      _el.classList.remove('open');
    }
  });
}
