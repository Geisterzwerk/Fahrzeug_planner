// =====================================================================
// sheets.js – Formulare und Detailansichten (als Bottom-Sheets)
// Buchung, Fahrzeugsuche, Schnellfahrt, Fahrzeug, Kontakt, Zug, Schlüssel
// =====================================================================
import { db, get, upsert, remove, save, ensureContact, contactByName } from './store.js';
import {
  PRIO, TECH, KEYS, BSTATUS, TYPES, isTrailer, toD, iso, isoDate, hm, fmtDT, addMin, roundTo, durTxt,
  check, search, quickSearch, liveStatus, bookingsOf, contactName, vehicleLabel, sortByStart, active,
  issueKey, returnKey, setKeyManual, newBooking, conflictsFor, toICS, effEnd,
} from './logic.js';
import {
  esc, telLink, openSheet, closeSheet, closeAllSheets, rerenderSheet, toast, download, dot, statusColor,
  chips, bindChips, chipVal,
} from './ui.js';

const prioChips = Object.entries(PRIO).map(([k, p]) => [k, p.l, p.c]);
const REMINDERS = [['', 'Keine'], ['5', '5 Min.'], ['15', '15 Min.'], ['30', '30 Min.'], ['60', '1 h'], ['custom', 'Eigene']];

function contactDatalist() {
  return `<datalist id="dl-contacts">${db().contacts.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>`;
}

function callBtn(phone, small = false) {
  return phone ? `<a class="btn green ${small ? 'sm' : ''}" href="${telLink(phone)}">📞 Anrufen</a>` : '';
}

