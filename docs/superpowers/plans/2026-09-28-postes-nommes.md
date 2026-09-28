# Deux postes nommés par créneau de salle — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire porter à chaque créneau de salle deux postes nommés — Time Keeper et Captation — pourvus, contrôlés et remplis automatiquement.

**Architecture:** `assign` reste la source de vérité de « qui est sur ce créneau » ; un nouveau champ `roles` qualifie ces personnes. Toute lecture passe par `roleOf`, qui ne renvoie un id que s'il figure encore dans `assign` — l'auto-affectation réécrit désormais les deux tables, et cette validation est ce qui rend toute désignation orpheline inerte.

**Tech Stack:** Angular 20 (signals, `@if`/`@for`), TypeScript 5.9, Karma + Jasmine.

**Spec:** `docs/superpowers/specs/2026-09-28-postes-nommes-design.md`

## Global Constraints

- Le domaine (`src/app/domain/`) reste **pur** : aucune fonction n'y modifie l'état reçu.
- Tests sur le domaine uniquement. Pas de `TestBed`, pas de test de store ni de composant.
- Commentaires et libellés d'interface **en français**.
- Suite : `npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | grep -E "FAILED|TOTAL"`. **Toujours filtrer** — la sortie brute de la phase RED a tué trois sous-agents lors du plan précédent.
- Jamais de grep, glob ou find depuis la racine : `node_modules` pèse 332 Mo.
- `under` n'est **pas** modifié. L'exigence des rôles est portée par `slotCoverage` seule, pour qu'un créneau à deux personnes sans rôles ne soit pas compté deux fois.
- Sur les gardes critiques, vérifier **par mutation** : retirer le garde, constater qu'un test et un seul échoue, le remettre.

---

### Task 1 : `roles` remplace `captation`

Tâche large et atomique : retirer `captation` casse la compilation partout où il est lu. Elle se termine sur une suite verte et une interface qui compile, au comportement inchangé.

**Files:**
- Modify: `src/app/domain/model.ts`, `src/app/domain/seed.ts` (`blankState`), `src/app/domain/import.ts` (`parseState`)
- Modify: `src/app/domain/rules.ts` (`captationOf` → `roleOf`, `Diagnostics`, `diagnostics`)
- Modify: `src/app/state/regie.store.ts` (`setCaptation` → `setRole`)
- Modify: `src/app/features/planning/planning.ts`, `src/app/features/controles/controles.ts`
- Test: `src/app/domain/rules.spec.ts`, `src/app/domain/import.spec.ts`

**Interfaces produites:**
```ts
export type RoleKey = 'keeper' | 'captation';
export const ROLE_KEYS: RoleKey[] = ['keeper', 'captation'];
export interface SlotRoles { keeper?: string; captation?: string }
// RegieState.roles: Record<string, SlotRoles>
export function roleOf(state: RegieState, s: Slot, role: RoleKey): string | null;
// Diagnostics.missingRole: { slot: Slot; role: RoleKey }[]   (remplace unassignedRole)
// RegieStore.setRole(slotId: string, role: RoleKey, personId: string | null): void
```

- [ ] **Step 1 : Adapter les tests existants et écrire les nouveaux**

Dans `src/app/domain/rules.spec.ts`, remplacer chaque `captation: { s1: 'p1' }` par `roles: { s1: { captation: 'p1' } }`, chaque appel `captationOf(st, s)` par `roleOf(st, s, 'captation')`, et chaque `d.unassignedRole` par `d.missingRole`. Le helper `state()` initialise `roles: {}` au lieu de `captation: {}`.

Ajouter, dans le `describe('captationOf')` renommé `describe('roleOf')` :

```ts
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

  // Même garde que pour la captation : l'auto-affectation réécrit assign et
  // roles, une désignation orpheline doit être inerte sur les DEUX rôles.
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
```

Et, dans le `describe` des postes manquants :

```ts
  it('nomme le poste vacant plutôt que le créneau', () => {
    const st = avecFormation({
      assign: { s1: ['p1', 'p2'] },
      roles: { s1: { captation: 'p1' } },
    });
    expect(diagnostics(st).missingRole).toEqual([
      jasmine.objectContaining({ role: 'keeper' }),
    ]);
  });
```

Dans `src/app/domain/import.spec.ts`, remplacer `captation` par `roles` dans les deux tests.

- [ ] **Step 2 : Lancer et vérifier l'échec**

Run: `npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | grep -E "FAILED|TOTAL"`
Expected: échec de compilation — `roleOf` et `roles` n'existent pas.

- [ ] **Step 3 : Le modèle**

Dans `src/app/domain/model.ts`, remplacer le champ `captation` par :

