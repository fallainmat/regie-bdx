import { Person, RegieState, Slot } from './model';
import { blocsFeuilles, blocsPlanning, feuillesDeRoute, planningParJour } from './impression';

function slot(over: Partial<Slot> = {}): Slot {
  return {
    id: 's1', jour: 'Jeudi 29', debut: 540, fin: 595,
    salle: 'Grand amphi', titre: '', format: 'keynote', besoin: null, ...over,
  };
}

function person(over: Partial<Person> = {}): Person {
  return {
    id: 'p1', nom: 'Ada Lovelace', email: '', role: '',
    tags: [], jours: [], maxCharge: 0, notes: '', ...over,
  };
}

function state(over: Partial<RegieState> = {}): RegieState {
  return {
    version: 1,
    nom: 'Test',
    formats: [
      { key: 'keynote', label: 'Keynote', need: 2 },
      { key: 'accueil', label: 'Accueil', need: 6 },
    ],
    options: { minGap: 0, maxPerPerson: 0, maxPerDay: 0 },
    days: ['Jeudi 29', 'Vendredi 30'],
    people: [],
    slots: [],
    assign: {},
    roles: {},
    ...over,
  };
}

describe('planningParJour', () => {
  it('rend une page par journée, dans l’ordre des jours de la régie', () => {
    const s = state({
      slots: [slot({ id: 'a', jour: 'Vendredi 30' }), slot({ id: 'b', jour: 'Jeudi 29' })],
    });

    expect(planningParJour(s).map((page) => page.jour)).toEqual(['Jeudi 29', 'Vendredi 30']);
  });

  it('ne retient que les créneaux du jour, triés par heure de début', () => {
    const s = state({
      days: ['Jeudi 29'],
      slots: [
        slot({ id: 'tard', debut: 660 }),
        slot({ id: 'tot', debut: 540 }),
        slot({ id: 'autre-jour', jour: 'Vendredi 30', debut: 500 }),
      ],
    });

    expect(planningParJour(s)[0].lignes.map((l) => l.slot.id)).toEqual(['tot', 'tard']);
  });

  it('porte les personnes affectées à chaque créneau, par ordre alphabétique', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'z', nom: 'Zoé Martin' }), person({ id: 'a', nom: 'Ada Lovelace' })],
      slots: [slot({ id: 'k' })],
      assign: { k: ['z', 'a'] },
    });

    expect(planningParJour(s)[0].lignes[0].personnes.map((p) => p.nom))
      .toEqual(['Ada Lovelace', 'Zoé Martin']);
  });

  it('indique les places encore à pourvoir sur chaque ligne', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'a' })],
      slots: [slot({ id: 'k', format: 'keynote' })],
      assign: { k: ['a'] },
    });

    const ligne = planningParJour(s)[0].lignes[0];
    expect(ligne.besoin).toBe(2);
    expect(ligne.manque).toBe(1);
  });

  it('nomme la ligne avec le libellé du créneau', () => {
    const s = state({ days: ['Jeudi 29'], slots: [slot({ id: 'k', salle: 'Amphi A' })] });

    expect(planningParJour(s)[0].lignes[0].libelle).toBe('Keynote — Amphi A');
  });
});

describe('feuillesDeRoute', () => {
  it('écarte les personnes sans aucun créneau', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'a', nom: 'Ada Lovelace' }), person({ id: 'o', nom: 'Oisive Personne' })],
      slots: [slot({ id: 'k' })],
      assign: { k: ['a'] },
    });

    expect(feuillesDeRoute(s).map((f) => f.person.nom)).toEqual(['Ada Lovelace']);
  });

  it('groupe les créneaux par jour et omet les jours sans créneau', () => {
    const s = state({
      people: [person({ id: 'a' })],
      slots: [
        slot({ id: 'v', jour: 'Vendredi 30', debut: 600 }),
        slot({ id: 'j', jour: 'Jeudi 29', debut: 540 }),
        slot({ id: 'libre', jour: 'Jeudi 29', debut: 700 }),
      ],
      assign: { v: ['a'], j: ['a'] },
    });

    const journees = feuillesDeRoute(s)[0].journees;
    expect(journees.map((d) => d.jour)).toEqual(['Jeudi 29', 'Vendredi 30']);
    expect(journees[0].lignes.map((l) => l.slot.id)).toEqual(['j']);
  });

  it('classe les helpers par ordre alphabétique et compte leurs créneaux', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'z', nom: 'Zoé Martin' }), person({ id: 'a', nom: 'Ada Lovelace' })],
      slots: [slot({ id: 'k1', debut: 540 }), slot({ id: 'k2', debut: 600 })],
      assign: { k1: ['z', 'a'], k2: ['a'] },
    });

    const feuilles = feuillesDeRoute(s);
    expect(feuilles.map((f) => f.person.nom)).toEqual(['Ada Lovelace', 'Zoé Martin']);
    expect(feuilles[0].total).toBe(2);
  });
});

