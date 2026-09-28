import { Person, RegieState } from './model';
import { normKey, uid } from './util';

function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const k of Object.keys(row)) if (names.includes(normKey(k))) {
    const v = row[k];
    if (v != null && v !== '') return v;
  }
  return undefined;
}
function toList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean);
  return String(v).split(/[,;|/]/).map((x) => x.trim()).filter(Boolean);
}

/**
 * Lit une liste de helpers depuis un JSON : tableau d'objets, tableau de noms,
 * ou objet contenant un tableau (personnes, benevoles, people…).
 * Les clés sont reconnues en français comme en anglais.
 */
export function parsePeople(data: unknown): Person[] {
  let arr: unknown[] | null = Array.isArray(data) ? data : null;
  if (!arr && data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const keys = ['people', 'personnes', 'benevoles', 'helpers', 'staff', 'equipe', 'members', 'membres', 'data', 'items'];
    const found = Object.keys(obj).find((k) => keys.includes(normKey(k)) && Array.isArray(obj[k]))
      ?? Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (found) arr = obj[found] as unknown[];
  }
  if (!arr) throw new Error('Le fichier doit contenir une liste de helpers, par exemple [{"nom":"Camille Roux"}].');

  const out: Person[] = [];
  for (const row of arr) {
    if (typeof row === 'string') {
      if (row.trim()) out.push({ id: uid('p'), nom: row.trim(), email: '', role: '', tags: [], jours: [], maxCharge: 0, notes: '' });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    let nom = String(pick(r, ['nom', 'name', 'fullname', 'nomcomplet', 'displayname']) ?? '').trim();
    if (!nom) nom = [pick(r, ['prenom', 'firstname']), pick(r, ['lastname', 'surname', 'nomdefamille'])].filter(Boolean).join(' ').trim();
    const email = String(pick(r, ['email', 'mail', 'courriel']) ?? '').trim();
    if (!nom && email) nom = email.split('@')[0];
    if (!nom) continue;
    out.push({
      id: String(pick(r, ['id', 'identifiant', 'uid']) ?? uid('p')),
      nom,
      email,
      role: String(pick(r, ['role', 'fonction', 'poste', 'equipe', 'team']) ?? '').trim(),
      tags: toList(pick(r, ['tags', 'tag', 'competences', 'skills', 'preferences', 'affinites'])),
      jours: toList(pick(r, ['jours', 'jour', 'dispo', 'dispos', 'disponibilites', 'availability', 'days'])),
      maxCharge: parseInt(String(pick(r, ['max', 'maxcharge', 'quota', 'capacite', 'chargemax']) ?? 0), 10) || 0,
      notes: String(pick(r, ['notes', 'note', 'commentaire', 'remarque']) ?? '').trim(),
    });
  }
  if (!out.length) throw new Error('Aucun helper exploitable : chaque entrée doit porter au moins un nom.');
  const seen = new Set<string>();
  for (const p of out) { if (seen.has(p.id)) p.id = uid('p'); seen.add(p.id); }
  return out;
}

/** Vérifie qu'un fichier est bien une sauvegarde complète de la régie. */
export function parseState(data: unknown): RegieState {
  const s = data as Partial<RegieState>;
  if (!s || typeof s !== 'object' || !Array.isArray(s.slots) || !Array.isArray(s.people) || !Array.isArray(s.formats))
    throw new Error("Ce fichier n'est pas une sauvegarde de la régie (il manque les créneaux, les helpers ou les formats).");
  return {
    version: 1,
    nom: s.nom ?? 'Régie',
    formats: s.formats,
    options: { minGap: 0, maxPerPerson: 0, maxPerDay: 0, ...(s.options ?? {}) },
    days: s.days ?? [...new Set(s.slots.map((x) => x.jour))],
    people: s.people,
    slots: s.slots,
    assign: s.assign ?? {},
    roles: s.roles ?? {},
  };
}
