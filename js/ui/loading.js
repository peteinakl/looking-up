// Bottom loading bar — shows satellite acquisition progress in three phases:
//   Phase 1: stations + active loading
//   Phase 2: base done, Starlink loading (starts after phase 1 resolves)
//   Phase 3: all loaded — visible 3s then fades out

let _state   = null;
let _el      = null;
let _doneTs  = null;
let _iv      = null;

export function initLoadingBar(state) {
  _state = state;
  _el    = document.getElementById('loading-bar');
  if (!_el) return;

  _render();
  _iv = setInterval(_render, 500);
}

function _render() {
  if (!_state || !_el) return;

  const { loading, counts, error } = _state.satellites;

  if (error) {
    _el.innerHTML = `<div class="lb-inner">
      <span class="lb-dot" style="background:rgba(255,100,100,0.7)"></span>
      <span class="lb-text" style="color:rgba(255,120,120,0.6)">${error}</span>
    </div>`;
    return;
  }
  const phase1Done = !loading.stations && !loading.active;
  const allDone    = phase1Done && !loading.starlink;

  if (allDone && !_doneTs) {
    _doneTs = Date.now();
  }

  if (_doneTs && Date.now() - _doneTs > 3000) {
    _el.classList.add('lb-done');
    clearInterval(_iv);
    return;
  }

  const n        = counts.aboveHorizon || 0;
  const nStarlink = counts.starlink     || 0;

  let html;

  if (!phase1Done) {
    // Phase 1 — fetching base satellite data
    html = `<div class="lb-inner">
      <span class="lb-dot lb-dot--cyan lb-dot--pulse"></span>
      <span class="lb-text">acquiring satellite data</span>
    </div>`;

  } else if (!allDone) {
    // Phase 2 — base done, Starlink incoming
    const aboveStr = n > 0 ? `${n} above` : 'tracking';
    html = `<div class="lb-inner">
      <span class="lb-dot lb-dot--cyan"></span>
      <span class="lb-text lb-text--cyan">${aboveStr}</span>
      <span class="lb-sep">·</span>
      <span class="lb-dot lb-dot--warm lb-dot--pulse"></span>
      <span class="lb-text">starlink incoming</span>
    </div>`;

  } else {
    // Phase 3 — all loaded
    const starlinkStr = nStarlink > 0
      ? `${nStarlink.toLocaleString()} starlink`
      : 'starlink';
    html = `<div class="lb-inner">
      <span class="lb-dot lb-dot--cyan"></span>
      <span class="lb-text lb-text--cyan">${n} above</span>
      <span class="lb-sep">·</span>
      <span class="lb-dot lb-dot--warm"></span>
      <span class="lb-text lb-text--warm">${starlinkStr}</span>
    </div>`;
  }

  _el.innerHTML = html;
}