```ts
  /** slotId -> les deux postes d'un créneau de salle. */
  roles: Record<string, SlotRoles>;
```

et ajouter au-dessus de `RegieState` :

```ts
export type RoleKey = 'keeper' | 'captation';
export const ROLE_KEYS: RoleKey[] = ['keeper', 'captation'];
/** Les deux postes d'un créneau de salle ; absents tant qu'ils ne sont pas pourvus. */
export interface SlotRoles { keeper?: string; captation?: string }
```

`blankState` (`seed.ts`) : `captation: {}` devient `roles: {}`.
`parseState` (`import.ts`) : `captation: s.captation ?? {}` devient `roles: s.roles ?? {}`.

- [ ] **Step 4 : L'accesseur**

Dans `src/app/domain/rules.ts`, remplacer `captationOf` par :

```ts
/**
 * Le titulaire d'un poste, s'il est toujours affecté au créneau.
 * `autoAssign` réécrit `assign` et `roles` ensemble : cette validation à la
 * lecture est ce qui rend inerte toute désignation devenue caduque. Aucun
 * appelant ne lit `state.roles` directement.
 */
export function roleOf(state: RegieState, s: Slot, role: RoleKey): string | null {
  const id = state.roles[s.id]?.[role];
  return id && slotAssigned(state, s).includes(id) ? id : null;
}
```

- [ ] **Step 5 : Les diagnostics**

Dans `Diagnostics`, `unassignedRole: Slot[]` devient :

```ts
  /** Poste vacant sur un créneau de salle. */
  missingRole: { slot: Slot; role: RoleKey }[];
```

Dans `diagnostics`, remplacer le bloc des rôles par :

```ts
    if (!isSalleConference(s)) continue;
    for (const role of ROLE_KEYS) {
      const id = roleOf(state, s, role);
      const person = id ? state.people.find((p) => p.id === id) : undefined;
      // Un id inconnu du fichier des helpers vaut poste vacant : sans cela le
      // créneau échapperait silencieusement aux deux diagnostics.
      if (!person) { d.missingRole.push({ slot: s, role }); continue; }
      if (role === 'captation' && !formes.has(person.id)) d.untrained.push({ slot: s, person });
    }
```

L'initialisation devient `..., untrained: [], missingRole: [] }`.

- [ ] **Step 6 : Le store**

Dans `src/app/state/regie.store.ts`, remplacer `setCaptation` par :

```ts
  /** Attribue un poste ; `null` le libère. */
  setRole(slotId: string, role: RoleKey, personId: string | null) {
    this.patch((s) => {
      const cur = s.roles[slotId] ?? {};
      if (personId != null && !(s.assign[slotId] ?? []).includes(personId)) return {};
      const next: SlotRoles = { ...cur };
      if (personId == null) delete next[role]; else next[role] = personId;
      return { roles: { ...s.roles, [slotId]: next } };
    });
  }
```

Compléter l'import depuis `../domain/model` avec `RoleKey` et `SlotRoles`.

- [ ] **Step 7 : Faire compiler l'interface, sans changer son comportement**

`planning.ts` : `captationOf(...)` devient `roleOf(..., 'captation')`, et `toggleCaptation` appelle `setRole(x.id, 'captation', ...)`. Le template reste identique — la refonte du panneau est la Task 5.

`controles.ts` : la liste `d.unassignedRole` devient `d.missingRole`, et sa ligne affiche le poste :

```html
          @for (m of d.missingRole; track m.slot.id + m.role) {
            <li><span>{{ when(m.slot) }} · {{ label(m.slot) }}</span><b class="miss">{{ m.role === 'keeper' ? 'Time Keeper' : 'Captation' }}</b></li>
          } @empty { <li class="none">Aucun.</li> }
```

`allGood()` : `!d.unassignedRole.length` devient `!d.missingRole.length`.

- [ ] **Step 8 : Vert, puis mutation**

Run la suite : verte.
Retirer temporairement la validation de `roleOf` (renvoyer `id ?? null` sans vérifier `slotAssigned`), relancer : le test « ignore un keeper dont la personne a quitté le créneau » doit échouer, et lui seul. Remettre.

- [ ] **Step 9 : Commit**

```bash
git add src/app/domain src/app/state src/app/features
git commit -m "refactor(model): deux postes nommés remplacent la captation seule"
```

---

### Task 2 : La couverture exige les deux postes

**Files:** Modify `src/app/domain/rules.ts` (`slotCoverage`) · Test `src/app/domain/rules.spec.ts`

- [ ] **Step 1 : Le test qui échoue**

