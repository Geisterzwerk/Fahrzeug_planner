// =====================================================================
// pages.js – Hauptseiten (Tabs): Planner, Fahrzeuge, Schlüssel, Züge, Kontakte, Einstellungen
// =====================================================================
import { db, get, save, replaceAll, resetAll } from './store.js';
import {
  PRIO, KEYS, isTrailer, toD, iso, isoDate, hm, wd, dm, fmtDT, addMin, addDays, startOfDay, monday, sameDay,
  durTxt, effEnd, liveStatus, dashboardCounts, overdueList, contactName, vehicleLabel, sortByStart,
  returnKey, shiftBooking, conflictsFor, minFreeOnDay, platoonOf,
} from './logic.js';
import { esc, telLink, toast, download, dot, statusColor } from './ui.js';
import {
  openBookingForm, openBookingDetail, openQuick, openVehicleDetail, openVehicleForm, openKeySheet,
  openContactForm, openPlatoonForm, openVehicleList,
} from './sheets.js';
import { loadDemo } from './demo.js';
import { openNewWK } from './newwk.js';

export const ui = { calMode: 'day', calDate: new Date(), contactFilter: '', vehicleFilter: '', scrollKey: '', scrollTop: 0 };
const HOUR = 56; // Pixel pro Stunde in der Tagesansicht

const callA = (c, small = true) => (c && c.phone
  ? `<a class="btn green ${small ? 'sm' : ''}" href="${telLink(c.phone)}">📞</a>` : '');

// =====================================================================
// PLANNER
// =====================================================================
export function plannerPage() {
  const now = new Date();
  const c = dashboardCounts(now);
  const over = overdueList(now);
  const keysOut = db().vehicles.filter((v) => v.keyStatus === 'ausgegeben').length;
  const d = ui.calDate;
  const isToday = sameDay(d, now);
  const stat = (k, label, color, list) =>
    `<button class="stat" data-list="${k}">${dot(color)}<b>${list.length}</b><span>${label}</span></button>`;
  const title = ui.calMode === 'day'
    ? `${wd(d)}, ${dm(d)}${d.getFullYear()}${isToday ? ' · Heute' : ''}`
    : `Woche ${dm(monday(d))} – ${dm(addDays(monday(d), 6))}`;

  return {
    title: 'Planner',
    sub: `<button class="nav-arrow" data-nav="-1">‹</button><span>${title}</span><button class="nav-arrow" data-nav="1">›</button>
          ${isToday && ui.calMode === 'day' ? '' : '<button class="today" data-nav="0">Heute</button>'}`,
    html: `
    <div class="card dash">
      <div class="stats">
        ${stat('frei', 'verfügbar', 'green', c.frei)}
        ${stat('eingeplant', 'eingeplant', 'blue', c.eingeplant)}
        ${stat('belegt', 'unterwegs', 'yellow', c.belegt)}
        ${stat('zug', 'an Züge', 'purple', c.zug)}
        ${stat('defekt', 'defekt', 'red', c.defekt)}
        ${stat('reparatur', 'Rep.', 'orange', c.reparatur)}
      </div>
      ${keysOut || over.length ? '<hr>' : ''}
      ${keysOut ? `<a class="alert" href="#/schluessel">${dot('yellow')}<b>${keysOut} Schlüssel ausgegeben</b> <span class="muted">›</span></a>` : ''}
      ${over.map(({ b, min }) => {
        const v = get('vehicles', b.vehicleId), o = get('contacts', b.driverId || b.ordererId);
        return `<div class="alert red-bg">${dot('red')}<div class="grow"><b class="c-red">${esc(vehicleLabel(v))} überfällig seit ${durTxt(min)}</b>
          <div class="small muted">${esc(o?.name || '')}${b.dest ? ' · ' + esc(b.dest) : ''}</div></div>
          ${callA(o)}<button class="btn olive sm" data-keyback="${v?.id}">🔑 zurück</button></div>`;
      }).join('')}
    </div>
    <div class="grid2 main-actions">
      <button class="btn olive big" data-act="new">＋ Buchung</button>
      <button class="btn yellow big" data-act="quick">⚡ Schnellfahrt</button>
    </div>
    <div class="seg"><button class="${ui.calMode === 'day' ? 'sel' : ''}" data-mode="day">Tag</button>
      <button class="${ui.calMode === 'week' ? 'sel' : ''}" data-mode="week">Woche</button></div>
    ${ui.calMode === 'day' ? dayView(d, now) : weekView(d, now)}`,
    bind: (el) => {
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act],[data-mode],[data-list],[data-keyback],[data-booking],[data-day],[data-vehicle]');
        if (!t) return;
        if (t.dataset.act === 'new') openBookingForm(null, ui.calMode === 'day' && !isToday
          ? { start: iso(addMin(startOfDay(d), 8 * 60)), end: iso(addMin(startOfDay(d), 10 * 60)) } : {});
        if (t.dataset.act === 'quick') openQuick();
        if (t.dataset.mode) { ui.calMode = t.dataset.mode; window.dispatchEvent(new Event('rerender')); }
        if (t.dataset.list) {
          const labels = { frei: 'Verfügbar', eingeplant: 'Eingeplant', belegt: 'Unterwegs', zug: 'An Züge', defekt: 'Defekt', reparatur: 'Reparatur' };
          openVehicleList(labels[t.dataset.list], c[t.dataset.list] || []);
        }
        if (t.dataset.keyback) { returnKey(get('vehicles', t.dataset.keyback)); toast('Schlüssel zurück'); }
        if (t.dataset.booking && !t.classList.contains('dragging') && !t.dataset.justDragged) openBookingDetail(t.dataset.booking);
        if (t.dataset.day) { ui.calMode = 'day'; ui.calDate = toD(t.dataset.day); window.dispatchEvent(new Event('rerender')); }
        if (t.dataset.vehicle) openVehicleDetail(t.dataset.vehicle);
      });
      if (ui.calMode === 'day') {
        enableDrag(el);
        // Kalender zur aktuellen Uhrzeit (bzw. 07:00) scrollen; Position beim Neuzeichnen behalten
        const sc = el.querySelector('.day-scroll');
        if (sc) {
          const key = isoDate(d);
          if (ui.scrollKey !== key) {
            ui.scrollKey = key;
            const h = isToday ? now.getHours() - 1 : 7;
            ui.scrollTop = Math.max(0, (h - db().settings.dayStart) * HOUR);
          }
          requestAnimationFrame(() => { sc.scrollTop = ui.scrollTop; });
          sc.addEventListener('scroll', () => { ui.scrollTop = sc.scrollTop; }, { passive: true });
        }
      }
    },
  };
}

