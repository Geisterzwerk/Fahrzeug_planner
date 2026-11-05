// =====================================================================
// logic.js – Planungslogik (ohne UI)
// Verfügbarkeit, Konflikte, Live-Status, Schlüssel, Überfällig
// =====================================================================
import { db, get, upsert, save, uid } from './store.js';

// ---------- Konstanten ----------
export const PRIO = {
  dringend: { l: 'Dringend', c: 'red', o: 0 },
  hoch: { l: 'Hoch', c: 'orange', o: 1 },
  normal: { l: 'Normal', c: 'blue', o: 2 },
  niedrig: { l: 'Niedrig', c: 'grey', o: 3 },
};
export const TECH = { ok: 'Einsatzbereit', defekt: 'Defekt', reparatur: 'Reparatur', nv: 'Nicht verfügbar' };
export const KEYS = { mir: 'Bei mir', ausgegeben: 'Ausgegeben', zug: 'Beim Zug', unklar: 'Unklar' };
export const BSTATUS = { geplant: 'Geplant', erledigt: 'Erledigt', storniert: 'Storniert' };
export const TYPES = ['DURO', 'PUCH', 'Mercedes G', 'Lastwagen', 'Bus', 'Anhänger', 'Anderes'];

export const isTrailer = (v) => v && v.type === 'Anhänger';
const MIN = 60000;

// ---------- Datum-Helfer ----------
export const toD = (s) => (s ? new Date(s) : null);
const p2 = (n) => String(n).padStart(2, '0');
export const iso = (d) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const isoDate = (d) => iso(d).slice(0, 10);
export const hm = (d) => (d ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : '');
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const wd = (d) => WD[d.getDay()];
export const dm = (d) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.`;
export const fmtDT = (s) => { const d = toD(s); return d ? `${wd(d)} ${dm(d)} ${hm(d)}` : ''; };
export const sameDay = (a, b) => a && b && isoDate(a) === isoDate(b);
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addMin = (d, m) => new Date(d.getTime() + m * MIN);
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const monday = (d) => { const x = startOfDay(d); const k = (x.getDay() + 6) % 7; return addDays(x, -k); };
export const roundTo = (d, m = 5) => new Date(Math.ceil(d.getTime() / (m * MIN)) * m * MIN);
export function durTxt(min) {
  min = Math.round(min);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${r} Min.` : `${h} h`;
}

// ---------- Buchungen ----------
export const isOpen = (b) => b.status === 'geplant' && !b.end;             // Schnellfahrt ohne Rückgabe
export const active = (b) => b.status === 'geplant';                        // blockiert Fahrzeuge

// Effektives Ende: offene Schnellfahrt blockiert bis zur (erwarteten) Rückkehr, mind. bis jetzt
export function effEnd(b, now = new Date()) {
  if (b.end) return toD(b.end);
  const er = toD(b.expectedReturn);
  const t = Math.max(now.getTime() + MIN, er ? er.getTime() : 0);
  return new Date(t);
}

export const bookingsOf = (vid) =>
  db().bookings.filter((b) => b.vehicleId === vid || b.trailerId === vid);

export const overlap = (b, start, end, now) =>
  active(b) && toD(b.start) < end && effEnd(b, now) > start;

export function contactName(id) { const c = get('contacts', id); return c ? c.name : ''; }
export function vehicleLabel(v) { return v ? `${v.type} ${v.number}` : 'ohne Fahrzeug'; }
export const sortByStart = (a, b) => toD(a.start) - toD(b.start);

// Aktuelle Zug-Zuteilung (null wenn keine oder abgelaufen)
export function platoonOf(v, at = new Date()) {
  const pl = v && get('platoons', v.platoonId);
  if (!pl) return null;
  if (pl.until && toD(pl.until) <= at) return null;
  return pl;
}

