import { Format, POSTE_KEYS, RegieState, Slot } from './model';
import { parseTime, uid } from './util';

/** Clé du format de la formation à la captation. */
export const FORMATION_KEY = 'formation';

/** Clé du format du parking. */
export const PARKING_KEY = 'parking';
export const DEFAULT_FORMATS: Format[] = [
  { key: 'keynote', label: 'Keynote', need: 2 },
  { key: 'conference', label: 'Conférence', need: 2 },
  { key: 'universite', label: 'Université', need: 1 },
  { key: 'atelier', label: 'Atelier', need: 1 },
  { key: 'quickie', label: 'Quickie', need: 2 },
  { key: 'tia', label: 'Tools-in-Action', need: 2 },
  { key: 'accueil', label: 'Accueil', need: 6 },
  { key: 'bagages', label: 'Bagages', need: 6 },
  { key: FORMATION_KEY, label: 'Formation captation', need: 10 },
  { key: PARKING_KEY, label: 'Parking', need: 2 },
  { key: 'autre', label: 'Autre', need: 1 },
];

/** Grille type d'une journée : salle, début, fin, format. */
const PROGRAMME: [string, string, string, string][] = [
  ['Grand amphi', '09:00', '09:55', 'keynote'],
  ['Grand amphi', '10:25', '11:10', 'conference'],
  ['Grand amphi', '11:20', '12:05', 'conference'],
  ['Grand amphi', '13:55', '14:10', 'quickie'],
  ['Grand amphi', '14:20', '15:05', 'conference'],
  ['Grand amphi', '15:15', '16:00', 'conference'],
  ['Grand amphi', '16:30', '17:15', 'conference'],
  ['Grand amphi', '17:25', '17:55', 'keynote'],
  ...(['Amphi A', 'Amphi B', 'Amphi D'] as const).flatMap((salle) =>
    (
      [
        ['10:25', '11:10', 'conference'],
        ['11:20', '12:05', 'conference'],
        ['13:55', '14:10', 'quickie'],
        ['14:20', '15:05', 'conference'],
        ['15:15', '16:00', 'conference'],
        ['16:30', '17:15', 'conference'],
      ] as const
    ).map(([d, f, k]) => [salle, d, f, k] as [string, string, string, string]),
  ),
  ['Amphi E', '10:25', '11:10', 'conference'],
  ['Amphi E', '11:20', '12:05', 'conference'],
  ['Amphi E', '13:55', '14:10', 'quickie'],
  ['Amphi E', '14:20', '14:35', 'quickie'],
  ['Amphi E', '14:35', '14:50', 'quickie'],
  ['Amphi E', '15:15', '15:30', 'quickie'],
  ['Amphi E', '15:30', '15:45', 'quickie'],
  ['Amphi E', '16:30', '16:45', 'quickie'],
  ['Amphi E', '16:45', '17:00', 'quickie'],
  ['Lab', '10:25', '13:25', 'atelier'],
  ['Lab', '13:30', '15:15', 'atelier'],
  ['Lab', '15:15', '17:55', 'atelier'],
  ['Lab 2', '10:25', '13:25', 'universite'],
  ['Lab 2', '13:30', '16:30', 'atelier'],
];

export const DEFAULT_DAYS = ['Jeudi 29', 'Vendredi 30'];

/** Plage des postes transverses et durée minimale d'une vacation. */
export const POSTE_OUVERTURE = '08:00';
export const POSTE_FERMETURE = '18:30';
export const POSTE_TRANCHE_MIN = 45;

export function seedSessions(jour: string): Slot[] {
  return PROGRAMME.map(([salle, d, f, format]) => ({
    id: uid('s'),
    jour,
    debut: parseTime(d),
    fin: parseTime(f),
    salle,
    titre: '',
    format,
    besoin: null,
  }));
}

/**
 * Coupures d'une journée pour les vacations : les débuts de session,
 * écrémés pour qu'aucune vacation ne descende sous `minSlice` minutes.
 */
export function programmeBoundaries(
  sessions: Slot[],
  jour: string,
  from: number,
  to: number,
  minSlice: number,
): number[] {
  const starts = [
    ...new Set(
      sessions
        .filter((s) => !isPosteKey(s.format) && s.jour === jour && s.debut != null)
        .map((s) => s.debut as number)
        .filter((t) => t > from && t < to),
    ),
  ].sort((a, b) => a - b);
  const cuts = [from];
  let last = from;
  for (const t of starts) {
    if (t - last >= minSlice && to - t >= minSlice) {
      cuts.push(t);
      last = t;
    }
  }
  cuts.push(to);
  return cuts;
}

export function isPosteKey(format: string): boolean {
  return (POSTE_KEYS as readonly string[]).includes(format);
}

export function seedPostes(jour: string, sessions: Slot[], keys: string[] = [...POSTE_KEYS]): Slot[] {
  const from = parseTime(POSTE_OUVERTURE)!;
  const to = parseTime(POSTE_FERMETURE)!;
  const cuts = programmeBoundaries(sessions, jour, from, to, POSTE_TRANCHE_MIN);
  return keys.flatMap((format) =>
    cuts.slice(0, -1).map((debut, i) => ({
      id: uid('s'),
      jour,
      debut,
      fin: cuts[i + 1],
      salle: '',
      titre: '',
      format,
      besoin: null,
    })),
  );
}

/** Besoin en helpers de la formation à la captation. */
export const FORMATION_BESOIN = 10;

/**
 * Le jeudi matin s'ouvre par une formation à la captation, hors grille type.
 * Son début est calé sur `POSTE_OUVERTURE` : `programmeBoundaries` ne retient
 * que les débuts strictement postérieurs à l'ouverture, si bien que ce créneau
 * ne coupe aucune vacation. Le décaler plus tard peut redécouper les postes —
 * c'est ce que verrouille le test « ne modifie pas le découpage des vacations ».
 */
export function seedFormation(jour: string): Slot[] {
  if (!/^jeudi/i.test(jour.trim())) return [];
  return [
    {
      id: uid('s'),
      jour,
      debut: parseTime(POSTE_OUVERTURE),
      fin: parseTime('09:00'),
      salle: '',
      titre: 'Formation captation',
      format: FORMATION_KEY,
      besoin: FORMATION_BESOIN,
    },
  ];
}

/** Besoin en helpers du parking. */
export const PARKING_BESOIN = 2;

/**
 * Chaque journée s'ouvre par une heure de parking, hors grille type — un besoin
 * quotidien, contrairement à la formation qui ne vaut que le jeudi.
 * Même calage sur `POSTE_OUVERTURE` : le créneau ne coupe aucune vacation.
 */
export function seedParking(jour: string): Slot[] {
  return [
    {
      id: uid('s'),
      jour,
      debut: parseTime(POSTE_OUVERTURE),
      fin: parseTime('09:00'),
      salle: '',
      titre: 'Parking',
      format: PARKING_KEY,
      besoin: PARKING_BESOIN,
    },
  ];
}

export function seedDay(jour: string): Slot[] {
  const sessions = [...seedFormation(jour), ...seedParking(jour), ...seedSessions(jour)];
  return [...sessions, ...seedPostes(jour, sessions)];
}

export function blankState(): RegieState {
  return {
    version: 1,
    nom: 'BDX I/O 2026',
    formats: DEFAULT_FORMATS.map((f) => ({ ...f })),
    options: { minGap: 0, maxPerPerson: 0, maxPerDay: 0 },
    days: [...DEFAULT_DAYS],
    people: [],
    slots: DEFAULT_DAYS.flatMap(seedDay),
    assign: {},
    roles: {},
  };
}
