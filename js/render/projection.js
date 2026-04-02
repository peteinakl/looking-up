// Coordinate transforms: RA/Dec → Alt/Az → screen (stereographic zenithal).
// All angle parameters are in radians unless noted.

/**
 * Convert RA/Dec (J2000) to Alt/Az for a given observer and sidereal time.
 *
 * @param {number} raRad   - Right Ascension in radians
 * @param {number} decRad  - Declination in radians
 * @param {number} latRad  - Observer latitude in radians
 * @param {number} lstRad  - Local Sidereal Time in radians
 * @returns {{ alt: number, az: number }} - Altitude and Azimuth in radians
 */
export function raDecToAltAz(raRad, decRad, latRad, lstRad) {
  const ha = lstRad - raRad;

  const sinAlt = Math.sin(decRad) * Math.sin(latRad)
    + Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const az = Math.atan2(
    -Math.sin(ha) * Math.cos(decRad),
    Math.cos(latRad) * Math.sin(decRad) - Math.sin(latRad) * Math.cos(decRad) * Math.cos(ha)
  );

  // Normalise azimuth to [0, 2π)
  return { alt, az: ((az % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
}

/**
 * Stereographic zenithal projection: Alt/Az → canvas pixel coords.
 *
 * North (az=0) maps to the top of the screen.
 * Objects below the horizon (alt < 0) return null.
 *
 * @param {number} altRad
 * @param {number} azRad
 * @param {object} viewport  { cx, cy, radius, zoom, panX, panY, rotation }
 * @returns {{ x: number, y: number } | null}
 */
export function altAzToScreen(altRad, azRad, viewport) {
  if (altRad < 0) return null;

  const { cx, cy, radius, zoom, panX, panY, rotation } = viewport;
  const r = Math.cos(altRad) / (1 + Math.sin(altRad));
  const az = azRad - rotation;

  const sx = r * Math.sin(az);
  const sy = -r * Math.cos(az);

  return {
    x: cx + (sx * radius + panX) * zoom,
    y: cy + (sy * radius + panY) * zoom,
  };
}

/**
 * Inverse stereographic projection: canvas pixel → Alt/Az.
 * Used for hit-testing click/touch events.
 *
 * @param {number} px  - Canvas physical pixel X
 * @param {number} py  - Canvas physical pixel Y
 * @param {object} viewport
 * @returns {{ alt: number, az: number }}
 */
export function screenToAltAz(px, py, viewport) {
  const { cx, cy, radius, zoom, panX, panY, rotation } = viewport;

  // Undo pan and zoom
  const sx = (px - cx) / zoom - panX;
  const sy = (py - cy) / zoom - panY;

  const r = Math.sqrt(sx * sx + sy * sy) / radius;
  const az = ((Math.atan2(sx, -sy) + rotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  // Inverse of r = cos(alt) / (1 + sin(alt))
  // Solving: alt = arcsin((1 - r²) / (1 + r²))
  const r2 = r * r;
  const alt = Math.asin(Math.max(-1, Math.min(1, (1 - r2) / (1 + r2))));

  return { alt, az };
}

/**
 * Project alt/az to canvas coords, returning null if below horizon or off-dome.
 * Convenience wrapper that also applies the horizon fade alpha multiplier.
 *
 * @param {number} altRad
 * @param {number} azRad
 * @param {object} viewport
 * @returns {{ x: number, y: number, alpha: number } | null}
 */
export function project(altRad, azRad, viewport) {
  if (altRad < 0) return null;
  const pt = altAzToScreen(altRad, azRad, viewport);
  if (!pt) return null;

  // Horizon fade: objects in the bottom 5° fade out
  const FADE_ALT = 5 * Math.PI / 180;
  const alpha = altRad < FADE_ALT ? altRad / FADE_ALT : 1;

  return { ...pt, alpha };
}