```ts
describe('slotCoverage — créneaux de salle', () => {
  it('refuse « ok » à un créneau pourvu en personnes mais sans rôles', () => {
    const s = slot('s1');
    const st = state({ people: [person('p1'), person('p2')], slots: [s], assign: { s1: ['p1', 'p2'] } });
    expect(slotCoverage(st, s)).not.toBe('ok');
  });

  it('accorde « ok » quand les deux postes sont tenus', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')], slots: [s], assign: { s1: ['p1', 'p2'] },
      roles: { s1: { keeper: 'p2', captation: 'p1' } },
    });
    expect(slotCoverage(st, s)).toBe('ok');
  });

  it('laisse les postes transverses à la règle d\'effectif', () => {
    const s = slot('a', { salle: '', format: 'accueil', besoin: 1 });
    const st = state({ people: [person('p1')], slots: [s], assign: { a: ['p1'] } });
    expect(slotCoverage(st, s)).toBe('ok');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** — le premier test passe « ok ».

- [ ] **Step 3 : L'implémentation**

Dans `slotCoverage`, après le calcul existant de `n` et `a`, avant le retour :

```ts
  // Un créneau de salle n'est complet que si ses deux postes sont tenus.
  if (isSalleConference(s) && ROLE_KEYS.some((r) => !roleOf(state, s, r))) return a > 0 ? 'part' : 'miss';
