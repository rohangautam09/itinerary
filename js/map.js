/* Leaflet map: numbered pins per day, route lines, day filter. */
const TripMap = (() => {

  let map = null;
  let layer = null;
  let filterDate = 'all';

  function init() {
    if (map) return map;
    map = L.map('map', { zoomControl: true, attributionControl: true, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      crossOrigin: true,
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.setView([52.3731, 4.8926], 13);
    return map;
  }

  const pinIcon = (n, color) => L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${color}"><b>${n}</b></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });

  function popupHTML(place, dayLabel, timeLabel) {
    const bits = [];
    if (timeLabel) bits.push(`<p><b>${U.esc(timeLabel)}</b> · ${U.esc(dayLabel)}</p>`);
    else bits.push(`<p>${U.esc(dayLabel)}</p>`);
    if (place.address) bits.push(`<p>${U.esc(place.address)}</p>`);
    const q = place.lat != null ? `${place.lat},${place.lng}` : encodeURIComponent(place.name);
    bits.push(`<p style="margin-top:6px">
      <a href="https://maps.apple.com/?q=${encodeURIComponent(place.name)}&ll=${q}" target="_blank" rel="noopener">Apple Maps</a> ·
      <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Google Maps</a>
      ${place.url ? ` · <a href="${U.esc(place.url)}" target="_blank" rel="noopener">Website</a>` : ''}
    </p>`);
    return `<div class="pop"><h4>${U.catIcon(place.category)} ${U.esc(place.name)}</h4>${bits.join('')}</div>`;
  }

  // Resolve a CSS custom property (--d3) to a real color Leaflet can paint with.
  const resolveColor = v => {
    const m = String(v).match(/var\((--[\w-]+)\)/);
    if (!m) return v;
    return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#0f766e';
  };

  function render() {
    if (!map) init();
    layer.clearLayers();
    const trip = Store.get();
    const bounds = [];

    trip.days.forEach((day, di) => {
      if (filterDate !== 'all' && filterDate !== day.date) return;
      const color = resolveColor(Store.dayColor(di));
      const plan = Store.computeDay(day);
      const path = [];

      plan.stops.forEach((s, i) => {
        if (s.place.lat == null) return;
        const latlng = [s.place.lat, s.place.lng];
        path.push(latlng);
        bounds.push(latlng);
        const time = s.fixed ? U.toHHMM(s.start) : `~${U.toHHMM(s.start)}`;
        L.marker(latlng, { icon: pinIcon(i + 1, color), riseOnHover: true })
          .bindPopup(popupHTML(s.place, `Day ${di + 1} — ${U.shortDate(day.date)}`, time))
          .addTo(layer);
      });

      if (path.length > 1) {
        L.polyline(path, { color, weight: 3, opacity: .55, dashArray: '6 7' }).addTo(layer);
      }

      const hotel = day.hotelId ? trip.hotels?.[day.hotelId] : null;
      if (hotel && hotel.lat != null && filterDate === day.date) {
        bounds.push([hotel.lat, hotel.lng]);
        L.marker([hotel.lat, hotel.lng], {
          icon: L.divIcon({ className: '', html: `<div class="pin" style="background:#444"><b>🏨</b></div>`, iconSize: [28, 28], iconAnchor: [14, 28] }),
        }).bindPopup(popupHTML({ ...hotel, category: 'hotel' }, 'Your hotel', '')).addTo(layer);
      }
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [42, 42], maxZoom: 15 });
  }

  function setFilter(date) { filterDate = date; render(); }
  const getFilter = () => filterDate;
  function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 60); }
  function focus(lat, lng) { if (map) map.setView([lat, lng], 16, { animate: true }); }

  return { init, render, setFilter, getFilter, invalidate, focus };
})();
