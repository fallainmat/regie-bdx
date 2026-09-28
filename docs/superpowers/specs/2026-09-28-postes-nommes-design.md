# Deux postes nommés par créneau de salle : Time Keeper et Captation

Date : 2026-09-28 · Statut : à valider · Remplace partiellement
`2026-09-28-roles-captation-design.md`

## Ce qui change, et pourquoi

La conception précédente posait la captation comme une **annotation** sur un
créneau tenu par deux personnes interchangeables. À l'usage, ce n'est pas ce
qu'il fallait : un créneau de salle porte **deux postes nommés à pourvoir**,
Time Keeper et Captation. Un créneau n'est complet que si les deux sont tenus,
et non plus dès que deux personnes y figurent.

Cela revient sur deux décisions antérieures, assumées :

| Décision antérieure | Devient |
|---|---|
| On ne stocke que la captation, le keeper est déduit | Les deux rôles sont stockés et assignables |
| L'auto-affectation ignore les rôles | Elle place les deux rôles |

## Ce qui survit de la branche `feat/roles-captation`

Rien n'est à jeter :

- le prédicat de périmètre et ses tests épinglés (voir l'amendement ci-dessous) ;
- le créneau de formation du jeudi, `FORMATION_KEY` et la notion « a suivi la
  formation », indépendante du jour ;
- les besoins des ateliers et universités portés à 2 ;
- le diagnostic « captation non formée » ;
- le principe de **validation à la lecture**, qui devient la clé de voûte du
  nouveau modèle.

Sont remplacés : le champ `captation`, l'accesseur `captationOf`, le diagnostic
« captation à désigner » et le bouton du panneau de détail.

## Modèle

```ts
/** slotId -> les deux postes d'un créneau de salle. */
roles: Record<string, { keeper?: string; captation?: string }>;
```

`assign` reste la source de vérité de « qui est sur ce créneau ». Tout le reste
en dépend — charge, chevauchements, feuilles de route, export CSV — et rien de
cela ne doit changer de sens. `roles` **qualifie** des personnes déjà présentes
dans `assign` ; il ne les remplace pas.

### Validation à la lecture, généralisée

```ts
export function roleOf(state: RegieState, s: Slot, role: 'keeper' | 'captation'): string | null;
```

Ne renvoie l'id que si la personne figure **encore** dans `slotAssigned`. C'est
le même mécanisme que `captationOf`, et il devient d'autant plus nécessaire que
l'auto-affectation réécrit désormais `assign` **et** `roles` : toute désignation
orpheline est inerte, jamais visible, jamais à purger.

Aucun appelant ne lit `state.roles` directement.

## Couverture

Pour un créneau de salle, `slotCoverage` renvoie `'ok'` si **et seulement si**
les deux rôles se résolvent, en plus de la règle d'effectif existante. Un créneau
portant deux personnes sans rôle attribué n'est donc plus complet.

Les postes transverses et le créneau de formation gardent la règle actuelle,
purement quantitative : ils n'ont pas de rôles.

Conséquence assumée : le compteur d'en-tête passera mécaniquement au rouge après
migration, le temps que les rôles soient attribués.

## Auto-affectation

La machinerie de contraintes ne bouge pas — disponibilité, plafond personnel,
plafond du jour, chevauchements, score de charge, bonus de tag. Seul change ce
qui est rempli.

Pour un créneau de salle, au lieu d'un compteur :

1. **Captation d'abord.** Parmi les candidats plaçables, préférer ceux qui ont
   suivi la formation. À défaut, placer quelqu'un d'autre : le spec ne bloque
   pas, il signale — le diagnostic « captation non formée » fera son travail.
2. **Keeper ensuite**, parmi les candidats restants, au score existant.

`AutoResult` porte désormais `roles` en plus de `assign`, et le store applique
les deux ensemble.

Le mode `fill` respecte les rôles déjà attribués ; le mode `all` repart de zéro.

## Éligibilité

`eligibility` reçoit le rôle visé et ajoute un seul motif de refus : le poste
est déjà tenu par quelqu'un d'autre. Les motifs existants — absent ce jour,
plafond atteint, déjà pris à telle heure — sont inchangés.

Placer une personne non formée en captation reste **possible** et signalé.

## Diagnostics

- `untrained` : conservé tel quel, en lisant `roleOf(..., 'captation')`.
- `unassignedRole` : devient `missingRole: { slot: Slot; role: 'keeper' | 'captation' }[]`,
  pour dire **lequel** des deux postes manque plutôt que de signaler le créneau
  en bloc.

La disjonction avec « créneaux incomplets » disparaît d'elle-même : un poste
vacant est désormais une incomplétude, et les deux listes se répondent.

## Interface

**Panneau de détail d'un créneau de salle** — une section « Rôles du créneau »
remplace la liste « Placés » :

```
Time Keeper   Elise Marcillaud      [Changer] [Vider]
Captation     Sebastien Moreno      [Changer] [Vider]
```

Un poste vacant affiche un emplacement vide explicite, pas une absence de ligne.
La liste « Disponibles » propose deux actions par personne, `[Keeper]` et
`[Captation]`, chacune désactivée si le poste est déjà tenu.

Les créneaux sans rôles — postes, formation — gardent la liste « Placés »
actuelle, inchangée.

**Écran Contrôles** — la section liste les postes vacants en les nommant, et les
captations non formées comme aujourd'hui.

## Migration

Troisième passe sur l'état sauvegardé, même forme que les précédentes :
sauvegarde horodatée, puis, pour chaque créneau de salle à deux personnes,
déduction — la seule personne formée devient captation, l'autre keeper. Les cas
ambigus restent vacants et remontent dans les postes manquants.

La désignation `captation` issue de la migration précédente, si elle existe, est
reprise telle quelle et son binôme devient keeper.

## Conséquence à valider

Le besoin par format reste modifiable depuis l'écran Règles, mais pour un format
de salle il ne peut plus descendre sous 2 sans rendre le créneau structurellement
incomplétable. Le spec ne verrouille pas le champ ; il acte que la couverture
d'un créneau de salle exige les deux rôles **en plus** de l'effectif demandé.

## Hors périmètre

- Aucun blocage : affecter une personne non formée à la captation reste possible.
- Aucun marqueur dans la grille Planning.
- Ni l'impression ni l'export CSV ne mentionnent le rôle.
- Aucun troisième rôle, aucun rôle sur les postes transverses.

---

## Amendement du 2026-09-28 — les labs sortent du périmètre

Constat d'usage : **les labs n'ont ni time keeper ni captation, et ne tiennent
qu'une personne**. Ce document et celui qu'il remplace les incluaient tous deux,
sur la foi d'une réponse qui valait pour les conférences.

Deux corrections, et rien d'autre :

- le prédicat de périmètre passe de `/amphi|^lab/i` à `/amphi/i`. Il est renommé
  `tientUnBinome` : il ne retient plus « les salles de conférence » — les labs en
  sont — mais les créneaux tenus par un binôme. Nommer le concept plutôt que le
  type de salle évite qu'un futur lecteur se fie au nom contre le code.
- `atelier` et `universite` reviennent à `need: 1`.

Conséquence sur les données existantes : les rôles déjà posés sur des créneaux de
lab deviennent inertes, sans rien effacer — la validation à la lecture s'en
charge, comme pour toute désignation hors périmètre.