// ---------- Tagesansicht ----------
function dayView(day, now) {
  const { dayStart, dayEnd } = db().settings;
  const d0 = addMin(startOfDay(day), dayStart * 60), d1 = addMin(startOfDay(day), dayEnd * 60);
  const items = db().bookings.filter((b) => toD(b.start) < d1 && effEnd(b, now) > d0).sort(sortByStart);

  // Spuren (Lanes) für überlappende Buchungen
  const lanes = [], lane = new Map();
  items.forEach((b) => {
    const s = toD(b.start);
    let i = lanes.findIndex((end) => end <= s);
    if (i < 0) { i = lanes.length; lanes.push(0); }
    lanes[i] = effEnd(b, now); lane.set(b.id, i);
  });
  const n = Math.max(1, lanes.length);

  const hours = [];
  for (let h = dayStart; h <= dayEnd; h++) hours.push(`<div class="hour" style="top:${(h - dayStart) * HOUR}px"><span>${String(h).padStart(2, '0')}:00</span></div>`);

  const blocks = items.map((b) => {
    const s = Math.max(toD(b.start), d0), e = Math.min(effEnd(b, now), d1);
    const top = ((s - d0) / 3600000) * HOUR, h = Math.max(26, ((e - s) / 3600000) * HOUR - 2);
    const v = get('vehicles', b.vehicleId);
    const p = PRIO[b.priority];
    const cls = [p.c, b.status !== 'geplant' ? 'faded' : '', b.status === 'storniert' ? 'striked' : '', !b.end ? 'open' : ''].join(' ');
    const w = 100 / n;
    return `<div class="ev ${cls}" data-booking="${b.id}" style="top:${top}px;height:${h}px;left:calc(${lane.get(b.id) * w}% + 2px);width:calc(${w}% - 4px)">
      <b>${esc(v ? vehicleLabel(v) : 'ohne Fahrzeug')}</b>
      <span>${hm(toD(b.start))}${b.end ? '–' + hm(toD(b.end)) : ' ⚡ offen'} · ${esc(contactName(b.ordererId) || '')}</span>
      ${h > 44 ? `<span>${b.persons} Pers.${b.dest ? ' → ' + esc(b.dest) : ''}</span>` : ''}
    </div>`;
  }).join('');

  const nowLine = sameDay(day, now) && now > d0 && now < d1
    ? `<div class="now-line" style="top:${((now - d0) / 3600000) * HOUR}px"></div>` : '';

  return `<div class="card day-scroll"><div class="day-cal" style="height:${(dayEnd - dayStart) * HOUR + 20}px">
    ${hours.join('')}<div class="ev-area">${blocks}${nowLine}</div></div></div>
    <div class="muted small center">Tipp: Buchung gedrückt halten und ziehen zum Verschieben</div>`;
}