// =====================================================================
// BUCHUNG: Formular (neu / bearbeiten) inkl. Fahrzeugsuche
// =====================================================================
export function openBookingForm(existing = null, prefill = {}) {
  const now = roundTo(new Date(), 15);
  let d;
  if (existing) {
    const s = toD(existing.start), e = existing.end ? toD(existing.end) : effEnd(existing);
    const o = get('contacts', existing.ordererId), dr = get('contacts', existing.driverId);
    d = {
      id: existing.id, date: isoDate(s), from: hm(s), to: hm(e), persons: existing.persons, dest: existing.dest,
      ordererName: o?.name || '', ordererPhone: o?.phone || '', driverName: dr?.name || '',
      priority: existing.priority, reminder: existing.reminder == null ? '' : String(existing.reminder),
      reminderTouched: true, note: existing.note, vehicleId: existing.vehicleId, trailerId: existing.trailerId,
      override: existing.override, status: existing.status, quick: existing.quick && !existing.end, showResults: false,
    };
  } else {
    const s = prefill.start ? toD(prefill.start) : addMin(now, 60);
    const e = prefill.end ? toD(prefill.end) : addMin(s, 120);
    d = {
      id: null, date: isoDate(s), from: hm(s), to: hm(e), persons: prefill.persons || 1, dest: prefill.dest || '',
      ordererName: prefill.ordererName || '', ordererPhone: prefill.ordererPhone || '', driverName: '',
      priority: 'normal', reminder: String(db().settings.defaultReminder.normal), reminderTouched: false,
      note: prefill.note || '', vehicleId: prefill.vehicleId || '', trailerId: '', override: false,
      status: 'geplant', quick: false, showResults: !prefill.vehicleId,
    };
  }

  const times = () => {
    const start = new Date(`${d.date}T${d.from}`);
    let end = new Date(`${d.date}T${d.to}`);
    if (end <= start) end = addMin(end, 24 * 60); // über Mitternacht
    return { start, end };
  };

  const capture = (el) => {
    const v = (n) => el.querySelector(`[name="${n}"]`)?.value ?? '';
    d.date = v('date') || d.date; d.from = v('from') || d.from; d.to = v('to') || d.to;
    d.persons = Math.max(0, parseInt(v('persons'), 10) || 0);
    d.dest = v('dest'); d.ordererName = v('orderer'); d.ordererPhone = v('ordererPhone');
    d.driverName = v('driver'); d.note = v('note');
    d.priority = chipVal(el, 'prio') || d.priority;
    const rem = chipVal(el, 'rem');
    d.reminder = rem === 'custom' ? (v('remCustom') || '') : (rem ?? d.reminder);
    d.reminderCustom = rem === 'custom';
    if (el.querySelector('[name="status"]')) d.status = v('status');
    if (el.querySelector('[name="trailer"]')) d.trailerId = v('trailer');
  };

  const resultsHTML = () => {
    const { start, end } = times();
    const r = search({ start, end, persons: d.persons, excludeId: d.id });
    const row = (x, ok) => {
      const { v } = x, rr = x.r;
      const color = ok ? 'green' : rr.reasons[0].k === 'booking' ? 'blue' : rr.reasons[0].k === 'zug' ? 'purple'
        : rr.reasons[0].k === 'tech' ? (v.tech === 'reparatur' ? 'orange' : 'red') : 'grey';
      const pl = v.platoonId ? get('platoons', v.platoonId)?.name : 'Fahrzeugpool';
      let btn = '';
      if (ok) btn = `<button class="btn green sm" data-pick="${v.id}">Wählen</button>`;
      else if (rr.onlyZug) btn = `<button class="btn light sm" data-override="${v.id}">Übersteuern</button>`;
      else if (rr.reasons.every((q) => q.k === 'booking')) btn = `<button class="btn light sm" data-move="${rr.conflicts[0].id}">Verschieben</button>`;
      const sel = d.vehicleId === v.id ? 'selected' : '';
      return `<div class="card row ${ok ? 'ok' : ''} ${sel}">
        <div class="grow">${dot(color)}<b>${esc(vehicleLabel(v))}</b>
          <div class="muted small">${v.seats} Plätze · ${esc(pl || '')}</div>
          ${ok ? `<div class="muted small">Nächste Buchung: ${rr.next ? fmtDT(rr.next.start) : 'keine'}</div>`
          : rr.reasons.map((q) => `<div class="small c-${color}">${esc(q.t)}</div>`).join('')}
          ${!ok && rr.freeFrom ? `<div class="small muted">frei ab ${fmtDT(iso(rr.freeFrom))}</div>` : ''}
        </div>${btn}</div>`;
    };
    return `<div class="label">Verfügbar (${r.ok.length})</div>
      ${r.ok.length ? r.ok.map((x) => row(x, true)).join('') : '<div class="card muted">Keine Fahrzeuge verfügbar.</div>'}
      <div class="label">Nicht verfügbar (${r.no.length})</div>${r.no.map((x) => row(x, false)).join('')}`;
  };

  const trailerSelect = () => {
    const { start, end } = times();
    const trailers = db().vehicles.filter((v) => isTrailer(v) && v.active !== false);
    if (!trailers.length) return '';
    const car = get('vehicles', d.vehicleId);
    return `<label class="field"><span>Anhänger (optional)</span><select name="trailer">
      <option value="">keiner</option>
      ${trailers.map((t) => {
        const r = check(t, { start, end, excludeId: d.id });
        const hint = car && car.trailerId === t.id ? ' – zugeordnet' : r.ok ? '' : ` – ${r.reasons[0].t}`;
        return `<option value="${t.id}" ${d.trailerId === t.id ? 'selected' : ''}>${esc(t.number + hint)}</option>`;
      }).join('')}</select></label>`;
  };

  const render = () => {
    const vSel = get('vehicles', d.vehicleId);
    const known = contactByName(d.ordererName);
    const remSel = d.reminderCustom ? 'custom' : (REMINDERS.some(([k]) => k === d.reminder) ? d.reminder : 'custom');
    return `${contactDatalist()}
    <div class="grid2">
      <label class="field"><span>Datum</span><input type="date" name="date" value="${d.date}"></label>
      <label class="field"><span>Personen</span><input type="number" inputmode="numeric" name="persons" min="0" value="${d.persons}"></label>
      <label class="field"><span>Von</span><input type="time" name="from" value="${d.from}" step="300"></label>
      <label class="field"><span>Bis</span><input type="time" name="to" value="${d.to}" step="300"></label>
    </div>
    <label class="field"><span>Ziel</span><input name="dest" value="${esc(d.dest)}" placeholder="z. B. Thun"></label>
    <label class="field"><span>Bestellt von</span><input name="orderer" list="dl-contacts" value="${esc(d.ordererName)}" placeholder="Name oder Organisation" autocomplete="off"></label>
    <div class="phone-row">
      <label class="field grow"><span>Telefon <i id="ordHint">${d.ordererName && !known ? '<em>(neuer Kontakt – wird gespeichert)</em>' : ''}</i></span>
        <input name="ordererPhone" type="tel" value="${esc(d.ordererPhone)}" placeholder="optional, später nachtragen"></label>
      ${callBtn(d.ordererPhone)}
    </div>
    <label class="field"><span>Fahrer (optional)</span><input name="driver" list="dl-contacts" value="${esc(d.driverName)}" autocomplete="off"></label>
    <div class="label">Priorität</div>${chips('prio', prioChips, d.priority)}
    <div class="label">Erinnerung vorher</div>${chips('rem', REMINDERS, remSel)}
    <label class="field ${remSel === 'custom' ? '' : 'hidden'}" id="remCustomBox"><span>Eigene Zeit (Minuten)</span>
      <input name="remCustom" type="number" inputmode="numeric" value="${remSel === 'custom' ? esc(d.reminder) : ''}"></label>
    <label class="field"><span>Notiz / Transport</span><textarea name="note" rows="2" placeholder="z. B. Material XY">${esc(d.note)}</textarea></label>
    ${d.id ? `<label class="field"><span>Status</span><select name="status">${Object.entries(BSTATUS).map(([k, l]) =>
      `<option value="${k}" ${d.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}

    <div class="label">Fahrzeug</div>
    <div class="card row">
      <div class="grow">${vSel ? `<b>${esc(vehicleLabel(vSel))}</b> <span class="muted small">${vSel.seats} Plätze</span>
        ${d.override ? '<div class="small c-purple">Zug-Sperre übersteuert</div>' : ''}` : '<span class="muted">Noch kein Fahrzeug gewählt</span>'}</div>
      ${vSel ? '<button class="btn light sm" data-act="clearVehicle">Entfernen</button>' : ''}
    </div>
    ${trailerSelect()}
    <button class="btn olive block" data-act="search">🔍 ${d.showResults ? 'Suche aktualisieren' : 'Fahrzeug suchen'}</button>
    ${d.showResults ? `<div id="results">${resultsHTML()}</div>` : ''}
    <div class="sticky-actions">
      <button class="btn olive block big" data-act="save">💾 Speichern</button>
    </div>`;
  };

  const bind = (el) => {
    bindChips(el, 'prio', (val) => {
      if (!d.reminderTouched) {
        capture(el); d.priority = val; d.reminder = String(db().settings.defaultReminder[val] ?? 15); d.reminderCustom = false; rerenderSheet();
      }
    });
    bindChips(el, 'rem', (val) => {
      d.reminderTouched = true;
      el.querySelector('#remCustomBox').classList.toggle('hidden', val !== 'custom');
    });
    // Bekannter Kontakt → Telefonnummer eintragen (ohne neu zu zeichnen, damit der Fokus bleibt)
    const ord = el.querySelector('[name="orderer"]');
    const onOrderer = () => {
      const c = contactByName(ord.value);
      const ph = el.querySelector('[name="ordererPhone"]');
      if (c && c.phone && !ph.value) ph.value = c.phone;
      el.querySelector('#ordHint').innerHTML = ord.value.trim() && !c ? '<em>(neuer Kontakt – wird gespeichert)</em>' : '';
    };
    ord.addEventListener('input', onOrderer); ord.addEventListener('change', onOrderer);
    ['date', 'from', 'to', 'persons'].forEach((n) => el.querySelector(`[name="${n}"]`).addEventListener('change', () => {
      if (d.showResults) { capture(el); const r = el.querySelector('#results'); if (r) r.innerHTML = resultsHTML(); }
    }));
    el.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.act === 'search') { capture(el); d.showResults = true; rerenderSheet(); setTimeout(() => document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth' }), 50); }
      if (t.dataset.act === 'clearVehicle') { capture(el); d.vehicleId = ''; d.override = false; rerenderSheet(); }
      if (t.dataset.pick) { capture(el); d.vehicleId = t.dataset.pick; d.override = false; d.showResults = false; rerenderSheet(); }
      if (t.dataset.override) {
        if (!confirm('Fahrzeug ist einem Zug zugeteilt. Hat der Zug es freigegeben? Sperre für diese Buchung übersteuern?')) return;
        capture(el); d.vehicleId = t.dataset.override; d.override = true; d.showResults = false; rerenderSheet();
      }
      if (t.dataset.move) { capture(el); openBookingForm(get('bookings', t.dataset.move)); }
      if (t.dataset.act === 'save') { capture(el); doSave(); }
    });
  };

  const doSave = () => {
    if (!d.date || !d.from || !d.to) return toast('Datum und Zeit ausfüllen');
    const { start, end } = times();
    const orderer = ensureContact(d.ordererName, d.ordererPhone);
    const driver = ensureContact(d.driverName);
    const rem = d.reminder === '' || d.reminder == null ? null : parseInt(d.reminder, 10);
    const data = {
      start: iso(start), end: d.quick ? '' : iso(end), persons: d.persons, dest: d.dest.trim(),
      ordererId: orderer?.id || '', driverId: driver?.id || '', priority: d.priority,
      reminder: Number.isFinite(rem) ? rem : null, note: d.note.trim(), vehicleId: d.vehicleId,
      trailerId: d.trailerId, override: d.override, status: d.status,
    };
    const old = d.id ? get('bookings', d.id) : null;
    if (old && (old.start !== data.start || old.reminder !== data.reminder)) data.notified = false;
    const probe = { ...(old || {}), ...data, id: d.id || '__new__' };
    if (data.status === 'geplant') {
      const c = conflictsFor(probe);
      if (c.length && !confirm('⚠️ Konflikt:\n\n' + c.join('\n') + '\n\nTrotzdem speichern?')) return;
    }
    if (old) { Object.assign(old, data); save(); } else newBooking(data);
    toast(old ? 'Buchung gespeichert' : 'Buchung erstellt');
    closeSheet();
  };

  openSheet({ title: existing ? 'Buchung bearbeiten' : 'Neue Buchung', render, bind, capture });
}

// =====================================================================
// BUCHUNG: Detailansicht
// =====================================================================
export function openBookingDetail(id) {
  openSheet({
    title: 'Buchung', live: true,
    render: () => {
      const b = get('bookings', id);
      if (!b) return '<div class="card muted">Buchung gelöscht.</div>';
      const v = get('vehicles', b.vehicleId), tr = get('vehicles', b.trailerId);
      const o = get('contacts', b.ordererId), dr = get('contacts', b.driverId);
      const p = PRIO[b.priority];
      const keyHere = v && v.keyStatus === 'ausgegeben' && v.keyBookingId === b.id;
      const time = b.end ? `${fmtDT(b.start)} – ${hm(toD(b.end))}`
        : `seit ${fmtDT(b.start)} · zurück ${b.expectedReturn ? 'ca. ' + hm(toD(b.expectedReturn)) : 'unbekannt'}`;
      const person = (label, c) => `<div class="card row"><div class="grow"><div class="muted small">${label}</div>
        <b>${c ? esc(c.name) : '–'}</b><div class="small ${c?.phone ? '' : 'c-orange'}">${c ? (c.phone ? esc(c.phone) : 'Nummer nicht hinterlegt') : ''}</div></div>
        ${c ? (c.phone ? callBtn(c.phone, true) : `<button class="btn light sm" data-contact="${c.id}">+ Nummer</button>`) : ''}</div>`;
      return `
      <div class="card">
        <div class="row"><span class="tag ${p.c}">${p.l}</span><span class="tag ${b.status === 'geplant' ? 'olive' : 'grey'}">${BSTATUS[b.status]}</span>
          ${b.quick ? '<span class="tag yellow">⚡ Schnellfahrt</span>' : ''}${b.override ? '<span class="tag purple">übersteuert</span>' : ''}</div>
        <h2>${esc(vehicleLabel(v))}${tr ? ` <span class="muted">+ ${esc(tr.number)}</span>` : ''}</h2>
        <div>${time}</div>
        <div>${b.persons} Personen${b.dest ? ' → ' + esc(b.dest) : ''}</div>
        ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
        <div class="muted small">Erinnerung: ${b.reminder == null ? 'keine' : durTxt(b.reminder) + ' vorher'}</div>
      </div>
      ${person('Bestellt von', o)}${person('Fahrer', dr)}
      ${b.status === 'geplant' && v ? (keyHere
        ? `<button class="btn olive block big" data-act="keyBack">🔑 Schlüssel zurück</button>`
        : `<button class="btn yellow block big" data-act="keyOut">🔑 Schlüssel ausgeben</button>`) : ''}
      <div class="grid2">
        <button class="btn light" data-act="edit">✏️ Bearbeiten</button>
        ${b.status === 'geplant' ? '<button class="btn light" data-act="done">✅ Erledigt</button>' : '<button class="btn light" data-act="reopen">↩︎ Wieder geplant</button>'}
        ${b.status === 'geplant' ? '<button class="btn light" data-act="cancel">❌ Stornieren</button>' : '<span></span>'}
        ${b.end ? '<button class="btn light" data-act="ics">📅 In iPhone-Kalender</button>' : '<span></span>'}
      </div>
      <button class="btn danger-link block" data-act="delete">Buchung endgültig löschen</button>`;
    },
    bind: (el) => el.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const b = get('bookings', id); if (!b) return;
      const v = get('vehicles', b.vehicleId);
      if (t.dataset.contact) return openContactForm(get('contacts', t.dataset.contact));
      switch (t.dataset.act) {
        case 'edit': return openBookingForm(b);
        case 'done': if (v && v.keyBookingId === b.id) returnKey(v); else { b.status = 'erledigt'; if (!b.end) b.end = iso(new Date()); save(); } toast('Erledigt'); break;
        case 'reopen': b.status = 'geplant'; save(); break;
        case 'cancel': if (confirm('Buchung stornieren? Sie bleibt in der Historie.')) { b.status = 'storniert'; if (v && v.keyBookingId === b.id) setKeyManual(v, 'mir'); save(); toast('Storniert'); } break;
        case 'delete': if (confirm('Endgültig löschen?')) { remove('bookings', id); closeSheet(); } break;
        case 'keyOut': {
          if (v.keyStatus === 'ausgegeben' && !confirm(`Schlüssel ist bereits bei ${contactName(v.keyHolderId) || 'jemandem'}. Trotzdem neu ausgeben?`)) return;
          issueKey(v, b.driverId || b.ordererId, b.id); toast('Schlüssel ausgegeben'); break;
        }
        case 'keyBack': returnKey(v); toast('Schlüssel zurück – Fahrt erledigt'); break;
        case 'ics': download(`fahrt-${b.start.slice(0, 10)}.ics`, toICS(b), 'text/calendar'); break;
      }
    }),
  });
}

