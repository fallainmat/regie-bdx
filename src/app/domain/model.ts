/** Un type de créneau (conférence, accueil…) et son besoin par défaut en helpers. */
export interface Format {
  key: string;
  label: string;
  need: number;
}

/** Un créneau à couvrir : une session du programme ou une vacation de poste. */
export interface Slot {
  id: string;
  jour: string;
  /** Minutes depuis minuit. */
  debut: number | null;
  fin: number | null;
  salle: string;
  titre: string;
  format: string;
  /** Besoin saisi à la main ; null = on prend celui du format. */
  besoin: number | null;
}

/** Un helper (bénévole). */
export interface Person {
  id: string;
  nom: string;
  email: string;
  role: string;
  tags: string[];
  /** Jours de présence ; vide = présent tous les jours. */
  jours: string[];
  /** Plafond personnel ; 0 = on prend le plafond global. */
  maxCharge: number;
  notes: string;
}

export interface Options {
  /** Écart minimum entre deux créneaux d'une même personne, en minutes. */
  minGap: number;
  /** Plafond global de créneaux par personne ; 0 = sans limite. */
  maxPerPerson: number;
  /** Plafond global de créneaux par personne et par jour ; 0 = sans limite. */
  maxPerDay: number;
}

export interface RegieState {
  version: 1;
  nom: string;
  formats: Format[];
  options: Options;
  days: string[];
  people: Person[];
  slots: Slot[];
  /** slotId -> liste d'ids de personnes. */
  assign: Record<string, string[]>;
  /** slotId -> id de la personne qui assure la captation ; le keeper est l'autre. */
  captation: Record<string, string>;
}

/** Les postes transverses, découpés en vacations sur la journée. */
export const POSTE_KEYS = ['accueil', 'bagages'] as const;