// ---------- Drag & Drop (gedrückt halten → verschieben, 15-Min-Raster) ----------
function enableDrag(root) {
  root.querySelectorAll('.ev').forEach((ev) => {
    const b = get('bookings', ev.dataset.booking);
    if (!b || b.status !== 'geplant' || !b.end) return; // offene Schnellfahrten nicht ziehen
    let timer = null, dragging = false, startY = 0, origTop = 0, delta = 0;
    const down = (y) => {
      startY = y; origTop = parseFloat(ev.style.top);
      timer = setTimeout(() => { dragging = true; ev.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(20); }, 350);
    };
    const move = (y, e) => {
      if (!dragging) { if (Math.abs(y - startY) > 8) clearTimeout(timer); return; }
      e.preventDefault();
      const dy = y - startY;
      delta = Math.round(((dy / HOUR) * 60) / 15) * 15;
      ev.style.top = origTop + (delta / 60) * HOUR + 'px';
      ev.querySelector('span').textContent = `${hm(addMin(toD(b.start), delta))}–${hm(addMin(toD(b.end), delta))} (${delta >= 0 ? '+' : ''}${delta} Min.)`;
    };
    const up = () => {
      clearTimeout(timer);
      if (!dragging) return;
      dragging = false; ev.classList.remove('dragging');
      ev.dataset.justDragged = '1'; setTimeout(() => delete ev.dataset.justDragged, 400);
      if (!delta) return;
      const probe = { ...b, start: iso(addMin(toD(b.start), delta)), end: iso(addMin(toD(b.end), delta)) };
      const c = conflictsFor(probe);
      if (c.length && !confirm('⚠️ Konflikt:\n\n' + c.join('\n') + '\n\nTrotzdem verschieben?')) { delta = 0; window.dispatchEvent(new Event('rerender')); return; }
      shiftBooking(b, delta); toast(`Verschoben um ${delta} Min.`); delta = 0;
    };
    ev.addEventListener('touchstart', (e) => down(e.touches[0].clientY), { passive: true });
    ev.addEventListener('touchmove', (e) => move(e.touches[0].clientY, e), { passive: false });
    ev.addEventListener('touchend', up);
    ev.addEventListener('mousedown', (e) => {
      down(e.clientY);
      const mm = (x) => move(x.clientY, x);
      const mu = () => { up(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
      window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    });
  });
}

// ---------- Wochenansicht ----------
function weekView(day, now) {
  const { dayStart, dayEnd } = db().settings;
  const mon = monday(day);
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const vehicles = db().vehicles.filter((v) => v.active !== false)
    .sort((a, b) => Number(isTrailer(a)) - Number(isTrailer(b)) || a.type.localeCompare(b.type) || a.number.localeCompare(b.number));
  const span = (dayEnd - dayStart) * 3600000;

  const rows = vehicles.map((v) => {
    const cells = days.map((dd) => {
      const d0 = addMin(dd, dayStart * 60), d1 = addMin(dd, dayEnd * 60);
      let inner = '';
      const pl = platoonOf(v, d0);
      if (v.tech !== 'ok') inner += `<div class="wb full ${v.tech === 'reparatur' ? 'orange' : 'red'}"></div>`;
      else if (pl) inner += `<div class="wb full purple" title="${esc(pl.name)}"></div>`;
      db().bookings.filter((b) => (b.vehicleId === v.id || b.trailerId === v.id) && b.status !== 'storniert'
        && toD(b.start) < d1 && effEnd(b, now) > d0).forEach((b) => {
        const s = Math.max(toD(b.start), d0), e = Math.min(effEnd(b, now), d1);
        const l = ((s - d0) / span) * 100, w = Math.max(6, ((e - s) / span) * 100);
        const col = b.quick ? 'yellow' : PRIO[b.priority].c === 'red' ? 'red' : 'blue';
        inner += `<div class="wb ${col} ${b.status === 'erledigt' ? 'faded' : ''}" data-booking="${b.id}" style="left:${l}%;width:${w}%"></div>`;
      });
      return `<div class="wc ${sameDay(dd, now) ? 'today' : ''}">${inner}</div>`;
    }).join('');
    return `<div class="wr"><div class="wn clickable" data-vehicle="${v.id}">${esc(v.type === 'Anhänger' ? 'Anh.' : v.type)}<br><small>${esc(v.number)}</small></div>${cells}</div>`;
  }).join('');

  // Engpass-Hinweis
  const tight = days.filter((dd) => dd >= startOfDay(now)).map((dd) => ({ dd, ...minFreeOnDay(dd) }))
    .filter((x) => x.total && x.min <= 1);
  return `<div class="card week">
    <div class="wr head"><div class="wn"></div>${days.map((dd) => `<div class="wh clickable ${sameDay(dd, now) ? 'today' : ''}" data-day="${iso(dd)}">${wd(dd)}<br><small>${dd.getDate()}.</small></div>`).join('')}</div>
    ${rows || '<div class="muted">Noch keine Fahrzeuge erfasst.</div>'}
    <div class="legend"><span class="tag blue">Buchung</span><span class="tag red">Dringend</span><span class="tag yellow">Schnellfahrt</span><span class="tag purple">Zug</span><span class="tag orange">Rep.</span></div>
  </div>
  ${tight.map((x) => `<div class="card warnbox"><b>${wd(x.dd)} ${dm(x.dd)} wird knapp:</b> nur ${x.min} Fahrzeug${x.min === 1 ? '' : 'e'} frei um ${hm(x.at)}</div>`).join('')}
  <div class="muted small center">Tag antippen → Tagesansicht</div>`;
}

// =====================================================================
// FAHRZEUGE
// =====================================================================
export function vehiclesPage() {
  const f = ui.vehicleFilter.toLowerCase();
  const all = db().vehicles.filter((v) => !f || `${v.type} ${v.number}`.toLowerCase().includes(f));
  const group = (title, list) => list.length ? `<div class="label">${title} (${list.length})</div>${list.map((v) => {
    const s = liveStatus(v);
    const tr = get('vehicles', v.trailerId);
    return `<div class="card row clickable" data-vehicle="${v.id}">${dot(statusColor(s.k))}<div class="grow">
      <b>${esc(vehicleLabel(v))}</b>${tr ? ` <span class="muted small">+ ${esc(tr.number)}</span>` : ''}
      <div class="muted small">${isTrailer(v) ? 'Anhänger' : v.seats + ' Plätze'} · ${esc(s.l)} · 🔑 ${KEYS[v.keyStatus] || '–'}</div></div><span class="muted">›</span></div>`;
  }).join('')}` : '';
  const act = all.filter((v) => v.active !== false);
  return {
    title: 'Fahrzeuge', sub: `${act.length} im Bestand`,
    html: `<input class="search" placeholder="🔎 Suchen (z. B. 345)" value="${esc(ui.vehicleFilter)}" data-filter="vehicle">
      <button class="btn olive block" data-act="add">＋ Fahrzeug / Anhänger erfassen</button>
      ${group('Fahrzeuge', act.filter((v) => !isTrailer(v)))}
      ${group('Anhänger', act.filter(isTrailer))}
      ${group('Nicht mehr im Bestand', all.filter((v) => v.active === false))}
      ${db().vehicles.length ? '' : '<div class="card muted">Noch keine Fahrzeuge. Erfasse deine Fahrzeuge oder lade unter ⚙️ Demo-Daten.</div>'}`,
    bind: (el) => {
      el.addEventListener('click', (e) => {
        const r = e.target.closest('[data-vehicle]'); if (r) return openVehicleDetail(r.dataset.vehicle);
        if (e.target.closest('[data-act="add"]')) openVehicleForm();
      });
      bindFilter(el, 'vehicle', 'vehicleFilter');
    },
  };
}

function bindFilter(el, name, key) {
  const inp = el.querySelector(`[data-filter="${name}"]`);
  if (!inp) return;
  inp.addEventListener('input', () => {
    ui[key] = inp.value; window.dispatchEvent(new Event('rerender'));
    const n = document.querySelector(`[data-filter="${name}"]`); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
  });
}

// =====================================================================
// SCHLÜSSEL
// =====================================================================
export function keysPage() {
  const now = new Date();
  const vs = db().vehicles.filter((v) => v.active !== false);
  const by = (k) => vs.filter((v) => (v.keyStatus || 'mir') === k);
  const overIds = new Set(overdueList(now).map((x) => x.b.vehicleId));
  const out = by('ausgegeben').sort((a, b) => Number(overIds.has(b.id)) - Number(overIds.has(a.id)));
  const card = (v) => {
    const c = get('contacts', v.keyHolderId), b = get('bookings', v.keyBookingId);
    const due = b ? (b.end ? toD(b.end) : toD(b.expectedReturn)) : null;
    const over = overIds.has(v.id);
    return `<div class="card ${over ? 'red-bg bordered-red' : ''}">
      <div class="row">${dot(over ? 'red' : 'yellow')}<div class="grow"><b>${esc(vehicleLabel(v))}</b>
      <div class="small muted">${esc(c?.name || 'unbekannt')} · seit ${hm(toD(v.keySince))}${b?.dest ? ' · ' + esc(b.dest) : ''}</div>
      <div class="small ${over ? 'c-red bold' : 'muted'}">${due ? (over ? `Erwartet ${hm(due)} – überfällig seit ${durTxt((now - due) / 60000)}` : `zurück ca. ${hm(due)}`) : 'Rückkehr unbekannt'}</div></div></div>
      <div class="grid2 mt">${c?.phone ? `<a class="btn green" href="${telLink(c.phone)}">📞 Anrufen</a>` : '<span class="muted small">keine Nummer</span>'}
      <button class="btn olive" data-back="${v.id}">🔑 Schlüssel zurück</button></div></div>`;
  };
  const simple = (v, extra = '') => `<div class="card row clickable" data-key="${v.id}">${dot(statusColor(v.keyStatus === 'zug' ? 'zug' : v.keyStatus === 'mir' ? 'frei' : 'nv'))}
    <b class="grow">${esc(vehicleLabel(v))}</b><span class="muted small">${extra}</span></div>`;
  return {
    title: 'Schlüssel', sub: 'Wer hat welchen Schlüssel?',
    html: `<div class="card stats4">
        <div>${dot('green')}<b>${by('mir').length}</b><span>bei mir</span></div>
        <div>${dot('yellow')}<b>${out.length}</b><span>ausgegeben</span></div>
        <div>${dot('purple')}<b>${by('zug').length}</b><span>beim Zug</span></div>
        <div>${dot('grey')}<b>${by('unklar').length}</b><span>unklar</span></div></div>
      ${out.length ? `<div class="label">Ausgegeben</div>${out.map(card).join('')}` : '<div class="card muted">Alle Schlüssel sind da 👍</div>'}
      ${by('unklar').length ? `<div class="label">Unklar – bitte klären</div>${by('unklar').map((v) => simple(v, 'antippen zum Setzen')).join('')}` : ''}
      ${by('zug').length ? `<div class="label">Beim Zug</div>${by('zug').map((v) => simple(v, esc(get('platoons', v.platoonId)?.name || ''))).join('')}` : ''}
      ${by('mir').length ? `<div class="label">Bei mir</div>${by('mir').map((v) => simple(v)).join('')}` : ''}`,
    bind: (el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-back]');
      if (b) { returnKey(get('vehicles', b.dataset.back)); toast('Schlüssel zurück – Fahrt erledigt'); return; }
      const k = e.target.closest('[data-key]'); if (k) openKeySheet(k.dataset.key);
    }),
  };
}

