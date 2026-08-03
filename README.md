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
| `npm run coverage`              | Couverture, les deux suites   |
| `node tools/contraste.mjs`      | Vérifie les contrastes AA     |
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
| [Transloco](https://jsverse.gitbook.io/transloco)  | ^8.4    | i18n : traductions embarquées, pas de requête au démarrage              |

## Structure

```
apps/shopping-list/       l'application
apps/shopping-list-e2e/   Playwright
libs/core/                CRDT, QR, providers de synchro (IndexedDB, GitHub)
libs/data-access/         NgRx (actions, reducers, selectors, effects)
libs/feature/             pages et parcours (liste, produit, appairage, proximité)
libs/ui/                  composants muets
libs/util/                rayons/emoji, i18n, recherche approximative, thème
docs/architecture.md      le document de référence
```

## Gestes sur la liste

Sur téléphone, la liste se mène au pouce, une main sur le caddie :

| Geste                 | Effet                          |
| --------------------- | ------------------------------ |
| Taper la ligne        | Cocher / décocher              |
| **Glisser à droite**  | Cocher (ou renvoyer du panier) |
| **Glisser à gauche**  | Retirer de la liste            |
| Bouton ✏️ de la ligne | Modifier le produit            |
| Menu ⋯ de l'en-tête   | Vider la liste                 |

La voie découverte par le glissé se teinte doucement, puis se sature au
franchissement du seuil : le point de bascule se voit au lieu de se deviner.

Il n'y a **plus de case à cocher** : la ligne entière coche, le glissé fait le
même travail, et un article coché part dans le panier, barré et marqué d'un ✓
vert. Le barré et le rangement disent l'état mieux qu'un cercle de 26 px, qui
n'était qu'une cible de plus à viser.

Il n'y a **plus de menu ⋯ sur la ligne** non plus. Il ne portait que deux
entrées, dont l'une — retirer — a son glissé ; et son popover, prisonnier du
calque que la ligne crée pour glisser, passait sous la ligne suivante :
inatteignable au doigt autant qu'à l'œil. Reste l'édition, qui n'a pas de
geste, et qui est donc un bouton — à toutes les largeurs.

**Au-delà de 1040 px, deux boutons de plus encadrent le ✏️** — ✓ cocher,
✕ retirer. Il y a la place, et la souris n'a ni le glissé ni la ligne entière
comme cible évidente. Les trois portent un `aria-label` **et** un `title` : un
glyphe seul ne dit rien à personne, et on veut savoir avant de cliquer.

« Vider la liste » ne touche pas au catalogue — c'est toute la différence avec
l'historique, et ce qui permet de refaire les courses suivantes sans rien
retaper. Le geste n'ayant pas de retour en arrière, il passe par une
confirmation.

## Ajouter un article

L'ajout n'occupe plus une barre collée en bas en permanence. Il prend la taille
de ce qu'il vaut à l'instant où on regarde l'écran :

| Où l'on est              | Ce qu'on voit                                        |
| ------------------------ | ---------------------------------------------------- |
| Liste vide               | Un bouton de 64 px au centre : l'ajout _est_ l'écran |
| Liste peuplée, téléphone | Un bouton flottant de 62 px en bas à droite          |
| Au-delà de 1040 px       | La barre permanente, dans le pied de la colonne      |

Le bouton flottant **se retire quand on défile vers l'avant de la liste et
revient dès qu'on remonte** : lire sa liste ne se fait pas avec un bouton posé
sur la dernière ligne. Il rend ainsi 62 px de liste sans jamais s'éloigner d'un
geste.

Le toucher ouvre une feuille qui **reste ouverte après chaque ajout** : le champ
se vide, l'article rejoint une pile de pastilles en haut, les suggestions se
réordonnent. On enchaîne dix articles sans revenir à la liste, et « Terminé »
ferme tout. Chaque pastille porte son ✕ : tant que la feuille est ouverte, un
ajout se défait d'un geste — pas de bandeau d'annulation à chronométrer.

La pile n'est pas journalisée : elle est **dérivée de la liste**, par la date de
création des articles depuis l'ouverture de la feuille. Une pile tenue à part
mentirait dès qu'un article en sortirait autrement — retiré d'un glissé, ou
emporté par un delta reçu de l'autre téléphone.

## Chercher

Toutes les recherches — les suggestions d'ajout, la colonne historique, l'écran
de gestion du catalogue — sont **approximatives**, par
[fuzzysort](https://github.com/farzher/fuzzysort). « lat » sort « Lait »,
« ptl » sort « Papier toilette », « crss » sort « Croissants ».

C'est l'exigence d'exactitude qui était mal placée : elle pesait sur la personne
qui tape d'un pouce, en marchant, avec un caddie dans l'autre main. Une
sous-chaîne exacte demandait de savoir écrire ce qu'on cherche avant de l'avoir
trouvé.

Deux conséquences, tenues ensemble :

- **le classement fait le travail du filtre.** Il n'y a pas de score plancher —
  « lat » ne vaut que 0,36 contre « Lait », et l'écarter reviendrait à refuser
  la faute de frappe qui justifie tout ceci. C'est le score qui ordonne, et la
  meilleure correspondance est en tête ;
- **ce qui a répondu est surligné.** Les lettres trouvées peuvent être
  éparpillées : sans mise en évidence, une liste de résultats flous paraît
  arbitraire. `sl-matched-text` découpe le texte et marque les lettres
  atteintes, en gras **et** en couleur — la teinte ne porte jamais
  l'information toute seule.

La recherche porte sur le libellé, la description, et les deux mis bout à bout :
sans quoi « yaourt vanille » ne trouverait rien, la moitié des lettres étant
dans l'un et l'autre moitié dans l'autre.

Les accents sont repliés sans décaler les index — « cafe » trouve « Café », et
c'est bien « **Café** » qui se surligne. Le repli se fait caractère par
caractère et garde une table des origines : c'est ce qui permet de surligner le
texte d'origine à partir d'index calculés sur sa forme repliée.

Tout cela vit dans [`libs/util/search/`](libs/util/search/src/lib/), une
fonction pure et un découpage — aucune connaissance du domaine.

## Thème

Un sélecteur à trois positions dans l'en-tête de la liste : **clair**,
**sombre**, **système**.

« Système » n'est pas « clair par défaut » : c'est l'absence de choix, celle qui
continue de suivre le téléphone quand il bascule au coucher du soleil. D'où
trois segments plutôt qu'un interrupteur — et plutôt qu'un bouton qui fait le
tour, lequel ne dit jamais où il en est sans qu'on le regarde.

Le choix vit dans le `localStorage` de l'appareil et **pas dans le CRDT** :
c'est une préférence d'appareil, deux téléphones ont le droit d'être réglés
différemment, et un réglage qui se synchroniserait changerait l'écran de l'autre
au milieu de ses courses.

Il pose un attribut `data-theme` sur `<html>`, que lisent les jetons de
`styles.scss`. Cinq lignes en ligne dans `index.html` le reposent avant le
premier pixel : sans elles, un thème clair sur un téléphone réglé en sombre
commencerait par un éclair noir.

## Contrastes

Les jetons de couleur passent les **4,5:1** exigés par le RGAA et le WCAG AA
dans les deux thèmes, texte normal compris.
[`node tools/contraste.mjs`](tools/contraste.mjs) relit les couleurs dans
`styles.scss` et rejoue les paires — un tableau de référence tenu à part
finirait par mentir.

Deux pièges rencontrés, qui valent d'être écrits :

- **le vert de marque était trop clair de deux crans.** Texte blanc dessus
  comme lui-même en texte sur blanc plafonnaient à 4,4:1. Il descend à
  `#097a40` : 5,4:1 des deux côtés, pour un vert qu'on ne distingue pas de
  l'ancien ;
- **l'encapsulation Angular renforce les sélecteurs descendants.** `main button`
  devient `main[x] button[x]`, qui pèse plus lourd que `.primary[x]` : le bouton
  primaire de l'échange de proximité gardait le fond des boutons secondaires
  avec l'encre prévue pour le vert — blanc sur blanc en clair, vert sombre sur
  gris sombre en sombre. La parade est d'écrire `main button.primary`, ce que
  faisait déjà l'écran d'appairage.

## Langues

L'interface existe en **français** et en **anglais**. La langue est celle du
navigateur — pas de sélecteur : on parcourt les langues annoncées par
`navigator.languages` et on prend la première traduite, français à défaut.

Les traductions vivent dans
[`libs/util/i18n/src/lib/translations/`](libs/util/i18n/src/lib/translations/),
gérées par [Transloco](https://jsverse.gitbook.io/transloco). Elles sont
**embarquées dans le bundle**, pas chargées en HTTP : l'application doit
s'afficher au fond d'un rayon sans réseau, et deux fichiers de quelques
kilo-octets ne justifient pas une requête de plus au démarrage.

Ajouter une langue :

1. copier `fr.json` et le traduire ;
2. l'ajouter à `AVAILABLE_LANGS` dans
   [`langs.ts`](libs/util/i18n/src/lib/langs.ts) et au chargeur ;
3. ajouter les mots-clés de cette langue dans
   [`libs/util/categories/`](libs/util/categories/src/lib/), sur le modèle de
   `keywords.en.ts` — le dictionnaire qui devine le rayon d'un produit est
   fusionné, pas traduit : on tape « pasta » dans une interface française.

Un test compare les jeux de clés des deux langues et échoue si l'un dérive.

Les pluriels s'écrivent en formes nommées et sont accordés par
`Intl.PluralRules` — « 0 produit archivé » est correct en français,
« 0 archived products » en anglais.

## Intégration continue et déploiement

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) découpe le pipeline en jobs, un par
étape, pour qu'un coup d'œil suffise à voir laquelle a cassé :

```
installation ─┬─ lint ─────────────────────────────┐
              ├─ tests-unitaires ─┬─ couverture ───┤
              ├─ tests-e2e ───────┘                ├─ deploy
              └─ build ────────────────────────────┘
```

`installation` paie le `npm ci` une fois et met `node_modules` en cache ; les quatre vérifications
partent ensuite ensemble au lieu de s'enchaîner. Chacune tournant sur une machine vierge, elles
retrouvent les dépendances par [`.github/actions/preparer-node`](.github/actions/preparer-node/action.yml),
qui restaure ce cache — et retombe sur `npm ci` s'il a été évincé.

Les tests unitaires et e2e relèvent chacun leur couverture de leur côté : elles ne se rejoignent que
dans `couverture`, qui récupère les deux artefacts pour n'en faire qu'un tableau. `build` compile avec
`baseHref=/shared-shopping-list/`.

Une pull request vers `main` fait tourner ces mêmes vérifications sur la branche, et s'arrête avant
`deploy` : la branche est validée avant la fusion, sans écraser le site en ligne. Un push sur `main`
va au bout et publie sur GitHub Pages — le déploiement attend toutes les vérifications, pas seulement
le build.

Le workflow copie `index.html` en `404.html` — GitHub Pages ne connaît pas les routes profondes
comme `/shared-shopping-list/liste` et renvoie `404.html`, qu'on fait pointer sur l'app pour que le routeur
Angular reprenne la main.

Pages est configuré en mode _GitHub Actions_ et le site est servi depuis
`/shared-shopping-list/`.

### Couverture des tests

Chaque pull request reçoit un commentaire — un seul, réécrit à chaque push — qui donne la couverture
des deux suites : le total en titre, puis le détail par projet, du moins couvert au mieux couvert. Le
même tableau apparaît dans le résumé du job, et les rapports `lcov` sont archivés en artefact.

Les deux chiffres ne se mesurent pas de la même façon, et ne veulent pas dire la même chose :

| Suite      | Comment                                                                                            | Ce que ça dit                             |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Unitaires  | Vitest instrumente chaque projet avec le provider V8                                               | Quelles lignes un test exerce directement |
| End-to-end | V8 relève ce que le navigateur exécute, les _source maps_ le ramènent aux `.ts`, Monocart l'agrège | Quel code un vrai parcours traverse       |

Deux limites à garder en tête. La couverture e2e ne compte que les projets **Chromium** :
`page.coverage` passe par le protocole Chrome DevTools, que WebKit n'expose pas — les parcours Mobile
Safari tournent, mais sans relevé. Et un chiffre e2e élevé sur un fichier ne dit pas qu'il est
_testé_ : seulement qu'il a été traversé.

En local, les deux relevés sont éteints par défaut — ils coûtent quelques secondes pour un chiffre
qu'on ne lit qu'en revue. `npm run coverage` les allume et affiche le tableau.

La couverture unitaire est à **100 %**, et un seuil la retient là : chaque projet refuse de passer
sous 100 % de lignes, branches, fonctions et instructions. Le relevé cesse donc d'être une
information qu'on lit après coup pour devenir une condition de fusion — un test oublié fait échouer
le job, en nommant le fichier fautif plutôt qu'en annonçant un total en baisse. Le seuil vit dans le
bloc `coverage` de chaque `vite.config.mts`, et dans les options de la cible `test` de
[`project.json`](apps/shopping-list/project.json) pour l'application, qui passe par l'exécuteur
Angular et non par Vitest directement.

Ce que ces 100 % ne disent pas : qu'un test est bon. Une ligne traversée n'est pas une ligne
vérifiée, et c'est le **test de mutation** qui tranche — on casse le code de production et on
regarde si la suite tombe. Une poignée de gardes échappent par ailleurs à la mesure, marquées
`/* v8 ignore */` avec leur justification : elles protègent des invariants qu'aucun test ne peut
mettre en défaut aujourd'hui.

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
