import { Person, RegieState, Slot } from './model';
import { blankState } from './seed';
import { captationOf, diagnostics, isSalleConference } from './rules';

function person(id: string): Person {
  return { id, nom: id, email: '', role: '', tags: [], jours: [], maxCharge: 0, notes: '' };
}

function slot(id: string, over: Partial<Slot> = {}): Slot {
  return { id, jour: 'Jeudi 29', debut: 600, fin: 660, salle: 'Amphi A', titre: '', format: 'conference', besoin: 2, ...over };
}

function state(over: Partial<RegieState> = {}): RegieState {
  return { ...blankState(), people: [], slots: [], assign: {}, captation: {}, ...over };
}

describe('isSalleConference', () => {
  it('retient les amphis et les labs', () => {
    expect(isSalleConference(slot('a', { salle: 'Amphi A' }))).toBe(true);
    expect(isSalleConference(slot('b', { salle: 'Grand amphi' }))).toBe(true);
    expect(isSalleConference(slot('c', { salle: 'Lab' }))).toBe(true);
    expect(isSalleConference(slot('d', { salle: 'Lab 2' }))).toBe(true);
  });

  // Sans ces négatifs à salle non vide, le prédicat pourrait être réécrit en
  // `salle !== ''` — ou perdre son ancre ^ — sans qu'aucun test ne bronche.
  it('écarte une salle qui ne relève ni des amphis ni des labs', () => {
    // « Collaboratif » contient « lab » sans en être un : cela épingle l'ancre ^.
    expect(isSalleConference(slot('g', { salle: 'Collaboratif' }))).toBe(false);
    expect(isSalleConference(slot('h', { salle: 'Salle 1' }))).toBe(false);
  });

  it('écarte les créneaux sans salle : postes et formation', () => {
    expect(isSalleConference(slot('e', { salle: '', format: 'accueil' }))).toBe(false);
    expect(isSalleConference(slot('f', { salle: '', format: 'formation' }))).toBe(false);
  });
});

describe('captationOf', () => {
  it('renvoie la personne désignée quand elle est affectée au créneau', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p1', 'p2'] },
      captation: { s1: 'p1' },
    });
    expect(captationOf(st, s)).toBe('p1');
  });

  // Le scénario « Tout refaire » : autoAssign remplace assign en bloc et
  // ne touche pas aux rôles. La désignation devenue caduque doit être ignorée.
  it('ignore une désignation dont la personne a quitté le créneau', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p2'] },
      captation: { s1: 'p1' },
    });
    expect(captationOf(st, s)).toBeNull();
  });

  it('renvoie null quand aucune captation n\'est désignée', () => {
    const s = slot('s1');
    const st = state({ people: [person('p1')], slots: [s], assign: { s1: ['p1'] } });
    expect(captationOf(st, s)).toBeNull();
  });
});

/** Un état à deux créneaux : la formation du jeudi et une conférence. */
function avecFormation(over: Partial<RegieState> = {}): RegieState {
  const formation = slot('f', { jour: 'Jeudi 29', salle: '', format: 'formation', besoin: 10, debut: 480, fin: 540 });
  const conf = slot('s1', { jour: 'Vendredi 30' });
  return state({
    days: ['Jeudi 29', 'Vendredi 30'],
    people: [person('p1'), person('p2')],
    slots: [formation, conf],
    ...over,
  });
}

describe('diagnostics — captation non formée', () => {
  it('signale la captation qui n\'a pas suivi la formation, même le vendredi', () => {
    const st = avecFormation({ assign: { s1: ['p1', 'p2'], f: ['p2'] }, captation: { s1: 'p1' } });
    expect(diagnostics(st).untrained.map((u) => u.person.id)).toEqual(['p1']);
  });

  // Le spec l'affirme : une captation non formée est un problème même si le
  // binôme est incomplet. `untrained` ne regarde donc pas la couverture.
  it('signale une captation non formée même sur un binôme incomplet', () => {
    const st = avecFormation({ assign: { s1: ['p1'], f: ['p2'] }, captation: { s1: 'p1' } });
    expect(diagnostics(st).untrained.map((u) => u.person.id)).toEqual(['p1']);
  });

  it('ne signale pas une captation formée', () => {
    const st = avecFormation({ assign: { s1: ['p1', 'p2'], f: ['p2'] }, captation: { s1: 'p2' } });
    expect(diagnostics(st).untrained).toEqual([]);
  });
});

describe('diagnostics — captation à désigner', () => {
  it('signale un créneau complet sans captation', () => {
    const st = avecFormation({ assign: { s1: ['p1', 'p2'] } });
    expect(diagnostics(st).unassignedRole.map((s) => s.id)).toEqual(['s1']);
  });

  // Sans cette exclusion, les créneaux sous-pourvus seraient comptés deux fois :
  // ici et dans `under`. Les deux catégories doivent rester disjointes.
  it('ignore un créneau sous-pourvu, déjà couvert par « créneaux incomplets »', () => {
    const st = avecFormation({ assign: { s1: ['p1'] } });
    const d = diagnostics(st);
    expect(d.unassignedRole).toEqual([]);
    expect(d.under.some((u) => u.slot.id === 's1')).toBe(true);
  });

  // Ce test doit FALSIFIER le garde isSalleConference : les deux créneaux hors
  // salle sont complets, l'un sans captation désignée, l'autre avec une captation
  // non formée. Sans le garde, le premier remonterait dans unassignedRole et le
  // second dans untrained.
  // Le scénario que captationOf existe pour couvrir : après un « Tout refaire »,
  // le créneau est de nouveau complet mais la personne désignée n'y figure plus.
  it('signale un créneau complet dont la captation désignée a été remplacée', () => {
    const st = avecFormation({
      people: [person('p1'), person('p2'), person('p3')],
      assign: { s1: ['p2', 'p3'] },
      captation: { s1: 'p1' },
    });
    const d = diagnostics(st);
    expect(d.unassignedRole.map((s) => s.id)).toEqual(['s1']);
    expect(d.untrained).toEqual([]);
  });

  // Une désignation pointant un id absent de `people` prenait autrefois la
  // branche untrained puis y était abandonnée : le créneau paraissait sain.
  it('traite une captation inconnue au fichier des helpers comme à désigner', () => {
    const st = avecFormation({
      assign: { s1: ['p1', 'fantome'] },
      captation: { s1: 'fantome' },
    });
    const d = diagnostics(st);
    expect(d.untrained).toEqual([]);
    expect(d.unassignedRole.map((s) => s.id)).toEqual(['s1']);
  });

  it('ignore les créneaux hors salle pour les deux diagnostics', () => {
    const formation = slot('f', { salle: '', format: 'formation', besoin: 1, debut: 480, fin: 540 });
    const poste = slot('a', { salle: '', format: 'accueil', besoin: 1, debut: 480, fin: 540 });
    const st = state({
      days: ['Jeudi 29'],
      people: [person('p1'), person('p2')],
      slots: [formation, poste],
      assign: { f: ['p1'], a: ['p2'] },
      captation: { a: 'p2' },
    });
    const d = diagnostics(st);
    expect(d.under).toEqual([]);
    expect(d.unassignedRole).toEqual([]);
    expect(d.untrained).toEqual([]);
  });
});
