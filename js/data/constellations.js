// Loads d3-celestial constellation data.
// Same RA coordinate convention as stars: RA_deg = ((lon + 360) % 360)

const DEG = Math.PI / 180;

let _data = null;

/**
 * Load constellation lines and name points.
 * @returns {Promise<{ lines: GeoJSON, names: Array }>}
 */
export async function loadConstellations() {
  if (_data) return _data;

  const [linesRes, namesRes] = await Promise.all([
    fetch('data/constellations.lines.json'),
    fetch('data/constellations.json'),
  ]);

  const linesJson = await linesRes.json();
  const namesJson = await namesRes.json();

  // Pre-normalise line vertices: [[raRad, decRad], ...] per line segment
  const lines = linesJson.features.map(f => {
    // Each feature is a MultiLineString; coordinates is array of line arrays
    const segments = f.geometry.coordinates.map(line =>
      line.map(([lon, lat]) => [
        ((lon + 360) % 360) * DEG,  // RA in radians
        lat * DEG,                   // Dec in radians
      ])
    );
    return { id: f.id, segments };
  });

  // Pre-normalise name positions
  const names = namesJson.features.map(f => {
    const [lon, lat] = f.geometry.coordinates;
    return {
      id:     f.id,
      name:   f.properties.name || f.id,
      raRad:  ((lon + 360) % 360) * DEG,
      decRad: lat * DEG,
    };
  });

  _data = { lines, names };
  return _data;
}
