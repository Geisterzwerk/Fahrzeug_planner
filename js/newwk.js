// =====================================================================
// newwk.js – „Neuer WK starten“
// Löscht Fahrzeuge, Buchungen, Züge und Schlüssel-Historie.
// Personen-Kontakte (Sdt, Wm, Lt …) bleiben, Orte/Organisationen
// (Krankenhaus usw.) werden standardmässig entfernt.
// Vorher wird automatisch ein Backup vom alten WK heruntergeladen.
// =====================================================================
import { db, save } from './store.js';
import { isoDate } from './logic.js';
import { esc, openSheet, closeAllSheets, toast, download } from './ui.js';

// Militärische Grade → Kontakt ist eine Person
const RANKS = /^(rekr|sdt|gfr|obgfr|kpl|wm|obwm|four|fw|hptfw|adj|stabsadj|hptadj|chefadj|lt|oblt|hptm|maj|oberstlt|oberst|br|div|kkdt|fachof|kdt)\b\.?/i;

export function isPerson(c) {
  return RANKS.test((c.name || '').trim()) || /fahrer/i.test(c.role || '');
}

export function openNewWK() {
  const contacts = db().contacts.slice().sort((a, b) => a.name.localeCompare(b.name));
  const keep = new Set(contacts.filter(isPerson).map((c) => c.id));

  const row = (c) => `<label class="card row check">
      <input type="checkbox" data-keep="${c.id}" ${keep.has(c.id) ? 'checked' : ''}>
      <span class="grow"><b>${esc(c.name)}</b><span class="muted small">${c.phone ? ' · ' + esc(c.phone) : ''}</span></span>
    </label>`;

  const persons = contacts.filter(isPerson);
  const others = contacts.filter((c) => !isPerson(c));

  openSheet({
    title: '🔄 Neuer WK starten',
    render: () => `
      <div class="card">
        <b>Wird gelöscht:</b>
        <div class="small">${db().vehicles.length} Fahrzeuge/Anhänger · ${db().bookings.length} Buchungen · ${db().platoons.length} Züge · Schlüssel-Historie</div>
        <hr>
        <b>Bleibt:</b>
        <div class="small">Angehakte Kontakte · Einstellungen</div>
      </div>
      <label class="card row check"><input type="checkbox" name="backup" checked>
        <span class="grow">Vorher Backup vom alten WK herunterladen <span class="muted small">(empfohlen)</span></span></label>

      <div class="label">Personen – behalten (${persons.length})</div>
      ${persons.map(row).join('') || '<div class="card muted small">Keine</div>'}
      <div class="label">Orte / Organisationen – werden gelöscht (${others.length})</div>
      ${others.map(row).join('') || '<div class="card muted small">Keine</div>'}
      <div class="muted small">Haken setzen = Kontakt behalten. Personen werden am Grad (Sdt, Wm, Lt …) erkannt.</div>

      <button class="btn danger block big" data-act="start">🔄 Neuen WK starten</button>`,
    bind: (el) => el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act="start"]'); if (!t) return;
      const keepIds = new Set([...el.querySelectorAll('[data-keep]')].filter((x) => x.checked).map((x) => x.dataset.keep));
      const removed = db().contacts.length - keepIds.size;
      if (!confirm(`Neuen WK starten?\n\nFahrzeuge, Buchungen und Züge werden gelöscht.\n${keepIds.size} Kontakte bleiben, ${removed} werden gelöscht.`)) return;

      if (el.querySelector('[name="backup"]').checked) {
        download(`fahrzeugplaner-backup-WK-ende-${isoDate(new Date())}.json`, JSON.stringify(db(), null, 2));
      }

      const s = db();
      s.vehicles = [];
      s.bookings = [];
      s.platoons = [];
      s.keyLog = [];
      s.contacts = s.contacts.filter((c) => keepIds.has(c.id)).map((c) => ({ ...c, platoonId: '' }));
      save();

      closeAllSheets();
      toast('Neuer WK gestartet – viel Erfolg! 🚙');
      location.hash = '#/fahrzeuge';
    }),
  });
}
