export function uid(prefix = 'x'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Clé de comparaison : sans accents, sans casse, sans ponctuation. */
export function normKey(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function minutesToTime(m: number | null | undefined): string {
  if (m == null || isNaN(m)) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Accepte « 9:30 », « 9h30 », « 930 », « 9h », « 9 ». */
export function parseTime(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\s*[:hH.]\s*(\d{1,2})/);
  if (m) {
    const h = +m[1], mi = +m[2];
    if (h <= 23 && mi <= 59) return h * 60 + mi;
  }
  m = s.match(/^(\d{1,2})\s*[hH]$/);
  if (m && +m[1] <= 23) return +m[1] * 60;
  m = s.match(/^(\d{3,4})$/);
  if (m) {
    const n = m[1].padStart(4, '0');
    const h = +n.slice(0, 2), mi = +n.slice(2);
    if (h <= 23 && mi <= 59) return h * 60 + mi;
  }
  m = s.match(/^(\d{1,2})$/);
  if (m && +m[1] <= 23) return +m[1] * 60;
  return null;
}

export function initials(name: string): string {
  const p = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
