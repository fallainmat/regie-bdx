import { Component, computed, inject, signal } from '@angular/core';
import { RegieStore } from '../../state/regie.store';
import { Person, Slot } from '../../domain/model';
import {
  captationOf, compareSlots, eligibility, formatLabel, isPoste, isSalleConference, personSlots, slotAssigned,
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
      .map((p) => ({ person: p, load: personSlots(s, p.id).length, reason: eligibility(s, p, slot), match: tagBonus(s, p, slot) }))
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

  protected roleAttendu(x: Slot) { return isSalleConference(x); }
  protected captation(x: Slot) { return captationOf(this.store.state(), x); }
  protected toggleCaptation(x: Slot, personId: string) {
    this.store.setCaptation(x.id, this.captation(x) === personId ? null : personId);
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