describe('blocsPlanning', () => {
  it('rend un bloc par journée, titré par le jour', () => {
    const s = state({ slots: [slot({ id: 'a' }), slot({ id: 'b', jour: 'Vendredi 30' })] });

    expect(blocsPlanning(s).map((b) => b.titre)).toEqual(['Jeudi 29', 'Vendredi 30']);
  });

  it('décrit chaque créneau en horaire, libellé et équipe', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'a', nom: 'Ada Lovelace' })],
      slots: [slot({ id: 'k', debut: 540, fin: 595, salle: 'Amphi A', format: 'keynote', besoin: 1 })],
      assign: { k: ['a'] },
    });

    const section = blocsPlanning(s)[0].sections[0];
    expect(section.entetes).toEqual(['Fin', 'Créneau', 'Équipe']);
    expect(section.lignes[0]).toEqual({ cellules: ['09:00'], entete: true });
    expect(section.lignes[1].cellules).toEqual(['jusqu’à 09:55', 'Keynote — Amphi A', 'Ada Lovelace']);
  });

  it('accole le reste à pourvoir aux personnes déjà placées', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'a', nom: 'Ada Lovelace' })],
      slots: [slot({ id: 'k', format: 'keynote' })],
      assign: { k: ['a'] },
    });

    expect(blocsPlanning(s)[0].sections[0].lignes[1].cellules[2]).toBe('Ada Lovelace · +1 à pourvoir');
  });

  it('signale les places à pourvoir quand personne n’est placé', () => {
    const s = state({ days: ['Jeudi 29'], slots: [slot({ id: 'k', format: 'keynote' })] });

    expect(blocsPlanning(s)[0].sections[0].lignes[1].cellules[2]).toBe('— 2 à pourvoir');
  });
});

describe('blocsPlanning — segmentation horaire', () => {
  it('ouvre chaque créneau horaire par une ligne d’en-tête portant l’heure de début', () => {
    const s = state({
      days: ['Jeudi 29'],
      slots: [
        slot({ id: 'a', debut: 540, fin: 595 }),
        slot({ id: 'b', debut: 540, fin: 600, salle: 'Amphi A' }),
        slot({ id: 'c', debut: 625, fin: 670, salle: 'Amphi B' }),
      ],
    });

    const lignes = blocsPlanning(s)[0].sections[0].lignes;
    expect(lignes.map((l) => [l.entete ?? false, l.cellules[0]])).toEqual([
      [true, '09:00'],
      // à heure égale, compareSlots départage par la salle : Amphi A avant Grand amphi
      [false, 'jusqu’à 10:00'],
      [false, 'jusqu’à 09:55'],
      [true, '10:25'],
      [false, 'jusqu’à 11:10'],
    ]);
  });

  it('marque chaque ligne par son état de couverture', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'a' }), person({ id: 'b' })],
      slots: [
        slot({ id: 'vide', debut: 540, format: 'keynote' }),
        slot({ id: 'partiel', debut: 600, format: 'keynote', salle: 'Amphi A' }),
        // Créneau de salle : « complet » exige désormais ses deux postes tenus,
        // un effectif suffisant ne suffit plus.
        slot({ id: 'plein', debut: 660, besoin: 2, salle: 'Amphi B' }),
      ],
      assign: { partiel: ['a'], plein: ['a', 'b'] },
      roles: { plein: { keeper: 'b', captation: 'a' } },
    });

    const creneaux = blocsPlanning(s)[0].sections[0].lignes.filter((l) => !l.entete);
    expect(creneaux.map((l) => l.couverture)).toEqual(['miss', 'part', 'ok']);
  });

  it('alterne la teinte d’un groupe horaire à l’autre', () => {
    const s = state({
      days: ['Jeudi 29'],
      slots: [
        slot({ id: 'a', debut: 540 }),
        slot({ id: 'b', debut: 625, salle: 'Amphi A' }),
        slot({ id: 'c', debut: 680, salle: 'Amphi B' }),
      ],
    });

    const creneaux = blocsPlanning(s)[0].sections[0].lignes.filter((l) => !l.entete);
    expect(creneaux.map((l) => l.bande ?? false)).toEqual([true, false, true]);
  });
});

