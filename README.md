# 🛒 Liste de courses

PWA de liste de courses partagée — **local-first**, **hors ligne**, **sans backend**, **0 € par
mois**.

Remplace la note Google Keep partagée : chacun ajoute et coche depuis son téléphone, tout se
synchronise, et ça continue de marcher quand le réseau du centre commercial ne passe pas.

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
libs/core/                CRDT, blobs, providers de synchro
libs/data-access/         NgRx (actions, reducers, selectors, effects)
libs/feature/             pages et parcours
libs/ui/                  composants muets
libs/util/                dictionnaire rayons/emoji
docs/architecture.md      le document de référence
```

## Déploiement

Un push sur `main` déclenche [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) : lint,
tests unitaires, e2e, build avec `baseHref=/shopping-list/`, puis publication sur GitHub Pages.

Le workflow copie `index.html` en `404.html` — GitHub Pages ne connaît pas les routes profondes
comme `/shopping-list/liste` et renvoie `404.html`, qu'on fait pointer sur l'app pour que le routeur
Angular reprenne la main.

**À faire une fois côté GitHub :** _Settings → Pages → Source → GitHub Actions_.

## État d'avancement

- [x] **Lot 0** — Workspace, PWA installable, CI vers Pages
- [ ] **Lot 1** — CRDT, store NgRx, UI liste, fiche produit, suggestions
- [ ] **Lot 2** — Synchro GitHub à deux appareils
- [ ] **Lot 3** — File offline, sonde réseau, bannières
- [ ] **Lot 4** — Échange QR de proximité
- [ ] **Lot 5** — Photos des produits
- [ ] **Lot 6** — Rayons, gestion du catalogue, multi-listes
