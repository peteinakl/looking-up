// Geolocation handler.
// Tries browser Geolocation API, then Nominatim reverse geocode for city name.
// Falls back to Auckland if denied. Caches in sessionStorage.

const CACHE_KEY = 'looking-up-observer';
const AUCKLAND  = { lat: -36.85, lon: 174.76, displayName: 'Auckland, NZ' };

/**
 * Get observer position and update state.observer.
 * Shows a location input UI if geolocation is denied.
 *
 * @param {object} state - shared app state (mutated in place)
 * @returns {Promise<void>}
 */
export async function getLocation(state) {
  // Check session cache first
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      Object.assign(state.observer, JSON.parse(cached));
      return;
    }
  } catch {}

  return new Promise(resolve => {
    if (!navigator.geolocation) {
      _showLocationPrompt(state, resolve);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const displayName = await _reverseGeocode(lat, lon);
        _setObserver(state, { lat, lon, displayName });
        resolve();
      },
      () => {
        // Denied or unavailable — show manual input
        _showLocationPrompt(state, resolve);
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}

async function _reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'User-Agent': 'looking-up-app/1.0' } }
    );
    if (!res.ok) return _formatLatLon(lat, lon);
    const data = await res.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.county || '';
    const country = addr.country_code ? addr.country_code.toUpperCase() : '';
    return city ? `${city}${country ? ', ' + country : ''}` : _formatLatLon(lat, lon);
  } catch {
    return _formatLatLon(lat, lon);
  }
}

function _formatLatLon(lat, lon) {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr} ${lonStr}`;
}

function _setObserver(state, observer) {
  Object.assign(state.observer, observer);
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(observer));
  } catch {}
}

function _showLocationPrompt(state, resolve) {
  const prompt = document.createElement('div');
  prompt.id = 'location-prompt';
  prompt.innerHTML = `
    <div class="location-box glass">
      <h2>Where are you?</h2>
      <p>Geolocation access is needed to show the sky above your location.</p>
      <input class="location-input" type="text" placeholder="City name or lat,lon (e.g. 51.5,-0.1)" autocomplete="off" spellcheck="false">
      <button class="location-submit">Use this location</button>
      <button class="location-submit" style="background:none;border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);margin-top:4px">Use Auckland (default)</button>
    </div>
  `;
  document.body.appendChild(prompt);

  const input   = prompt.querySelector('.location-input');
  const buttons = prompt.querySelectorAll('.location-submit');

  input.focus();

  async function submit(useDefault) {
    let lat = AUCKLAND.lat, lon = AUCKLAND.lon, displayName = AUCKLAND.displayName;

    if (!useDefault && input.value.trim()) {
      const parsed = _parseInput(input.value.trim());
      if (parsed) {
        ({ lat, lon } = parsed);
        displayName = await _reverseGeocode(lat, lon);
      }
    }

    _setObserver(state, { lat, lon, displayName });
    prompt.remove();
    resolve();
  }

  buttons[0].addEventListener('click', () => submit(false));
  buttons[1].addEventListener('click', () => submit(true));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(false); });
}

function _parseInput(val) {
  // Try "lat,lon" format
  const parts = val.split(',').map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lon: parts[1] };
  }
  return null;
}