// ---------- Verfügbarkeitsprüfung (Herzstück) ----------
// Gibt immer Gründe zurück – Fahrzeuge werden nie versteckt.
export function check(v, { start, end, persons = 0, excludeId = null, override = false, now = new Date() }) {
  const reasons = [];
  if (v.active === false) reasons.push({ k: 'inaktiv', t: 'Nicht im Bestand' });
  if (!isTrailer(v) && persons > (Number(v.seats) || 0))
    reasons.push({ k: 'seats', t: `Nur ${v.seats || 0} Plätze` });
  if (v.tech !== 'ok') reasons.push({ k: 'tech', t: TECH[v.tech] || v.tech });
  const pl = platoonOf(v, start);
  if (pl && !override)
    reasons.push({ k: 'zug', t: `${pl.name} zugeteilt${pl.until ? ' bis ' + fmtDT(pl.until) : ''}` });

  const own = bookingsOf(v.id).filter((b) => b.id !== excludeId && active(b));
  const conflicts = own.filter((b) => overlap(b, start, end, now)).sort(sortByStart);
  conflicts.forEach((b) => {
    const who = contactName(b.ordererId) || 'unbekannt';
    const t = b.end ? `${hm(toD(b.start))}–${hm(toD(b.end))}` : `seit ${hm(toD(b.start))} unterwegs`;
    reasons.push({ k: 'booking', t: `Gebucht ${t} · ${who} (${PRIO[b.priority]?.l || ''})`, b });
  });

  const next = own.filter((b) => toD(b.start) >= end).sort(sortByStart)[0] || null;

  // Ab wann wieder frei? (nur wenn einzig Buchungen blockieren)
  let freeFrom = null;
  if (conflicts.length && reasons.every((r) => r.k === 'booking')) {
    let t = Math.max(...conflicts.map((b) => effEnd(b, now).getTime()));
    let changed = true;
    while (changed) { // direkt anschliessende Buchungen berücksichtigen
      changed = false;
      for (const b of own) {
        const s = toD(b.start).getTime(), e = effEnd(b, now).getTime();
        if (s <= t && e > t) { t = e; changed = true; }
      }
    }
    freeFrom = new Date(t);
  }
  const onlyZug = reasons.length > 0 && reasons.every((r) => r.k === 'zug');
  return { ok: reasons.length === 0, reasons, conflicts, next, freeFrom, onlyZug, platoon: pl };
}

// Alle Fahrzeuge prüfen und sortieren (verfügbar zuerst, dann nach Plätzen)
export function search({ start, end, persons, excludeId, includeTrailers = false, now }) {
  const list = db().vehicles.filter((v) => v.active !== false && (includeTrailers ? true : !isTrailer(v)));
  const res = list.map((v) => ({ v, r: check(v, { start, end, persons, excludeId, now }) }));
  const ok = res.filter((x) => x.r.ok).sort((a, b) => (a.v.seats || 0) - (b.v.seats || 0));
  const no = res.filter((x) => !x.r.ok).sort((a, b) => order(a.r) - order(b.r));
  return { ok, no };
}
const order = (r) => (r.reasons[0]?.k === 'booking' ? 0 : r.reasons[0]?.k === 'zug' ? 1 : r.reasons[0]?.k === 'seats' ? 3 : 2);

// Schnellfahrt: sofort / bedingt / nicht
export function quickSearch({ persons, durationMin, now = new Date() }) {
  const start = now;
  const end = addMin(now, durationMin || 15);
  const out = { now: [], soon: [], no: [] };
  db().vehicles.filter((v) => v.active !== false && !isTrailer(v)).forEach((v) => {
    const r = check(v, { start, end, persons, now });
    if (r.ok) {
      const gap = r.next ? (toD(r.next.start) - now) / MIN : Infinity;
      const need = (durationMin || 30) + 15; // Puffer
      if (gap < need) out.soon.push({ v, r, gap }); else out.now.push({ v, r, gap });
    } else out.no.push({ v, r });
  });
  out.now.sort((a, b) => b.gap - a.gap);
  out.no.sort((a, b) => (a.r.freeFrom ? a.r.freeFrom : Infinity) - (b.r.freeFrom ? b.r.freeFrom : Infinity));
  return out;
}

// ---------- Live-Status eines Fahrzeugs ----------
export function liveStatus(v, now = new Date()) {
  if (v.active === false) return { k: 'archiv', l: 'Nicht im Bestand' };
  if (v.tech !== 'ok') return { k: v.tech, l: TECH[v.tech] };
  const pl = platoonOf(v, now);
  if (pl) return { k: 'zug', l: pl.name };
  const own = bookingsOf(v.id).filter(active);
  const cur = own.find((b) => toD(b.start) <= now && effEnd(b, now) > now);
  if (cur) return { k: 'belegt', l: cur.end ? 'Belegt' : 'Unterwegs', b: cur };
  const later = own.filter((b) => toD(b.start) > now && sameDay(toD(b.start), now)).sort(sortByStart)[0];
  if (later) return { k: 'eingeplant', l: `Eingeplant ab ${hm(toD(later.start))}`, b: later };
  return { k: 'frei', l: 'Verfügbar' };
}

export function dashboardCounts(now = new Date()) {
  const c = { frei: [], eingeplant: [], belegt: [], zug: [], defekt: [], reparatur: [], nv: [] };
  db().vehicles.filter((v) => v.active !== false).forEach((v) => {
    const s = liveStatus(v, now);
    (c[s.k] || (c[s.k] = [])).push(v);
  });
  return c;
}

// ---------- Überfällig ----------
export function overdueList(now = new Date()) {
  return db().bookings.filter((b) => {
    if (!active(b) || !b.keyOut) return false;
    const due = b.end ? toD(b.end) : toD(b.expectedReturn);
    return due && due < now;
  }).map((b) => {
    const due = b.end ? toD(b.end) : toD(b.expectedReturn);
    return { b, min: (now - due) / MIN };
  }).sort((a, b) => b.min - a.min);
}

