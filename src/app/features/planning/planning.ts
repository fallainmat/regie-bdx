import { Component, computed, inject, signal } from '@angular/core';
import { RegieStore } from '../../state/regie.store';
import { Person, RoleKey, ROLE_KEYS, Slot } from '../../domain/model';
import {
  compareSlots, eligibility, formatLabel, isPoste, isSalleConference, personSlots, roleOf, slotAssigned,
  slotCoverage, slotEnd, slotLabel, slotNeed, tagBonus,
} from '../../domain/rules';
import { initials, minutesToTime } from '../../domain/util';

interface Candidate { person: Person; load: number; reason: string | null; match: number }

@Component({
  selector: 'app-planning',
  templateUrl: './planning.html',
  styleUrl: './planning.css',
})
export class Planning {
  protected readonly store = inject(RegieStore);
  protected readonly time = minutesToTime;
  protected readonly initials = initials;

  protected readonly day = signal(this.store.days()[0] ?? '');
  protected readonly onlyGaps = signal(false);
  protected readonly show = signal<'tout' | 'sessions' | 'postes'>('tout');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly showBlocked = signal(false);

  protected readonly currentDay = computed(() => {
    const days = this.store.days();
    return days.includes(this.day()) ? this.day() : days[0] ?? '';
  });

  protected readonly groups = computed(() => {
    const s = this.store.state();
    const kind = this.show();
    const list = s.slots
      .filter((x) => x.jour === this.currentDay())
      .filter((x) => kind === 'tout' || (kind === 'postes') === isPoste(x))
      .filter((x) => !this.onlyGaps() || slotCoverage(s, x) !== 'ok')
      .sort(compareSlots(s.days));
    const out: { debut: number | null; slots: Slot[] }[] = [];
    for (const x of list) {
      const last = out.at(-1);
      if (last && last.debut === x.debut) last.slots.push(x);
      else out.push({ debut: x.debut, slots: [x] });
    }
    return out;
  });

  protected readonly dayGaps = computed<Record<string, number>>(() => {
    const s = this.store.state();
    return Object.fromEntries(
      s.days.map((d) => [
        d,
        s.slots.filter((x) => x.jour === d).reduce((n, x) => n + Math.max(0, slotNeed(s, x) - slotAssigned(s, x).length), 0),
      ]),
    );
  });

  protected readonly selected = computed(() => this.store.state().slots.find((x) => x.id === this.selectedId()) ?? null);

  protected readonly candidates = computed<Candidate[]>(() => {
    const s = this.store.state(), slot = this.selected();
    if (!slot) return [];
    return s.people
      .map((p) => {
        const brut = eligibility(s, p, slot);
        // Sur un créneau à postes, être déjà placé n'exclut pas : on peut tenir
        // l'autre poste, encore vacant.
        const reason = isSalleConference(slot) && brut === 'déjà placé' ? null : brut;
        return { person: p, load: personSlots(s, p.id).length, reason, match: tagBonus(s, p, slot) };
      })
      .filter((c) => c.reason !== 'déjà placé')
      .sort((a, b) => b.match - a.match || a.load - b.load || a.person.nom.localeCompare(b.person.nom, 'fr'));
  });
  protected readonly eligible = computed(() => this.candidates().filter((c) => !c.reason));
  protected readonly blocked = computed(() => this.candidates().filter((c) => c.reason));

  protected need(x: Slot) { return slotNeed(this.store.state(), x); }
  protected assigned(x: Slot): Person[] {
    const s = this.store.state();
    return slotAssigned(s, x).map((id) => s.people.find((p) => p.id === id)).filter((p): p is Person => !!p);
  }
  protected cov(x: Slot) { return slotCoverage(this.store.state(), x); }
  protected label(x: Slot) { return slotLabel(this.store.state(), x); }
  protected fmt(x: Slot) { return formatLabel(this.store.state(), x.format); }
  protected end(x: Slot) { return minutesToTime(slotEnd(x)); }
  protected poste(x: Slot) { return isPoste(x); }

  protected readonly ORDRE = ROLE_KEYS;
  protected roleAttendu(x: Slot) { return isSalleConference(x); }
  protected roleLabel(r: RoleKey) { return r === 'keeper' ? 'Time Keeper' : 'Captation'; }
  protected titulaire(x: Slot, r: RoleKey): Person | null {
    const id = roleOf(this.store.state(), x, r);
    return id ? this.store.people().find((p) => p.id === id) ?? null : null;
  }
  /** Le poste est pris, ou la personne tient déjà l'autre poste du créneau. */
  protected posteIndispo(x: Slot, r: RoleKey, personId: string) {
    const st = this.store.state();
    const autre: RoleKey = r === 'keeper' ? 'captation' : 'keeper';
    return !!roleOf(st, x, r) || roleOf(st, x, autre) === personId;
  }
  protected placerAu(x: Slot, r: RoleKey, personId: string) {
    this.store.assign(x.id, personId);
    this.store.setRole(x.id, r, personId);
  }
  protected viderPoste(x: Slot, r: RoleKey) {
    const id = roleOf(this.store.state(), x, r);
    this.store.setRole(x.id, r, null);
    if (id) this.store.unassign(x.id, id);
  }

  protected open(x: Slot) {
    this.selectedId.set(this.selectedId() === x.id ? null : x.id);
    this.showBlocked.set(false);
  }
  protected setNeed(x: Slot, raw: string) {
    const v = raw.trim() === '' ? null : Number(raw);
    this.store.setSlotNeed(x.id, v == null || isNaN(v) ? null : v);
  }
}