// =====================================================================
// SCHNELLFAHRT
// =====================================================================
const DUR = [['15', '15 min'], ['30', '30 min'], ['60', '1 h'], ['custom', 'Eigene'], ['unk', '?']];

export function openQuick() {
  const q = { who: '', phone: '', persons: 1, purpose: '', dur: '30', custom: '', checked: false };
  const durMin = () => q.dur === 'unk' ? null : q.dur === 'custom' ? (parseInt(q.custom, 10) || null) : parseInt(q.dur, 10);

  const capture = (el) => {
    const v = (n) => el.querySelector(`[name="${n}"]`)?.value ?? '';
    q.who = v('who'); q.phone = v('phone'); q.persons = Math.max(0, parseInt(v('persons'), 10) || 0);
    q.purpose = v('purpose'); q.dur = chipVal(el, 'dur') || q.dur; q.custom = v('custom');
  };

  const results = () => {
    const now = new Date();
    const r = quickSearch({ persons: q.persons, durationMin: durMin(), now });
    const card = (x, kind) => {
      const { v } = x;
      if (kind === 'now') return `<div class="card row ok"><div class="grow">${dot('green')}<b>${esc(vehicleLabel(v))}</b>
        <div class="muted small">${v.seats} Plätze · Nächste Buchung: ${x.r.next ? fmtDT(x.r.next.start) : 'keine'}</div></div>
        <button class="btn green sm" data-give="${v.id}">Ausgeben</button></div>`;
      if (kind === 'soon') return `<div class="card row warn"><div class="grow">${dot('yellow')}<b>${esc(vehicleLabel(v))}</b>
        <div class="small c-yellow">Nächste Buchung ${hm(toD(x.r.next.start))} (in ${durTxt(x.gap)})</div></div>
        <button class="btn yellow sm" data-give="${v.id}" data-warn="${hm(toD(x.r.next.start))}">Ausgeben</button></div>`;
      const ff = x.r.freeFrom;
      return `<div class="card row"><div class="grow">${dot(ff ? 'red' : 'grey')}<b class="muted">${esc(vehicleLabel(v))}</b>
        <div class="small c-red">${esc(x.r.reasons[0].t)}</div>${ff ? `<div class="small muted">voraussichtlich frei ab ${hm(ff)}</div>` : ''}</div>
        ${ff ? `<button class="btn light sm" data-later="${v.id}" data-at="${iso(roundTo(ff, 5))}">Für ${hm(roundTo(ff, 5))} buchen</button>` : ''}</div>`;
    };
    return `<div class="label">Sofort verfügbar</div>${r.now.map((x) => card(x, 'now')).join('') || '<div class="card muted">–</div>'}
      ${r.soon.length ? `<div class="label">Bedingt verfügbar</div>${r.soon.map((x) => card(x, 'soon')).join('')}` : ''}
      <div class="label">Nicht verfügbar</div>${r.no.map((x) => card(x, 'no')).join('') || '<div class="card muted">–</div>'}`;
  };

  const render = () => `${contactDatalist()}
    <div class="muted small">Ausgabe ab jetzt · ${hm(new Date())}</div>
    <label class="field"><span>Wer?</span><input name="who" list="dl-contacts" value="${esc(q.who)}" autocomplete="off" placeholder="Name"></label>
    <label class="field"><span>Telefon ${q.who && !contactByName(q.who) ? '<em>(neuer Kontakt)</em>' : ''}</span><input name="phone" type="tel" value="${esc(q.phone)}" placeholder="optional"></label>
    <div class="grid2">
      <label class="field"><span>Personen</span><input name="persons" type="number" inputmode="numeric" value="${q.persons}"></label>
      <label class="field"><span>Zweck / Ziel</span><input name="purpose" value="${esc(q.purpose)}" placeholder="z. B. Bäckerei"></label>
    </div>
    <div class="label">Voraussichtlich zurück in</div>${chips('dur', DUR, q.dur)}
    <label class="field ${q.dur === 'custom' ? '' : 'hidden'}" id="customBox"><span>Minuten</span><input name="custom" type="number" inputmode="numeric" value="${esc(q.custom)}"></label>
    <button class="btn olive block big" data-act="check">Verfügbarkeit prüfen</button>
    ${q.checked ? results() : ''}`;

  const bind = (el) => {
    bindChips(el, 'dur', (val) => { el.querySelector('#customBox').classList.toggle('hidden', val !== 'custom'); });
    el.querySelector('[name="who"]').addEventListener('change', (e) => {
      const c = contactByName(e.target.value); if (c && c.phone) el.querySelector('[name="phone"]').value = c.phone;
    });
    el.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      capture(el);
      if (t.dataset.act === 'check') { q.checked = true; rerenderSheet(); }
      if (t.dataset.give) {
        if (!q.who.trim()) return toast('Bitte angeben, wer das Fahrzeug bekommt');
        if (t.dataset.warn && !confirm(`Achtung: Fahrzeug wird um ${t.dataset.warn} wieder gebraucht. Trotzdem ausgeben?`)) return;
        const c = ensureContact(q.who, q.phone);
        const now = new Date(), m = durMin();
        const v = get('vehicles', t.dataset.give);
        const b = newBooking({
          start: iso(now), end: '', expectedReturn: m ? iso(addMin(now, m)) : '', persons: q.persons, dest: q.purpose,
          vehicleId: v.id, ordererId: c.id, driverId: c.id, quick: true, reminder: null, notified: true,
        });
        issueKey(v, c.id, b.id);
        closeAllSheets();
        toast(`🔑 ${vehicleLabel(v)} an ${c.name} ausgegeben`);
      }
      if (t.dataset.later) {
        const start = toD(t.dataset.at), m = durMin() || 60;
        openBookingForm(null, {
          start: iso(start), end: iso(addMin(start, m)), persons: q.persons, dest: q.purpose,
          ordererName: q.who, ordererPhone: q.phone, vehicleId: t.dataset.later,
        });
      }
    });
  };
  openSheet({ title: '⚡ Schnellfahrt', render, bind, capture });
}

