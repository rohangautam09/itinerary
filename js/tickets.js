/* Ticket vault.
 *
 * Uploaded files live in IndexedDB on this device only — they are never sent anywhere
 * and never enter the git repo. That is deliberate: tickets carry names, booking refs
 * and scannable barcodes, and this site is public. It also means they survive with no
 * signal, which is when you actually need them.
 */
const Tickets = (() => {

  const DB_NAME = 'itin-tickets';
  const DB_VER = 1;
  const STORE = 'tickets';

  let dbp = null;
  let query = '';
  let objectURLs = [];

  /* ---------- IndexedDB ---------- */

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id' }).createIndex('date', 'date');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const out = fn(store);
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const all = () => tx('readonly', s => s.getAll());
  const put = rec => tx('readwrite', s => s.put(rec));
  const del = id => tx('readwrite', s => s.delete(id));

  /* ---------- types ---------- */

  const TYPES = {
    museum:    { icon: '🎟', label: 'Attraction / museum' },
    experience:{ icon: '🎡', label: 'Experience / tour' },
    transport: { icon: '🚆', label: 'Train / bus / ferry' },
    flight:    { icon: '✈️', label: 'Flight' },
    hotel:     { icon: '🏨', label: 'Hotel' },
    event:     { icon: '🎭', label: 'Event' },
    other:     { icon: '📄', label: 'Other' },
  };
  const typeIcon = t => (TYPES[t] || TYPES.other).icon;
  const typeLabel = t => (TYPES[t] || TYPES.other).label;

  const fileSize = n =>
    n < 1024 ? `${n} B`
      : n < 1048576 ? `${(n / 1024).toFixed(0)} KB`
        : `${(n / 1048576).toFixed(1)} MB`;

  /* ---------- search ---------- */

  function matches(rec, q) {
    if (!q) return true;
    const city = Store.cities().find(c => c.id === rec.cityId);
    const hay = [
      rec.title, rec.ref, rec.notes, rec.date, rec.time,
      typeLabel(rec.type), city?.name,
      ...(rec.files || []).map(f => f.name),
    ].filter(Boolean).join(' ').toLowerCase();
    // Every word has to appear somewhere, so "anne 17" narrows rather than widens.
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }

  /* ---------- add / edit form ---------- */

  function form(rec) {
    const { el } = U;
    const f = UI.formHelpers();
    const title = f.input({ value: rec?.title || '', placeholder: 'e.g. Anne Frank House entry' });
    const type = f.select(Object.entries(TYPES).map(([v, t]) => ({ value: v, label: `${t.icon}  ${t.label}` })), rec?.type || 'museum');
    const cityOpts = [{ value: '', label: '— any —' }, ...Store.cities().map(c => ({ value: c.id, label: c.name }))];
    const city = f.select(cityOpts, rec?.cityId || '');
    const date = el('input', { type: 'date', value: rec?.date || '' });
    const time = el('input', { type: 'time', value: rec?.time || '' });
    const ref = f.input({ value: rec?.ref || '', placeholder: 'Booking / confirmation number' });
    const notes = el('textarea', { placeholder: 'Anything you want to find this by later' }, rec?.notes || '');

    const picker = el('input', {
      type: 'file', multiple: true,
      accept: 'image/*,application/pdf,.pdf',
      style: { padding: '8px' },
    });
    const fileNote = el('p', { class: 'hint' },
      rec?.files?.length ? `${rec.files.length} file(s) already attached — adding more keeps them.` : 'PDFs and photos. Screenshots of a phone ticket work fine.');

    return {
      body: el('div', {},
        f.field('Title', title),
        el('div', { class: 'row2' }, f.field('Type', type), f.field('City', city)),
        el('div', { class: 'row2' }, f.field('Date', date), f.field('Time', time)),
        f.field('Reference', ref),
        f.field('Notes', notes),
        f.field('Attach files', picker, null),
        fileNote,
      ),
      read: async () => {
        const chosen = [...(picker.files || [])];
        const added = await Promise.all(chosen.map(async file => ({
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          blob: await file.arrayBuffer().then(b => new Blob([b], { type: file.type || 'application/octet-stream' })),
        })));
        return {
          id: rec?.id || U.uid(),
          title: title.value.trim(),
          type: type.value,
          cityId: city.value || null,
          date: date.value || '',
          time: time.value || '',
          ref: ref.value.trim(),
          notes: notes.value.trim(),
          files: [...(rec?.files || []), ...added],
          createdAt: rec?.createdAt || new Date().toISOString(),
        };
      },
    };
  }

  function add() { openForm(null); }

  function openForm(rec) {
    const f = form(rec);
    UI.modal({
      title: rec ? 'Edit ticket' : 'Add a ticket',
      body: f.body,
      buttons: [
        rec && { label: 'Delete', class: 'danger', onClick: () => { remove(rec.id); } },
        { spacer: true },
        { label: 'Cancel', class: 'ghost' },
        {
          label: 'Save', class: 'primary',
          onClick: () => {
            (async () => {
              const data = await f.read();
              if (!data.title) { UI.toast('Give it a title'); return; }
              await put(data);
              UI.closeModal();
              UI.toast(rec ? 'Ticket updated' : 'Ticket saved to this device');
              render();
            })();
            return false; // the async save closes the modal itself
          },
        },
      ].filter(Boolean),
    });
  }

  async function remove(id) {
    await del(id);
    UI.toast('Ticket deleted');
    render();
  }

  /* ---------- viewing an attached file ---------- */

  function fileURL(file) {
    const url = URL.createObjectURL(file.blob);
    objectURLs.push(url);
    return url;
  }

  function preview(rec, i) {
    const { el } = U;
    const file = rec.files[i];
    const url = fileURL(file);
    const isImg = file.mime.startsWith('image/');
    UI.modal({
      title: file.name,
      body: el('div', { style: { textAlign: 'center' } },
        isImg
          ? el('img', { src: url, alt: file.name, style: { maxWidth: '100%', borderRadius: '10px' } })
          : el('p', { class: 'hint', style: { padding: '20px 0' } }, 'PDFs open in a new tab.'),
      ),
      buttons: [
        { spacer: true },
        { label: 'Close', class: 'ghost' },
        { label: 'Open in new tab', class: 'primary', onClick: () => { window.open(url, '_blank', 'noopener'); return false; } },
      ],
    });
  }

  /* ---------- render ---------- */

  async function render() {
    const { el, $ } = U;
    const v = $('#view-tickets');
    if (!v) return;

    // Object URLs from the previous render are dead now — let the memory go.
    objectURLs.forEach(URL.revokeObjectURL);
    objectURLs = [];

    let recs;
    try {
      recs = await all();
    } catch (err) {
      v.innerHTML = '';
      v.append(el('div', { class: 'empty' },
        el('p', {}, el('b', {}, 'Ticket storage is unavailable.')),
        el('p', {}, 'Private browsing blocks it in Safari — open the site in a normal tab.'),
        el('p', { class: 'hint' }, U.esc(err.message || String(err)))));
      return;
    }

    recs.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));
    const hits = recs.filter(r => matches(r, query));
    const fileCount = recs.reduce((n, r) => n + (r.files?.length || 0), 0);
    const bytes = recs.reduce((n, r) => n + (r.files || []).reduce((m, f) => m + (f.size || 0), 0), 0);

    v.innerHTML = '';
    v.append(el('div', { class: 'view-head' },
      el('h2', {}, 'Tickets'),
      el('span', { class: 'sub' },
        recs.length ? `${recs.length} ticket${recs.length === 1 ? '' : 's'} · ${fileCount} file${fileCount === 1 ? '' : 's'} · ${fileSize(bytes)}` : 'Nothing stored yet')));

    const search = el('input', {
      type: 'text', value: query, class: 'searchbar',
      placeholder: 'Search title, reference, city, notes, filename…',
      oninput: e => { query = e.target.value; paint(); },
    });
    const bar = el('div', { class: 'toolbar' },
      search,
      el('button', { class: 'btn primary', onclick: add }, '+ Add ticket'));
    v.append(bar);

    const listWrap = el('div', {});
    v.append(listWrap);

    v.append(el('p', { class: 'fineprint' },
      '🔒 Files stay on this device — they are never uploaded and never go into the repo. ',
      'Keep the originals in your email or Files app too: clearing Safari website data would wipe these.'));

    function paint() {
      const shown = recs.filter(r => matches(r, query));
      listWrap.innerHTML = '';

      if (!recs.length) {
        listWrap.append(el('div', { class: 'empty' },
          el('p', {}, 'Add your booked tickets here — Anne Frank, trains, the chocolate factory.'),
          el('p', { class: 'hint', style: { marginBottom: '16px' } }, 'Then search for one instead of digging through email at the entrance.'),
          el('button', { class: 'btn primary', onclick: add }, '+ Add your first ticket')));
        return;
      }
      if (!shown.length) {
        listWrap.append(el('div', { class: 'empty' }, el('p', {}, `Nothing matches “${query}”.`)));
        return;
      }

      shown.forEach(rec => {
        const city = Store.cities().find(c => c.id === rec.cityId);
        const when = [rec.date && U.shortDate(rec.date), rec.time].filter(Boolean).join(' · ');

        const thumbs = el('div', { class: 'ticket-files' },
          (rec.files || []).map((f, i) => {
            const isImg = f.mime.startsWith('image/');
            return el('button', { class: 'ticket-file', title: f.name, onclick: () => preview(rec, i) },
              isImg
                ? el('img', { src: fileURL(f), alt: '' })
                : el('span', { class: 'pdf' }, 'PDF'),
              el('span', { class: 'fname' }, f.name));
          }));

        listWrap.append(el('article', { class: 'ticket' },
          el('div', { class: 'ticket-head' },
            el('span', { class: 'ticket-ico' }, typeIcon(rec.type)),
            el('div', { class: 'ticket-main' },
              el('h3', {}, rec.title),
              el('p', { class: 'ticket-sub' },
                [when, city?.name, typeLabel(rec.type)].filter(Boolean).join(' · '))),
            el('div', { class: 'stop-tools', style: { opacity: 1 } },
              el('button', { class: 'btn-mini', title: 'Edit', onclick: () => openForm(rec) }, '✎'),
              el('button', {
                class: 'btn-mini danger', title: 'Delete',
                onclick: () => UI.confirmModal('Delete this ticket?', `“${rec.title}” and its ${rec.files?.length || 0} file(s) will be removed from this device.`, () => remove(rec.id)),
              }, '✕'))),
          rec.ref && el('p', { class: 'ticket-ref' }, 'Ref ', el('b', {}, rec.ref)),
          rec.notes && el('p', { class: 'ticket-note' }, rec.notes),
          (rec.files || []).length ? thumbs : null,
        ));
      });
    }

    paint();
  }

  /* Tickets for one date — used by the Today view. */
  async function forDate(date) {
    try {
      const recs = await all();
      return recs.filter(r => r.date === date);
    } catch { return []; }
  }

  return { render, add, forDate, TYPES, typeIcon, typeLabel };
})();
