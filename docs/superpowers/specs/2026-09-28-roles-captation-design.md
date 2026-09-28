# Rôles keeper / captation et alerte de formation

Date : 2026-09-28 · Statut : validé, prêt pour le plan d'implémentation

## Objectif

Signaler, sur l'écran Contrôles, les créneaux de salle (amphis et labs) dont la
personne chargée de la captation n'a pas suivi la formation du jeudi matin.

Chaque créneau de salle est tenu par un binôme : un *keeper* et une *captation*.
Le modèle actuel ne sait pas les distinguer — `assign` est un
`Record<slotId, personId[]>`, une liste de personnes sans qualification. Ce
document décrit l'ajout minimal qui rend l'alerte possible.

## Décisions cadrées

| Question | Décision |
|---|---|
| Ampleur | Annotation + alerte. `autoAssign`, `coverage` et `eligibility` restent inchangés. |
| Sens du besoin de 2 | Le binôme existait déjà, non nommé. Les effectifs ne changent pas, sauf ateliers et universités. |
| Périmètre des salles | Toute salle de conférence : amphis **et** labs. |
| Migration | Déduction — sur un créneau à deux, si exactement une personne est formée, elle devient la captation. |
| Emplacement | Écran Contrôles uniquement. |
| Représentation | Approche A : on ne stocke que la captation, le keeper est dérivé. |

## Modèle

Un champ additif dans `RegieState` (`src/app/domain/model.ts`) :

```ts
/** slotId -> id de la personne qui assure la captation. */
captation: Record<string, string>;
```

`blankState()` l'initialise à `{}`. `parseState` (`import.ts`) le tolère absent
et retombe sur `{}`, afin que les sauvegardes antérieures restent lisibles :

```ts
captation: s.captation ?? {},
```

Le keeper n'est pas stocké. Sur un créneau à deux personnes, c'est celle qui
n'est pas la captation ; l'interface peut donc l'afficher sans que l'état porte
une information dérivable.

## L'accesseur validé

```ts
/** La captation d'un créneau, si elle est toujours affectée à ce créneau. */
export function captationOf(state: RegieState, s: Slot): string | null
```

Il renvoie `state.captation[s.id]` **uniquement** si cet id figure encore dans
`slotAssigned(state, s)`, et `null` sinon.

Cette validation à la lecture est structurante, pas cosmétique. `runAuto`
remplace la table `assign` en bloc (`regie.store.ts`), et l'auto-affectation
ignore les rôles par choix : sans cette vérification, chaque « Tout refaire »
laisserait des désignations pointant vers des personnes qui ne sont plus sur le
créneau, et rien ne viendrait jamais les réparer.

**Tout lecteur passe par cette fonction.** Aucune lecture directe de
`state.captation` hors de `captationOf` et du setter. Les entrées périmées
restent en mémoire sans nuire ; elles sont ignorées.

## Périmètre des créneaux

```ts
/** Les créneaux tenus en binôme : amphis et labs. */
export function isSalleConference(s: Slot): boolean {
  return /amphi|^lab/i.test(s.salle);
}
```

Les postes transverses et le créneau de formation ont une salle vide : ils sont
exclus mécaniquement, sans condition supplémentaire. Sur les données de
référence, le prédicat retient **80 créneaux** (Grand amphi, Amphi A/B/D/E, Lab,
Lab 2).

## Définition de « a suivi la formation »

Figurer dans les affectations d'un créneau de format `formation`.

C'est **indépendant du jour du créneau évalué** : une personne placée sur un
amphi le vendredi doit avoir suivi la formation du jeudi. Le rapprochement se
fait sur la personne, jamais sur la journée.

## Diagnostic

Deux entrées s'ajoutent à `Diagnostics` (`rules.ts`) :

```ts
/** Captation désignée mais non formée. */
untrained: { slot: Slot; person: Person }[];
/** Créneau complet sans captation désignée. */
unassignedRole: Slot[];
```