// =====================================================================
// FAHRZEUG: Detail + Formular
// =====================================================================
export function openVehicleDetail(id) {
  openSheet({
    title: 'Fahrzeug', live: true,
    render: () => {
      const v = get('vehicles', id);
      if (!v) return '<div class="card muted">Gelöscht.</div>';
      const s = liveStatus(v);
      const pl = get('platoons', v.platoonId);
      const towedBy = isTrailer(v) ? db().vehicles.find((x) => x.trailerId === v.id) : null;
      const all = bookingsOf(v.id);
      const upcoming = all.filter((b) => active(b)).sort(sortByStart);
      const hist = all.filter((b) => !active(b)).sort((a, b) => toD(b.start) - toD(a.start)).slice(0, 15);
      const bRow = (b) => `<div class="card row clickable" data-booking="${b.id}"><span class="bar ${PRIO[b.priority].c}"></span>
        <div class="grow"><b>${fmtDT(b.start)}${b.end ? '–' + hm(toD(b.end)) : ' (offen)'}</b>
        <div class="muted small">${esc(contactName(b.ordererId) || '–')} · ${b.persons} Pers.${b.dest ? ' → ' + esc(b.dest) : ''}${b.status !== 'geplant' ? ' · ' + BSTATUS[b.status] : ''}</div></div></div>`;
      const trailers = db().vehicles.filter((x) => isTrailer(x) && x.active !== false);
      return `
      <div class="card">
        <h2>${esc(vehicleLabel(v))}</h2>
        <table class="kv">
          <tr><td>Typ</td><td>${esc(v.type)}</td></tr>
          <tr><td>Militärnummer</td><td>${esc(v.number)}</td></tr>
          ${isTrailer(v) ? '' : `<tr><td>Sitzplätze</td><td>${v.seats}</td></tr>`}
          <tr><td>Zuteilung</td><td>${pl ? esc(pl.name) + (pl.until ? ' bis ' + fmtDT(pl.until) : '') : 'Fahrzeugpool'}</td></tr>
          ${isTrailer(v) ? `<tr><td>Zugeordnet an</td><td>${towedBy ? esc(vehicleLabel(towedBy)) : '–'}</td></tr>` : ''}
          <tr><td>Schlüssel</td><td>${KEYS[v.keyStatus] || '–'}${v.keyStatus === 'ausgegeben' ? ' · ' + esc(contactName(v.keyHolderId)) : ''}</td></tr>
        </table>
        ${v.note ? `<div class="note">${esc(v.note)}</div>` : ''}
      </div>
      <div class="label">Status jetzt</div>
      <div class="card">${dot(statusColor(s.k))}<b>${esc(s.l)}</b></div>
      <div class="label">Technischer Status (manuell)</div>
      ${chips('tech', [['ok', 'Einsatzbereit', 'green'], ['defekt', 'Defekt', 'red'], ['reparatur', 'Reparatur', 'orange'], ['nv', 'Nicht verfügbar', 'grey']], v.tech)}
      ${!isTrailer(v) && trailers.length ? `<label class="field"><span>Anhänger zuordnen (erzeugt keine Buchung)</span>
        <select name="trailerAssign"><option value="">keiner</option>${trailers.map((t) => `<option value="${t.id}" ${v.trailerId === t.id ? 'selected' : ''}>${esc(t.number)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>Zug-Zuteilung</span><select name="platoon"><option value="">Fahrzeugpool</option>
        ${db().platoons.map((p) => `<option value="${p.id}" ${v.platoonId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <button class="btn light block" data-act="key">🔑 Schlüsselstatus ändern</button>
      <div class="label">Aktuelle & nächste Buchungen</div>${upcoming.map(bRow).join('') || '<div class="card muted">Keine</div>'}
      <div class="label">Historie</div>${hist.map(bRow).join('') || '<div class="card muted">Noch keine</div>'}
      <div class="grid2"><button class="btn light" data-act="edit">✏️ Bearbeiten</button>
        <button class="btn light" data-act="archive">${v.active === false ? '↩︎ Wieder in Bestand' : '📦 Aus Bestand nehmen'}</button></div>
      <button class="btn danger-link block" data-act="delete">Fahrzeug löschen</button>`;
    },
    bind: (el) => {
      const v = get('vehicles', id); if (!v) return;
      bindChips(el, 'tech', (val) => { v.tech = val; save(); toast(`Status: ${TECH[val]}`); });
      el.querySelector('[name="trailerAssign"]')?.addEventListener('change', (e) => {
        db().vehicles.forEach((x) => { if (x.trailerId === e.target.value && x.id !== v.id && e.target.value) x.trailerId = ''; });
        v.trailerId = e.target.value; save(); toast('Anhänger-Zuordnung gespeichert');
      });
      el.querySelector('[name="platoon"]').addEventListener('change', (e) => assignPlatoon(v, e.target.value));
      el.addEventListener('click', (e) => {
        const row = e.target.closest('[data-booking]'); if (row) return openBookingDetail(row.dataset.booking);
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.act === 'edit') openVehicleForm(v);
        if (t.dataset.act === 'key') openKeySheet(v.id);
        if (t.dataset.act === 'archive') { v.active = v.active === false; save(); }
        if (t.dataset.act === 'delete' && confirm('Fahrzeug löschen? (Buchungen bleiben bestehen)')) { remove('vehicles', id); closeSheet(); }
      });
    },
  });
}

export function assignPlatoon(v, platoonId) {
  const was = v.platoonId;
  v.platoonId = platoonId;
  if (platoonId && v.keyStatus !== 'ausgegeben') v.keyStatus = 'zug';
  if (!platoonId && was && v.keyStatus === 'zug') {
    v.keyStatus = confirm('Zuteilung aufgehoben. Ist der Schlüssel wieder bei dir?') ? 'mir' : 'unklar';
  }
  save();
  toast(platoonId ? `${get('platoons', platoonId).name} zugeteilt` : 'Zurück im Fahrzeugpool');
}

export function openVehicleForm(existing = null) {
  const d = existing ? { ...existing } : { type: 'DURO', number: 'M-', seats: 8, tech: 'ok', platoonId: '', trailerId: '', keyStatus: 'mir', active: true, note: '' };
  openSheet({
    title: existing ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug',
    render: () => `
      <label class="field"><span>Typ</span><select name="type">${TYPES.map((t) => `<option ${d.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Militärnummer</span><input name="number" value="${esc(d.number)}" autocapitalize="characters"></label>
      <label class="field"><span>Sitzplätze (inkl. Fahrer)</span><input name="seats" type="number" inputmode="numeric" value="${d.seats}"></label>
      <label class="field"><span>Bemerkung</span><textarea name="note" rows="2">${esc(d.note)}</textarea></label>
      <button class="btn olive block big" data-act="save">💾 Speichern</button>
      ${existing ? '' : '<button class="btn light block" data-act="saveNext">Speichern & nächstes erfassen</button>'}`,
    bind: (el) => {
      const typeSel = el.querySelector('[name="type"]');
      typeSel.addEventListener('change', () => { if (typeSel.value === 'Anhänger') el.querySelector('[name="seats"]').value = 0; });
      el.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        const v = (n) => el.querySelector(`[name="${n}"]`).value;
        const num = v('number').trim().toUpperCase();
        if (!num || num === 'M-') return toast('Nummer eingeben');
        if (db().vehicles.some((x) => x.number.toUpperCase() === num && x.id !== d.id)) return toast('Diese Nummer existiert schon');
        upsert('vehicles', { ...d, type: v('type'), number: num, seats: parseInt(v('seats'), 10) || 0, note: v('note').trim() });
        toast('Fahrzeug gespeichert');
        if (t.dataset.act === 'saveNext') { closeSheet(); openVehicleForm(); } else closeSheet();
      });
    },
  });
}

// =====================================================================
// SCHLÜSSEL manuell setzen
// =====================================================================
export function openKeySheet(vid) {
  const v = get('vehicles', vid);
  openSheet({
    title: `Schlüssel ${v.number}`,
    render: () => `${contactDatalist()}
      <div class="card">Aktuell: <b>${KEYS[v.keyStatus]}</b>${v.keyStatus === 'ausgegeben' ? ` · ${esc(contactName(v.keyHolderId))} seit ${fmtDT(v.keySince)}` : ''}</div>
      ${v.keyStatus === 'ausgegeben' ? '<button class="btn olive block big" data-act="back">🔑 Schlüssel zurück</button>' : ''}
      <div class="label">Manuell setzen</div>
      ${chips('ks', Object.entries(KEYS).map(([k, l]) => [k, l]), v.keyStatus)}
      <label class="field"><span>An wen? (bei „Ausgegeben“)</span><input name="who" list="dl-contacts" value="${esc(contactName(v.keyHolderId))}"></label>
      <button class="btn light block" data-act="set">Übernehmen</button>`,
    bind: (el) => el.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t || !t.dataset.act) return;
      if (t.dataset.act === 'back') { returnKey(v); toast('Schlüssel zurück'); closeSheet(); }
      if (t.dataset.act === 'set') {
        const st = chipVal(el, 'ks');
        const c = st === 'ausgegeben' ? ensureContact(el.querySelector('[name="who"]').value) : null;
        if (st === 'ausgegeben' && !c) return toast('Name angeben');
        setKeyManual(v, st, c?.id); toast('Gespeichert'); closeSheet();
      }
    }),
  });
}

// =====================================================================
// KONTAKT
// =====================================================================
export function openContactForm(existing = null) {
  const d = existing ? { ...existing } : { name: '', phone: '', role: '', platoonId: '', note: '' };
  openSheet({
    title: existing ? 'Kontakt' : 'Neuer Kontakt',
    render: () => {
      const bs = existing ? db().bookings.filter((b) => b.ordererId === existing.id || b.driverId === existing.id)
        .sort((a, b) => toD(b.start) - toD(a.start)).slice(0, 10) : [];
      return `
      <label class="field"><span>Name / Bezeichnung *</span><input name="name" value="${esc(d.name)}" placeholder="z. B. Wm Müller, Krankenhaus"></label>
      <div class="phone-row"><label class="field grow"><span>Telefon</span><input name="phone" type="tel" value="${esc(d.phone)}"></label>${callBtn(d.phone)}</div>
      <label class="field"><span>Funktion</span><input name="role" value="${esc(d.role)}" placeholder="z. B. Zugführer, Fahrer"></label>
      <label class="field"><span>Zug</span><select name="platoonId"><option value="">–</option>${db().platoons.map((p) => `<option value="${p.id}" ${d.platoonId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Notiz</span><textarea name="note" rows="2">${esc(d.note)}</textarea></label>
      <button class="btn olive block big" data-act="save">💾 Speichern</button>
      ${bs.length ? `<div class="label">Letzte Buchungen</div>${bs.map((b) => `<div class="card clickable small" data-booking="${b.id}">
        ${fmtDT(b.start)} · ${esc(vehicleLabel(get('vehicles', b.vehicleId)))}${b.dest ? ' · ' + esc(b.dest) : ''} <span class="muted">${BSTATUS[b.status]}</span></div>`).join('')}` : ''}
      ${existing ? '<button class="btn danger-link block" data-act="delete">Kontakt löschen</button>' : ''}`;
    },
    bind: (el) => el.addEventListener('click', (e) => {
      const row = e.target.closest('[data-booking]'); if (row) return openBookingDetail(row.dataset.booking);
      const t = e.target.closest('button'); if (!t) return;
      const v = (n) => el.querySelector(`[name="${n}"]`).value.trim();
      if (t.dataset.act === 'save') {
        if (!v('name')) return toast('Name ist Pflicht');
        const dup = contactByName(v('name'));
        if (dup && dup.id !== d.id) return toast('Name existiert bereits');
        upsert('contacts', { ...d, name: v('name'), phone: v('phone'), role: v('role'), platoonId: v('platoonId'), note: v('note') });
        toast('Kontakt gespeichert'); closeSheet();
      }
      if (t.dataset.act === 'delete' && confirm('Kontakt löschen?')) { remove('contacts', d.id); closeSheet(); }
    }),
  });
}

// =====================================================================
// ZUG
// =====================================================================
export function openPlatoonForm(existing = null) {
  const d = existing ? { ...existing } : { name: '', until: '' };
  openSheet({
    title: existing ? 'Zug bearbeiten' : 'Neuer Zug',
    render: () => {
      const list = db().vehicles.filter((v) => v.active !== false);
      return `
      <label class="field"><span>Name</span><input name="name" value="${esc(d.name)}" placeholder="z. B. Zug 2"></label>
      <label class="field"><span>Zuteilung gültig bis</span><input name="until" type="datetime-local" value="${esc(d.until)}"></label>
      ${existing ? `<div class="label">Fahrzeuge dieses Zugs</div>
      ${list.map((v) => {
        const other = v.platoonId && v.platoonId !== d.id ? get('platoons', v.platoonId)?.name : '';
        return `<label class="card row check"><input type="checkbox" data-v="${v.id}" ${v.platoonId === d.id ? 'checked' : ''}>
          <span class="grow">${esc(vehicleLabel(v))}</span><span class="muted small">${other ? 'bei ' + esc(other) : ''}</span></label>`;
      }).join('')}` : '<div class="muted small">Fahrzeuge kannst du nach dem Speichern zuteilen.</div>'}
      <button class="btn olive block big" data-act="save">💾 Speichern</button>
      ${existing ? '<button class="btn danger-link block" data-act="delete">Zug löschen</button>' : ''}`;
    },
    bind: (el) => el.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.act === 'save') {
        const name = el.querySelector('[name="name"]').value.trim();
        if (!name) return toast('Name eingeben');
        const p = upsert('platoons', { ...d, name, until: el.querySelector('[name="until"]').value }, true);
        el.querySelectorAll('[data-v]').forEach((cb) => {
          const v = get('vehicles', cb.dataset.v);
          if (cb.checked && v.platoonId !== p.id) { v.platoonId = p.id; if (v.keyStatus !== 'ausgegeben') v.keyStatus = 'zug'; }
          if (!cb.checked && v.platoonId === p.id) { v.platoonId = ''; if (v.keyStatus === 'zug') v.keyStatus = 'unklar'; }
        });
        save(); toast('Gespeichert'); closeSheet();
      }
      if (t.dataset.act === 'delete' && confirm('Zug löschen? Fahrzeuge kommen in den Pool (Schlüssel: unklar).')) {
        db().vehicles.forEach((v) => { if (v.platoonId === d.id) { v.platoonId = ''; if (v.keyStatus === 'zug') v.keyStatus = 'unklar'; } });
        remove('platoons', d.id); closeSheet();
      }
    }),
  });
}

// Liste von Fahrzeugen (z. B. Dashboard „6 verfügbar“ antippen)
export function openVehicleList(title, vehicles) {
  openSheet({
    title, live: true,
    render: () => vehicles.map((v) => {
      const s = liveStatus(v);
      return `<div class="card row clickable" data-vehicle="${v.id}">${dot(statusColor(s.k))}<div class="grow"><b>${esc(vehicleLabel(v))}</b>
        <div class="muted small">${isTrailer(v) ? 'Anhänger' : v.seats + ' Plätze'} · ${esc(s.l)}</div></div><span class="muted">›</span></div>`;
    }).join('') || '<div class="card muted">Keine Fahrzeuge</div>',
    bind: (el) => el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-vehicle]'); if (r) openVehicleDetail(r.dataset.vehicle);
    }),
  });
}
