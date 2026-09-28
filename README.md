# Régie des helpers — BDX I/O 2026

Application Angular 20 (standalone, signals, zoneless) pour répartir les helpers sur les créneaux de l'événement.
Aucun backend : les données restent dans le navigateur, et l'export JSON sert de sauvegarde et de moyen de partage.

## Démarrer

L'environnement est géré par [mise](https://mise.jdx.dev) : il installe la bonne version de Node et porte les tâches du projet.

```bash
mise trust         # une fois : autoriser le mise.toml du dossier
mise install       # installe Node 22
mise run dev       # installe les dépendances si besoin, puis http://localhost:4200
```

Autres tâches (`mise tasks` pour la liste) :

| Tâche | Effet |
|---|---|
| `mise run setup` | `npm ci`, relancé seulement si `package.json` ou le lockfile changent |
| `mise run build` | build de production dans `dist/` |
| `mise run preview` | sert le build de production sur http://localhost:4300 |
| `mise run clean` | supprime `node_modules`, `dist` et le cache Angular |

## Organisation du code

```
src/app/
  domain/        logique métier pure, sans Angular (testable seule)
    model.ts     types : Slot, Person, Format, Options, RegieState
    seed.ts      programme type d'une journée, découpage accueil/bagages
    rules.ts     règles d'affectation, remplissage automatique, contrôles
    import.ts    lecture des fichiers JSON (helpers, sauvegardes)
    impression.ts  mise en forme des données pour l'export PDF
  state/
    regie.store.ts   état unique en signals, persistance localStorage, exports
    pdf.ts           fabrication des PDF (jspdf, chargé à la demande)
  features/
    planning/    timeline par journée + panneau d'affectation
    helpers/     import, ajout, charge et feuille de route de chaque helper
    regles/      besoins par format, limites, journées
    controles/   créneaux incomplets, chevauchements, plafonds dépassés
```

## Règles d'affectation

- Besoin d'un créneau : valeur saisie sur le créneau, sinon celle du format
  (Keynote, Conférence, Quickie, TiA : 2 ; Université, Atelier, Autre : 1 ; Accueil, Bagages : 6 par vacation).
- Accueil et bagages : 08:00–18:30, découpés sur les débuts de session, vacations de 45 min minimum.
- Une personne n'est placée que si elle est présente ce jour, sous ses plafonds (événement et jour),
  et sans chevauchement avec ses autres créneaux, pause minimum comprise.
- Remplissage : créneaux les plus contraints d'abord, puis choix au score le plus bas
  `charge × 10 + charge du jour × 4 − compétence × 3`.

## Export PDF

Menu **Fichier** → *Télécharger le planning* ou *Télécharger les feuilles de
route*. Le PDF est fabriqué dans le navigateur et téléchargé comme les exports
JSON et CSV : A4 portrait, marges 12 mm, aucun serveur.

- `planning-helpers.pdf` : une page par journée. Les créneaux sont groupés par
  heure de début, comme à l'écran : une bande colorée ouvre chaque groupe et ses
  lignes partagent une teinte, alternée d'un groupe à l'autre. La colonne
  « Équipe » reprend les couleurs de couverture de l'application — ambre quand
  il manque du monde, rouge quand personne n'est placé. Si un groupe se poursuit
  sur la page suivante, l'en-tête rappelle la journée et l'heure concernée.
- `feuilles-de-route-helpers.pdf` : une page par helper, ses créneaux groupés
  par jour. Les personnes sans aucun créneau sont omises.

Le rendu utilise `jspdf` et `jspdf-autotable`, chargés par `import()` dynamique
depuis `state/pdf.ts` : ils partent dans un morceau à part et n'alourdissent pas
le chargement initial de l'application. Les données à tracer viennent de
`domain/impression.ts`, qui est pur et testé.

À savoir : au deuxième export d'affilée, Chrome demande l'autorisation de
télécharger plusieurs fichiers. Si le second PDF n'arrive pas, c'est là qu'il
faut regarder (icône dans la barre d'adresse).

## Format d'import des helpers

```json
[
  { "nom": "Camille Roux", "jours": ["Jeudi 29"], "tags": ["accueil"], "max": 4 },
  { "nom": "Yanis Benali", "tags": ["Amphi A"] },
  "Léa Martin"
]
```