```

- [ ] **Step 4 : Vert, puis commit**

```bash
git commit -am "feat(rules): un créneau de salle n'est complet qu'avec ses deux postes"
```

---

### Task 3 : Éligibilité par poste

**Files:** Modify `src/app/domain/rules.ts` (`eligibility`) · Test `src/app/domain/rules.spec.ts`

- [ ] **Step 1 : Le test qui échoue**

```ts
describe('eligibility — poste visé', () => {
  it('refuse un poste déjà tenu par quelqu\'un d\'autre', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2'), person('p3')], slots: [s],
      assign: { s1: ['p1', 'p2'] }, roles: { s1: { captation: 'p1' } },
    });
    expect(eligibility(st, st.people[2], s, 'captation')).toBe('poste déjà tenu');
    expect(eligibility(st, st.people[2], s, 'keeper')).toBeNull();
  });

  it('conserve les motifs existants', () => {
    const s = slot('s1', { jour: 'Vendredi 30' });
    const st = state({ days: ['Jeudi 29', 'Vendredi 30'], people: [person('p1')], slots: [s] });
    st.people[0].jours = ['Jeudi 29'];
    expect(eligibility(st, st.people[0], s, 'keeper')).toBe('absent ce jour');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** — la signature n'accepte pas de rôle.

- [ ] **Step 3 : L'implémentation**

```ts
export function eligibility(state: RegieState, p: Person, slot: Slot, role?: RoleKey): string | null {
  if (role && isSalleConference(slot)) {
    const tenant = roleOf(state, slot, role);
    if (tenant && tenant !== p.id) return 'poste déjà tenu';
  }
  if (slotAssigned(state, slot).includes(p.id) && !role) return 'déjà placé';
  // …le reste inchangé
}
```

`planning.ts` passe le rôle visé lorsqu'il en a un.

- [ ] **Step 4 : Vert, puis commit**

```bash
git commit -am "feat(rules): éligibilité tenant compte du poste visé"
```

---

### Task 4 : L'auto-affectation place les deux postes

La tâche centrale. Toute la machinerie de contraintes reste identique ; seul change ce qui est rempli.

**Files:** Modify `src/app/domain/rules.ts` (`AutoResult`, `autoAssign`), `src/app/state/regie.store.ts` (`runAuto`) · Test `src/app/domain/rules.spec.ts`

- [ ] **Step 1 : Les tests qui échouent**

```ts
describe('autoAssign — postes nommés', () => {
  it('place une personne formée en captation quand il en existe une', () => {
    const formation = slot('f', { salle: '', format: 'formation', besoin: 1, debut: 480, fin: 540 });
    const conf = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')], slots: [formation, conf],
      assign: { f: ['p1'] },
    });
    const r = autoAssign(st, 'fill');
    expect(r.roles['s1'].captation).toBe('p1');
    expect(r.roles['s1'].keeper).toBe('p2');
  });

  it('place quand même une personne non formée plutôt que laisser le poste vide', () => {
    const conf = slot('s1');
    const st = state({ people: [person('p1'), person('p2')], slots: [conf] });
    const r = autoAssign(st, 'fill');
    expect(r.roles['s1'].captation).toBeDefined();
    expect(r.roles['s1'].keeper).toBeDefined();
  });

  it('ne donne pas les deux postes à la même personne', () => {
    const conf = slot('s1');
    const st = state({ people: [person('p1'), person('p2')], slots: [conf] });
    const r = autoAssign(st, 'fill');
    expect(r.roles['s1'].keeper).not.toBe(r.roles['s1'].captation);
  });

  it('laisse les postes transverses sans rôles', () => {
    const a = slot('a', { salle: '', format: 'accueil', besoin: 1 });
    const st = state({ people: [person('p1')], slots: [a] });
    expect(autoAssign(st, 'fill').roles['a']).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** — `AutoResult` n'a pas de `roles`.

- [ ] **Step 3 : L'implémentation**

`AutoResult` gagne `roles: Record<string, SlotRoles>`.

Dans `autoAssign`, initialiser `roles` depuis `state.roles` (mode `fill`) ou `{}` (mode `all`). La boucle de remplissage, pour un créneau de salle, place poste par poste au lieu de compter :

```ts
    if (isSalleConference(s)) {
      for (const role of ROLE_KEYS) {
        if (roles[s.id]?.[role]) continue;
        let best: Person | null = null, bestScore = Infinity;
        state.people.forEach((p, i) => {
          if (!canPlace(p, s)) return;
          // La captation revient de préférence à quelqu'un qui a suivi la
          // formation ; à défaut on place quand même, le diagnostic signalera.
          const prefer = role === 'captation' && formes.has(p.id) ? -100 : 0;
          const score = prefer + load[p.id] * 10 + (loadDay[p.id][s.jour] ?? 0) * 4
            - tagBonus(state, p, s) * 3 + (i % 3) * 0.01;
          if (score < bestScore) { bestScore = score; best = p; }
        });
        if (!best) continue;
        const b = best as Person;
        (assign[s.id] ??= []).push(b.id);
        (roles[s.id] ??= {})[role] = b.id;
        load[b.id]++;
        loadDay[b.id][s.jour] = (loadDay[b.id][s.jour] ?? 0) + 1;
        taken[b.id].push(s);
        placed++;
      }
      continue;
    }
```

`canPlace` exclut déjà quiconque figure dans `assign[s.id]` : une même personne ne peut donc pas tenir les deux postes.

`formes` est construit en tête de `autoAssign`, comme dans `diagnostics`.

`runAuto` dans le store applique les deux tables : `this.patch(() => ({ assign: r.assign, roles: r.roles }))`.

- [ ] **Step 4 : Vert, puis commit**

```bash
git commit -am "feat(rules): l'auto-affectation place les deux postes nommés"
```

---

### Task 5 : Le panneau de détail

**Files:** Modify `src/app/features/planning/planning.ts`, `planning.html`, `planning.css`

- [ ] **Step 1 : Les méthodes**

```ts
  protected readonly ROLES = ROLE_KEYS;
  protected roleLabel(r: RoleKey) { return r === 'keeper' ? 'Time Keeper' : 'Captation'; }
  protected titulaire(x: Slot, r: RoleKey) {
    const id = roleOf(this.store.state(), x, r);
    return id ? this.store.people().find((p) => p.id === id) ?? null : null;
  }
  protected placerAu(x: Slot, r: RoleKey, personId: string) {
    this.store.assign(x.id, personId);
    this.store.setRole(x.id, r, personId);
  }
  protected viderPoste(x: Slot, r: RoleKey) {
    const id = roleOf(this.store.state(), x, r);
    this.store.setRole(x.id, r, null);
    if (id) this.store.unassign(x.id, id);
  }
```

- [ ] **Step 2 : Le template**

Dans `planning.html`, sous `@if (roleAttendu(x))`, une section « Rôles du créneau » listant les deux postes avec leur titulaire ou un emplacement vide, et dans la liste « Disponibles » deux boutons par personne, chacun désactivé si le poste est tenu. La liste « Placés » actuelle n'est rendue que pour les créneaux **sans** rôles.

- [ ] **Step 3 : Build, puis commit**

```bash
npx ng build
git commit -am "feat(planning): deux postes nommés dans le panneau de détail"
```

---

### Task 6 : Migration

**Files:** Create `docs/superpowers/plans/migration-postes.js`

- [ ] **Step 1 : Le script**

Sauvegarde horodatée ; `s.roles = s.roles || {}` ; pour chaque créneau de salle à deux personnes : si une désignation `captation` existe déjà (migration précédente), la reprendre et donner `keeper` à l'autre ; sinon, si exactement une des deux est formée, elle devient `captation` et l'autre `keeper` ; sinon laisser vacant. Retourner `{ backupKey, deduits, ambigus }`.

- [ ] **Step 2 : Exécution**

À présenter à l'humain, **jamais** exécuté d'office. Avertir de recharger tout autre onglet ouvert sur `localhost:4200` avant de lancer.
