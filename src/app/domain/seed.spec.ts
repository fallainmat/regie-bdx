import { Slot } from './model';
import { POSTE_OUVERTURE, blankState, seedDay } from './seed';
import { tientUnBinome } from './rules';
import { parseTime } from './util';

const FORMATION = 'formation';

function formations(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.format === FORMATION);
}

/** Les bornes des vacations d'un poste, pour comparer deux journées. */
function vacations(slots: Slot[], poste: string): [number | null, number | null][] {
  return slots.filter((s) => s.format === poste).map((s) => [s.debut, s.fin]);
}

describe('seedDay — formation captation', () => {
  it('ajoute le créneau le jeudi', () => {
    expect(formations(seedDay('Jeudi 29')).length).toBe(1);
  });

  it("ne l'ajoute pas les autres jours", () => {
    expect(formations(seedDay('Vendredi 30')).length).toBe(0);
    expect(formations(seedDay('Samedi 31')).length).toBe(0);
  });

  it('reconnaît le jeudi quel que soit le suffixe ou la casse', () => {
    expect(formations(seedDay('jeudi 5 novembre')).length).toBe(1);
    expect(formations(seedDay('JEUDI')).length).toBe(1);
  });

  it('porte le titre, le besoin et les horaires demandés', () => {
    const [f] = formations(seedDay('Jeudi 29'));
    expect(f.titre).toBe('Formation captation');
    expect(f.besoin).toBe(10);
    expect(f.debut).toBe(8 * 60);
    // Le calage sur l'ouverture des postes est ce qui préserve les vacations.
    expect(f.debut).toBe(parseTime(POSTE_OUVERTURE));
    expect(f.fin).toBe(9 * 60);
    expect(f.jour).toBe('Jeudi 29');
  });

  it('reçoit un identifiant unique, comme les autres créneaux', () => {
    const ids = seedDay('Jeudi 29').map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // L'invariant qui casserait en silence : programmeBoundaries dérive les
  // coupures des débuts de session, donc ajouter une session pourrait
  // redécouper les vacations. Le jeudi doit rester calé sur le vendredi.
  it('ne modifie pas le découpage des vacations', () => {
    const jeudi = seedDay('Jeudi 29');
    const vendredi = seedDay('Vendredi 30');
    expect(vacations(jeudi, 'accueil')).toEqual(vacations(vendredi, 'accueil'));
    expect(vacations(jeudi, 'bagages')).toEqual(vacations(vendredi, 'bagages'));
  });

  it("expose un format 'formation' dans l'état initial", () => {
    const state = blankState();
    const format = state.formats.find((f) => f.key === FORMATION);
    // Le libellé est ce que la grille Planning affiche : la salle étant vide,
    // c'est lui qui nomme le créneau à l'écran.
    expect(format?.label).toBe('Formation captation');
    expect(formations(state.slots).length).toBe(1);
  });
});

describe('DEFAULT_FORMATS — binôme keeper + captation', () => {
  it('demande deux personnes sur les formats tenus en binôme', () => {
    const need = Object.fromEntries(blankState().formats.map((f) => [f.key, f.need]));
    expect(need['conference']).toBe(2);
    expect(need['keynote']).toBe(2);
    expect(need['quickie']).toBe(2);
    expect(need['tia']).toBe(2);
  });

  // Les labs accueillent ateliers et universités : une personne, sans postes.
  it('n\'en demande qu\'une sur les formats de lab', () => {
    const need = Object.fromEntries(blankState().formats.map((f) => [f.key, f.need]));
    expect(need['atelier']).toBe(1);
    expect(need['universite']).toBe(1);
  });
});

// Deux définitions indépendantes de « tenu en binôme » coexistent : le besoin
// porté par le format, et le périmètre porté par le NOM de la salle. Rien ne
// les relie — ce test est ce lien.
describe('PROGRAMME — accord entre besoin du binôme et périmètre des salles', () => {
  it('place tout format tenu en binôme dans une salle reconnue', () => {
    const binome = ['keynote', 'conference', 'quickie', 'tia'];
    const tenus = blankState().slots.filter((s) => binome.includes(s.format));
    // Sans ce garde, l'assertion suivante passerait sur un ensemble vide.
    expect(tenus.length).toBeGreaterThan(0);
    const fautifs = tenus.filter((s) => !tientUnBinome(s)).map((s) => `${s.format} en « ${s.salle} »`);
    expect(fautifs).toEqual([]);
  });
});
