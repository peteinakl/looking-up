// Loads and parses the d3-celestial star catalogue (stars.6.json)
// and star name data (starnames.json).
//
// d3-celestial coordinate convention (confirmed empirically):
//   RA_deg = ((lon + 360) % 360)  — longitude is RA wrapped to [-180, +180]
//   bv property is a STRING — must parseFloat.
//   f.id is the Hipparcos number, used to look up names in starnames.json.

const DEG = Math.PI / 180;

let _stars = null;

export async function loadStars() {
  if (_stars) return _stars;

  const [starJson, nameJson] = await Promise.all([
    fetch('data/stars.6.json').then(r => r.json()),
    fetch('data/starnames.json').then(r => r.json()),
  ]);

  _stars = starJson.features.map(f => {
    const [lon, lat] = f.geometry.coordinates;
    const raRad  = ((lon + 360) % 360) * DEG;
    const decRad = lat * DEG;
    const mag    = f.properties.mag;
    const bv     = parseFloat(f.properties.bv);

    const nameData   = nameJson[String(f.id)] || {};
    const name       = nameData.name || null;   // "Sirius", or null if unnamed
    const bayerConst = nameData.desig && nameData.c
      ? `${nameData.desig} ${nameData.c}`       // e.g. "α CMa"
      : nameData.desig || null;

    return {
      raRad, decRad,
      mag,
      bv:    isNaN(bv) ? 0 : bv,
      id:    f.id,
      name,
      desig: bayerConst,
    };
  });

  return _stars;
}
