// =====================================================================
// demo.js – Beispieldaten zum Testen (Einstellungen → Demo-Daten laden)
// =====================================================================
import { replaceAll, emptyState, uid } from './store.js';
import { iso, startOfDay, addMin, addDays } from './logic.js';

export function loadDemo() {
  const s = emptyState();
  const today = startOfDay(new Date());
  const at = (dayOff, h, m = 0) => iso(addMin(addDays(today, dayOff), h * 60 + m));
  const sunday = addDays(today, (7 - today.getDay()) % 7 || 7);

  const z1 = { id: uid(), name: 'Zug 1', until: iso(addMin(sunday, 18 * 60)) };
  const z2 = { id: uid(), name: 'Zug 2', until: iso(addMin(sunday, 18 * 60)) };
  s.platoons.push(z1, z2);

  const V = (type, number, seats, extra = {}) => {
    const v = { id: uid(), type, number, seats, tech: 'ok', platoonId: '', trailerId: '', keyStatus: 'mir',
      keyHolderId: '', keySince: '', keyBookingId: '', active: true, note: '', ...extra };
    s.vehicles.push(v); return v;
  };
  const anh1 = V('Anhänger', 'M-98765', 0);
  const d1 = V('DURO', 'M-12345', 8, { trailerId: anh1.id });
  const d2 = V('DURO', 'M-54321', 6);
  V('DURO', 'M-34567', 8, { platoonId: z2.id, keyStatus: 'zug' });
  V('DURO', 'M-23456', 8, { platoonId: z2.id, keyStatus: 'zug' });
  V('DURO', 'M-56789', 8, { platoonId: z1.id, keyStatus: 'zug' });
  V('DURO', 'M-45678', 8, { tech: 'reparatur', note: 'Bremse hinten' });
  const p1 = V('PUCH', 'M-48321', 4);
  const p2 = V('PUCH', 'M-61234', 4);
  V('Anhänger', 'M-87654', 0, { platoonId: z2.id, keyStatus: 'zug' });

  const C = (name, phone, role = '') => { const c = { id: uid(), name, phone, role, platoonId: '', note: '' }; s.contacts.push(c); return c; };
  const mueller = C('Wm Müller', '079 123 45 67', 'Zugführer Zug 2');
  const spital = C('Krankenhaus', '031 000 00 00', 'Organisation');
  const meier = C('Sdt Meier', '079 222 33 44', 'Fahrer');
  const keller = C('Wm Keller', '', 'Zug 1');
  const huber = C('Sdt Huber', '079 555 12 34', 'Fahrer');

  const B = (o) => {
    const b = { id: uid(), start: '', end: '', expectedReturn: '', persons: 1, dest: '', vehicleId: '', trailerId: '',
      ordererId: '', driverId: '', priority: 'normal', status: 'geplant', reminder: 15, note: '', override: false,
      quick: false, keyOut: false, notified: true, overdueNotified: false, created: iso(new Date()), ...o };
    s.bookings.push(b); return b;
  };
  B({ start: at(0, 8), end: at(0, 9, 30), persons: 3, dest: 'Spital Thun', vehicleId: d1.id, ordererId: spital.id, driverId: meier.id, priority: 'dringend', reminder: 60, status: 'erledigt' });
  B({ start: at(0, 13), end: at(0, 16), persons: 5, dest: 'Thun', vehicleId: d1.id, trailerId: anh1.id, ordererId: mueller.id, driverId: meier.id, note: 'Material XY transportieren', reminder: 30 });
  B({ start: at(0, 14), end: at(0, 15, 30), persons: 2, dest: 'Bern', vehicleId: d2.id, ordererId: keller.id, priority: 'hoch' });
  B({ start: at(1, 7, 30), end: at(1, 11), persons: 6, dest: 'Schiessplatz', vehicleId: d2.id, ordererId: mueller.id, priority: 'hoch' });
  B({ start: at(2, 13), end: at(2, 17), persons: 4, dest: 'Kaserne', vehicleId: p2.id, ordererId: keller.id, priority: 'niedrig' });
  B({ start: at(-1, 10), end: at(-1, 10, 25), persons: 2, dest: 'Bäckerei', vehicleId: p1.id, ordererId: huber.id, quick: true, status: 'erledigt' });

  // Offene Schnellfahrt (überfällig) zum Testen
  const now = new Date();
  const q = B({ start: iso(addMin(now, -45)), end: '', expectedReturn: iso(addMin(now, -15)), persons: 2, dest: 'Bäckerei',
    vehicleId: p1.id, ordererId: huber.id, driverId: huber.id, quick: true, keyOut: true, reminder: null });
  p1.keyStatus = 'ausgegeben'; p1.keyHolderId = huber.id; p1.keySince = q.start; p1.keyBookingId = q.id;
  s.keyLog.push({ id: uid(), vehicleId: p1.id, contactId: huber.id, bookingId: q.id, out: q.start, back: null });

  replaceAll(s);
}
