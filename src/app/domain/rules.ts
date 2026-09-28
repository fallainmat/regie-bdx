/**
 * Règles d'affectation des helpers.
 * Tout est pur : chaque fonction lit un état et n'en modifie aucun,
 * sauf `autoAssign` qui renvoie une nouvelle table d'affectations.
 */
import { Person, RegieState, RoleKey, ROLE_KEYS, SlotRoles, Slot } from './model';
import { FORMATION_KEY, isPosteKey } from './seed';
import { normKey } from './util';

export function formatOf(state: RegieState, key: string) {
  return state.formats.find((f) => f.key === key);
}
export function formatLabel(state: RegieState, key: string): string {
  return formatOf(state, key)?.label ?? key;
}

/** Besoin d'un créneau : saisie manuelle, sinon besoin du format, sinon 1. */
export function slotNeed(state: RegieState, s: Slot): number {
  if (s.besoin != null && !isNaN(s.besoin)) return Math.max(0, Math.floor(s.besoin));
  return formatOf(state, s.format)?.need ?? 1;
}
export function slotAssigned(state: RegieState, s: Slot): string[] {
  return state.assign[s.id] ?? [];
}
export type Coverage = 'ok' | 'part' | 'miss';
export function slotCoverage(state: RegieState, s: Slot): Coverage {
  const n = slotNeed(state, s), a = slotAssigned(state, s).length;
  // Un créneau de salle n'est complet que si ses deux postes sont tenus : deux
  // personnes sans rôle attribué ne suffisent plus. Les créneaux sans salle
  // gardent la règle d'effectif, sous peine d'être incomplétables.
  if (tientUnBinome(s) && ROLE_KEYS.some((r) => !roleOf(state, s, r))) return a > 0 ? 'part' : 'miss';
  if (a >= n) return 'ok';
  return a > 0 ? 'part' : 'miss';
}
/** Un créneau sans heure de fin dure une heure. */
export function slotEnd(s: Slot): number | null {
  if (s.fin != null) return s.fin;
  return s.debut != null ? s.debut + 60 : null;
}
export function isPoste(s: Slot): boolean {
  return isPosteKey(s.format);
}
export function slotLabel(state: RegieState, s: Slot): string {
  if (s.titre.trim()) return s.titre.trim();
  return formatLabel(state, s.format) + (s.salle ? ` — ${s.salle}` : '');
}

export function compareSlots(days: string[]) {
  return (a: Slot, b: Slot) => {
    const da = days.indexOf(a.jour), db = days.indexOf(b.jour);
    if (da !== db) return da - db;
    const ta = a.debut ?? 99999, tb = b.debut ?? 99999;
    if (ta !== tb) return ta - tb;
    return a.salle.localeCompare(b.salle, 'fr');
  };
}

export function personSlots(state: RegieState, pid: string): Slot[] {
  return state.slots.filter((s) => slotAssigned(state, s).includes(pid)).sort(compareSlots(state.days));
}

/** Plafond : personnel, sinon global, sinon illimité. */
export function personMax(state: RegieState, p: Person): number {
  if (p.maxCharge > 0) return p.maxCharge;
  if (state.options.maxPerPerson > 0) return state.options.maxPerPerson;
  return Infinity;
}
export function dayMax(state: RegieState): number {
  return state.options.maxPerDay > 0 ? state.options.maxPerDay : Infinity;
}

/** Sans jours renseignés, la personne est présente tous les jours. */
export function personAvailable(p: Person, day: string): boolean {
  if (!p.jours.length) return true;
  const d = normKey(day);
  return p.jours.some((j) => {
    const k = normKey(j);
    return k === d || d.includes(k) || k.includes(d);
  });
}

/** Deux créneaux se chevauchent s'ils sont à moins de `gap` minutes l'un de l'autre. */
export function overlaps(a: Slot, b: Slot, gap: number): boolean {
  if (a.jour !== b.jour) return false;
  const as = a.debut, ae = slotEnd(a), bs = b.debut, be = slotEnd(b);
  if (as == null || ae == null || bs == null || be == null) return false;
  return as < be + gap && bs < ae + gap;
}

