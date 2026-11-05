// =====================================================================
// ui.js – kleine UI-Helfer: Escaping, Bottom-Sheets (Stapel), Toast
// =====================================================================

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const telLink = (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');

// ---------- Sheet-Stapel ----------
// Jedes Sheet = { title, render() -> html, bind(el), capture(el), live }
// capture() sichert Formulareingaben, bevor ein weiteres Sheet geöffnet wird.
const stack = [];

export function openSheet(sheet) {
  const cur = stack[stack.length - 1];
  if (cur && cur.capture) cur.capture($('#sheet-body'));
  stack.push(sheet);
  renderSheet();
}

export function closeSheet() {
  stack.pop();
  if (stack.length) renderSheet();
  else { $('#sheet').classList.remove('open'); $('#sheet-bg').classList.remove('open'); }
}

export function closeAllSheets() {
  stack.length = 0;
  $('#sheet').classList.remove('open'); $('#sheet-bg').classList.remove('open');
}

// live-Sheets (Detailansichten) bei Datenänderung neu zeichnen, Formulare nicht
export function refreshSheet() { const s = stack[stack.length - 1]; if (s && s.live) renderSheet(true); }
// Formular nach eigener Aktion neu zeichnen (vorher capture!)
export function rerenderSheet() { if (stack.length) renderSheet(true); }

export function currentSheet() { return stack[stack.length - 1]; }

function renderSheet(keepScroll = false) {
  const s = stack[stack.length - 1];
  const body = $('#sheet-body');
  const scroll = body.scrollTop;
  $('#sheet-title').textContent = s.title;
  $('#sheet-back').textContent = stack.length > 1 ? '‹ Zurück' : 'Schliessen';
  // Frisches Element pro Rendern → keine doppelten Event-Listener
  const inner = document.createElement('div');
  inner.innerHTML = s.render();
  body.replaceChildren(inner);
  $('#sheet').classList.add('open'); $('#sheet-bg').classList.add('open');
  if (s.bind) s.bind(inner);
  body.scrollTop = keepScroll ? scroll : 0;
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Datei herunterladen ----------
export function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Bausteine ----------
export const dot = (c) => `<span class="dot ${c}"></span>`;
export const statusColor = (k) => ({
  frei: 'green', eingeplant: 'blue', belegt: 'yellow', zug: 'purple',
  defekt: 'red', reparatur: 'orange', nv: 'grey', archiv: 'grey',
}[k] || 'grey');

export function chips(name, options, selected) {
  return `<div class="chips" data-chips="${name}">${options.map(([val, label, color]) =>
    `<button type="button" class="chip ${String(val) === String(selected) ? 'sel' : ''}" data-val="${esc(val)}">${color ? dot(color) : ''}${esc(label)}</button>`).join('')}</div>`;
}
export function bindChips(root, name, onChange) {
  const box = root.querySelector(`[data-chips="${name}"]`);
  if (!box) return;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    box.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
    b.classList.add('sel');
    onChange && onChange(b.dataset.val);
  });
}
export const chipVal = (root, name) => root.querySelector(`[data-chips="${name}"] .chip.sel`)?.dataset.val;