describe('blocsFeuilles', () => {
  it('rend un bloc par helper affecté, avec une section par jour', () => {
    const s = state({
      people: [person({ id: 'a', nom: 'Ada Lovelace' }), person({ id: 'o', nom: 'Oisive Personne' })],
      slots: [
        slot({ id: 'j', jour: 'Jeudi 29', debut: 540, fin: 595, salle: 'Amphi A' }),
        slot({ id: 'v', jour: 'Vendredi 30', debut: 600, fin: 645, salle: 'Lab' }),
      ],
      assign: { j: ['a'], v: ['a'] },
    });

    const blocs = blocsFeuilles(s);
    expect(blocs.map((b) => b.titre)).toEqual(['Ada Lovelace']);
    expect(blocs[0].sections.map((sec) => sec.titre)).toEqual(['Jeudi 29', 'Vendredi 30']);
    // Sans rôle attribué, la colonne Rôle porte un tiret plutôt que de disparaître.
    expect(blocs[0].sections[0].lignes).toEqual([{ cellules: ['09:00 – 09:55', 'Keynote — Amphi A', '—'] }]);
  });
});

describe('impression — rôles des créneaux de salle', () => {
  const deux = () => state({
    days: ['Jeudi 29'],
    people: [person({ id: 'a', nom: 'Ada Lovelace' }), person({ id: 'g', nom: 'Grace Hopper' })],
    slots: [slot({ id: 'k', salle: 'Amphi A', format: 'keynote', besoin: 2 })],
    assign: { k: ['a', 'g'] },
    roles: { k: { keeper: 'a', captation: 'g' } },
  });

  it('accole son abréviation de rôle à chaque nom du planning', () => {
    const l = blocsPlanning(deux())[0].sections[0].lignes[1];
    expect(l.cellules[2]).toBe('Ada Lovelace (TK), Grace Hopper (CA)');
  });

  it('laisse nu un nom sans rôle, et conserve le reste à pourvoir', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'a', nom: 'Ada Lovelace' }), person({ id: 'g', nom: 'Grace Hopper' })],
      slots: [slot({ id: 'k', salle: 'Amphi A', format: 'keynote', besoin: 2 })],
      assign: { k: ['a', 'g'] },
      roles: { k: { captation: 'g' } },
    });
    expect(blocsPlanning(s)[0].sections[0].lignes[1].cellules[2]).toBe('Ada Lovelace, Grace Hopper (CA)');
  });

  it('donne une colonne Rôle aux feuilles de route', () => {
    const section = blocsFeuilles(deux())[0].sections[0];
    expect(section.entetes).toEqual(['Horaire', 'Créneau', 'Rôle']);
    expect(section.lignes[0].cellules[2]).toBe('Time Keeper');
  });

  // Postes transverses et formation n'ont pas de rôles : la colonne doit rester
  // alignée, pas disparaître.
  it('marque d\'un tiret les créneaux sans poste', () => {
    const s = state({
      days: ['Jeudi 29'],
      people: [person({ id: 'a', nom: 'Ada Lovelace' })],
      slots: [slot({ id: 'x', salle: '', format: 'accueil', besoin: 1 })],
      assign: { x: ['a'] },
    });
    expect(blocsFeuilles(s)[0].sections[0].lignes[0].cellules[2]).toBe('—');
  });
});