`untrained` s'applique quelle que soit la couverture du créneau : une captation
non formée est un problème même si le binôme est incomplet.

`unassignedRole` ne retient un créneau que s'il est **complet par ailleurs**
(`slotCoverage === 'ok'`). Sans cette condition, les créneaux sous-pourvus
seraient comptés deux fois — ici et dans `under` — et l'écran Contrôles
paraîtrait incohérent. Les deux catégories restent ainsi disjointes.

`Controles.allGood()` intègre les deux nouvelles listes : « Tout est couvert »
ne s'affiche plus tant qu'une captation manque ou n'est pas formée.

## Besoins par format

Dans `DEFAULT_FORMATS` (`seed.ts`), `atelier` et `universite` passent de `1` à
`2`, pour refléter le binôme. Conférences, keynotes et quickies sont déjà à 2 et
ne bougent pas. Effet : **+10 places** sur l'ensemble du planning.

## Migration

Une passe **unique**, exécutée dans le navigateur sur l'état sauvegardé, sur le
modèle de l'injection du créneau de formation. Délibérément **pas** dans
`parseState` : une migration logée dans le parseur s'exécuterait à chaque
chargement et devrait rester idempotente indéfiniment.

Elle doit, dans cet ordre :

1. déposer une sauvegarde horodatée de l'état courant ;
2. porter `atelier` et `universite` à un besoin de 2 dans le tableau `formats` de
   l'état sauvegardé — le changement de `DEFAULT_FORMATS` ne l'atteint pas ;
3. créer le champ `captation` s'il est absent ;
4. pour chaque créneau de salle à deux personnes affectées dont **exactement
   une** est formée : désigner celle-ci comme captation.

Résultat attendu sur les données de référence :

| Cas | Nombre |
|---|---|
| Résolus par déduction | 43 |
| Ambigus — les deux personnes formées | 19 |
| Ambigus — aucune personne formée | 8 |
| Sous-pourvus après passage du besoin à 2 | 10 |
| **À traiter à la main** | **37** |

Ces 37 recouvrent deux natures de travail distinctes : **27 désignations de rôle**
(les cas ambigus, créneaux complets qui remonteront dans `unassignedRole`) et
**10 places à pourvoir** (les ateliers et universités passés à 2, qui remontent
dans `under` et non dans la nouvelle catégorie).

Les 19 cas « deux formées » sont un arbitrage humain ; les 8 cas « aucune
formée » sont un vrai manque de staffing, que l'alerte a précisément pour rôle
de révéler.

## Interface

Écran Contrôles (`controles.ts`) : une section supplémentaire listant les
créneaux concernés, la personne en cause pour `untrained`, dans le style des
sections existantes.

La désignation de la captation se fait depuis le panneau de détail du créneau,
dans l'écran Planning : un contrôle par personne affectée permet de la marquer
comme captation. Le store expose :

```ts
setCaptation(slotId: string, personId: string | null): void
```

`null` retire la désignation. Le setter refuse un `personId` qui n'est pas
affecté au créneau.

## Tests

Sur le domaine pur, dans `rules.spec.ts` (nouveau) :

- `captationOf` renvoie l'id désigné quand la personne est affectée ;
- `captationOf` renvoie `null` quand la désignation est périmée — **le test qui
  protège le scénario « Tout refaire »** ;
- `isSalleConference` retient amphis et labs, écarte postes et formation ;
- `untrained` signale une captation non formée, y compris le vendredi ;
- `untrained` ignore une captation formée ;
- `unassignedRole` signale un créneau complet sans captation ;
- `unassignedRole` **ignore** un créneau sous-pourvu, déjà couvert par `under`.

## Hors périmètre

Explicitement exclus, à ne pas traiter dans cette itération :

- `autoAssign` reste aveugle aux rôles : il ne place pas les personnes formées
  en captation et ne répare pas les désignations ;
- aucun marqueur dans la grille Planning ;
- ni l'impression ni l'export CSV ne mentionnent le rôle ;
- aucun blocage : affecter une personne non formée à la captation reste possible.
