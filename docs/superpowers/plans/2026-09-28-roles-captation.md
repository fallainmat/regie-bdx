# Rôles keeper / captation — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signaler sur l'écran Contrôles les créneaux de salle dont la personne chargée de la captation n'a pas suivi la formation du jeudi.

**Architecture:** Un champ additif `captation: Record<slotId, personId>` dans l'état. Le keeper n'est pas stocké : c'est l'autre personne du binôme. Toute lecture passe par `captationOf`, qui ne renvoie la désignation que si la personne est encore affectée au créneau — sans quoi un « Tout refaire » laisserait des rôles orphelins que rien ne réparerait.

**Tech Stack:** Angular 20 (signals, control flow `@if`/`@for`), TypeScript 5.9, Karma + Jasmine.

**Spec:** `docs/superpowers/specs/2026-09-28-roles-captation-design.md`

## Global Constraints

- Le domaine (`src/app/domain/`) reste **pur** : aucune fonction n'y modifie l'état qu'elle reçoit.
- Les tests portent sur le domaine uniquement. Le store et les composants n'ont pas de tests dans ce projet ; ne pas introduire `TestBed`.
- Commentaires et libellés d'interface **en français**, comme le reste du code.
- Lancer la suite avec `npx ng test --watch=false --browsers=ChromeHeadless`. Elle doit être verte à la fin de chaque tâche.
- **Hors périmètre, à ne pas implémenter :** `autoAssign` reste aveugle aux rôles ; aucun marqueur dans la grille Planning ; ni impression ni export CSV ne mentionnent le rôle ; aucun blocage d'affectation.

---

### Task 1 : Le champ `captation` dans l'état

**Files:**
- Modify: `src/app/domain/model.ts` (interface `RegieState`)
- Modify: `src/app/domain/seed.ts` (`blankState`)
- Modify: `src/app/domain/import.ts` (`parseState`)
- Test: `src/app/domain/import.spec.ts` (créer)

**Interfaces:**
- Consumes: rien.
- Produces: `RegieState.captation: Record<string, string>`, garanti non nul après `parseState`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/app/domain/import.spec.ts` :

```ts
import { parseState } from './import';
import { blankState } from './seed';

