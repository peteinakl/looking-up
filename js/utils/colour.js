// B-V colour index → CSS hex, magnitude → pixel radius

// Anchor points from PRD §6.1: [bv, [r, g, b]]
const BV_ANCHORS = [
  [-0.4, [160, 192, 255]],   // blue-white
  [ 0.0, [255, 255, 255]],   // white
  [ 0.6, [255, 244, 224]],   // yellow-white
  [ 1.0, [255, 204, 128]],   // orange
  [ 1.5, [255, 136, 102]],   // red-orange
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map B-V colour index to CSS hex string.
 * @param {number} bv
 * @returns {string} e.g. "#a0c0ff"
 */
export function bvToRgb(bv) {
  // Clamp to anchor range
  if (bv <= BV_ANCHORS[0][0]) {
    const [r, g, b] = BV_ANCHORS[0][1];
    return toHex(r, g, b);
  }
  if (bv >= BV_ANCHORS[BV_ANCHORS.length - 1][0]) {
    const [r, g, b] = BV_ANCHORS[BV_ANCHORS.length - 1][1];
    return toHex(r, g, b);
  }

  for (let i = 0; i < BV_ANCHORS.length - 1; i++) {
    const [bv0, c0] = BV_ANCHORS[i];
    const [bv1, c1] = BV_ANCHORS[i + 1];
    if (bv >= bv0 && bv <= bv1) {
      const t = (bv - bv0) / (bv1 - bv0);
      const r = Math.round(lerp(c0[0], c1[0], t));
      const g = Math.round(lerp(c0[1], c1[1], t));
      const b = Math.round(lerp(c0[2], c1[2], t));
      return toHex(r, g, b);
    }
  }

  return '#ffffff';
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Map apparent magnitude to pixel radius.
 * Mag -1 (Sirius) → ~4px, Mag 6 → ~0.5px.
 */
export function magToRadius(mag) {
  return Math.max(0.4, 3.5 - mag * 0.58);
}
