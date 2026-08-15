/* All rendering + the edit forms. */
const UI = (() => {
  const { el, $, esc } = U;

  /* ================= toast + modal ================= */

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  function closeModal() {
    $('#modalRoot').hidden = true;
    $('#modalBody').innerHTML = '';
    $('#modalFoot').innerHTML = '';
  }

  function modal({ title, body, buttons = [] }) {
    $('#modalTitle').textContent = title;
    const b = $('#modalBody');
    b.innerHTML = '';
    b.append(body);
    const f = $('#modalFoot');
    f.innerHTML = '';
    buttons.forEach(btn => {
      if (btn.spacer) { f.append(el('span', { class: 'spacer' })); return; }
      f.append(el('button', {
        class: `btn ${btn.class || ''}`,
        onclick: () => { if (btn.onClick?.() !== false) closeModal(); },
      }, btn.label));
    });
    $('#modalRoot').hidden = false;
    setTimeout(() => b.querySelector('input,select,textarea')?.focus(), 40);
  }

  function confirmModal(title, message, onYes, yesLabel = 'Delete') {
    modal({
      title,
      body: el('p', { text: message, style: { fontSize: '14px', color: 'var(--ink-2)', lineHeight: '1.5' } }),
      buttons: [
        { label: 'Cancel', class: 'ghost' },
        { label: yesLabel, class: 'danger', onClick: onYes },
      ],
    });
  }

  /* form field helpers */
  const field = (label, input, hint) =>
    el('div', { class: 'field' }, el('label', { text: label }), input, hint && el('p', { class: 'hint', text: hint }));
  const input = (attrs) => el('input', { type: 'text', ...attrs });
  const select = (opts, value) =>
    el('select', {}, opts.map(o => el('option', { value: o.value, selected: o.value === value }, o.label)));

  /* ================= day cards ================= */

  function stopEl(plan, s, dayIndex) {
    const { day } = plan;
    const p = s.place;
    const timeCls = s.fixed ? 'stop-time' : 'stop-time est';
    const timeTxt = s.fixed ? U.toHHMM(s.start) : `~${U.toHHMM(s.start)}`;

    const sub = [U.catLabel(p.category), U.durText(s.end - s.start)];
    if (p.cost > 0) sub.push(U.money(p.cost, Store.get().tripCurrency));

    const tools = el('div', { class: 'stop-tools' },
      el('button', { class: 'btn-mini', title: 'Move up', onclick: () => Store.moveItem(day.date, s.idx, -1) }, '↑'),
      el('button', { class: 'btn-mini', title: 'Move down', onclick: () => Store.moveItem(day.date, s.idx, 1) }, '↓'),
      el('button', { class: 'btn-mini', title: 'Edit', onclick: () => editStop(day.date, s.idx) }, '✎'),
      el('button', {
        class: 'btn-mini danger', title: 'Remove from this day',
        onclick: () => { Store.removeItem(day.date, s.idx); toast(`Removed ${p.name}`); },
      }, '✕'),
    );

    return el('li', { class: 'stop' },
      el('span', { class: 'stop-num' }, String(s.idx + 1)),
      el('div', { class: 'stop-main' },
        el('div', { class: 'stop-title' },
          el('span', { class: 'nm' }, `${U.catIcon(p.category)} ${p.name}`),
          el('span', { class: timeCls, title: s.fixed ? 'Fixed time' : 'Estimated from the stops before it' }, timeTxt),
        ),
        el('div', { class: 'stop-sub' }, sub.join(' · ')),
        s.item.note && el('div', { class: 'stop-note' }, s.item.note),
        s.warnings.length && el('div', { class: 'stop-flags' },
          s.warnings.map(w => el('span', { class: `flag ${w.kind === 'verify' ? 'ok' : 'warn'}` },
            (w.kind === 'verify' ? 'ⓘ ' : '⚠ ') + w.text))),
      ),
      tools,
    );
  }

  function dayCard(day, dayIndex) {
    const trip = Store.get();
    const plan = Store.computeDay(day);
    const d = U.parseDate(day.date);
    const isToday = day.date === U.todayISO();
    const hotel = day.hotelId ? trip.hotels?.[day.hotelId] : null;

    const meta = [];
    if (hotel) meta.push(el('span', { class: 'chip' }, `🏨 ${hotel.name}`));
    if (plan.sun.sunset != null) meta.push(el('span', { class: 'chip' }, `🌇 Sunset ${U.toHHMM(plan.sun.sunset)}`));
    meta.push(el('span', { class: 'chip' }, `${plan.stops.length} stop${plan.stops.length === 1 ? '' : 's'}`));
    const warnCount = plan.stops.reduce((n, s) => n + s.warnings.filter(w => w.kind !== 'verify').length, 0);
    if (warnCount) meta.push(el('span', { class: 'chip warn' }, `⚠ ${warnCount} to check`));

    const list = el('ul', { class: 'stops' });
    plan.stops.forEach((s, i) => {
      if (i > 0 && s.leg) {
        list.append(el('li', { class: 'leg' }, `${U.distText(s.leg.km)} · ${U.durText(s.leg.min)} walk`));
      }
      list.append(stopEl(plan, s, dayIndex));
    });
    if (!plan.stops.length) {
      list.append(el('li', { class: 'stop', style: { color: 'var(--ink-3)', fontSize: '13.5px' } },
        el('div', { class: 'stop-main' }, 'Nothing planned yet — add your first stop below.')));
    }

    const totals = [];
    if (plan.totals.km) totals.push(el('span', {}, el('b', {}, U.distText(plan.totals.km)), ' walking'));
    if (plan.totals.endsAt != null) totals.push(el('span', {}, 'ends ~', el('b', {}, U.toHHMM(plan.totals.endsAt))));
    totals.push(el('span', {}, el('b', {}, U.money(plan.totals.cost, trip.tripCurrency)), ' tickets'));

    return el('article', {
      class: `day-card${isToday ? ' is-today' : ''}`,
      style: { '--day-color': Store.dayColor(dayIndex) },
      'data-date': day.date,
    },
      el('div', { class: 'day-head' },
        el('div', { class: 'day-head-top' },
          el('div', { class: 'day-badge' }, el('b', {}, String(d.getDate())), el('span', {}, U.MONTHS[d.getMonth()])),
          el('div', { class: 'day-titles' },
            el('h3', {}, day.title || `Day ${dayIndex + 1}`),
            el('div', { class: 'day-when' },
              `Day ${dayIndex + 1} · ${U.DAYS_LONG[d.getDay()]}${day.city ? ' · ' + day.city : ''}${isToday ? ' · Today' : ''}`),
          ),
          el('div', { class: 'day-actions' },
            el('button', { class: 'btn-mini', title: 'Show on map', onclick: () => { showView('map'); TripMap.setFilter(day.date); renderMapFilter(); } }, '◎'),
            el('button', { class: 'btn-mini', title: 'Edit day', onclick: () => editDay(day.date) }, '✎'),
            el('button', {
              class: 'btn-mini danger', title: 'Delete day',
              onclick: () => confirmModal('Delete this day?',
                `“${day.title || U.shortDate(day.date)}” and its ${day.items.length} stop(s) will be removed. The places themselves stay in your library.`,
                () => { Store.removeDay(day.date); toast('Day deleted'); }),
            }, '✕'),
          ),
        ),
        el('div', { class: 'day-meta' }, meta),
        day.notes && el('p', { class: 'day-note' }, day.notes),
      ),
      list,
      el('div', { class: 'day-foot' },
        el('div', { class: 'totals' }, totals),
        el('button', { class: 'btn sm', style: { marginLeft: 'auto' }, onclick: () => addStop(day.date) }, '+ Add stop'),
      ),
    );
  }

  /* ================= views ================= */

  function renderDays() {
    const trip = Store.get();
    const v = $('#view-days');
    v.innerHTML = '';

    v.append(el('div', { class: 'view-head' },
      el('h2', {}, 'Itinerary'),
      el('span', { class: 'sub' },
        `${trip.days.length} day${trip.days.length === 1 ? '' : 's'} planned · ${U.shortDate(trip.startDate)} – ${U.shortDate(trip.endDate)}`),
    ));

    const grid = el('div', { class: 'day-grid' });
    trip.days.forEach((day, i) => grid.append(dayCard(day, i)));
    grid.append(el('button', { class: 'add-day-card', onclick: () => addDay() },
      el('span', { class: 'plus' }, '+'), el('span', {}, 'Add a day')));
    v.append(grid);

    v.append(wishlistPanel());
  }

  function wishlistPanel() {
    const trip = Store.get();
    const ids = trip.wishlist || [];
    const panel = el('section', { class: 'panel', style: { marginTop: '26px' } });
    panel.append(el('h3', {}, `Saved places — not scheduled yet (${ids.length})`));
    if (!ids.length) {
      panel.append(el('div', { class: 'empty', style: { padding: '26px' } },
        el('p', {}, 'Anything you want to keep as a maybe lands here.'),
        el('button', { class: 'btn sm', onclick: () => newPlace(null) }, '+ Save a place')));
      return panel;
    }
    const list = el('ul', { class: 'stops' });
    ids.forEach(id => {
      const p = trip.places[id];
      if (!p) return;
      list.append(el('li', { class: 'stop' },
        el('span', { class: 'stop-num', style: { background: 'var(--ink-3)' } }, '☆'),
        el('div', { class: 'stop-main' },
          el('div', { class: 'stop-title' }, el('span', { class: 'nm' }, `${U.catIcon(p.category)} ${p.name}`)),
          el('div', { class: 'stop-sub' }, [U.catLabel(p.category), U.durText(p.durationMin), p.cost > 0 && U.money(p.cost, trip.tripCurrency)].filter(Boolean).join(' · ')),
        ),
        el('div', { class: 'stop-tools' },
          el('button', { class: 'btn-mini', title: 'Schedule on a day', onclick: () => scheduleFromWishlist(id) }, '＋'),
          el('button', { class: 'btn-mini danger', title: 'Remove', onclick: () => Store.fromWishlist(id) }, '✕'),
        )));
    });
    panel.append(list);
    panel.append(el('div', { style: { padding: '12px 18px', borderTop: '1px solid var(--line)' } },
      el('button', { class: 'btn sm', onclick: () => newPlace(null) }, '+ Save a place')));
    return panel;
  }

  function renderToday() {
    const trip = Store.get();
    const v = $('#view-today');
    v.innerHTML = '';
    const today = U.todayISO();
    const idx = trip.days.findIndex(d => d.date === today);

    if (idx === -1) {
      const daysOut = U.daysBetween(today, trip.startDate);
      const hero = el('div', { class: 'today-hero' });
      if (daysOut > 0) {
        hero.append(
          el('p', { class: 'eyebrow' }, 'Countdown'),
          el('div', { class: 'countdown' }, `${daysOut} day${daysOut === 1 ? '' : 's'}`),
          el('p', { class: 'when' }, `until ${trip.name} begins on ${U.prettyDate(trip.startDate)}`),
        );
      } else {
        hero.append(el('p', { class: 'eyebrow' }, 'Trip complete'),
          el('h2', {}, trip.name),
          el('p', { class: 'when' }, `${U.prettyDate(trip.startDate)} – ${U.prettyDate(trip.endDate)}`));
      }
      v.append(hero);

      if (trip.days.length) {
        v.append(el('div', { class: 'view-head' }, el('h2', {}, 'First day'), el('span', { class: 'sub' }, 'What you land into')));
        const grid = el('div', { class: 'day-grid' });
        grid.append(dayCard(trip.days[0], 0));
        v.append(grid);
      }
      return;
    }

    const day = trip.days[idx];
    const plan = Store.computeDay(day);
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const next = plan.stops.find(s => s.end > now);

    const hero = el('div', { class: 'today-hero' },
      el('p', { class: 'eyebrow' }, `Day ${idx + 1} of ${trip.days.length}`),
      el('h2', {}, day.title || U.prettyDate(day.date)),
      el('p', { class: 'when' }, `${U.prettyDate(day.date)}${day.city ? ' · ' + day.city : ''}`),
    );
    if (next) {
      const mins = next.start - now;
      hero.append(
        el('div', { class: 'countdown' }, mins > 0 ? `in ${U.durText(mins)}` : 'now'),
        el('p', { class: 'when' }, `${U.catIcon(next.place.category)} ${next.place.name}${next.fixed ? ` at ${U.toHHMM(next.start)}` : ''}`),
      );
    } else {
      hero.append(el('div', { class: 'countdown' }, 'Day done'), el('p', { class: 'when' }, 'Nothing left on the plan for today.'));
    }
    v.append(hero);

    const cards = el('div', { class: 'next-up' });
    if (next?.place.lat != null) {
      const q = `${next.place.lat},${next.place.lng}`;
      cards.append(el('div', { class: 'next-card' },
        el('p', { class: 'lbl' }, 'Next stop'),
        el('p', { class: 'val' }, next.place.name),
        el('p', { class: 'sub' }, next.place.address || ''),
        el('p', { style: { marginTop: '9px', fontSize: '13px' } },
          el('a', { href: `https://maps.apple.com/?q=${encodeURIComponent(next.place.name)}&ll=${q}`, target: '_blank', rel: 'noopener' }, 'Apple Maps'),
          ' · ',
          el('a', { href: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=walking`, target: '_blank', rel: 'noopener' }, 'Walk there')),
      ));
    }
    if (plan.sun.sunset != null) {
      cards.append(el('div', { class: 'next-card' },
        el('p', { class: 'lbl' }, 'Daylight'),
        el('p', { class: 'val' }, `${U.toHHMM(plan.sun.sunrise)} – ${U.toHHMM(plan.sun.sunset)}`),
        el('p', { class: 'sub' }, `Sunset in ${U.durText(Math.max(0, plan.sun.sunset - now))}`)));
    }
    const hotel = day.hotelId ? trip.hotels?.[day.hotelId] : null;
    if (hotel) {
      cards.append(el('div', { class: 'next-card' },
        el('p', { class: 'lbl' }, 'Tonight'),
        el('p', { class: 'val' }, hotel.name),
        el('p', { class: 'sub' }, hotel.address || '')));
    }
    if (cards.children.length) v.append(cards);

    v.append(el('div', { class: 'view-head', style: { marginTop: '26px' } }, el('h2', {}, 'Today’s plan')));
    const grid = el('div', { class: 'day-grid' });
    grid.append(dayCard(day, idx));
    v.append(grid);
  }

  function renderMapFilter() {
    const trip = Store.get();
    const f = $('#mapFilter');
    f.innerHTML = '';
    const mk = (label, date, color) => el('button', {
      class: `btn sm${TripMap.getFilter() === date ? ' primary' : ''}`,
      style: color ? { borderLeft: `4px solid ${color}` } : {},
      onclick: () => { TripMap.setFilter(date); renderMapFilter(); },
    }, label);
    f.append(mk('All days', 'all'));
    trip.days.forEach((d, i) => f.append(mk(`Day ${i + 1} · ${U.shortDate(d.date)}`, d.date, Store.dayColor(i))));
  }

  function renderMore() {
    const v = $('#view-more');
    v.innerHTML = '';
    renderBudget(v);
    renderPrep(v);
  }

  function renderBudget(v) {
    const trip = Store.get();
    const cur = trip.tripCurrency, home = trip.homeCurrency, fx = trip.fxRate || 1;

    const perDay = trip.days.map((d, i) => ({ i, d, plan: Store.computeDay(d) }));
    const total = perDay.reduce((n, x) => n + x.plan.totals.cost, 0);
    const totalKm = perDay.reduce((n, x) => n + x.plan.totals.km, 0);

    v.append(el('div', { class: 'view-head' },
      el('h2', {}, 'Budget'),
      el('span', { class: 'sub' }, 'Tickets and entry fees only — not hotels, food or transport')));

    v.append(el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('p', { class: 'lbl' }, 'Planned tickets'),
        el('p', { class: 'val' }, U.money(total, cur)), el('p', { class: 'sub' }, `${U.money(total * fx, home)} at ${fx}/${cur}`)),
      el('div', { class: 'stat' }, el('p', { class: 'lbl' }, 'Per day'),
        el('p', { class: 'val' }, U.money(trip.days.length ? total / trip.days.length : 0, cur)),
        el('p', { class: 'sub' }, `over ${trip.days.length} day${trip.days.length === 1 ? '' : 's'}`)),
      el('div', { class: 'stat' }, el('p', { class: 'lbl' }, 'For two'),
        el('p', { class: 'val' }, U.money(total * 2, cur)), el('p', { class: 'sub' }, U.money(total * 2 * fx, home))),
      el('div', { class: 'stat' }, el('p', { class: 'lbl' }, 'On foot'),
        el('p', { class: 'val' }, U.distText(totalKm)), el('p', { class: 'sub' }, 'across the whole trip')),
    ));

    const rows = perDay.map(({ i, d, plan }) => el('tr', {},
      el('td', {}, el('b', {}, `Day ${i + 1}`), ' ', el('span', { style: { color: 'var(--ink-3)' } }, U.shortDate(d.date))),
      el('td', {}, d.title || ''),
      el('td', { class: 'num' }, String(plan.stops.length)),
      el('td', { class: 'num' }, U.distText(plan.totals.km) || '—'),
      el('td', { class: 'num' }, U.money(plan.totals.cost, cur)),
      el('td', { class: 'num' }, U.money(plan.totals.cost * fx, home)),
    ));

    v.append(el('section', { class: 'panel' },
      el('h3', {}, 'By day'),
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Day'), el('th', {}, 'Title'), el('th', { class: 'num' }, 'Stops'),
          el('th', { class: 'num' }, 'Walk'), el('th', { class: 'num' }, cur), el('th', { class: 'num' }, home))),
        el('tbody', {}, rows),
        el('tfoot', {}, el('tr', {},
          el('td', { colspan: 4 }, 'Total'),
          el('td', { class: 'num' }, U.money(total, cur)),
          el('td', { class: 'num' }, U.money(total * fx, home)))),
      )));

    const paid = Object.values(trip.places).filter(p => p.cost > 0).sort((a, b) => b.cost - a.cost);
    if (paid.length) {
      v.append(el('section', { class: 'panel' },
        el('h3', {}, 'Paid entries'),
        el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Place'), el('th', { class: 'num' }, 'Per person'), el('th', { class: 'num' }, 'For two'))),
          el('tbody', {}, paid.map(p => el('tr', {},
            el('td', {}, `${U.catIcon(p.category)} ${p.name}`),
            el('td', { class: 'num' }, U.money(p.cost, cur)),
            el('td', { class: 'num' }, U.money(p.cost * 2, cur))))))));
    }

    v.append(el('p', { class: 'sub', style: { color: 'var(--ink-3)', fontSize: '12.5px' } },
      'Prices are estimates entered by hand — edit any place to correct one. FX rate is set in the trip file.'));
  }

  function renderPrep(v) {
    const trip = Store.get();
    const items = trip.packing || [];
    const done = items.filter(i => i.done).length;

    v.append(el('div', { class: 'view-head', style: { marginTop: '30px' } },
      el('h2', {}, 'Prep'),
      el('span', { class: 'sub' }, `${done} of ${items.length} done`)));

    const groups = {};
    items.forEach(i => (groups[i.group || 'Other'] ||= []).push(i));

    const panel = el('section', { class: 'panel' });
    panel.append(el('h3', {}, 'Packing & to-do'));
    Object.entries(groups).forEach(([g, list]) => {
      panel.append(el('p', { class: 'group-head' }, g));
      const ul = el('ul', { class: 'check-list' });
      list.forEach(it => {
        const id = `pk-${it.id}`;
        ul.append(el('li', { class: `check-item${it.done ? ' done' : ''}` },
          el('input', { type: 'checkbox', id, checked: it.done, onchange: () => Store.togglePack(it.id) }),
          el('label', { for: id }, it.text),
          el('button', { class: 'btn-mini danger', title: 'Remove', onclick: () => Store.removePack(it.id) }, '✕')));
      });
      panel.append(ul);
    });
    panel.append(el('div', { style: { padding: '12px 18px', borderTop: '1px solid var(--line)' } },
      el('button', { class: 'btn sm', onclick: addPackItem }, '+ Add item')));
    v.append(panel);
  }

  /* ================= try list ================= */

  const TRY_CATS = {
    food:       { icon: '🍽', label: 'Food' },
    sweet:      { icon: '🍫', label: 'Sweet' },
    drink:      { icon: '🍺', label: 'Drink' },
    experience: { icon: '🎡', label: 'Experience' },
    shop:       { icon: '🛍', label: 'Shopping' },
    other:      { icon: '✨', label: 'Other' },
  };
  const tryIcon = c => (TRY_CATS[c] || TRY_CATS.other).icon;
  const tryLabel = c => (TRY_CATS[c] || TRY_CATS.other).label;

  let tryFilter = 'all';   // 'all' | 'todo' | 'done' | 'starred'

  function renderTry() {
    const v = $('#view-try');
    v.innerHTML = '';
    const items = Store.tryList();
    const cities = Store.cities();
    const done = items.filter(i => i.done).length;

    v.append(el('div', { class: 'view-head' },
      el('h2', {}, 'Things to try'),
      el('span', { class: 'sub' }, items.length ? `${done} of ${items.length} ticked off` : 'Nothing on the list yet')));

    v.append(el('div', { class: 'toolbar' },
      el('div', { class: 'segmented' },
        [['all', 'All'], ['todo', 'To try'], ['done', 'Tried'], ['starred', '★ Must']].map(([k, label]) =>
          el('button', {
            class: `seg${tryFilter === k ? ' on' : ''}`,
            onclick: () => { tryFilter = k; renderTry(); },
          }, label))),
      el('button', { class: 'btn', onclick: () => editCity(null) }, '+ City'),
      el('button', { class: 'btn primary', onclick: () => editTry(null) }, '+ Add something')));

    const pass = t =>
      tryFilter === 'all' ? true
        : tryFilter === 'todo' ? !t.done
          : tryFilter === 'done' ? t.done
            : t.starred;

    // Every city gets a card, plus a catch-all for items whose city was deleted.
    const groups = cities.map(c => ({ city: c, items: items.filter(t => t.cityId === c.id && pass(t)) }));
    const orphans = items.filter(t => !cities.some(c => c.id === t.cityId) && pass(t));
    if (orphans.length) groups.push({ city: { id: null, name: 'No city', emoji: '📍' }, items: orphans });

    if (!cities.length && !items.length) {
      v.append(el('div', { class: 'empty' },
        el('p', {}, 'Add a city, then start listing what you want to eat, drink and do there.'),
        el('button', { class: 'btn primary', onclick: () => editCity(null) }, '+ Add a city')));
      return;
    }

    const grid = el('div', { class: 'day-grid' });
    groups.forEach(({ city, items: list }, i) => {
      const total = items.filter(t => t.cityId === city.id).length;
      const ticked = items.filter(t => t.cityId === city.id && t.done).length;

      const ul = el('ul', { class: 'stops' });
      list.forEach(t => {
        const id = `try-${t.id}`;
        ul.append(el('li', { class: `stop try-row${t.done ? ' done' : ''}` },
          el('input', {
            type: 'checkbox', id, class: 'try-check', checked: t.done,
            onchange: () => Store.toggleTry(t.id),
          }),
          el('div', { class: 'stop-main' },
            el('div', { class: 'stop-title' },
              el('label', { class: 'nm', for: id }, `${tryIcon(t.category)} ${t.name}`),
              t.starred && el('span', { class: 'star on' }, '★')),
            (t.where || t.category) && el('div', { class: 'stop-sub' },
              [t.where, tryLabel(t.category)].filter(Boolean).join(' · ')),
            t.note && el('div', { class: 'stop-note' }, t.note),
            t.url && el('div', { class: 'stop-sub' },
              el('a', { href: t.url, target: '_blank', rel: 'noopener' }, 'Open link ↗')),
          ),
          el('div', { class: 'stop-tools' },
            el('button', { class: 'btn-mini', title: t.starred ? 'Unstar' : 'Mark as a must', onclick: () => Store.toggleTryStar(t.id) }, t.starred ? '★' : '☆'),
            el('button', { class: 'btn-mini', title: 'Edit', onclick: () => editTry(t) }, '✎'),
            el('button', { class: 'btn-mini danger', title: 'Remove', onclick: () => Store.removeTry(t.id) }, '✕'))));
      });
      if (!list.length) {
        ul.append(el('li', { class: 'stop', style: { color: 'var(--ink-3)', fontSize: '13.5px' } },
          el('div', { class: 'stop-main' }, tryFilter === 'all' ? 'Nothing here yet.' : 'Nothing matches this filter.')));
      }

      grid.append(el('article', { class: 'day-card', style: { '--day-color': Store.dayColor(i) } },
        el('div', { class: 'day-head' },
          el('div', { class: 'day-head-top' },
            el('div', { class: 'day-badge' }, el('b', {}, city.emoji || '📍')),
            el('div', { class: 'day-titles' },
              el('h3', {}, city.name),
              el('div', { class: 'day-when' }, total ? `${ticked} of ${total} tried` : 'Nothing listed yet')),
            city.id && el('div', { class: 'day-actions' },
              el('button', { class: 'btn-mini', title: 'Move up', onclick: () => Store.moveCity(city.id, -1) }, '↑'),
              el('button', { class: 'btn-mini', title: 'Move down', onclick: () => Store.moveCity(city.id, 1) }, '↓'),
              el('button', { class: 'btn-mini', title: 'Rename city', onclick: () => editCity(city) }, '✎'),
              el('button', {
                class: 'btn-mini danger', title: 'Delete city',
                onclick: () => confirmModal('Delete this city?',
                  `“${city.name}” will be removed. Its ${total} item(s) are kept and moved to “No city”.`,
                  () => { Store.removeCity(city.id); toast('City removed'); }),
              }, '✕')))),
        ul,
        city.id && el('div', { class: 'day-foot' },
          el('button', { class: 'btn sm', style: { marginLeft: 'auto' }, onclick: () => editTry(null, city.id) }, '+ Add to ' + city.name))));
    });
    v.append(grid);
  }

  function editCity(city) {
    const name = input({ value: city?.name || '', placeholder: 'e.g. Rotterdam' });
    const emoji = input({ value: city?.emoji || '', placeholder: '🇳🇱', maxlength: 4 });
    modal({
      title: city ? 'Rename city' : 'Add a city',
      body: el('div', {},
        field('City', name),
        field('Emoji', emoji, 'Optional — shows on the card')),
      buttons: [{ label: 'Cancel', class: 'ghost' }, {
        label: city ? 'Save' : 'Add city', class: 'primary',
        onClick: () => {
          if (!name.value.trim()) { toast('Give it a name'); return false; }
          if (city) Store.updateCity(city.id, { name: name.value.trim(), emoji: emoji.value.trim() });
          else Store.addCity({ name: name.value, emoji: emoji.value });
          toast('Saved');
        },
      }],
    });
  }

  function editTry(t, presetCityId) {
    const cities = Store.cities();
    const name = input({ value: t?.name || '', placeholder: 'e.g. Stroopwafels' });
    const cat = select(Object.entries(TRY_CATS).map(([v, c]) => ({ value: v, label: `${c.icon}  ${c.label}` })), t?.category || 'food');
    const cityOpts = cities.map(c => ({ value: c.id, label: c.name }));
    if (!cityOpts.length) cityOpts.push({ value: '', label: '— add a city first —' });
    const city = select(cityOpts, t?.cityId || presetCityId || cityOpts[0]?.value);
    const where = input({ value: t?.where || '', placeholder: 'Where to get it — market, café, area' });
    const url = el('input', { type: 'url', value: t?.url || '', placeholder: 'https://' });
    const note = el('textarea', { placeholder: 'Why, what to order, what to avoid' }, t?.note || '');
    const star = el('input', { type: 'checkbox', checked: t?.starred, style: { width: '17px', height: '17px', accentColor: 'var(--accent)' } });

    modal({
      title: t ? 'Edit' : 'Something to try',
      body: el('div', {},
        field('What', name),
        el('div', { class: 'row2' }, field('City', city), field('Category', cat)),
        field('Where', where),
        field('Link', url),
        field('Note', note),
        el('label', { style: { display: 'flex', gap: '9px', alignItems: 'center', fontSize: '14px' } },
          star, 'Mark as a must-do')),
      buttons: [{ label: 'Cancel', class: 'ghost' }, {
        label: t ? 'Save' : 'Add', class: 'primary',
        onClick: () => {
          if (!name.value.trim()) { toast('What is it?'); return false; }
          const data = {
            name: name.value, cityId: city.value || null, category: cat.value,
            where: where.value, url: url.value, note: note.value, starred: star.checked,
          };
          if (t) Store.updateTry(t.id, data);
          else Store.addTry(data);
          toast('Saved');
        },
      }],
    });
  }

  function addPackItem() {
    const text = input({ placeholder: 'e.g. OV-chipkaart / travel card' });
    const group = input({ placeholder: 'Documents, Tech, Clothing…', value: 'Other' });
    modal({
      title: 'Add to the list',
      body: el('div', {}, field('Item', text), field('Group', group)),
      buttons: [{ label: 'Cancel', class: 'ghost' }, {
        label: 'Add', class: 'primary',
        onClick: () => { if (!text.value.trim()) return false; Store.addPack(text.value.trim(), group.value.trim()); },
      }],
    });
  }

  /* ================= edit forms ================= */

  function dayFormBody(day) {
    const trip = Store.get();
    const suggested = trip.days.length
      ? U.addDays(trip.days[trip.days.length - 1].date, 1)
      : trip.startDate;
    const date = el('input', { type: 'date', value: day?.date || suggested });
    const title = input({ value: day?.title || '', placeholder: 'e.g. Amsterdam old city' });
    const city = input({ value: day?.city || '', placeholder: 'e.g. Amsterdam' });
    const start = el('input', { type: 'time', value: day?.dayStart || '' });
    const hotelOpts = [{ value: '', label: '— none —' },
      ...Object.values(trip.hotels || {}).map(h => ({ value: h.id, label: h.name }))];
    const hotel = select(hotelOpts, day?.hotelId || '');
    const notes = el('textarea', { placeholder: 'Anything you want to remember about this day' }, day?.notes || '');
    return {
      date, title, city, start, hotel, notes,
      body: el('div', {},
        el('div', { class: 'row2' }, field('Date', date), field('Day starts', start, 'Blank uses the trip default')),
        field('Title', title),
        el('div', { class: 'row2' }, field('City', city), field('Hotel', hotel)),
        field('Notes', notes)),
    };
  }

  function addDay() {
    const f = dayFormBody(null);
    modal({
      title: 'Add a day',
      body: f.body,
      buttons: [{ label: 'Cancel', class: 'ghost' }, {
        label: 'Add day', class: 'primary',
        onClick: () => {
          if (!f.date.value) { toast('Pick a date'); return false; }
          if (Store.getDay(f.date.value)) { toast('That date is already in the trip'); return false; }
          Store.addDay({
            date: f.date.value, title: f.title.value.trim(), city: f.city.value.trim(),
            hotelId: f.hotel.value || null, notes: f.notes.value.trim(),
          });
          if (f.start.value) Store.updateDay(f.date.value, { dayStart: f.start.value });
          toast('Day added — now add some stops');
        },
      }],
    });
  }

  function editDay(date) {
    const day = Store.getDay(date);
    const f = dayFormBody(day);
    modal({
      title: 'Edit day',
      body: f.body,
      buttons: [{ label: 'Cancel', class: 'ghost' }, {
        label: 'Save', class: 'primary',
        onClick: () => {
          if (f.date.value !== date && Store.getDay(f.date.value)) { toast('That date is already in the trip'); return false; }
          Store.updateDay(date, {
            date: f.date.value, title: f.title.value.trim(), city: f.city.value.trim(),
            hotelId: f.hotel.value || null, notes: f.notes.value.trim(),
            dayStart: f.start.value || undefined,
          });
          toast('Saved');
        },
      }],
    });
  }

  /* --- adding a stop: pick an existing place, or create a new one --- */
  function addStop(date) {
    const trip = Store.get();
    const used = new Set(Store.getDay(date).items.map(i => i.placeId));
    const all = Object.values(trip.places).sort((a, b) => a.name.localeCompare(b.name));

    const search = input({ placeholder: 'Search your places…' });
    const list = el('div', { class: 'pick-list' });

    const paint = () => {
      const q = search.value.toLowerCase().trim();
      list.innerHTML = '';
      const hits = all.filter(p => !q || p.name.toLowerCase().includes(q) || (p.address || '').toLowerCase().includes(q));
      if (!hits.length) {
        list.append(el('p', { class: 'hint', style: { padding: '14px 12px' } },
          'No saved place matches. Use “New place” below to create one.'));
      }
      hits.forEach(p => list.append(el('button', {
        class: 'pick',
        onclick: () => { Store.addItem(date, { placeId: p.id }); Store.fromWishlist(p.id); closeModal(); toast(`${p.name} added`); },
      },
        el('span', { class: 'ico' }, U.catIcon(p.category)),
        el('span', { class: 't' }, el('b', {}, p.name),
          el('span', {}, [U.catLabel(p.category), p.address, used.has(p.id) ? 'already on this day' : null].filter(Boolean).join(' · '))),
      )));
    };
    search.addEventListener('input', paint);
    paint();

    modal({
      title: `Add a stop — ${U.shortDate(date)}`,
      body: el('div', {}, field('Find a place', search), list),
      buttons: [
        { label: 'New place', onClick: () => { newPlace(date); return false; } },
        { spacer: true },
        { label: 'Close', class: 'ghost' },
      ],
    });
  }

  function placeFormBody(p) {
    const name = input({ value: p?.name || '', placeholder: 'e.g. Rijksmuseum' });
    const cat = select(Object.entries(U.CATEGORIES).map(([v, c]) => ({ value: v, label: `${c.icon}  ${c.label}` })), p?.category || 'sight');
    const lat = el('input', { type: 'number', step: 'any', value: p?.lat ?? '', placeholder: '52.3600' });
    const lng = el('input', { type: 'number', step: 'any', value: p?.lng ?? '', placeholder: '4.8852' });
    const addr = input({ value: p?.address || '', placeholder: 'Street, postcode, city' });
    const url = el('input', { type: 'url', value: p?.url || '', placeholder: 'https://' });
    const cost = el('input', { type: 'number', step: '0.5', min: '0', value: p?.cost ?? 0 });
    const dur = el('input', { type: 'number', step: '15', min: '0', value: p?.durationMin ?? 60 });
    const notes = el('textarea', { placeholder: 'Tips, what to book, what to skip' }, p?.notes || '');

    const paste = input({ placeholder: 'Paste a Google Maps link or "52.3600, 4.8852"' });
    paste.addEventListener('input', () => {
      const m = paste.value.match(/(-?\d{1,3}\.\d{3,})[,\s/@]+(-?\d{1,3}\.\d{3,})/);
      if (m) { lat.value = m[1]; lng.value = m[2]; toast('Coordinates picked up'); paste.value = ''; }
    });

    return {
      name, cat, lat, lng, addr, url, cost, dur, notes,
      read: () => ({
        name: name.value.trim(), category: cat.value,
        lat: lat.value === '' ? null : Number(lat.value),
        lng: lng.value === '' ? null : Number(lng.value),
        address: addr.value.trim(), url: url.value.trim(),
        cost: Number(cost.value) || 0, durationMin: Number(dur.value) || 60,
        notes: notes.value.trim(),
      }),
      body: el('div', {},
        field('Name', name),
        el('div', { class: 'row2' }, field('Category', cat), field('Typical time (min)', dur)),
        field('Coordinates', paste, 'Paste a maps link and the lat/lng fill in automatically'),
        el('div', { class: 'row2' }, field('Latitude', lat), field('Longitude', lng)),
        field('Address', addr),
        el('div', { class: 'row2' }, field('Website', url), field(`Cost per person (${Store.get().tripCurrency})`, cost)),
        field('Notes', notes)),
    };
  }

  function newPlace(dateOrNull) {
    const f = placeFormBody(null);
    modal({
      title: 'New place',
      body: f.body,
      buttons: [{ label: 'Cancel', class: 'ghost' }, {
        label: dateOrNull ? 'Add to day' : 'Save to list', class: 'primary',
        onClick: () => {
          const data = f.read();
          if (!data.name) { toast('Give it a name'); return false; }
          const p = Store.addPlace(data);
          if (dateOrNull) { Store.addItem(dateOrNull, { placeId: p.id }); toast(`${p.name} added`); }
          else { Store.toWishlist(p.id); toast(`${p.name} saved`); }
        },
      }],
    });
  }

  function editStop(date, idx) {
    const day = Store.getDay(date);
    const item = day.items[idx];
    const place = Store.get().places[item.placeId];
    const f = placeFormBody(place);

    const start = el('input', { type: 'time', value: item.start || '' });
    const end = el('input', { type: 'time', value: item.end || '' });
    const anchor = select([
      { value: '', label: 'No anchor' },
      { value: 'sunset', label: 'Relative to sunset' },
      { value: 'sunrise', label: 'Relative to sunrise' },
    ], item.anchor || '');
    const offset = el('input', { type: 'number', step: '5', value: item.anchorOffsetMin ?? 0 });
    const note = input({ value: item.note || '', placeholder: 'Just for this day' });

    const dayOpts = Store.get().days.map((d, i) => ({ value: d.date, label: `Day ${i + 1} · ${U.shortDate(d.date)}` }));
    const moveTo = select(dayOpts, date);

    const timing = el('div', {},
      el('div', { class: 'row2' }, field('Start', start, 'Blank = estimated from earlier stops'), field('End', end, 'Blank = start + typical time')),
      el('div', { class: 'row2' }, field('Anchor', anchor), field('Offset (min)', offset, '−40 = 40 min before')),
      field('Note for this day', note),
      field('Move to', moveTo),
      el('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '20px 0' } }),
      el('p', { class: 'hint', style: { marginBottom: '14px' } }, 'Below edits the place everywhere it appears.'),
    );

    modal({
      title: place.name,
      body: el('div', {}, timing, f.body),
      buttons: [
        {
          label: 'Remove from day', class: 'danger',
          onClick: () => { Store.removeItem(date, idx); toast('Removed'); },
        },
        { spacer: true },
        { label: 'Cancel', class: 'ghost' },
        {
          label: 'Save', class: 'primary',
          onClick: () => {
            const data = f.read();
            if (!data.name) { toast('Give it a name'); return false; }
            Store.updatePlace(item.placeId, data);
            Store.updateItem(date, idx, {
              start: start.value || null, end: end.value || null,
              anchor: anchor.value || null,
              anchorOffsetMin: anchor.value ? Number(offset.value) || 0 : null,
              note: note.value.trim() || null,
            });
            if (moveTo.value !== date) Store.moveItemToDay(date, idx, moveTo.value);
            toast('Saved');
          },
        },
      ],
    });
  }

  function scheduleFromWishlist(placeId) {
    const days = Store.get().days;
    if (!days.length) { toast('Add a day first'); return; }
    const list = el('div', { class: 'pick-list' },
      days.map((d, i) => el('button', {
        class: 'pick',
        onclick: () => { Store.addItem(d.date, { placeId }); Store.fromWishlist(placeId); closeModal(); toast('Scheduled'); },
      },
        el('span', { class: 'ico' }, String(i + 1)),
        el('span', { class: 't' }, el('b', {}, d.title || `Day ${i + 1}`), el('span', {}, U.shortDate(d.date))))));
    modal({ title: 'Which day?', body: list, buttons: [{ label: 'Cancel', class: 'ghost' }] });
  }

  /* ================= print ================= */

  function buildPrintSheet() {
    const trip = Store.get();
    const root = $('#printSheet');
    root.innerHTML = '';
    root.append(el('div', { class: 'p-head' },
      el('h1', {}, trip.name),
      el('p', {}, `${U.prettyDate(trip.startDate)} – ${U.prettyDate(trip.endDate)}${trip.subtitle ? ' · ' + trip.subtitle : ''}`)));

    trip.days.forEach((day, i) => {
      const plan = Store.computeDay(day);
      const hotel = day.hotelId ? trip.hotels?.[day.hotelId] : null;
      const ol = el('ol', {});
      plan.stops.forEach(s => ol.append(el('li', {},
        el('span', { class: 't' }, `${s.fixed ? '' : '~'}${U.toHHMM(s.start)} `),
        s.place.name,
        s.place.address ? ` — ${s.place.address}` : '',
        s.item.note ? ` (${s.item.note})` : '')));
      root.append(el('div', { class: 'p-day' },
        el('h3', {}, `Day ${i + 1}: ${day.title || U.shortDate(day.date)}`),
        el('p', { class: 'pw' },
          `${U.prettyDate(day.date)}${hotel ? ' · ' + hotel.name : ''}${plan.sun.sunset != null ? ' · sunset ' + U.toHHMM(plan.sun.sunset) : ''}`),
        ol));
    });
  }

  /* ================= view switching ================= */

  let current = 'today';
  function showView(name) {
    current = name;
    Store.setPref('view', name);
    ['today', 'days', 'map', 'try', 'more'].forEach(v => {
      $(`#view-${v}`).hidden = v !== name;
    });
    U.$$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === name)));
    if (name === 'map') { TripMap.init(); TripMap.render(); renderMapFilter(); TripMap.invalidate(); }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function renderAll() {
    const trip = Store.get();
    $('#tripName').textContent = trip.name;
    $('#tripSub').textContent = trip.subtitle || `${U.shortDate(trip.startDate)} – ${U.shortDate(trip.endDate)}`;
    document.title = trip.name;
    renderToday();
    renderDays();
    renderTry();
    renderMore();
    if (current === 'map') { TripMap.render(); renderMapFilter(); }
  }

  return { renderAll, showView, toast, modal, closeModal, confirmModal,
           buildPrintSheet, renderMapFilter, addDay };
})();
