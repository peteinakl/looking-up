// All functions accept an explicit `ts` (Unix ms timestamp) parameter.
// Never call Date.now() internally — this enables the v2 time scrubber
// to pass any arbitrary timestamp without touching these functions.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Convert Unix ms timestamp to Julian Date.
 */
export function julianDate(ts) {
  return ts / 86400000 + 2440587.5;
}

/**
 * Greenwich Mean Sidereal Time in radians.
 * Formula: Meeus, Astronomical Algorithms Ch.12.
 */
export function gmst(ts) {
  const jd  = julianDate(ts);
  const T   = (jd - 2451545.0) / 36525;
  // GMST in degrees at 0h UT
  let deg = 280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T
    - (T * T * T) / 38710000;
  deg = ((deg % 360) + 360) % 360;
  return deg * DEG;
}

/**
 * Local Sidereal Time in radians.
 * @param {number} ts      - Unix ms
 * @param {number} lonDeg  - Observer longitude in degrees (east positive)
 */
export function lst(ts, lonDeg) {
  const l = gmst(ts) + lonDeg * DEG;
  return ((l % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/**
 * Format UTC time as "HH:MM UTC".
 */
export function formatUTC(ts) {
  const d = new Date(ts);
  return d.toUTCString().slice(17, 22) + ' UTC';
}

/**
 * Format local time as "HH:MM" given a UTC offset in minutes.
 * If tzOffset is null, returns local browser time.
 */
export function formatLocal(ts, tzOffsetMin = null) {
  const d = new Date(ts);
  if (tzOffsetMin !== null) {
    const local = new Date(ts + tzOffsetMin * 60000);
    return local.toUTCString().slice(17, 22);
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Format a duration in ms as "Xm Ys".
 */
export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec}s`;
}

/**
 * Twilight label for a given sun altitude in radians.
 */
export function twilightLabel(sunAltRad) {
  const deg = sunAltRad * RAD;
  if (deg > 0)   return { label: 'Daylight',   cls: 'twilight-civil' };
  if (deg > -6)  return { label: 'Civil twilight',       cls: 'twilight-civil' };
  if (deg > -12) return { label: 'Nautical twilight',    cls: 'twilight-nautical' };
  if (deg > -18) return { label: 'Astronomical twilight',cls: 'twilight-astro' };
  return           { label: 'Night',           cls: 'night' };
}
