// =====================================================================
// app.js – Start, Navigation (Tabs), Erinnerungen, Service Worker
// =====================================================================
import { db, get, save, onChange, requestPersist } from './store.js';
import { toD, addMin, vehicleLabel, contactName, overdueList, hm } from './logic.js';
import { $, refreshSheet, toast, closeSheet, closeAllSheets } from './ui.js';
import { plannerPage, vehiclesPage, keysPage, platoonsPage, contactsPage, settingsPage, ui } from './pages.js';

const ROUTES = {
  planner: plannerPage, fahrzeuge: vehiclesPage, schluessel: keysPage,
  zuege: platoonsPage, kontakte: contactsPage, einstellungen: settingsPage,
};

function route() { return (location.hash.replace('#/', '') || 'planner').split('?')[0]; }

function render() {
  const r = ROUTES[route()] ? route() : 'planner';
  const page = ROUTES[r]();
  $('#title').textContent = page.title;
  $('#sub').innerHTML = page.sub || '';
  const inner = document.createElement('div'); // frisch → keine doppelten Listener
  inner.innerHTML = page.html;
  $('#view').replaceChildren(inner);
  page.bind && page.bind(inner);
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('sel', a.dataset.r === r));
}

// Header: Datum vor/zurück im Planner
$('#sub').addEventListener('click', (e) => {
  const n = e.target.closest('[data-nav]'); if (!n) return;
  const step = ui.calMode === 'week' ? 7 : 1;
  const k = Number(n.dataset.nav);
  ui.calDate = k === 0 ? new Date() : new Date(ui.calDate.getFullYear(), ui.calDate.getMonth(), ui.calDate.getDate() + k * step);
  render();
});

$('#sheet-back').addEventListener('click', closeSheet);
$('#sheet-bg').addEventListener('click', closeAllSheets);

window.addEventListener('hashchange', () => { closeAllSheets(); render(); window.scrollTo(0, 0); });
window.addEventListener('rerender', render);
onChange(() => { render(); refreshSheet(); });

// ---------- Erinnerungen & Überfällig-Warnung ----------
async function notify(title, body) {
  toast(`🔔 ${title}: ${body}`, 6000);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: title + body });
    }
  } catch (e) { /* Toast reicht */ }
}

function tick() {
  const now = new Date();
  let changed = false;
  db().bookings.forEach((b) => {
    if (b.status !== 'geplant' || b.reminder == null || b.notified) return;
    const at = addMin(toD(b.start), -b.reminder);
    if (now >= at) {
      b.notified = true; changed = true;
      if (now - toD(b.start) < 30 * 60000) {   // nicht für uralte Buchungen nachholen
        const v = get('vehicles', b.vehicleId), o = get('contacts', b.ordererId);
        notify(`Fahrt um ${hm(toD(b.start))}`, `${vehicleLabel(v)} · ${b.persons} Pers.${b.dest ? ' → ' + b.dest : ''}${o ? ' · ' + o.name + (o.phone ? ' ' + o.phone : '') : ''}`);
      }
    }
  });
  const lim = db().settings.overdueMin;
  overdueList(now).forEach(({ b, min }) => {
    if (min >= lim && !b.overdueNotified) {
      b.overdueNotified = true; changed = true;
      notify('Fahrzeug überfällig', `${vehicleLabel(get('vehicles', b.vehicleId))} · ${contactName(b.driverId || b.ordererId)} seit ${Math.round(min)} Min.`);
    }
  });
  if (changed) save();
  else if (route() === 'planner' || route() === 'schluessel') render(); // Uhrzeit-Linie & Zähler aktualisieren
}

// ---------- Start ----------
render();
requestPersist();
setInterval(tick, 30000);
setTimeout(tick, 1500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW nicht registriert', e));
}