// =====================================================================
// ZÜGE
// =====================================================================
export function platoonsPage() {
  const vs = db().vehicles.filter((v) => v.active !== false);
  const block = (title, sub, list, color, id) => `<div class="card ${id ? 'clickable' : ''}" ${id ? `data-platoon="${id}"` : ''}>
    <div class="row"><b class="grow big-t">${esc(title)}</b><span class="muted small">${sub}</span></div>
    ${list.map((v) => `<div class="li">${dot(color)}${esc(vehicleLabel(v))}${v.tech !== 'ok' ? ` <span class="small c-orange">(${esc(liveStatus(v).l)})</span>` : ''}</div>`).join('') || '<div class="muted small">keine Fahrzeuge</div>'}</div>`;
  const now = new Date();
  return {
    title: 'Züge', sub: 'Zuteilung der Fahrzeuge',
    html: `${db().platoons.map((p) => {
      const expired = p.until && toD(p.until) <= now;
      return block(p.name, p.until ? (expired ? 'abgelaufen ' : 'bis ') + fmtDT(p.until) : 'ohne Enddatum', vs.filter((v) => v.platoonId === p.id), expired ? 'grey' : 'purple', p.id);
    }).join('')}
      ${block('Fahrzeugpool', 'bei mir', vs.filter((v) => !v.platoonId || !platoonOf(v)), 'green', '')}
      <button class="btn olive block" data-act="add">＋ Zug erfassen</button>
      <div class="muted small center">Zug antippen → Fahrzeuge zuteilen / Datum ändern</div>`,
    bind: (el) => el.addEventListener('click', (e) => {
      const p = e.target.closest('[data-platoon]'); if (p) return openPlatoonForm(get('platoons', p.dataset.platoon));
      if (e.target.closest('[data-act="add"]')) openPlatoonForm();
    }),
  };
}