// ---------- Schlüssel ----------
export function issueKey(v, contactId, bookingId) {
  v.keyStatus = 'ausgegeben';
  v.keyHolderId = contactId || '';
  v.keySince = iso(new Date());
  v.keyBookingId = bookingId || '';
  db().keyLog.push({ id: uid(), vehicleId: v.id, contactId, bookingId, out: v.keySince, back: null });
  if (bookingId) { const b = get('bookings', bookingId); if (b) b.keyOut = true; }
  save();
}

// Schlüssel zurück → Fahrt erledigt, Fahrzeug wieder frei
export function returnKey(v) {
  const now = new Date();
  const log = [...db().keyLog].reverse().find((l) => l.vehicleId === v.id && !l.back);
  if (log) log.back = iso(now);
  const b = get('bookings', v.keyBookingId);
  if (b && active(b)) {
    if (!b.end) b.end = iso(now);            // Schnellfahrt: Endzeit = jetzt
    b.returnedAt = iso(now);
    b.keyOut = false;
    b.status = 'erledigt';
  }
  v.keyStatus = 'mir'; v.keyHolderId = ''; v.keySince = ''; v.keyBookingId = '';
  save();
}

export function setKeyManual(v, status, contactId = '') {
  if (v.keyStatus === 'ausgegeben' && status !== 'ausgegeben') {
    const log = [...db().keyLog].reverse().find((l) => l.vehicleId === v.id && !l.back);
    if (log) log.back = iso(new Date());
  }
  v.keyStatus = status;
  v.keyHolderId = status === 'ausgegeben' ? contactId : '';
  v.keySince = status === 'ausgegeben' ? iso(new Date()) : '';
  if (status !== 'ausgegeben') v.keyBookingId = '';
  save();
}

// ---------- Buchung anlegen / verschieben ----------
export function newBooking(data) {
  return upsert('bookings', {
    start: '', end: '', expectedReturn: '', persons: 1, dest: '', vehicleId: '', trailerId: '',
    ordererId: '', driverId: '', priority: 'normal', status: 'geplant', reminder: null, note: '',
    override: false, quick: false, keyOut: false, notified: false, overdueNotified: false,
    created: iso(new Date()), ...data,
  });
}

export function shiftBooking(b, deltaMin) {
  b.start = iso(addMin(toD(b.start), deltaMin));
  if (b.end) b.end = iso(addMin(toD(b.end), deltaMin));
  b.notified = false;
  save();
}

// Konflikte einer (geänderten) Buchung prüfen – für Warnungen beim Speichern
export function conflictsFor(b) {
  if (!b.vehicleId && !b.trailerId) return [];
  const start = toD(b.start), end = b.end ? toD(b.end) : effEnd(b);
  const msgs = [];
  [b.vehicleId, b.trailerId].filter(Boolean).forEach((id) => {
    const v = get('vehicles', id);
    if (!v) return;
    const r = check(v, { start, end, persons: id === b.vehicleId ? b.persons : 0, excludeId: b.id, override: b.override });
    r.reasons.forEach((x) => msgs.push(`${vehicleLabel(v)}: ${x.t}`));
  });
  return msgs;
}

// Wenige freie Fahrzeuge an einem Tag? (für Hinweis in der Wochenansicht)
export function minFreeOnDay(day) {
  const base = db().vehicles.filter((v) => v.active !== false && !isTrailer(v));
  let min = Infinity, at = null;
  for (let h = 7; h < 18; h += 0.5) {
    const s = addMin(startOfDay(day), h * 60), e = addMin(s, 30);
    const free = base.filter((v) => check(v, { start: s, end: e, persons: 0 }).ok).length;
    if (free < min) { min = free; at = s; }
  }
  return { min, at, total: base.length };
}

// ---------- iPhone-Kalender-Export (.ics) für echte Erinnerungen ----------
export function toICS(b) {
  const v = get('vehicles', b.vehicleId);
  const f = (s) => s.replace(/[-:]/g, '') + '00';
  const end = b.end || iso(addMin(toD(b.start), 60));
  const esc = (t) => String(t || '').replace(/[,;\\]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const orderer = get('contacts', b.ordererId);
  const desc = [
    `Fahrzeug: ${vehicleLabel(v)}`, `Personen: ${b.persons}`,
    orderer ? `Besteller: ${orderer.name} ${orderer.phone || ''}` : '',
    b.driverId ? `Fahrer: ${contactName(b.driverId)}` : '', b.note ? `Notiz: ${b.note}` : '',
  ].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fahrzeug-Planner//DE', 'BEGIN:VEVENT',
    `UID:${b.id}@fahrzeugplaner`, `DTSTAMP:${f(iso(new Date()))}`,
    `DTSTART:${f(b.start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${esc(`${vehicleLabel(v)} → ${b.dest || 'Fahrt'}`)}`,
    `DESCRIPTION:${esc(desc)}`,
  ];
  if (b.reminder != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Fahrt ' + (b.dest || ''))}`, `TRIGGER:-PT${b.reminder}M`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
