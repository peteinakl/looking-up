import { formatLocal, formatUTC, twilightLabel } from '../utils/time.js';

let _state    = null;
let _el       = null;
let _interval = null;

export function initHud(state) {
  _state = state;
  _el    = document.getElementById('hud');
  _el.classList.add('glass');
  _render();
  _interval = setInterval(_render, 1000);
}

function _render() {
  if (!_state || !_el) return;
  const { observer, timestamp, planets, satellites } = _state;

  const twi = twilightLabel(planets.sunAlt || 0);

  const moonLine = _moonLine(planets.moon);
  const satLine  = _satLine(satellites);

  _el.innerHTML = `
    <div class="hud-row">
      <span class="hud-label">Location</span>
      <span class="hud-value">${_esc(observer.displayName)}</span>
    </div>
    <div class="hud-divider"></div>
    <div class="hud-row">
      <span class="hud-label">Local</span>
      <span class="hud-value">${formatLocal(timestamp)}</span>
    </div>
    <div class="hud-row">
      <span class="hud-label">UTC</span>
      <span class="hud-value">${formatUTC(timestamp)}</span>
    </div>
    <div class="hud-divider"></div>
    <div class="hud-row">
      <span class="hud-label">Sun</span>
      <span class="hud-value ${twi.cls}">${twi.label}</span>
    </div>
    ${moonLine}
    ${satLine}
  `;
}

function _satLine(sats) {
  const loading = sats.loading.stations || sats.loading.active;
  if (loading) {
    return `
      <div class="hud-row">
        <span class="hud-label">Sats</span>
        <span class="hud-value hud-loading">loading</span>
      </div>`;
  }
  const n = sats.counts.aboveHorizon;
  if (n === 0) return '';
  return `
    <div class="hud-row">
      <span class="hud-label">Sats</span>
      <span class="hud-value">${n} above</span>
    </div>`;
}

function _moonLine(moon) {
  if (!moon || moon.alt <= 0) return '';
  const altDeg = (moon.alt * 180 / Math.PI).toFixed(0);
  return `
    <div class="hud-row">
      <span class="hud-label">Moon</span>
      <span class="hud-value">${_esc(moon.phaseName)} · ${altDeg}°</span>
    </div>
  `;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