// =====================================================================
// KONTAKTE
// =====================================================================
export function contactsPage() {
  const f = ui.contactFilter.toLowerCase();
  const list = db().contacts.filter((c) => !f || `${c.name} ${c.phone} ${c.role}`.toLowerCase().includes(f))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: 'Kontakte', sub: 'Auftraggeber & Fahrer',
    html: `<input class="search" placeholder="🔎 Suchen…" value="${esc(ui.contactFilter)}" data-filter="contact">
      <button class="btn olive block" data-act="add">＋ Kontakt</button>
      ${list.map((c) => `<div class="card row clickable" data-contact="${c.id}">
        <div class="avatar">${esc((c.name.split(' ').pop() || '?')[0])}</div>
        <div class="grow"><b>${esc(c.name)}</b><div class="muted small">${esc(c.role || '')}${c.role && c.phone ? ' · ' : ''}${esc(c.phone || '')}</div></div>
        ${c.phone ? `<a class="btn green sm" href="${telLink(c.phone)}">📞</a>` : '<span class="btn light sm warn-t">+ Nummer</span>'}</div>`).join('')
        || '<div class="card muted">Noch keine Kontakte. Sie entstehen automatisch beim Buchen.</div>'}`,
    bind: (el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('a[href^="tel:"]')) return;
        const r = e.target.closest('[data-contact]'); if (r) return openContactForm(get('contacts', r.dataset.contact));
        if (e.target.closest('[data-act="add"]')) openContactForm();
      });
      bindFilter(el, 'contact', 'contactFilter');
    },
  };
}