describe('parseState — champ captation', () => {
  it('accepte une sauvegarde antérieure, sans le champ', () => {
    const { captation, ...ancien } = blankState();
    expect(parseState(ancien).captation).toEqual({});
  });

  it('préserve les désignations existantes', () => {
    const sauvegarde = { ...blankState(), captation: { 's-1': 'p-1' } };
    expect(parseState(sauvegarde).captation).toEqual({ 's-1': 'p-1' });
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: échec de compilation — `captation` n'existe pas sur `RegieState`.

- [ ] **Step 3 : Ajouter le champ au modèle**

Dans `src/app/domain/model.ts`, interface `RegieState`, juste après la ligne `assign` :

```ts
  /** slotId -> id de la personne qui assure la captation ; le keeper est l'autre. */
  captation: Record<string, string>;
```

- [ ] **Step 4 : Initialiser dans `blankState`**

Dans `src/app/domain/seed.ts`, fonction `blankState`, après `assign: {},` :

```ts
    captation: {},
```

- [ ] **Step 5 : Tolérer l'absence dans `parseState`**

Dans `src/app/domain/import.ts`, fonction `parseState`, après `assign: s.assign ?? {},` :

```ts
    captation: s.captation ?? {},
```

- [ ] **Step 6 : Lancer les tests**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: tout est vert.

- [ ] **Step 7 : Commit**

```bash
git add src/app/domain/model.ts src/app/domain/seed.ts src/app/domain/import.ts src/app/domain/import.spec.ts
git commit -m "feat(model): champ captation dans l'état de la régie"
```

---

### Task 2 : Périmètre des salles et accesseur validé

**Files:**
- Modify: `src/app/domain/seed.ts` (constante `FORMATION_KEY`)
- Modify: `src/app/domain/rules.ts`
- Test: `src/app/domain/rules.spec.ts` (créer)

**Interfaces:**
- Consumes: `RegieState.captation` (Task 1), `slotAssigned` (existant).
- Produces: `FORMATION_KEY: string`, `isSalleConference(s: Slot): boolean`, `captationOf(state: RegieState, s: Slot): string | null`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/app/domain/rules.spec.ts` :

```ts
import { Person, RegieState, Slot } from './model';
import { blankState } from './seed';
import { captationOf, isSalleConference } from './rules';

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
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: échec de compilation — `isSalleConference` et `captationOf` n'existent pas.

- [ ] **Step 3 : Nommer la clé du format formation**

Dans `src/app/domain/seed.ts`, **avant** `DEFAULT_FORMATS` :

```ts
/** Clé du format de la formation à la captation. */
export const FORMATION_KEY = 'formation';
```

Puis remplacer la clé littérale dans `DEFAULT_FORMATS` :

```ts
  { key: FORMATION_KEY, label: 'Formation captation', need: 10 },
```

et dans `seedFormation`, la ligne `format: 'formation',` devient :

```ts
      format: FORMATION_KEY,
```

- [ ] **Step 4 : Écrire les deux fonctions**

Dans `src/app/domain/rules.ts`, après `isPoste` :

```ts
/** Les créneaux tenus en binôme keeper + captation : amphis et labs. */
export function isSalleConference(s: Slot): boolean {
  return /amphi|^lab/i.test(s.salle);
}

/**
 * La captation d'un créneau, si elle y est toujours affectée.
 * `autoAssign` remplace la table d'affectations en bloc sans toucher aux rôles,
 * et n'en repose aucun : cette validation à la lecture est le seul rempart
 * contre les désignations devenues caduques. Aucun appelant ne doit lire
 * `state.captation` directement.
 */
export function captationOf(state: RegieState, s: Slot): string | null {
  const id = state.captation[s.id];
  return id && slotAssigned(state, s).includes(id) ? id : null;
}
```

- [ ] **Step 5 : Lancer les tests**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: tout est vert.

- [ ] **Step 6 : Commit**

```bash
git add src/app/domain/rules.ts src/app/domain/seed.ts src/app/domain/rules.spec.ts
git commit -m "feat(rules): périmètre des salles et accesseur captationOf validé"
```

---

### Task 3 : Ateliers et universités passent à deux personnes

**Files:**
- Modify: `src/app/domain/seed.ts` (`DEFAULT_FORMATS`)
- Test: `src/app/domain/seed.spec.ts` (existant)

**Interfaces:**
- Consumes: rien.
- Produces: `atelier` et `universite` ont `need: 2`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/app/domain/seed.spec.ts`, à la fin du fichier :

```ts
describe('DEFAULT_FORMATS — binôme keeper + captation', () => {
  it('demande deux personnes sur tous les formats de salle', () => {
    const need = Object.fromEntries(blankState().formats.map((f) => [f.key, f.need]));
    expect(need['conference']).toBe(2);
    expect(need['keynote']).toBe(2);
    expect(need['quickie']).toBe(2);
    expect(need['atelier']).toBe(2);
    expect(need['universite']).toBe(2);
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: `Expected 1 to be 2.` sur `atelier`.

- [ ] **Step 3 : Porter les deux besoins à 2**

Dans `src/app/domain/seed.ts`, `DEFAULT_FORMATS` :

```ts
  { key: 'universite', label: 'Université', need: 2 },
  { key: 'atelier', label: 'Atelier', need: 2 },
```

- [ ] **Step 4 : Lancer toute la suite**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: tout est vert. Si `impression.spec.ts` casse, c'est qu'un test y dépendait d'un besoin de 1 : corriger l'attendu du test, pas le format.

- [ ] **Step 5 : Commit**

```bash
git add src/app/domain/seed.ts src/app/domain/seed.spec.ts
git commit -m "feat(seed): ateliers et universités tenus en binôme"
```

---

### Task 4 : Les deux diagnostics

**Files:**
- Modify: `src/app/domain/rules.ts` (`Diagnostics`, `diagnostics`)
- Test: `src/app/domain/rules.spec.ts` (existant depuis Task 2)

**Interfaces:**
- Consumes: `captationOf`, `isSalleConference`, `FORMATION_KEY` (Task 2) ; `slotCoverage`, `slotAssigned` (existants).
- Produces: `Diagnostics.untrained: { slot: Slot; person: Person }[]`, `Diagnostics.unassignedRole: Slot[]`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `src/app/domain/rules.spec.ts` (les helpers `person`, `slot`, `state` sont déjà dans le fichier) :

Compléter d'abord l'import existant en tête de fichier :

```ts
import { captationOf, diagnostics, isSalleConference } from './rules';
```

Puis ajouter à la suite :

```ts
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

  it('ignore les créneaux hors salle', () => {
    const st = avecFormation({ assign: { f: ['p1', 'p2'] } });
    expect(diagnostics(st).unassignedRole.map((s) => s.id)).not.toContain('f');
  });
});
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: échec de compilation — `untrained` n'existe pas sur `Diagnostics`.

- [ ] **Step 3 : Étendre l'interface `Diagnostics`**

Dans `src/app/domain/rules.ts`, ajouter les deux champs à l'interface :

```ts
  /** Captation désignée mais qui n'a pas suivi la formation. */
  untrained: { slot: Slot; person: Person }[];
  /** Créneau de salle complet dont la captation n'est pas désignée. */
  unassignedRole: Slot[];
```

- [ ] **Step 4 : Alimenter les deux listes**

Dans `src/app/domain/rules.ts`, remplacer l'initialisation et la première boucle de `diagnostics` par :

```ts
  const d: Diagnostics = { under: [], conflicts: [], idle: [], over: [], untrained: [], unassignedRole: [] };
  // Avoir suivi la formation ne dépend pas du jour du créneau évalué :
  // le rapprochement se fait sur la personne.
  const formes = new Set(
    state.slots.filter((s) => s.format === FORMATION_KEY).flatMap((s) => slotAssigned(state, s)),
  );
  for (const s of [...state.slots].sort(compareSlots(state.days))) {
    const miss = slotNeed(state, s) - slotAssigned(state, s).length;
    if (miss > 0) d.under.push({ slot: s, miss });
    if (!isSalleConference(s)) continue;
    const id = captationOf(state, s);
    if (!id) {
      if (slotCoverage(state, s) === 'ok') d.unassignedRole.push(s);
    } else if (!formes.has(id)) {
      const person = state.people.find((p) => p.id === id);
      if (person) d.untrained.push({ slot: s, person });
    }
  }
```

Compléter l'import en tête de fichier :

```ts
import { FORMATION_KEY, isPosteKey } from './seed';
```

- [ ] **Step 5 : Lancer les tests**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: tout est vert.

- [ ] **Step 6 : Commit**

```bash
git add src/app/domain/rules.ts src/app/domain/rules.spec.ts
git commit -m "feat(rules): diagnostics captation non formée et captation à désigner"
```

---

### Task 5 : Le setter du store

**Files:**
- Modify: `src/app/state/regie.store.ts`

**Interfaces:**
- Consumes: `RegieState.captation` (Task 1).
- Produces: `RegieStore.setCaptation(slotId: string, personId: string | null): void`.

Pas de test : ce projet ne teste pas le store, et toute la logique de lecture est déjà couverte par `captationOf` (Task 2). Le setter se contente de refuser une personne non affectée.

- [ ] **Step 1 : Ajouter la méthode**

Dans `src/app/state/regie.store.ts`, après le bloc `/* --- règles --- */` et avant `/* --- journées --- */` :

```ts
  /* --- rôles ---------------------------------------------------------- */
  /** Désigne la captation d'un créneau ; `null` retire la désignation. */
  setCaptation(slotId: string, personId: string | null) {
    this.patch((s) => {
      const captation = { ...s.captation };
      if (personId == null) delete captation[slotId];
      else if ((s.assign[slotId] ?? []).includes(personId)) captation[slotId] = personId;
      else return {};
      return { captation };
    });
  }
```

- [ ] **Step 2 : Vérifier la compilation**

Run: `npx ng build`
Expected: build réussi (les avertissements `jspdf` / `canvg` sont préexistants).

- [ ] **Step 3 : Commit**

```bash
git add src/app/state/regie.store.ts
git commit -m "feat(store): désignation de la captation d'un créneau"
```

---

### Task 6 : La section dans l'écran Contrôles

**Files:**
- Modify: `src/app/features/controles/controles.ts` (template et `allGood`)

**Interfaces:**
- Consumes: `Diagnostics.untrained`, `Diagnostics.unassignedRole` (Task 4).
- Produces: rien.

- [ ] **Step 1 : Ajouter la section au template**

Dans `src/app/features/controles/controles.ts`, insérer une troisième `<section>` juste avant la fermeture `</div>` de `.grid` :

```html
      <section>
        <h2>Captation non formée <span class="n">{{ d.untrained.length }}</span></h2>
        <ul>
          @for (u of d.untrained; track u.slot.id) {
            <li><span>{{ when(u.slot) }} · {{ label(u.slot) }}</span><b class="miss">{{ u.person.nom }}</b></li>
          } @empty { <li class="none">Aucune.</li> }
        </ul>
        <h2 class="mt">Captation à désigner <span class="n">{{ d.unassignedRole.length }}</span></h2>
        <ul>
          @for (s of d.unassignedRole; track s.id) {
            <li><span>{{ when(s) }} · {{ label(s) }}</span></li>
          } @empty { <li class="none">Aucun.</li> }
        </ul>
      </section>
```

- [ ] **Step 2 : Intégrer les deux listes au « Tout est couvert »**

Remplacer le corps de `allGood` :

```ts
  protected readonly allGood = computed(() => {
    const d = this.store.diagnostics();
    return this.store.people().length > 0 && !d.under.length && !d.conflicts.length && !d.over.length
      && !d.untrained.length && !d.unassignedRole.length;
  });
```

- [ ] **Step 3 : Vérifier la compilation**

Run: `npx ng build`
Expected: build réussi.

- [ ] **Step 4 : Commit**

```bash
git add src/app/features/controles/controles.ts
git commit -m "feat(controles): section des alertes de captation"
```

---

### Task 7 : Désigner la captation depuis le panneau de détail

**Files:**
- Modify: `src/app/features/planning/planning.ts`
- Modify: `src/app/features/planning/planning.html:70-72`
- Modify: `src/app/features/planning/planning.css`

**Interfaces:**
- Consumes: `captationOf`, `isSalleConference` (Task 2), `setCaptation` (Task 5).
- Produces: rien.

- [ ] **Step 1 : Exposer les trois méthodes au template**

Dans `src/app/features/planning/planning.ts`, compléter l'import depuis `../../domain/rules` avec `captationOf` et `isSalleConference`, puis ajouter après la méthode `poste` :

```ts
  protected roleAttendu(x: Slot) { return isSalleConference(x); }
  protected captation(x: Slot) { return captationOf(this.store.state(), x); }
  protected toggleCaptation(x: Slot, personId: string) {
    this.store.setCaptation(x.id, this.captation(x) === personId ? null : personId);
  }
```

- [ ] **Step 2 : Ajouter le bouton dans la liste « Placés »**

Dans `src/app/features/planning/planning.html`, remplacer le `<li>` de la boucle `@for (p of assigned(x); track p.id)` par :

```html
            <li><span class="av">{{ initials(p.nom) }}</span><span class="nm">{{ p.nom }}</span>
              @if (roleAttendu(x)) {
                <button class="ghost small" [class.on]="captation(x) === p.id"
                  [attr.aria-pressed]="captation(x) === p.id"
                  (click)="toggleCaptation(x, p.id)">Captation</button>
              }
              <button class="ghost small" (click)="store.unassign(x.id, p.id)">Retirer</button></li>
```

Le grid `.plist li` définit déjà quatre colonnes (`28px 1fr auto auto`) : le bouton occupe la colonne restée vide, la mise en page ne bouge pas.

- [ ] **Step 3 : Styler l'état actif**

Ajouter à la fin de `src/app/features/planning/planning.css` :

```css
.plist button.on { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); border-color: var(--ok); font-weight: 600; }
```

- [ ] **Step 4 : Vérifier la compilation**

Run: `npx ng build`
Expected: build réussi.

- [ ] **Step 5 : Commit**

```bash
git add src/app/features/planning/planning.ts src/app/features/planning/planning.html src/app/features/planning/planning.css
git commit -m "feat(planning): désignation de la captation dans le panneau de détail"
```

---

### Task 8 : Migration de l'état sauvegardé

**Files:**
- Create: `docs/superpowers/plans/migration-captation.js` (script à exécuter une fois dans le navigateur)

**Interfaces:**
- Consumes: l'état persisté sous la clé `regie-helpers-v1`.
- Produces: rien dans le code de l'application.

Le seed ne touche pas les régies déjà enregistrées : `restore()` lit le localStorage et ne retombe sur `blankState()` que s'il est vide. Cette passe est **unique** et délibérément hors de `parseState`, qui s'exécuterait à chaque chargement.

- [ ] **Step 1 : Écrire le script**

Créer `docs/superpowers/plans/migration-captation.js` :

```js
// Passe unique sur l'état sauvegardé. À exécuter dans la console de l'application.
const KEY = 'regie-helpers-v1';
const s = JSON.parse(localStorage.getItem(KEY));

// 1. Sauvegarde horodatée, restaurable.
const backupKey = KEY + '-backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
localStorage.setItem(backupKey, JSON.stringify(s));

// 2. Les besoins du seed n'atteignent pas un état déjà enregistré.
for (const f of s.formats) if (f.key === 'atelier' || f.key === 'universite') f.need = 2;

// 3. Le champ peut manquer sur une sauvegarde antérieure.
s.captation = s.captation || {};

// 4. Déduction : sur un binôme complet, la seule personne formée assure la captation.
const formes = new Set(s.slots.filter((x) => x.format === 'formation').flatMap((x) => s.assign[x.id] || []));
let deduits = 0, ambigus = 0;
for (const x of s.slots) {
  if (!/amphi|^lab/i.test(x.salle || '')) continue;
  const ids = s.assign[x.id] || [];
  if (ids.length < 2 || s.captation[x.id]) continue;
  const formesIci = ids.filter((i) => formes.has(i));
  if (formesIci.length === 1) { s.captation[x.id] = formesIci[0]; deduits++; } else ambigus++;
}

localStorage.setItem(KEY, JSON.stringify(s));
({ backupKey, deduits, ambigus });
```

- [ ] **Step 2 : Exécuter la migration**

Ouvrir l'application, coller le contenu du script dans la console, puis **recharger la page**.
Expected: `deduits: 43`, `ambigus: 27` sur les données de référence.

Le rechargement est indispensable : le store réécrit tout le localStorage à chaque modification de l'état, un onglet resté ouvert sur l'ancien état écraserait la migration.

- [ ] **Step 3 : Vérifier dans l'application**

Ouvrir l'onglet Contrôles.
Expected: « Captation non formée » listant les binômes concernés, « Captation à désigner » proche de 27, et « Créneaux incomplets » augmenté de 10 (les ateliers et universités passés à 2).

- [ ] **Step 4 : Commit**

```bash
git add docs/superpowers/plans/migration-captation.js
git commit -m "chore: script de migration des rôles de captation"
```
