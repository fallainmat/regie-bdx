import { Component, computed, inject, signal } from '@angular/core';
import { RegieStore, download, readJsonFile } from './state/regie.store';
import { pdfFeuillesDeRoute, pdfPlanning } from './state/pdf';
import { Planning } from './features/planning/planning';
import { Helpers } from './features/helpers/helpers';
import { Regles } from './features/regles/regles';
import { Controles } from './features/controles/controles';

type Tab = 'planning' | 'helpers' | 'regles' | 'controles';

@Component({
  selector: 'app-root',
  imports: [Planning, Helpers, Regles, Controles],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(RegieStore);
  protected readonly tab = signal<Tab>('planning');
  protected readonly message = signal('');
  protected readonly tabs: { key: Tab; label: string }[] = [
    { key: 'planning', label: 'Planning' },
    { key: 'helpers', label: 'Helpers' },
    { key: 'regles', label: 'Règles' },
    { key: 'controles', label: 'Contrôles' },
  ];
  protected readonly toFill = computed(() => this.store.coverage().need - this.store.coverage().have);
  protected readonly issues = computed(() => {
    const d = this.store.diagnostics();
    return d.conflicts.length + d.over.length;
  });

  private flash(msg: string) {
    this.message.set(msg);
    setTimeout(() => this.message() === msg && this.message.set(''), 5000);
  }

  protected auto(mode: 'fill' | 'all') {
    if (!this.store.people().length) { this.tab.set('helpers'); this.flash('Ajoute des helpers avant de lancer le remplissage.'); return; }
    if (mode === 'all' && !confirm('Refaire toute la répartition ? Les placements faits à la main seront perdus.')) return;
    const r = this.store.runAuto(mode);
    this.flash(`${r.placed} placement${r.placed > 1 ? 's' : ''} ajouté${r.placed > 1 ? 's' : ''}. ${r.gaps ? r.gaps + ' place' + (r.gaps > 1 ? 's' : '') + ' restent à pourvoir.' : 'Tout est couvert.'}`);
  }

  protected save() {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    download(`regie-helpers-${stamp}.json`, this.store.exportJson(), 'application/json');
  }
  protected exportCsv() {
    download('affectations-helpers.csv', this.store.exportCsv(), 'text/csv;charset=utf-8');
  }

  /** Génère le PDF demandé et le télécharge comme les autres exports. */
  protected async exporterPdf(mode: 'planning' | 'feuilles') {
    if (!this.store.state().slots.length) { this.flash('Rien à exporter : la régie ne contient aucun créneau.'); return; }
    if (mode === 'feuilles' && !this.store.coverage().have) {
      this.tab.set('planning');
      this.flash('Aucune affectation : les feuilles de route seraient vides.');
      return;
    }
    this.flash('Préparation du PDF…');
    const nom = mode === 'planning' ? 'planning-helpers.pdf' : 'feuilles-de-route-helpers.pdf';
    try {
      const s = this.store.state();
      const blob = mode === 'planning' ? await pdfPlanning(s) : await pdfFeuillesDeRoute(s);
      download(nom, blob, 'application/pdf');
      // On ne peut pas savoir si le navigateur a accepté le téléchargement :
      // Chrome demande l'autorisation au deuxième export d'affilée. D'où un
      // message qui annonce le fichier prêt, pas un téléchargement accompli.
      this.flash(`« ${nom} » est prêt : regarde tes téléchargements.`);
    } catch (e) {
      this.flash(`Le PDF n'a pas pu être généré : ${(e as Error).message}`);
    }
  }
  protected async open(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm(`Remplacer la régie actuelle par « ${file.name} » ?`)) return;
    try {
      this.store.loadJson(await readJsonFile(file));
      this.flash(`Régie chargée depuis « ${file.name} ».`);
    } catch (e) {
      this.flash((e as Error).message);
    }
  }
  protected reset() {
    if (confirm('Tout effacer et repartir du programme type ? Pense à sauvegarder avant.')) this.store.reset();
  }
}
