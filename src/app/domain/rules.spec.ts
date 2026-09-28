import { Person, RegieState, Slot } from './model';
import { blankState } from './seed';
import { diagnostics, isSalleConference, roleOf } from './rules';

function person(id: string): Person {
  return { id, nom: id, email: '', role: '', tags: [], jours: [], maxCharge: 0, notes: '' };
}

function slot(id: string, over: Partial<Slot> = {}): Slot {
  return { id, jour: 'Jeudi 29', debut: 600, fin: 660, salle: 'Amphi A', titre: '', format: 'conference', besoin: 2, ...over };
}

function state(over: Partial<RegieState> = {}): RegieState {
  return { ...blankState(), people: [], slots: [], assign: {}, roles: {}, ...over };
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

describe('roleOf', () => {
  it('renvoie la personne désignée quand elle est affectée au créneau', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p1', 'p2'] },
      roles: { s1: { captation: 'p1' } },
    });
    expect(roleOf(st, s, 'captation')).toBe('p1');
  });

  // Le scénario « Tout refaire » : autoAssign remplace assign en bloc et
  // ne touche pas aux rôles. La désignation devenue caduque doit être ignorée.
  it('ignore une désignation dont la personne a quitté le créneau', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p2'] },
      roles: { s1: { captation: 'p1' } },
    });
    expect(roleOf(st, s, 'captation')).toBeNull();
  });

  it('renvoie null quand aucune captation n\'est désignée', () => {
    const s = slot('s1');
    const st = state({ people: [person('p1')], slots: [s], assign: { s1: ['p1'] } });
    expect(roleOf(st, s, 'captation')).toBeNull();
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

describe('roleOf — le keeper', () => {
  it('renvoie le keeper comme la captation', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p1', 'p2'] },
      roles: { s1: { keeper: 'p2', captation: 'p1' } },
    });
    expect(roleOf(st, s, 'keeper')).toBe('p2');
    expect(roleOf(st, s, 'captation')).toBe('p1');
  });

  // Même garde que pour la captation : autoAssign réécrit assign ET roles,
  // une désignation orpheline doit être inerte sur les DEUX postes.
  it('ignore un keeper dont la personne a quitté le créneau', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p1'] },
      roles: { s1: { keeper: 'p2', captation: 'p1' } },
    });
    expect(roleOf(st, s, 'keeper')).toBeNull();
    expect(roleOf(st, s, 'captation')).toBe('p1');
  });

  it('nomme le poste vacant plutôt que le créneau', () => {
    const st = avecFormation({
      assign: { s1: ['p1', 'p2'] },
      roles: { s1: { captation: 'p1' } },
    });
    expect(diagnostics(st).missingRole.map((m) => m.role)).toEqual(['keeper']);
  });
});

describe('diagnostics — captation non formée', () => {
  it('signale la captation qui n\'a pas suivi la formation, même le vendredi', () => {
    const st = avecFormation({ assign: { s1: ['p1', 'p2'], f: ['p2'] }, roles: { s1: { captation: 'p1' } } });
    expect(diagnostics(st).untrained.map((u) => u.person.id)).toEqual(['p1']);
  });

  // Le spec l'affirme : une captation non formée est un problème même si le
  // binôme est incomplet. `untrained` ne regarde donc pas la couverture.
  it('signale une captation non formée même sur un binôme incomplet', () => {
    const st = avecFormation({ assign: { s1: ['p1'], f: ['p2'] }, roles: { s1: { captation: 'p1' } } });
    expect(diagnostics(st).untrained.map((u) => u.person.id)).toEqual(['p1']);
  });

  it('ne signale pas une captation formée', () => {
    const st = avecFormation({ assign: { s1: ['p1', 'p2'], f: ['p2'] }, roles: { s1: { captation: 'p2' } } });
    expect(diagnostics(st).untrained).toEqual([]);
  });
});

describe('diagnostics — postes à pourvoir', () => {
  it('nomme les deux postes vacants d\'un créneau pourvu en personnes', () => {
    const st = avecFormation({ assign: { s1: ['p1', 'p2'] } });
    expect(diagnostics(st).missingRole.map((m) => m.role)).toEqual(['keeper', 'captation']);
  });

  // Les postes sont désormais des positions à pourvoir, pas une annotation :
  // un créneau sous-pourvu porte donc à la fois une incomplétude d'effectif et
  // des postes vacants. Les deux listes se répondent au lieu d'être disjointes.
  it('signale les postes vacants même sur un créneau sous-pourvu', () => {
    const st = avecFormation({ assign: { s1: ['p1'] } });
    const d = diagnostics(st);
    expect(d.missingRole.map((m) => m.role)).toEqual(['keeper', 'captation']);
    expect(d.under.some((u) => u.slot.id === 's1')).toBe(true);
  });

  // Ce test doit FALSIFIER le garde isSalleConference : les deux créneaux hors
  // salle sont complets, l'un sans captation désignée, l'autre avec une captation
  // non formée. Sans le garde, le premier remonterait dans missingRole et le
  // second dans untrained.
  // Le scénario que roleOf existe pour couvrir : après un « Tout refaire »,
  // le créneau est de nouveau complet mais la personne désignée n'y figure plus.
  it('signale un créneau complet dont la captation désignée a été remplacée', () => {
    const st = avecFormation({
      people: [person('p1'), person('p2'), person('p3')],
      assign: { s1: ['p2', 'p3'] },
      roles: { s1: { captation: 'p1' } },
    });
    const d = diagnostics(st);
    // La captation est caduque et le keeper n'a jamais été posé : deux vacants.
    expect(d.missingRole.map((m) => m.role)).toEqual(['keeper', 'captation']);
    expect(d.untrained).toEqual([]);
  });

  // Une désignation pointant un id absent de `people` prenait autrefois la
  // branche untrained puis y était abandonnée : le créneau paraissait sain.
  it('traite une captation inconnue au fichier des helpers comme à désigner', () => {
    const st = avecFormation({
      assign: { s1: ['p1', 'fantome'] },
      roles: { s1: { captation: 'fantome' } },
    });
    const d = diagnostics(st);
    expect(d.untrained).toEqual([]);
    expect(d.missingRole.map((m) => m.role)).toEqual(['keeper', 'captation']);
  });

  it('ignore les créneaux hors salle pour les deux diagnostics', () => {
    const formation = slot('f', { salle: '', format: 'formation', besoin: 1, debut: 480, fin: 540 });
    const poste = slot('a', { salle: '', format: 'accueil', besoin: 1, debut: 480, fin: 540 });
    const st = state({
      days: ['Jeudi 29'],
      people: [person('p1'), person('p2')],
      slots: [formation, poste],
      assign: { f: ['p1'], a: ['p2'] },
      roles: { a: { captation: 'p2' } },
    });
    const d = diagnostics(st);
    expect(d.under).toEqual([]);
    expect(d.missingRole).toEqual([]);
    expect(d.untrained).toEqual([]);
  });
});
