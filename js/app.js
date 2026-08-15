/* Bootstrap: theme, tabs, print, offline. */
(async function main() {
  const { $, $$ } = U;

  /* ---------- theme ---------- */
  function applyTheme(mode) {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    Store.setPref('theme', mode);
  }
  applyTheme(Store.getPref('theme', 'system'));
  $('#btnTheme').addEventListener('click', () => {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(Store.getPref('theme', 'system')) + 1) % 3];
    applyTheme(next);
    UI.toast(`Theme: ${next}`);
  });

  /* ---------- tabs ---------- */
  $$('.tab').forEach(t => t.addEventListener('click', () => UI.showView(t.dataset.view)));

  /* ---------- modal dismissal ---------- */
  $('#modalRoot').addEventListener('click', e => {
    if (e.target.hasAttribute('data-close')) UI.closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modalRoot').hidden) UI.closeModal();
  });

  /* ---------- print ---------- */
  $('#btnPrint').addEventListener('click', () => { UI.buildPrintSheet(); window.print(); });
  window.addEventListener('beforeprint', UI.buildPrintSheet);

  /* ---------- load + render ---------- */
  try {
    await Store.load();
  } catch (err) {
    document.querySelector('main').innerHTML =
      `<div class="empty"><p><b>Could not load the trip.</b></p><p>${U.esc(err.message)}</p>
       <p style="font-size:12.5px">If you opened this file directly, serve the folder over http instead —
       <code>python3 -m http.server</code> in the project folder, then open localhost:8000.</p></div>`;
    return;
  }

  Store.onChange(() => UI.renderAll());
  UI.renderAll();

  // Start on Today during the trip, otherwise wherever you left off.
  const trip = Store.get();
  const today = U.todayISO();
  const inTrip = today >= trip.startDate && today <= trip.endDate;
  UI.showView(inTrip ? 'today' : Store.getPref('view', 'days'));

  /* ---------- offline ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  }

  /* ---------- keep "today" honest across midnight / waking the phone ---------- */
  let lastDay = U.todayISO();
  setInterval(() => {
    const now = U.todayISO();
    if (now !== lastDay) { lastDay = now; UI.renderAll(); }
  }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) UI.renderAll(); });
})();
