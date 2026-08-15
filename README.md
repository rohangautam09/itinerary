# Itinerary

A day-by-day travel planner that runs as a plain web page — no build step, no server,
no npm. Open it on the Mac, install it to the iPhone home screen, and it keeps working
with no signal.

**Live:** https://rohangautam09.github.io/itinerary/

## What it does

- **Days** — one card per day: stops in order, estimated arrival times, walking distance
  between them, tickets total. Add, edit, reorder and delete everything in the browser.
- **Today** — during the trip this opens by default and shows what's next, how long until
  it, and a one-tap link to walking directions.
- **Map** — every stop as a numbered pin, coloured and routed per day. Filter to one day.
- **Budget** — ticket costs per day and per place, in EUR and INR.
- **Prep** — packing and pre-trip checklist.
- **Print** — ⎙ in the top bar gives a paper/PDF one-pager.

It flags things automatically as you plan:

| Warning | When |
|---|---|
| Closed on *day* | The place isn't open that weekday |
| Opens 10:00 — you'd arrive 09:20 | You'd get there before opening, or still be inside after closing |
| Tight — earlier stops run 40m past this | A booked slot you can't physically reach in time |
| 3.0 km from the last stop | A leg long enough that you'd want a tram or ferry |

Sunrise and sunset are computed for the actual date and location, so a stop can be
anchored to sunset (the Day 1 canal cruise is set to 40 minutes before it).

## Editing

Everything is editable in the app. Changes save to that device immediately — they do
**not** yet publish back to the repo, so an edit on the phone stays on the phone until
GitHub sync is added.

To publish an edit for good, change `data/amsterdam-2026.json` and push.

## Data model

`data/amsterdam-2026.json` is the whole trip.

- `places` — a library of locations, keyed by id. Name, coordinates, category, cost,
  typical visit length, opening hours, notes. A place exists independently of any day.
- `days[].items` — an ordered list of `{ placeId }`, optionally with `start` / `end`
  times, an `anchor` (`sunset`/`sunrise`) with `anchorOffsetMin`, and a per-day `note`.
- `hotels` — where you sleep each night; a day points at one with `hotelId`.
- `wishlist` — place ids saved but not scheduled.
- `packing` — checklist items.

Opening `hours` is either `"always"` or an array of 7 entries starting **Sunday**, each
either `null` (closed) or `["10:00", "18:00"]`.

Any place with a `verify` field shows an ⓘ note in the UI — use it for facts that need
confirming closer to the date.

## Running it locally

```bash
python3 -m http.server 8123 --directory ~/Projects/itinerary
```

Then open http://localhost:8123. It must be served over http — opening `index.html`
directly won't work, because the browser blocks `fetch` on `file://`.

## Offline

The service worker caches the app shell on first load and caches map tiles as you pan
over them, up to 1200 tiles. Pan around Amsterdam once on wifi and the map still draws
with the data roaming off. Shell assets are network-first with a 2.5s timeout, so a
deploy is picked up on the next open but a bad connection never stalls the app.

## Known limits

- Distances are straight-line × 1.35 at 4.5 km/h. Anything crossing the IJ (NDSM,
  Noord) is really a ferry ride, so treat those legs as indicative only.
- Prices and opening hours are typed in by hand and need checking before you travel.
- Weather isn't shown — it would need a network call, which breaks the offline promise.

## Files

```
index.html          markup + the tab shell
css/style.css       all styling, light/dark, phone + desktop
js/util.js          dates, sun times, distances, formatting
js/store.js         trip state, persistence, the scheduling engine
js/map.js           Leaflet map
js/ui.js            every view and every edit form
js/app.js           bootstrap: theme, tabs, print, service worker
sw.js               offline caching
data/*.json         the trip itself
tools/make_icons.py regenerates the PWA icons
vendor/             Leaflet 1.9.4, vendored so the map works offline
```
