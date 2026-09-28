import { Component, inject } from '@angular/core';
import { RegieStore } from '../../state/regie.store';
import { Options } from '../../domain/model';
import { POSTE_FERMETURE, POSTE_OUVERTURE, POSTE_TRANCHE_MIN } from '../../domain/seed';

@Component({
  selector: 'app-regles',
  templateUrl: './regles.html',
  styleUrl: './regles.css',
})
export class Regles {
  protected readonly store = inject(RegieStore);
  protected readonly poste = { ouverture: POSTE_OUVERTURE, fermeture: POSTE_FERMETURE, tranche: POSTE_TRANCHE_MIN };

  protected setOpt(key: keyof Options, raw: string) {
    this.store.setOption(key, parseInt(raw, 10) || 0);
  }
  protected setNeed(key: string, raw: string) {
    this.store.setFormatNeed(key, parseInt(raw, 10) || 0);
  }
  protected addDay(input: HTMLInputElement) {
    this.store.addDay(input.value);
    input.value = '';
  }
}
