/* Small helpers: dates, sun times, geo, formatting, DOM. No dependencies. */
const U = (() => {

  /* ---------- DOM ---------- */
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      // Skip the falsy values that `cond && el(...)` produces — including 0 and '',
      // which would otherwise print literally. Numbers meant as text are String()'d by callers.
      if (kid == null || kid === false || kid === true || kid === '' || kid === 0) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return n;
  };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- dates (all trip dates are plain YYYY-MM-DD, no timezone drift) ---------- */
  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Parse 'YYYY-MM-DD' as a *local* date so no UTC shift can move the day.
  const parseDate = s => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayISO = () => fmtDate(new Date());
  const dow = iso => parseDate(iso).getDay();
  const prettyDate = iso => {
    const d = parseDate(iso);
    return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };
  const shortDate = iso => {
    const d = parseDate(iso);
    return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };
  const addDays = (iso, n) => {
    const d = parseDate(iso);
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  };
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

  /* ---------- times as minutes-from-midnight ---------- */
  const toMin = hhmm => {
    if (!hhmm) return null;
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const toHHMM = min => {
    if (min == null) return '';
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const durText = min => {
    if (min == null) return '';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  };

  /* ---------- geo ---------- */
  const R = 6371;
  const haversine = (a, b) => {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const WALK_KMH = 4.5;
  // Straight-line distance underestimates real streets; 1.35 is the usual city detour factor.
  const DETOUR = 1.35;
  const walkMin = km => km == null ? null : Math.round((km * DETOUR) / WALK_KMH * 60);
  const distText = km => km == null ? '' : (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(1)} km`);

  /* ---------- sun times (NOAA approximation, good to ~1 min) ---------- */
  // Returns { sunrise, sunset } in local-clock minutes for the given lat/lng and tz offset (hours).
  const sunTimes = (iso, lat, lng, tzOffsetHours) => {
    const d = parseDate(iso);
    const start = new Date(d.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((d - start) / 86400000);
    const rad = Math.PI / 180;

    const calc = isSunrise => {
      const lngHour = lng / 15;
      const t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24;
      const M = (0.9856 * t) - 3.289;                                   // mean anomaly
      let L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634;
      L = (L + 360) % 360;                                              // true longitude
      let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
      RA = (RA + 360) % 360;
      RA += (Math.floor(L / 90) * 90) - (Math.floor(RA / 90) * 90);     // same quadrant as L
      RA /= 15;
      const sinDec = 0.39782 * Math.sin(L * rad);
      const cosDec = Math.cos(Math.asin(sinDec));
      const zenith = 90.833;                                            // official, includes refraction
      const cosH = (Math.cos(zenith * rad) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return null;                           // polar day / night
      let H = isSunrise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
      H /= 15;
      const T = H + RA - (0.06571 * t) - 6.622;                         // local mean time
      const UT = ((T - lngHour) % 24 + 24) % 24;
      return ((UT + tzOffsetHours) % 24 + 24) % 24 * 60;
    };
    return { sunrise: calc(true), sunset: calc(false) };
  };

  /* ---------- money ---------- */
  const money = (n, cur = 'EUR') => {
    if (n == null || isNaN(n)) return '—';
    const sym = { EUR: '€', INR: '₹', USD: '$', GBP: '£' }[cur] || (cur + ' ');
    const v = cur === 'INR' ? Math.round(n) : (Math.round(n * 100) / 100);
    return sym + v.toLocaleString(cur === 'INR' ? 'en-IN' : 'en-GB',
      { minimumFractionDigits: 0, maximumFractionDigits: cur === 'INR' ? 0 : 2 });
  };

  /* ---------- misc ---------- */
  const slug = s => String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clone = o => JSON.parse(JSON.stringify(o));

  const CATEGORIES = {
    sight:         { icon: '🏛', label: 'Sight' },
    museum:        { icon: '🖼', label: 'Museum' },
    activity:      { icon: '🎫', label: 'Activity' },
    neighbourhood: { icon: '🏘', label: 'Neighbourhood' },
    park:          { icon: '🌳', label: 'Park' },
    food:          { icon: '🍽', label: 'Food & drink' },
    shop:          { icon: '🛍', label: 'Shopping' },
    transit:       { icon: '🚉', label: 'Transit' },
    hotel:         { icon: '🏨', label: 'Hotel' },
    other:         { icon: '📍', label: 'Other' },
  };
  const catIcon = c => (CATEGORIES[c] || CATEGORIES.other).icon;
  const catLabel = c => (CATEGORIES[c] || CATEGORIES.other).label;

  return {
    el, $, $$, esc,
    DAYS_SHORT, DAYS_LONG, MONTHS,
    parseDate, fmtDate, todayISO, dow, prettyDate, shortDate, addDays, daysBetween,
    toMin, toHHMM, durText,
    haversine, walkMin, distText, WALK_KMH,
    sunTimes, money, slug, uid, clone,
    CATEGORIES, catIcon, catLabel,
  };
})();
