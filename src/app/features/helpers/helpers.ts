import { Component, computed, inject, signal } from '@angular/core';
import { RegieStore, readJsonFile } from '../../state/regie.store';
import { Person } from '../../domain/model';
import { personMax, personSlots, slotEnd, slotLabel } from '../../domain/rules';
import { initials, minutesToTime } from '../../domain/util';

const SAMPLE = `[
  { "nom": "Camille Roux", "jours": ["Jeudi 29"], "tags": ["accueil"], "max": 4 },
  { "nom": "Yanis Benali", "tags": ["Amphi A"] },
  "Léa Martin"
]`;

@Component({
  selector: 'app-helpers',
  templateUrl: './helpers.html',
  styleUrl: './helpers.css',
})
export class Helpers {
  protected readonly store = inject(RegieStore);
  protected readonly initials = initials;
  protected readonly time = minutesToTime;
  protected readonly sample = SAMPLE;

  protected readonly query = signal('');
  protected readonly openId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly importMode = signal<'replace' | 'merge'>('merge');

  protected readonly rows = computed(() => {
    const s = this.store.state();
    const q = this.query().trim().toLowerCase();
    return s.people
      .filter((p) => !q || [p.nom, p.role, ...p.tags].some((v) => v.toLowerCase().includes(q)))
      .map((p) => ({ p, slots: personSlots(s, p.id), max: personMax(s, p) }))
      .sort((a, b) => b.slots.length - a.slots.length || a.p.nom.localeCompare(b.p.nom, 'fr'));
  });
  protected readonly maxLoad = computed(() => Math.max(1, ...this.rows().map((r) => r.slots.length)));

  protected async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(''); this.info.set('');
    try {
      const n = this.store.importPeople(await readJsonFile(file), this.importMode());
      this.info.set(`${n} helper${n > 1 ? 's' : ''} lu${n > 1 ? 's' : ''} dans « ${file.name} ».`);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected add(nom: HTMLInputElement, jours: HTMLInputElement, tags: HTMLInputElement) {
    const n = nom.value.trim();
    if (!n) { nom.focus(); return; }
    const split = (v: string) => v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    this.store.addPerson({ nom: n, email: '', role: '', tags: split(tags.value), jours: split(jours.value), maxCharge: 0, notes: '' });
    nom.value = jours.value = tags.value = '';
    nom.focus();
  }

  protected setMax(p: Person, raw: string) {
    this.store.updatePerson(p.id, { maxCharge: Math.max(0, parseInt(raw, 10) || 0) });
  }
  protected remove(p: Person) {
    if (confirm(`Retirer ${p.nom} et toutes ses affectations ?`)) this.store.removePerson(p.id);
  }
  protected label = (sl: Parameters<typeof slotLabel>[1]) => slotLabel(this.store.state(), sl);
  protected end = (sl: Parameters<typeof slotEnd>[0]) => minutesToTime(slotEnd(sl));
  protected maxText(m: number) { return m === Infinity ? '—' : String(m); }
}
