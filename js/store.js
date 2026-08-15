/* Trip state: load, persist, mutate, and compute the day schedule. */
const Store = (() => {

  const TRIP_FILE = 'data/amsterdam-2026.json';
  const LS_KEY = 'itin:trip';
  const LS_PREFS = 'itin:prefs';

  let trip = null;      // the live, possibly-edited trip
  let published = null; // the pristine copy as shipped in the repo
  const listeners = [];

  const onChange = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => fn(trip));

  /* ---------- load / save ---------- */
  async function load() {
    const res = await fetch(TRIP_FILE, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load ${TRIP_FILE} (${res.status})`);
    published = await res.json();

    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only trust local edits for the same trip and schema.
        if (parsed.id === published.id && parsed.schemaVersion === published.schemaVersion) {
          trip = parsed;
        }
      } catch { /* corrupt local copy — fall through to the published one */ }
    }
    if (!trip) trip = U.clone(published);
    return trip;
  }

  function save() {
    trip.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(trip));
    } catch (e) {
      console.warn('Could not persist trip locally', e);
    }
    emit();
  }

  const get = () => trip;
  const hasLocalEdits = () => localStorage.getItem(LS_KEY) !== null;
  function resetToPublished() {
    localStorage.removeItem(LS_KEY);
    trip = U.clone(published);
    emit();
  }
  function exportJSON() {
    const out = U.clone(trip);
    out.updatedAt = new Date().toISOString();
    return JSON.stringify(out, null, 2);
  }

  /* ---------- prefs (theme, last view) ---------- */
  const prefs = (() => {
    try { return JSON.parse(localStorage.getItem(LS_PREFS)) || {}; } catch { return {}; }
  })();
  const setPref = (k, v) => { prefs[k] = v; localStorage.setItem(LS_PREFS, JSON.stringify(prefs)); };
  const getPref = (k, d) => prefs[k] ?? d;

  /* ---------- day mutations ---------- */
  function addDay({ date, title, city, hotelId, notes }) {
    const day = { date, title: title || '', city: city || '', hotelId: hotelId || null, notes: notes || '', items: [] };
    trip.days.push(day);
    sortDays();
    save();
    return day;
  }
  function updateDay(date, patch) {
    const d = trip.days.find(x => x.date === date);
    if (!d) return;
    Object.assign(d, patch);
    if (patch.date && patch.date !== date) sortDays();
    save();
  }
  function removeDay(date) {
    trip.days = trip.days.filter(d => d.date !== date);
    save();
  }
  const sortDays = () => trip.days.sort((a, b) => a.date.localeCompare(b.date));
  const getDay = date => trip.days.find(d => d.date === date);

  /* ---------- place mutations ---------- */
  function addPlace(p) {
    let id = p.id || U.slug(p.name);
    while (trip.places[id]) id = `${id}-${U.uid().slice(0, 3)}`;
    trip.places[id] = {
      id, name: p.name, category: p.category || 'other',
      lat: p.lat ?? null, lng: p.lng ?? null,
      address: p.address || '', url: p.url || '',
      cost: Number(p.cost) || 0, durationMin: Number(p.durationMin) || 60,
      hours: p.hours || 'always', notes: p.notes || '',
      photo: p.photo || '',
    };
    save();
    return trip.places[id];
  }
  function updatePlace(id, patch) {
    if (!trip.places[id]) return;
    Object.assign(trip.places[id], patch);
    save();
  }
  function removePlace(id) {
    delete trip.places[id];
    trip.days.forEach(d => { d.items = d.items.filter(i => i.placeId !== id); });
    trip.wishlist = (trip.wishlist || []).filter(x => x !== id);
    save();
  }

  /* ---------- item (a place scheduled on a day) mutations ---------- */
  function addItem(date, item) {
    const d = getDay(date);
    if (!d) return;
    d.items.push(item);
    save();
  }
  function updateItem(date, idx, patch) {
    const d = getDay(date);
    if (!d || !d.items[idx]) return;
    Object.assign(d.items[idx], patch);
    for (const k of Object.keys(patch)) if (patch[k] === null || patch[k] === '') delete d.items[idx][k];
    save();
  }
  function removeItem(date, idx) {
    const d = getDay(date);
    if (!d) return;
    d.items.splice(idx, 1);
    save();
  }
  function moveItem(date, idx, delta) {
    const d = getDay(date);
    if (!d) return;
    const to = idx + delta;
    if (to < 0 || to >= d.items.length) return;
    [d.items[idx], d.items[to]] = [d.items[to], d.items[idx]];
    save();
  }
  function moveItemToDay(fromDate, idx, toDate) {
    const from = getDay(fromDate), to = getDay(toDate);
    if (!from || !to || from === to) return;
    const [item] = from.items.splice(idx, 1);
    delete item.start; delete item.end;   // times rarely survive a day change
    to.items.push(item);
    save();
  }

  /* ---------- wishlist ---------- */
  function toWishlist(placeId) {
    trip.wishlist = trip.wishlist || [];
    if (!trip.wishlist.includes(placeId)) trip.wishlist.push(placeId);
    save();
  }
  function fromWishlist(placeId) {
    trip.wishlist = (trip.wishlist || []).filter(x => x !== placeId);
    save();
  }

  /* ---------- packing ---------- */
  function togglePack(id) {
    const it = (trip.packing || []).find(p => p.id === id);
    if (it) { it.done = !it.done; save(); }
  }
  function addPack(text, group) {
    trip.packing = trip.packing || [];
    trip.packing.push({ id: U.uid(), text, group: group || 'Other', done: false });
    save();
  }
  function removePack(id) {
    trip.packing = (trip.packing || []).filter(p => p.id !== id);
    save();
  }

  /* ---------- schedule engine ---------- */

  // What UTC offset (hours) does the trip timezone have on this date?
  function tzOffset(iso) {
    const tz = trip.timezone || 'Europe/Amsterdam';
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date(iso + 'T12:00:00Z'));
      const name = parts.find(p => p.type === 'timeZoneName')?.value || '';
      const m = name.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
      if (m) return Number(m[1]) + (m[2] ? Math.sign(Number(m[1])) * Number(m[2]) / 60 : 0);
    } catch { /* older engine without shortOffset — fall back below */ }
    return 2; // CEST, correct for a September trip in NL/BE/DE
  }

  function daySun(day) {
    const anchorPlace = day.items.map(i => trip.places[i.placeId]).find(p => p && p.lat != null);
    const hotel = day.hotelId ? trip.hotels?.[day.hotelId] : null;
    const at = anchorPlace || hotel;
    if (!at) return { sunrise: null, sunset: null };
    return U.sunTimes(day.date, at.lat, at.lng, tzOffset(day.date));
  }

  // Opening hours for a place on a given weekday: null = closed, [openMin, closeMin], or 'always'.
  function hoursOn(place, weekday) {
    if (!place || !place.hours || place.hours === 'always') return 'always';
    const h = place.hours[weekday];
    if (!h) return null;
    return [U.toMin(h[0]), U.toMin(h[1])];
  }

  /**
   * Lay a day out on a clock.
   * Fixed times (explicit start, or an anchor like sunset) hold their slot; everything
   * else floats forward from the previous stop plus the walk between them.
   */
  function computeDay(day) {
    const sun = daySun(day);
    const wd = U.dow(day.date);
    let cursor = U.toMin(day.dayStart || trip.defaultDayStart || '09:00');

    const stops = [];
    let prevPlace = day.hotelId ? trip.hotels?.[day.hotelId] : null;
    let totalKm = 0, totalWalk = 0, totalCost = 0, totalActive = 0;

    day.items.forEach((item, idx) => {
      const place = trip.places[item.placeId];
      if (!place) return;

      const km = U.haversine(prevPlace, place);
      const legMin = U.walkMin(km);
      if (km != null) { totalKm += km; totalWalk += legMin; }

      // Where does this stop want to start?
      let fixedStart = null;
      if (item.start) fixedStart = U.toMin(item.start);
      else if (item.anchor === 'sunset' && sun.sunset != null) fixedStart = Math.round(sun.sunset + (item.anchorOffsetMin || 0));
      else if (item.anchor === 'sunrise' && sun.sunrise != null) fixedStart = Math.round(sun.sunrise + (item.anchorOffsetMin || 0));

      const arrival = cursor + (legMin || 0);
      const start = fixedStart != null ? fixedStart : arrival;
      const dur = Number(place.durationMin) || 60;
      const end = item.end ? U.toMin(item.end) : start + dur;

      const warnings = [];

      // Can we physically get there in time?
      if (fixedStart != null && arrival > fixedStart + 1) {
        warnings.push({ kind: 'late', text: `Tight — earlier stops run ${U.durText(arrival - fixedStart)} past this` });
      }
      // Is the place even open?
      const hrs = hoursOn(place, wd);
      if (hrs === null) {
        warnings.push({ kind: 'closed', text: `Closed on ${U.DAYS_LONG[wd]}s` });
      } else if (hrs !== 'always') {
        const [o, c] = hrs;
        if (start < o) warnings.push({ kind: 'closed', text: `Opens ${U.toHHMM(o)} — you'd arrive ${U.toHHMM(start)}` });
        else if (end > c) warnings.push({ kind: 'closed', text: `Closes ${U.toHHMM(c)} — you'd still be there ${U.toHHMM(end)}` });
      }
      // A leg long enough that you'd probably take a tram instead.
      if (km != null && km > 2.5) {
        warnings.push({ kind: 'far', text: `${U.distText(km)} from the last stop — ${U.durText(legMin)} on foot, consider a tram or the ferry` });
      }
      if (place.verify) warnings.push({ kind: 'verify', text: `Check before you go: ${place.verify}` });

      totalCost += Number(place.cost) || 0;
      totalActive += end - start;

      stops.push({ idx, item, place, start, end, fixed: fixedStart != null, leg: km == null ? null : { km, min: legMin }, warnings });
      cursor = end;
      prevPlace = place;
    });

    return {
      day, stops, sun,
      totals: { km: totalKm, walkMin: totalWalk, cost: totalCost, activeMin: totalActive,
                endsAt: stops.length ? stops[stops.length - 1].end : null },
    };
  }

  const dayColor = i => `var(--d${(i % 8) + 1})`;

  return {
    load, save, get, onChange, hasLocalEdits, resetToPublished, exportJSON,
    setPref, getPref,
    addDay, updateDay, removeDay, getDay,
    addPlace, updatePlace, removePlace,
    addItem, updateItem, removeItem, moveItem, moveItemToDay,
    toWishlist, fromWishlist,
    togglePack, addPack, removePack,
    computeDay, daySun, hoursOn, tzOffset, dayColor,
  };
})();
