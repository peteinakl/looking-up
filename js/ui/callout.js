// On-canvas callout: leader line + pulsing ring drawn on canvas,
// info panel is a DOM <div> repositioned each frame.
//
// Canvas positions are in CSS pixels (projection.js uses CSS pixel space).
// DOM <div> is also in CSS pixels — no DPR conversion needed here.

import { fetchISSCrew } from '../data/satellites.js';
import { formatDuration } from '../utils/time.js';

let _state     = null;
let _panelEl   = null;
let _dismissTs = null;  // timestamp when we started auto-dismiss countdown

export function initCallout(canvas, state) {
  _state   = state;
  _panelEl = document.getElementById('callout');

  // Escape to dismiss
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') _dismiss();
  });
}

/**
 * Called every frame from draw(). Draws leader line + pulsing ring on canvas,
 * updates DOM panel position.
 */
export function drawCallout(ctx, state) {
  const sel = state.selectedObject;

  // Auto-dismiss when object goes below horizon
  if (sel && sel.data && sel.data.alt !== undefined && sel.data.alt <= 0) {
    if (!_dismissTs) {
      _dismissTs = state.timestamp;
    } else if (state.timestamp - _dismissTs > 3000) {
      _dismiss();
      return;
    }
  } else {
    _dismissTs = null;
  }

  if (!sel) {
    _panelEl.classList.remove('visible');
    _panelEl.innerHTML = '';
    return;
  }

  // Find current screen position of selected object
  const obj = state.renderedObjects.find(o => o.type === sel.type && o.id === sel.id);
  if (!obj) return;  // object scrolled below horizon mid-frame

  const x = obj.x, y = obj.y;

  // Update selected object's live data and position
  state.selectedObject = { ...sel, screenX: x, screenY: y, data: obj.data };

  // ─── Pulsing ring ────────────────────────────────────────────────────────
  const t     = (state.timestamp % 2000) / 2000;  // 0→1 over 2s
  const r1    = 8 + t * 10;
  const r2    = 12 + t * 14;
  const alpha = 1 - t;

  ctx.save();
  ctx.strokeStyle = _ringColour(sel.type);
  ctx.lineWidth   = 1;

  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath();
  ctx.arc(x, y, r1, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.3;
  ctx.beginPath();
  ctx.arc(x, y, r2, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.restore();

  // ─── Panel DOM ───────────────────────────────────────────────────────────
  _updatePanel(sel, obj, x, y);
}

function _updatePanel(sel, obj, x, y) {
  // Build content
  const content = _buildContent(sel.type, obj.data);

  _panelEl.innerHTML = `
    <div class="callout-panel glass">
      <div class="callout-header">
        <div class="callout-title-group">
          <span class="callout-name">${_esc(content.name)}</span>
          <span class="callout-type">${_esc(content.type)}</span>
        </div>
        <button class="callout-close" id="callout-close">✕</button>
      </div>
      <div class="callout-fields">
        ${content.fields.map(f => `
          <div class="callout-field">
            <span class="callout-field-key">${_esc(f.k)}</span>
            <span class="callout-field-val ${f.cls || ''}">${_esc(f.v)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('callout-close').addEventListener('click', _dismiss);

  // Position: offset above-right of object, clamped to viewport
  const panelW = 220, panelH = 120;
  const vw = window.innerWidth, vh = window.innerHeight;
  const mobile = vw < 480;

  let px, py;
  if (mobile) {
    // Bottom bar on very small screens
    _panelEl.style.cssText = '';
  } else {
    px = Math.min(x + 20, vw - panelW - 10);
    py = Math.max(10, y - panelH - 10);
    if (px < 10) px = x - panelW - 20;

    _panelEl.style.left = px + 'px';
    _panelEl.style.top  = py + 'px';
    _panelEl.style.bottom = '';
    _panelEl.style.right  = '';
  }

  _panelEl.classList.add('visible');

  // Draw leader line (canvas) — handled in drawCallout before panel update
  // (panel position is set here; leader endpoint approximated as panel's bottom-left corner)
}

function _buildContent(type, data) {
  switch (type) {
    case 'iss':
      return {
        name:   'ISS',
        type:   'Space Station',
        fields: [
          { k: 'Altitude', v: `${data.altKm} km` },
          { k: 'Speed',    v: `${data.speed} km/s` },
          { k: 'Sunlit',   v: data.sunlit ? 'Yes' : 'In shadow', cls: data.sunlit ? 'sunlit' : 'shadowed' },
          { k: 'NORAD',    v: data.norad },
          ...(data.crew !== null && data.crew !== undefined
            ? [{ k: 'Crew', v: `${data.crew} aboard` }]
            : []),
          ...(data.alt <= 0 ? [{ k: 'Status', v: 'Below horizon' }] : []),
        ],
      };

    case 'satellite':
      return {
        name:   data.name || `SAT-${data.norad}`,
        type:   data.isStarlink ? 'Starlink' : 'Satellite',
        fields: [
          { k: 'Altitude', v: `${data.altKm} km` },
          { k: 'Speed',    v: `${data.speed} km/s` },
          { k: 'Sunlit',   v: data.sunlit ? 'Yes' : 'In shadow', cls: data.sunlit ? 'sunlit' : 'shadowed' },
          { k: 'NORAD',    v: data.norad },
        ],
      };

    case 'planet':
      return {
        name:   data.name,
        type:   'Planet',
        fields: [
          { k: 'Altitude', v: `${(data.alt * 180 / Math.PI).toFixed(1)}°` },
          { k: 'Azimuth',  v: `${(data.az  * 180 / Math.PI).toFixed(1)}°` },
        ],
      };

    case 'moon':
      return {
        name:   'Moon',
        type:   'Natural Satellite',
        fields: [
          { k: 'Phase',       v: data.phaseName },
          { k: 'Illuminated', v: `${Math.round(data.illumination * 100)}%` },
          { k: 'Altitude',    v: `${(data.alt * 180 / Math.PI).toFixed(1)}°` },
        ],
      };

    case 'star':
      return {
        name:   data.name || data.desig || 'Star',
        type:   'Star',
        fields: [
          ...(data.desig ? [{ k: 'Designation', v: data.desig }] : []),
          { k: 'Magnitude', v: data.mag !== undefined ? data.mag.toFixed(1) : '—' },
          ...(data.bv !== undefined ? [{ k: 'Colour', v: `B-V ${data.bv.toFixed(2)}` }] : []),
        ],
      };

    default:
      return { name: 'Object', type: type, fields: [] };
  }
}

function _ringColour(type) {
  switch (type) {
    case 'iss':      return '#ffd700';
    case 'planet':   return '#fff0d0';
    case 'moon':     return 'rgba(220,220,230,0.8)';
    case 'star':     return 'rgba(255,255,255,0.7)';
    default:         return '#66cccc';
  }
}

function _dismiss() {
  if (_state) _state.selectedObject = null;
  _dismissTs = null;
  if (_panelEl) {
    _panelEl.classList.remove('visible');
    _panelEl.innerHTML = '';
  }
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