// =====================================================================
// EINSTELLUNGEN
// =====================================================================
export function settingsPage() {
  const s = db().settings;
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'nicht unterstützt';
  return {
    title: 'Einstellungen', sub: 'Backup, Erinnerungen, Demo',
    html: `
    <div class="label">Neuer WK</div>
    <div class="card small muted">Löscht Fahrzeuge, Buchungen und Züge vom letzten WK. Personen-Kontakte (Sdt, Wm, Lt …) bleiben. Vorher wird ein Backup gespeichert.</div>
    <button class="btn olive block big" data-act="newwk">🔄 Neuer WK starten</button>
    <div class="label">Benachrichtigungen</div>
    <div class="card">
      <div class="small">Status: <b>${perm === 'granted' ? 'erlaubt ✅' : perm === 'denied' ? 'blockiert ❌' : perm}</b></div>
      <div class="small muted">Auf dem iPhone nur möglich, wenn die App zum Home-Bildschirm hinzugefügt wurde (iOS 16.4+). Erinnerungen kommen, solange die App offen/im Hintergrund aktiv ist. Für sichere Erinnerungen: Buchung → „In iPhone-Kalender“.</div>
      <button class="btn light block mt" data-act="perm">Benachrichtigungen erlauben</button>
    </div>
    <div class="label">Überfällig-Warnung</div>
    <label class="field"><span>Warnen nach x Minuten Verspätung</span><input type="number" data-set="overdueMin" value="${s.overdueMin}"></label>
    <div class="label">Standard-Erinnerung je Priorität (Minuten)</div>
    <div class="grid2">${Object.entries(PRIO).map(([k, p]) => `<label class="field"><span>${p.l}</span><input type="number" data-rem="${k}" value="${s.defaultReminder[k] ?? ''}"></label>`).join('')}</div>
    <div class="label">Kalender Tagesansicht</div>
    <div class="grid2"><label class="field"><span>Von (Uhr)</span><input type="number" min="0" max="23" data-set="dayStart" value="${s.dayStart}"></label>
      <label class="field"><span>Bis (Uhr)</span><input type="number" min="1" max="24" data-set="dayEnd" value="${s.dayEnd}"></label></div>
    <div class="label">Daten (nur auf diesem Gerät gespeichert!)</div>
    <div class="card small muted">Regelmässig ein Backup machen. Die Datei kannst du in „Dateien“ sichern oder auf ein anderes Gerät übertragen.</div>
    <div class="grid2"><button class="btn olive" data-act="export">⬇️ Backup exportieren</button>
      <label class="btn light">⬆️ Backup laden<input type="file" accept=".json,application/json" data-act="import" hidden></label></div>
    <div class="grid2 mt"><button class="btn light" data-act="demo">🧪 Demo-Daten laden</button>
      <button class="btn danger" data-act="reset">🗑️ Alles löschen</button></div>
    <div class="muted small center mt">Fahrzeug-Planner v1.1 · ${db().vehicles.length} Fahrzeuge · ${db().bookings.length} Buchungen · ${db().contacts.length} Kontakte</div>`,
    bind: (el) => {
      el.querySelectorAll('[data-set]').forEach((i) => i.addEventListener('change', () => {
        const val = parseInt(i.value, 10); if (Number.isFinite(val)) { s[i.dataset.set] = val; save(); toast('Gespeichert'); }
      }));
      el.querySelectorAll('[data-rem]').forEach((i) => i.addEventListener('change', () => {
        s.defaultReminder[i.dataset.rem] = parseInt(i.value, 10) || 0; save(); toast('Gespeichert');
      }));
      el.querySelector('[data-act="import"]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          if (!data.vehicles) throw new Error('kein Backup');
          if (confirm('Aktuelle Daten durch Backup ersetzen?')) { replaceAll(data); toast('Backup geladen'); }
        } catch (err) { toast('Ungültige Datei'); }
      });
      el.addEventListener('click', async (e) => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.act === 'newwk') openNewWK();
        if (t.dataset.act === 'export') download(`fahrzeugplaner-backup-${isoDate(new Date())}.json`, JSON.stringify(db(), null, 2));
        if (t.dataset.act === 'demo' && confirm('Demo-Daten laden? Aktuelle Daten werden ersetzt.')) { loadDemo(); toast('Demo-Daten geladen'); location.hash = '#/planner'; }
        if (t.dataset.act === 'reset' && confirm('Wirklich ALLE Daten löschen (auch Kontakte)?') && confirm('Sicher? Ohne Backup ist alles weg.')) { resetAll(); toast('Alles gelöscht'); }
        if (t.dataset.act === 'perm') {
          if (typeof Notification === 'undefined') return toast('Nicht unterstützt – App zum Home-Bildschirm hinzufügen');
          const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Erlaubt ✅' : 'Nicht erlaubt'); window.dispatchEvent(new Event('rerender'));
        }
      });
    },
  };
}
