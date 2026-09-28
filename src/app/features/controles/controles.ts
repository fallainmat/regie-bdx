import { Component, computed, inject } from '@angular/core';
import { RegieStore } from '../../state/regie.store';
import { slotEnd, slotLabel } from '../../domain/rules';
import { RoleKey, ROLE_LABEL, Slot } from '../../domain/model';
import { minutesToTime } from '../../domain/util';

@Component({
  selector: 'app-controles',
  template: `
    @let d = store.diagnostics();
    @if (allGood()) {
      <p class="allgood">Tout est couvert, sans chevauchement ni dépassement de plafond.</p>
    }
    <div class="grid">
      <section>
        <h2>Créneaux incomplets <span class="n">{{ d.under.length }}</span></h2>
        <ul>
          @for (u of d.under; track u.slot.id) {
            <li><span>{{ when(u.slot) }} · {{ label(u.slot) }}</span><b class="miss">−{{ u.miss }}</b></li>
          } @empty { <li class="none">Aucun.</li> }
        </ul>
      </section>
      <section>
        <h2>Chevauchements <span class="n">{{ d.conflicts.length }}</span></h2>
        <ul>
          @for (c of d.conflicts; track $index) {
            <li><span><b>{{ c.person.nom }}</b> : {{ when(c.a) }} et {{ when(c.b) }}</span></li>
          } @empty { <li class="none">Aucun.</li> }
        </ul>
        <h2 class="mt">Plafonds dépassés <span class="n">{{ d.over.length }}</span></h2>
        <ul>
          @for (o of d.over; track o.person.id) {
            <li><span>{{ o.person.nom }}</span><b class="miss">{{ o.n }}/{{ o.max }}</b></li>
          } @empty { <li class="none">Aucun.</li> }
        </ul>
        <h2 class="mt">Helpers sans créneau <span class="n">{{ d.idle.length }}</span></h2>
        <ul>
          @for (p of d.idle; track p.id) { <li>{{ p.nom }}</li> } @empty { <li class="none">Aucun.</li> }
        </ul>
      </section>
      <section>
        <h2>Captation non formée <span class="n">{{ d.untrained.length }}</span></h2>
        <ul>
          @for (u of d.untrained; track u.slot.id) {
            <li><span>{{ when(u.slot) }} · {{ label(u.slot) }}</span><b class="miss">{{ u.person.nom }}</b></li>
          } @empty { <li class="none">Aucune.</li> }
        </ul>
        <h2 class="mt">Postes à pourvoir <span class="n">{{ d.missingRole.length }}</span></h2>
        <ul>
          @for (m of d.missingRole; track m.slot.id + m.role) {
            <li><span>{{ when(m.slot) }} · {{ label(m.slot) }}</span><b class="miss">{{ roleLabel(m.role) }}</b></li>
          } @empty { <li class="none">Aucun.</li> }
        </ul>
      </section>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 32px; }
    h2 { font: 600 1.25rem/1.1 var(--display); margin: 0 0 8px; display: flex; gap: 8px; align-items: baseline; }
    .mt { margin-top: 24px; }
    .n { font: 500 .85rem var(--body); color: var(--muted); }
    ul { list-style: none; margin: 0; padding: 0; max-height: 60vh; overflow: auto; }
    li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: .9rem; }
    .miss { color: var(--miss); font-variant-numeric: tabular-nums; }
    .none { color: var(--muted); }
    .allgood { background: color-mix(in srgb, var(--ok) 12%, transparent); color: var(--ok); padding: 12px 16px; border-radius: 6px; font-weight: 600; }
  `,
})
export class Controles {
  protected readonly store = inject(RegieStore);
  protected readonly allGood = computed(() => {
    const d = this.store.diagnostics();
    return this.store.people().length > 0 && !d.under.length && !d.conflicts.length && !d.over.length
      && !d.untrained.length && !d.missingRole.length;
  });
  protected when(s: Slot) { return `${s.jour} ${minutesToTime(s.debut)}–${minutesToTime(slotEnd(s))}`; }
  protected label(s: Slot) { return slotLabel(this.store.state(), s); }
  protected roleLabel(r: RoleKey) { return ROLE_LABEL[r]; }
}
