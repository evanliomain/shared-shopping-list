# 🛒 Liste de courses

PWA de liste de courses partagée — **local-first**, **hors ligne**, **sans backend**, **0 € par
mois**.

Remplace la note Google Keep partagée : chacun ajoute et coche depuis son téléphone, tout se
synchronise, et ça continue de marcher quand le réseau du centre commercial ne passe pas.

🌐 **En ligne : https://evanliomain.github.io/shared-shopping-list/**

> 📐 **[Architecture détaillée →](docs/architecture.md)** — modèle CRDT, synchro, choix techniques,
> diagrammes.

---

## Comment ça marche en trois phrases

L'état vit dans un **CRDT [Yjs](https://github.com/yjs/yjs)** répliqué sur chaque appareil et
persisté en IndexedDB : toute écriture est locale et instantanée, cocher un article ne dépend jamais
du réseau. Synchroniser se réduit à faire circuler des `Uint8Array`, par n'importe quel canal — un
**repo GitHub privé** sert de boîte aux lettres, et un **échange par QR code** prend le relais quand
il n'y a plus de réseau du tout. Le **store NgRx est une projection** du CRDT, jamais une seconde
source de vérité.

---

## Démarrer

```bash
npm ci
npm start              # http://localhost:4200
```

## Commandes

| Commande                        | Effet                         |
| ------------------------------- | ----------------------------- |
| `npm start`                     | Serveur de développement      |
| `npm run build`                 | Build de production           |
| `npm test`                      | Tests unitaires (Vitest)      |
| `npm run lint`                  | ESLint sur tout le workspace  |
| `npx nx e2e shopping-list-e2e`  | Tests end-to-end (Playwright) |
| `node tools/generate-icons.mjs` | Régénère les icônes PWA       |

Les tests e2e ont besoin des navigateurs une première fois :

```bash
npx playwright install chromium webkit --with-deps
```

## Stack

| Brique                                             | Version | Pourquoi                                                                |
| -------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| Nx                                                 | 22.7.8  | Cible Angular ~21.2 et NgRx ^21.0 — le trio est cohérent                |
| Angular                                            | ~21.2   | LTS jusqu'en mai 2027. Standalone, signals, zoneless                    |
| NgRx                                               | ~21.1   | Dernière stable. Store + Effects pour le domaine, SignalStore pour l'UI |
| Yjs                                                | ^13.6   | Le CRDT                                                                 |
| [taninsam](https://evanliomain.github.io/taninsam) | ^1.17   | Transformations de données                                              |

## Structure

```
apps/shopping-list/       l'application
apps/shopping-list-e2e/   Playwright
libs/core/                CRDT, QR, providers de synchro (IndexedDB, GitHub)
libs/data-access/         NgRx (actions, reducers, selectors, effects)
libs/feature/             pages et parcours (liste, produit, appairage, proximité)
libs/ui/                  composants muets
libs/util/                dictionnaire rayons/emoji
docs/architecture.md      le document de référence
```

## Déploiement

Un push sur `main` déclenche [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) : lint,
tests unitaires, e2e, build avec `baseHref=/shared-shopping-list/`, puis publication sur GitHub Pages.

Le workflow copie `index.html` en `404.html` — GitHub Pages ne connaît pas les routes profondes
comme `/shared-shopping-list/liste` et renvoie `404.html`, qu'on fait pointer sur l'app pour que le routeur
Angular reprenne la main.

Pages est configuré en mode _GitHub Actions_ et le site est servi depuis
`/shared-shopping-list/`.

### Première configuration de la synchro

1. Ouvrir l'app, taper la pastille de synchro dans l'en-tête.
2. Renseigner le compte, le dépôt privé `shopping-list-data`, et un jeton
   fine-grained limité à ce dépôt avec `Contents: Read and write`.
3. Sur le second appareil : « Appairer un autre appareil » affiche un QR à
   scanner — rien à ressaisir.

Le jeton vit dans l'IndexedDB de chaque appareil. Il n'est jamais committé, et
ne part que vers l'API GitHub.

## État d'avancement

- [x] **Lot 0** — Workspace, PWA installable, CI vers Pages
- [x] **Lot 1** — CRDT, store NgRx, UI liste, fiche produit, suggestions
- [x] **Lot 2** — Synchro GitHub à deux appareils
- [x] **Lot 3** — File offline, rattrapage au retour du réseau, invite de mise à jour
- [x] **Lot 4** — Échange QR de proximité
- [x] **Lot 5** — Photos des produits
- [x] **Lot 6** — Rayons, gestion du catalogue _(multi-listes non fait — voir plus bas)_

## Reste à faire

**Multi-listes.** Le CRDT le supporte déjà — les articles vivent dans une
racine `items:<listId>` et les métadonnées sont indexées par liste — mais
l'interface ne connaît qu'une seule liste, via la constante `DEFAULT_LIST_ID`.
Ajouter le multi-listes demande un sélecteur de liste et de rendre cette
constante dynamique dans la tranche NgRx. Rien de bloquant, mais ce n'était pas
dans le besoin exprimé.
