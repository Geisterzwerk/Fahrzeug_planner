// =====================================================================
// store.js – Datenhaltung (lokal im Browser / auf dem iPhone)
// Alle Daten liegen in localStorage. Kein Server, keine Cloud.
// =====================================================================

const KEY = 'fahrzeugplaner.v1';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const emptyState = () => ({
  version: 1,
  vehicles: [],   // Fahrzeuge + Anhänger
  platoons: [],   // Züge
  contacts: [],   // Auftraggeber / Fahrer
  bookings: [],   // Buchungen + Schnellfahrten
  keyLog: [],     // Schlüssel-Historie
  settings: {
    overdueMin: 10,          // Warnung x Minuten nach erwarteter Rückkehr
    dayStart: 6,             // Kalender Tagesansicht von ...
    dayEnd: 22,              // ... bis
    defaultReminder: { dringend: 60, hoch: 30, normal: 15, niedrig: 5 },
  },
});

const hasLS = typeof localStorage !== 'undefined';
let state = load();
const listeners = [];

function load() {
  if (!hasLS) return emptyState();
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version) {
      const e = emptyState();
      return { ...e, ...s, settings: { ...e.settings, ...s.settings } };
    }
  } catch (err) { console.warn('Laden fehlgeschlagen', err); }
  return emptyState();
}

export function save() {
  if (hasLS) localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((f) => f());
}

export const db = () => state;
export const onChange = (f) => listeners.push(f);

export function replaceAll(newState) {
  const e = emptyState();
  state = { ...e, ...newState, settings: { ...e.settings, ...(newState.settings || {}) } };
  save();
}

export function resetAll() { state = emptyState(); save(); }

// ---------- generisches CRUD ----------
export function get(coll, id) {
  return id ? state[coll].find((x) => x.id === id) : undefined;
}

export function upsert(coll, obj, silent = false) {
  const arr = state[coll];
  if (!obj.id) obj.id = uid();
  const i = arr.findIndex((x) => x.id === obj.id);
  if (i >= 0) arr[i] = { ...arr[i], ...obj };
  else arr.push(obj);
  if (!silent) save();
  return i >= 0 ? arr[i] : obj;
}

export function remove(coll, id) {
  state[coll] = state[coll].filter((x) => x.id !== id);
  save();
}

// ---------- Kontakte: Name finden oder neu anlegen ----------
export function contactByName(name) {
  const n = (name || '').trim().toLowerCase();
  return n ? state.contacts.find((c) => c.name.trim().toLowerCase() === n) : undefined;
}

export function ensureContact(name, phone) {
  name = (name || '').trim();
  if (!name) return null;
  let c = contactByName(name);
  if (!c) c = upsert('contacts', { name, phone: phone || '', role: '', platoonId: '', note: '' }, true);
  else if (phone !== undefined && phone !== null && phone.trim() !== '' && phone !== c.phone) c.phone = phone.trim();
  return c;
}

// Speicher als "persistent" markieren (iOS löscht sonst evtl. nach langer Nichtnutzung)
export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* egal */ }
}
