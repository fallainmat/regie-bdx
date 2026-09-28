import { Injectable, computed, effect, signal } from '@angular/core';
import { Format, Options, Person, RegieState, RoleKey, SlotRoles, Slot } from '../domain/model';
import { blankState, seedDay } from '../domain/seed';
import { autoAssign, coverage, diagnostics, formatLabel, personSlots, slotLabel } from '../domain/rules';
import { parsePeople, parseState } from '../domain/import';
import { minutesToTime, uid } from '../domain/util';

const STORAGE_KEY = 'regie-helpers-v1';

/**
 * Source unique de vérité de l'application.
 * L'état est sauvegardé dans le navigateur à chaque changement ;
 * l'export JSON sert de sauvegarde durable et de moyen de partage.
 */
@Injectable({ providedIn: 'root' })
export class RegieStore {
  readonly state = signal<RegieState>(this.restore());

  readonly days = computed(() => this.state().days);
  readonly people = computed(() => this.state().people);
  readonly coverage = computed(() => coverage(this.state()));
  readonly diagnostics = computed(() => diagnostics(this.state()));

  constructor() {
    effect(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state())); } catch { /* stockage plein ou bloqué */ }
    });
  }

  private restore(): RegieState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return parseState(JSON.parse(raw));
    } catch { /* sauvegarde illisible : on repart du programme */ }
    return blankState();
  }

  private patch(fn: (s: RegieState) => Partial<RegieState>) {
    this.state.update((s) => ({ ...s, ...fn(s) }));
  }

  /* --- affectations --------------------------------------------------- */
  assign(slotId: string, personId: string) {
    this.patch((s) => {
      const cur = s.assign[slotId] ?? [];
      return cur.includes(personId) ? {} : { assign: { ...s.assign, [slotId]: [...cur, personId] } };
    });
  }
  unassign(slotId: string, personId: string) {
    this.patch((s) => {
      const next = (s.assign[slotId] ?? []).filter((id) => id !== personId);
      const assign = { ...s.assign };
      if (next.length) assign[slotId] = next; else delete assign[slotId];
      return { assign };
    });
  }
  runAuto(mode: 'fill' | 'all') {
    const r = autoAssign(this.state(), mode);
    this.patch(() => ({ assign: r.assign, roles: r.roles }));
    return r;
  }
  clearAssignments() {
    // Même raison qu'à l'import : des rôles sans affectation s'accumulent en
    // silence. Inertes grâce à roleOf, mais trompeurs dans la sauvegarde.
    this.patch(() => ({ assign: {}, roles: {} }));
  }

  /* --- helpers -------------------------------------------------------- */
  importPeople(data: unknown, mode: 'replace' | 'merge'): number {
    const incoming = parsePeople(data);
    this.patch((s) => {
      // Les rôles désignent des personnes par id : remplacer la liste régénère
      // les ids, et les laisser derrière accumulerait des postes pointant dans
      // le vide. Inertes grâce à roleOf, mais trompeurs dans la sauvegarde.
      if (mode === 'replace') return { people: incoming, assign: {}, roles: {} };
      const byName = new Set(s.people.map((p) => p.nom.toLowerCase()));
      return { people: [...s.people, ...incoming.filter((p) => !byName.has(p.nom.toLowerCase()))] };
    });
    return incoming.length;
  }
  addPerson(p: Omit<Person, 'id'>) {
    this.patch((s) => ({ people: [...s.people, { ...p, id: uid('p') }] }));
  }
  updatePerson(id: string, changes: Partial<Person>) {
    this.patch((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, ...changes } : p)) }));
  }
  removePerson(id: string) {
    this.patch((s) => ({
      people: s.people.filter((p) => p.id !== id),
      assign: Object.fromEntries(
        Object.entries(s.assign).map(([k, v]) => [k, v.filter((x) => x !== id)] as const).filter(([, v]) => v.length),
      ),
      // Même raison : ne pas laisser de postes tenus par quelqu'un qui n'existe plus.
      roles: Object.fromEntries(
        Object.entries(s.roles)
          .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, pid]) => pid !== id))] as const)
          .filter(([, v]) => Object.keys(v).length),
      ),
    }));
  }

  /* --- règles --------------------------------------------------------- */
  setFormatNeed(key: string, need: number) {
    this.patch((s) => ({ formats: s.formats.map((f: Format) => (f.key === key ? { ...f, need: Math.max(0, need | 0) } : f)) }));
  }
  setOption<K extends keyof Options>(key: K, value: number) {
    this.patch((s) => ({ options: { ...s.options, [key]: Math.max(0, value | 0) } }));
  }
  setSlotNeed(slotId: string, besoin: number | null) {
    this.patch((s) => ({ slots: s.slots.map((x: Slot) => (x.id === slotId ? { ...x, besoin } : x)) }));
  }

  /* --- rôles ---------------------------------------------------------- */
  /** Attribue un poste d'un créneau ; `null` le libère. */
  setRole(slotId: string, role: RoleKey, personId: string | null) {
    this.patch((s) => {
      if (personId != null && !(s.assign[slotId] ?? []).includes(personId)) return {};
      const next: SlotRoles = { ...(s.roles[slotId] ?? {}) };
      if (personId == null) delete next[role]; else next[role] = personId;
      return { roles: { ...s.roles, [slotId]: next } };
    });
  }

  /* --- journées ------------------------------------------------------- */
  renameDay(oldName: string, name: string) {
    name = name.trim();
    if (!name || this.state().days.includes(name)) return;
    this.patch((s) => ({
      days: s.days.map((d) => (d === oldName ? name : d)),
      slots: s.slots.map((x) => (x.jour === oldName ? { ...x, jour: name } : x)),
      people: s.people.map((p) => ({ ...p, jours: p.jours.map((j) => (j === oldName ? name : j)) })),
    }));
  }
  addDay(name: string) {
    name = name.trim();
    if (!name || this.state().days.includes(name)) return;
    this.patch((s) => ({ days: [...s.days, name], slots: [...s.slots, ...seedDay(name)] }));
  }

  /* --- fichiers ------------------------------------------------------- */
  exportJson(): string {
    return JSON.stringify(this.state(), null, 2);
  }
  loadJson(data: unknown) {
    this.state.set(parseState(data));
  }
  reset() {
    this.state.set(blankState());
  }

  /** Une ligne par affectation, lisible dans un tableur. */
  exportCsv(): string {
    const s = this.state();
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Helper', 'Jour', 'Début', 'Fin', 'Poste', 'Salle', 'Format']];
    for (const p of s.people)
      for (const sl of personSlots(s, p.id))
        rows.push([p.nom, sl.jour, minutesToTime(sl.debut), minutesToTime(sl.fin), slotLabel(s, sl), sl.salle, formatLabel(s, sl.format)]);
    return '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  }
}

export function download(filename: string, content: string | Blob, type: string) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((t) => {
    try { return JSON.parse(t); } catch { throw new Error(`« ${file.name} » n'est pas un JSON valide.`); }
  });
}