/** null si la personne peut être placée sur le créneau, sinon la raison du refus. */
export function eligibility(state: RegieState, p: Person, slot: Slot, role?: RoleKey): string | null {
  if (role && tientUnBinome(slot)) {
    const tenant = roleOf(state, slot, role);
    if (tenant && tenant !== p.id) return 'poste déjà tenu';
  }
  // Déjà sur le créneau : prendre un poste vacant n'y consomme aucune
  // disponibilité supplémentaire, les plafonds et chevauchements la comptent déjà.
  if (slotAssigned(state, slot).includes(p.id)) return role ? null : 'déjà placé';
  if (!personAvailable(p, slot.jour)) return 'absent ce jour';
  const mine = personSlots(state, p.id);
  if (mine.length >= personMax(state, p)) return 'plafond atteint';
  if (mine.filter((s) => s.jour === slot.jour).length >= dayMax(state)) return 'plafond du jour atteint';
  const clash = mine.find((s) => overlaps(s, slot, state.options.minGap));
  if (clash) return `déjà pris à ${fmt(clash.debut)}`;
  return null;
}
function fmt(m: number | null): string {
  return m == null ? '?' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Bonus de compétence : 2 si un tag vise le format, 1 s'il vise la salle. */
export function tagBonus(state: RegieState, p: Person, s: Slot): number {
  const f = normKey(s.format), lab = normKey(formatLabel(state, s.format)), room = normKey(s.salle);
  let best = 0;
  for (const raw of p.tags) {
    const t = normKey(raw);
    if (!t) continue;
    if (t === f || t === lab) return 2;
    if (room && (t === room || room.includes(t))) best = 1;
  }
  return best;
}

export interface AutoResult {
  assign: Record<string, string[]>;
  roles: Record<string, SlotRoles>;
  placed: number;
  gaps: number;
}

/**
 * Remplissage automatique.
 * Ordre : créneaux les plus contraints d'abord (moins de candidats),
 * puis les plus longs, puis ceux qui manquent le plus de monde.
 * Choix : score le plus bas = charge × 10 + charge du jour × 4 − bonus × 3.
 */
/** Ordre de pourvoi des postes : le plus contraint d'abord. */
const ORDRE_ATTRIBUTION: RoleKey[] = ['captation', 'keeper'];

export function autoAssign(state: RegieState, mode: 'fill' | 'all'): AutoResult {
  const assign: Record<string, string[]> =
    mode === 'all' ? {} : Object.fromEntries(Object.entries(state.assign).map(([k, v]) => [k, [...v]]));
  const roles: Record<string, SlotRoles> =
    mode === 'all' ? {} : Object.fromEntries(Object.entries(state.roles).map(([k, v]) => [k, { ...v }]));
  // Avoir suivi la formation ne dépend pas du jour : rapprochement sur la personne.
  const formes = new Set(
    state.slots.filter((x) => x.format === FORMATION_KEY).flatMap((x) => slotAssigned(state, x)),
  );
  const gap = state.options.minGap;
  const load: Record<string, number> = {};
  const loadDay: Record<string, Record<string, number>> = {};
  const taken: Record<string, Slot[]> = {};
  const known = new Set(state.people.map((p) => p.id));
  for (const p of state.people) { load[p.id] = 0; loadDay[p.id] = {}; taken[p.id] = []; }
  for (const s of state.slots) {
    for (const pid of assign[s.id] ?? []) {
      if (!known.has(pid)) continue;
      load[pid]++;
      loadDay[pid][s.jour] = (loadDay[pid][s.jour] ?? 0) + 1;
      taken[pid].push(s);
    }
  }
  const need = (s: Slot) => slotNeed(state, s);
  const count = (s: Slot) => (assign[s.id] ?? []).length;
  const canPlace = (p: Person, s: Slot) =>
    !(assign[s.id] ?? []).includes(p.id) &&
    personAvailable(p, s.jour) &&
    load[p.id] < personMax(state, p) &&
    (loadDay[p.id][s.jour] ?? 0) < dayMax(state) &&
    !taken[p.id].some((t) => overlaps(t, s, gap));

  const roleTaken = (s: Slot, r: RoleKey) => roles[s.id]?.[r];
  // Un créneau de salle déjà pourvu en personnes mais sans rôles doit être
  // visité : sans cela ses postes ne seraient jamais attribués.
  const aRemplir = (s: Slot) =>
    count(s) < need(s) || (tientUnBinome(s) && ROLE_KEYS.some((r) => !roleTaken(s, r)));

  const pending = state.slots
    .filter(aRemplir)
    .map((s) => ({
      s,
      cand: state.people.filter((p) => canPlace(p, s)).length,
      miss: need(s) - count(s),
      dur: s.debut == null || slotEnd(s) == null ? 60 : slotEnd(s)! - s.debut,
    }));
  const bySlot = compareSlots(state.days);
  pending.sort((a, b) => a.cand - b.cand || b.dur - a.dur || b.miss - a.miss || bySlot(a.s, b.s));

  let placed = 0;
  for (const { s } of pending) {
    if (tientUnBinome(s)) {
      // La captation d'abord : c'est le poste contraint, il veut quelqu'un qui a
      // suivi la formation. Servir le keeper en premier lui ferait rafler la
      // seule personne formée et laisserait la captation à quelqu'un qui ne l'est pas.
      for (const role of ORDRE_ATTRIBUTION) {
        if (roleTaken(s, role)) continue;
        const autre = ROLE_KEYS.find((r) => r !== role)!;
        // D'abord les personnes déjà présentes et sans poste : les qualifier ne
        // consomme aucune disponibilité. On ne recrute qu'à défaut.
        const dedans = (assign[s.id] ?? []).filter((id) => roleTaken(s, autre) !== id);
        const vivier = dedans.length
          ? state.people.filter((p) => dedans.includes(p.id))
          : state.people.filter((p) => canPlace(p, s));
        let best: Person | null = null, bestScore = Infinity;
        vivier.forEach((p, i) => {
          // La captation revient de préférence à quelqu'un qui a suivi la
          // formation ; à défaut on place quand même, le diagnostic signalera.
          const prefer = role === 'captation' && formes.has(p.id) ? -100 : 0;
          const score = prefer + load[p.id] * 10 + (loadDay[p.id][s.jour] ?? 0) * 4
            - tagBonus(state, p, s) * 3 + (i % 3) * 0.01;
          if (score < bestScore) { bestScore = score; best = p; }
        });
        if (!best) continue;
        const b = best as Person;
        (roles[s.id] ??= {})[role] = b.id;
        // Qualifier quelqu'un déjà présent n'est pas un placement : ne pas le
        // compter, sous peine d'annoncer 160 personnes placées quand aucune
        // n'a bougé.
        if (!(assign[s.id] ?? []).includes(b.id)) {
          (assign[s.id] ??= []).push(b.id);
          load[b.id]++;
          loadDay[b.id][s.jour] = (loadDay[b.id][s.jour] ?? 0) + 1;
          taken[b.id].push(s);
          placed++;
        }
      }
      // Pas de `continue` : un créneau de salle dont le besoin dépasse 2 doit
      // encore être complété au-delà de ses deux postes.
    }
    while (count(s) < need(s)) {
      let best: Person | null = null, bestScore = Infinity;
      state.people.forEach((p, i) => {
        if (!canPlace(p, s)) return;
        const score = load[p.id] * 10 + (loadDay[p.id][s.jour] ?? 0) * 4 - tagBonus(state, p, s) * 3 + (i % 3) * 0.01;
        if (score < bestScore) { bestScore = score; best = p; }
      });
      if (!best) break;
      const b = best as Person;
      (assign[s.id] ??= []).push(b.id);
      load[b.id]++;
      loadDay[b.id][s.jour] = (loadDay[b.id][s.jour] ?? 0) + 1;
      taken[b.id].push(s);
      placed++;
    }
  }
  const gaps = state.slots.reduce((n, s) => n + Math.max(0, need(s) - count(s)), 0);
  return { assign, roles, placed, gaps };
}

export interface Diagnostics {
  under: { slot: Slot; miss: number }[];
  conflicts: { person: Person; a: Slot; b: Slot }[];
  idle: Person[];
  over: { person: Person; n: number; max: number }[];
  /** Captation désignée mais qui n'a pas suivi la formation. */
  untrained: { slot: Slot; person: Person }[];
  /** Poste vacant sur un créneau de salle. */
  missingRole: { slot: Slot; role: RoleKey }[];
}

export function diagnostics(state: RegieState): Diagnostics {
  const d: Diagnostics = { under: [], conflicts: [], idle: [], over: [], untrained: [], missingRole: [] };
  // Avoir suivi la formation ne dépend pas du jour du créneau évalué :
  // le rapprochement se fait sur la personne.
  const formes = new Set(
    state.slots.filter((s) => s.format === FORMATION_KEY).flatMap((s) => slotAssigned(state, s)),
  );
  for (const s of [...state.slots].sort(compareSlots(state.days))) {
    const miss = slotNeed(state, s) - slotAssigned(state, s).length;
    if (miss > 0) d.under.push({ slot: s, miss });
    if (!tientUnBinome(s)) continue;
    for (const role of ROLE_KEYS) {
      const id = roleOf(state, s, role);
      // Un id qui ne correspond à aucun helper connu vaut poste vacant : sans
      // cela le créneau échapperait silencieusement aux deux diagnostics.
      const person = id ? state.people.find((p) => p.id === id) : undefined;
      if (!person) { d.missingRole.push({ slot: s, role }); continue; }
      if (role === 'captation' && !formes.has(person.id)) d.untrained.push({ slot: s, person });
    }
  }
  for (const p of state.people) {
    const mine = personSlots(state, p.id);
    if (!mine.length) { d.idle.push(p); continue; }
    const max = personMax(state, p);
    if (mine.length > max) d.over.push({ person: p, n: mine.length, max });
    for (let i = 0; i < mine.length; i++)
      for (let j = i + 1; j < mine.length; j++)
        if (overlaps(mine[i], mine[j], state.options.minGap)) d.conflicts.push({ person: p, a: mine[i], b: mine[j] });
  }
  return d;
}

export function coverage(state: RegieState, slots = state.slots) {
  let need = 0, have = 0, ok = 0, part = 0, miss = 0;
  for (const s of slots) {
    const n = slotNeed(state, s);
    need += n;
    have += Math.min(slotAssigned(state, s).length, n);
    const c = slotCoverage(state, s);
    if (c === 'ok') ok++; else if (c === 'part') part++; else miss++;
  }
  return { need, have, ok, part, miss, slots: slots.length };
}

/** Le poste tenu par une personne sur un créneau, s'il y en a un. */
export function roleDe(state: RegieState, s: Slot, personId: string): RoleKey | null {
  return ROLE_KEYS.find((r) => roleOf(state, s, r) === personId) ?? null;
}

/**
 * Les créneaux tenus en binôme keeper + captation : les amphis seulement.
 * Les labs accueillent ateliers et universités, qui ne tiennent qu'une personne
 * et n'ont ni time keeper ni captation.
 */
export function tientUnBinome(s: Slot): boolean {
  return /amphi/i.test(s.salle);
}

/**
 * Le titulaire d'un poste, s'il est toujours affecté au créneau.
 * `autoAssign` réécrit `assign` et `roles` ensemble : cette validation à la
 * lecture est ce qui rend inerte toute désignation devenue caduque. Aucun
 * appelant ne lit `state.roles` directement.
 */
export function roleOf(state: RegieState, s: Slot, role: RoleKey): string | null {
  const id = state.roles[s.id]?.[role];
  return id && slotAssigned(state, s).includes(id) ? id : null;
}
