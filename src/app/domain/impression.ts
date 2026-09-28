import { Person, RegieState, RoleKey, ROLE_ABBR, ROLE_LABEL, Slot } from './model';
import { Coverage, compareSlots, personSlots, roleDe, slotAssigned, slotCoverage, slotEnd, slotLabel, slotNeed } from './rules';
import { minutesToTime } from './util';

export interface LignePlanning {
  slot: Slot;
  libelle: string;
  personnes: Person[];
  besoin: number;
  manque: number;
}

export interface PagePlanning {
  jour: string;
  lignes: LignePlanning[];
}

export function planningParJour(state: RegieState): PagePlanning[] {
  const ordre = compareSlots(state.days);
  const parId = new Map(state.people.map((p) => [p.id, p]));
  return state.days.map((jour) => ({
    jour,
    lignes: state.slots
      .filter((s) => s.jour === jour)
      .sort(ordre)
      .map((s) => {
        const personnes = slotAssigned(state, s)
          .map((id) => parId.get(id))
          .filter((p): p is Person => !!p)
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
        const besoin = slotNeed(state, s);
        return {
          slot: s,
          libelle: slotLabel(state, s),
          personnes,
          besoin,
          manque: Math.max(0, besoin - personnes.length),
        };
      }),
  }));
}

export interface LigneRoute {
  slot: Slot;
  libelle: string;
  /** Poste tenu sur ce créneau ; null sur les créneaux qui n'en portent pas. */
  role: RoleKey | null;
}

export interface JourneeRoute {
  jour: string;
  lignes: LigneRoute[];
}

export interface FeuilleRoute {
  person: Person;
  journees: JourneeRoute[];
  total: number;
}

export function feuillesDeRoute(state: RegieState): FeuilleRoute[] {
  return state.people
    .map((person) => {
      const slots = personSlots(state, person.id);
      const journees = state.days
        .map((jour) => ({
          jour,
          lignes: slots
            .filter((s) => s.jour === jour)
            .map((s) => ({ slot: s, libelle: slotLabel(state, s), role: roleDe(state, s, person.id) })),
        }))
        .filter((j) => j.lignes.length > 0);
      return { person, journees, total: slots.length };
    })
    .filter((f) => f.total > 0)
    .sort((a, b) => a.person.nom.localeCompare(b.person.nom, 'fr'));
}

/** Une ligne de tableau : ses cellules, plus de quoi la styler. */
export interface LignePdf {
  cellules: string[];
  /** Bande pleine largeur ouvrant un créneau horaire ; une seule cellule. */
  entete?: boolean;
  /** Groupe horaire teinté, alterné d'un créneau à l'autre. */
  bande?: boolean;
  /** État de couverture, pour teinter le texte comme l'écran teinte la carte. */
  couverture?: Coverage;
}

/** Un tableau à tracer : des en-têtes, des lignes, et un titre facultatif. */
export interface SectionPdf {
  titre: string;
  entetes: string[];
  lignes: LignePdf[];
}

/** Ce qui occupe une page du PDF. */
export interface BlocPdf {
  titre: string;
  soustitre: string;
  sections: SectionPdf[];
}

function horaire(s: Slot): string {
  return `${minutesToTime(s.debut)} – ${minutesToTime(slotEnd(s))}`;
}

function equipe(state: RegieState, l: LignePlanning): string {
  const noms = l.personnes
    .map((p) => {
      const r = roleDe(state, l.slot, p.id);
      return r ? `${p.nom} (${ROLE_ABBR[r]})` : p.nom;
    })
    .join(', ');
  const reste = l.manque ? `+${l.manque} à pourvoir` : '';
  if (!noms) return reste ? `— ${l.manque} à pourvoir` : '—';
  return reste ? `${noms} · ${reste}` : noms;
}

/**
 * Découpe les lignes d'une journée en groupes partageant la même heure de
 * début — la même clé qu'à l'écran — et ouvre chaque groupe par une bande
 * portant cette heure. Les lignes du groupe ne gardent alors que leur fin,
 * et les groupes alternent de teinte pour rester solidaires d'une page à
 * l'autre.
 */
function segmenter(state: RegieState, lignes: LignePlanning[]): LignePdf[] {
  const out: LignePdf[] = [];
  let debut: number | null | undefined;
  let bande = false;
  for (const l of lignes) {
    if (debut === undefined || l.slot.debut !== debut) {
      debut = l.slot.debut;
      bande = !bande;
      out.push({ cellules: [minutesToTime(debut) || '—'], entete: true });
    }
    out.push({
      // « jusqu'à » lève l'ambiguïté avec l'heure de début portée par la bande.
      cellules: [`jusqu’à ${minutesToTime(slotEnd(l.slot)) || '—'}`, l.libelle, equipe(state, l)],
      bande,
      couverture: slotCoverage(state, l.slot),
    });
  }
  return out;
}

export function blocsPlanning(state: RegieState): BlocPdf[] {
  return planningParJour(state).map((page) => ({
    titre: page.jour,
    soustitre: `${state.nom} — planning`,
    sections: [{
      titre: '',
      // La bande de groupe porte l'heure de début ; la colonne ne garde que la fin.
      entetes: ['Fin', 'Créneau', 'Équipe'],
      lignes: segmenter(state, page.lignes),
    }],
  }));
}

export function blocsFeuilles(state: RegieState): BlocPdf[] {
  return feuillesDeRoute(state).map((f) => ({
    titre: f.person.nom,
    soustitre: `${state.nom} — ${f.total} créneau${f.total > 1 ? 'x' : ''}`,
    sections: f.journees.map((j) => ({
      titre: j.jour,
      entetes: ['Horaire', 'Créneau', 'Rôle'],
      lignes: j.lignes.map((l) => ({ cellules: [horaire(l.slot), l.libelle, l.role ? ROLE_LABEL[l.role] : '—'] })),
    })),
  }));
}
