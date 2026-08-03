---
name: critique-code
description: Relecteur sévère du travail d'une session — vérifie la correction du code, son respect des conventions et de l'esprit du dépôt, et le format des messages de commit ; puis range les corrections dans les commits d'origine via --fixup et rebase --autosquash. Se charge en fin de session (hook Stop), ou sur demande avant de considérer un travail comme terminé.
---

# Relecture du code produit

Relire ce qui vient d'être écrit **en cherchant à le démolir**, pas à le valider.

Le code produit dans une session est presque toujours plausible : il compile, les tests
passent, il ressemble au reste. C'est exactement ce qui le rend dangereux. Cette relecture
existe pour trouver ce que « ça a l'air bien » recouvre.

## Posture

**Par défaut, le code est refusé.** C'est à lui de démontrer qu'il tient, pas au relecteur
de démontrer qu'il casse. Un doute non levé est un défaut.

- Aucun compliment. Rien sur ce qui va bien : ça n'aide personne et ça dilue le reste.
- Aucune atténuation : pas de « peut-être », « on pourrait envisager », « ce n'est pas
  bloquant mais ». Un constat s'énonce.
- **Chaque reproche se prouve.** Un défaut sans scénario d'échec concret — entrées
  précises → comportement faux — n'est pas un défaut, c'est une préférence : à jeter.
- On critique le code, pas celui qui l'a écrit. C'est ce qui autorise la sévérité.

**Ne pas inventer de défauts pour remplir la liste.** Un rapport gonflé de broutilles cache
le vrai problème aussi sûrement qu'un rapport vide. Si rien de sérieux ne ressort après une
recherche honnête, l'écrire — et dire *ce qui a été cherché sans être trouvé*, pour qu'on
puisse juger si la recherche valait quelque chose.

## Périmètre

Le travail de la session, dans ses deux formes :

- **le code** : `git diff <base>` plus les fichiers non suivis (`<base>` est fourni par le
  déclencheur ; à défaut, `git diff HEAD` et `git status --porcelain`) ;
- **les commits** : `git log <base>..HEAD`, messages compris — un mauvais message est un
  défaut au même titre qu'un mauvais test.

Lire **le code autour**, pas seulement le diff : un ajout correct en lui-même peut
contredire un invariant posé trois fichiers plus loin. La moitié des vrais défauts est
invisible dans le diff seul.

## Ce qu'on cherche, dans cet ordre

L'ordre compte : ne pas parler de nommage tant qu'on n'a pas cherché les pertes de données.

### 1. Correction et perte de données

- Le cas limite non traité : liste vide, chaîne vide, `undefined`, quantité nulle ou
  négative, produit supprimé pendant l'édition, double clic, `await` manquant.
- **Les invariants du CRDT** (`docs/architecture.md` §3–4). Une écriture qui écrase au lieu
  de fusionner, un compteur remis à zéro au lieu d'être incrémenté, un tombstone ignoré,
  une clé d'article dérivée d'autre chose que ce que le schéma impose. Question à poser
  systématiquement : *deux appareils font ça hors ligne en même temps — après fusion, que
  reste-t-il ?* Si la réponse est « ça dépend de qui synchronise en premier », c'est un bug,
  pas un arbitrage.
- L'écriture qui part dans le store NgRx sans passer par le CRDT. **Le store est une
  projection** (§5) : toute source de vérité parallèle est un défaut de conception, même si
  l'écran s'affiche correctement.
- Ce qui casse hors ligne ou au retour du réseau : une action qui suppose une réponse
  serveur, un `catch` qui avale une erreur de synchro, une file offline contournée.
- Les images : un `blob:` révoqué trop tôt, un hash calculé sur autre chose que le contenu,
  un orphelin jamais purgé.

### 2. Conventions et esprit de la maison

Le dépôt a un style tenu. Ce qui s'en écarte est un défaut, même si ça fonctionne : c'est
la cohérence qui rend le code relisible dans six mois. **Vérifier sur les fichiers voisins
plutôt que de se fier à sa mémoire** — le voisin fait foi.

- **Anglais pour le code, français pour la prose.** Identifiants, types, fichiers en
  anglais ; commentaires, JSDoc et libellés de test en français. Pas l'inverse, pas de
  mélange dans un même identifiant.
- **Nommage des fichiers** : `kebab-case`, sans suffixe `.component` / `.service` hérité —
  `theme-switch.ts` exporte `ThemeSwitch`, `fuzzy.ts` exporte ses fonctions.
- **Le JSDoc de tête d'un module dit pourquoi il existe**, dans le même registre que les
  messages de commit : le problème qu'il résout, l'arbitrage tranché, ce qui a été écarté.
  Un module ajouté sans cet en-tête, ou avec un en-tête qui paraphrase son nom, est
  incomplet.
- **Les commentaires disent pourquoi, jamais quoi.** Un commentaire qui redit la ligne
  qu'il surplombe est à supprimer, pas à reformuler.
- **Les libellés de test sont des phrases françaises qui décrivent un comportement** —
  « s'annonce comme un groupe de trois choix exclusifs », pas « should render radiogroup »
  ni « test theme switch ». Un libellé qui nomme la méthode appelée au lieu de l'effet
  attendu est à refuser.
- **Immuabilité par défaut** : `readonly` sur les champs d'interface, `interface` pour les
  formes de données, constantes de module en `UPPER_SNAKE`.
- **Imports par alias** (`@shopping-list/util/i18n`), jamais de chemin relatif qui remonte
  hors de sa lib. Les points d'entrée secondaires (`.../testing`) servent au test et à rien
  d'autre.
- **Angular** : standalone, zoneless, signaux et `input()` / `output()`. Un `@Input()`
  décoré, un `NgModule`, un `subscribe` dans un composant, une valeur lue depuis le store
  autrement que par un selector : à signaler.

### 3. Frontières et placement

- Les tags Nx (§9). `feature` → `feature`, `core` → `data-access`, `ui` → autre chose que
  `util` : refusé, même si ESLint laisse passer.
- Le code déposé dans la première lib venue parce que c'était pratique. Demander : *si
  demain on supprime cet écran, ce code disparaît-il avec lui ?* Sinon, il n'est pas au bon
  endroit.
- La logique métier réfugiée dans un composant, ou dans un template.

### 4. Les tests, avec la plus grande méfiance

C'est ici qu'on trouve le plus. Un test vert ne prouve rien tant qu'on n'a pas lu ce qu'il
affirme.

- **Le test qui n'assure rien** : il appelle sans assurer ; il assure sur un mock qu'il a
  lui-même posé ; il assure `toBeDefined()` ou `not.toThrow()` sur du code qui ne peut pas
  jeter. Vérification qui tranche : **casser mentalement l'implémentation — le test
  rougit-il ?** Sinon, il ne teste rien.
- Le test écrit pour la couverture, qui traverse le code sans rien affirmer (§14 :
  « traversé n'est pas testé »). Un chiffre qui monte sans qu'un comportement soit
  verrouillé est une régression déguisée en progrès — le dire.
- Le cas nominal seul, sans l'échec, sans le concurrent, sans le vide.
- Le mock qui ment : un faux `fetch` qui ne peut pas rendre 409, un faux IndexedDB qui ne
  peut pas échouer, une horloge figée qui masque une course.
- Le test supprimé, désactivé, ou dont l'assertion a été détendue pour qu'il passe.
  **À signaler en tête de rapport, toujours.**

### 5. Interface, accessibilité, i18n

- Une chaîne visible écrite en dur au lieu d'une clé (§10) — et l'inverse : une donnée
  utilisateur transformée en clé de traduction.
- Une clé ajoutée dans une langue et pas dans l'autre.
- Un rôle ARIA absent ou faux, un état annoncé uniquement par la couleur, une cible tactile
  trop petite, un focus perdu après une action.
- Un contraste non vérifié en clair **et** en sombre (`node tools/contraste.mjs`).
- Ce qui ne marche qu'au clavier, ou ne marche qu'au pouce.

### 6. Simplicité

- L'abstraction posée pour un seul appelant.
- L'option de configuration que personne ne règle.
- Le code mort, la branche inatteignable, le `TODO` laissé.
- Trois façons de faire la même chose dans le dépôt, dont deux datent d'aujourd'hui.

### 7. Les messages de commit

Relire chaque message de `git log <base>..HEAD` avec la même sévérité que le code. La
convention est celle du dépôt, lisible dans `git log` — la skill `commit-regulier` la
détaille.

Motifs de refus, du plus grave au moins grave :

1. **Le sujet décrit la manipulation et non l'effet** : « Ajoute un service », « Modifie le
   reducer », « Corrige le bug ». Le sujet dit ce que l'application fait de nouveau pour
   celui qui s'en sert.
2. **Le sujet n'est pas un verbe à l'indicatif présent, troisième personne** : « Ajout de… »,
   « Fix… », « feat: … », « Added… ». Pas de préfixe conventionnel, pas de point final,
   ~50 caractères.
3. **Le corps redit le diff** au lieu de dire pourquoi. Un corps qui énumère les fichiers
   modifiés est à récrire : ce qu'on attend, c'est ce qui n'allait pas avant, l'arbitrage
   tranché, ce qui a été écarté et pourquoi, les conséquences non évidentes.
4. **Le corps est absent** sur autre chose qu'un changement trivial.
5. **Le commit est un fourre-tout** : le message a besoin d'un « et aussi », ou mêle
   refactoring et changement de comportement. Le signaler ; ne pas découper d'autorité,
   c'est un arbitrage.
6. **Détails** : lignes non repliées vers 75 colonnes, français fautif, pied
   `Co-Authored-By` manquant.

## Vérifier avant d'affirmer

Un relecteur qui se trompe ne coûte pas seulement du temps : il apprend à ignorer les
relectures suivantes. Avant d'écrire un défaut :

1. ouvrir le fichier et lire le contexte réel, pas la mémoire qu'on en a ;
2. formuler le scénario d'échec en entrées concrètes ;
3. chercher activement ce qui **invaliderait** le reproche — une garde ailleurs, un test qui
   couvre déjà le cas, un invariant qui rend l'entrée impossible ;
4. si le doute subsiste, classer en **Douteux** plutôt que trancher à faux.

Lancer `npm test` plutôt que supposer l'état des tests. Si on affirme qu'un test ne teste
rien, l'avoir vérifié.

## Le rapport

Court, ordonné par gravité, sans préambule ni conclusion. Chaque entrée tient en trois
lignes.

```
## Verdict : REFUSÉ | À CORRIGER | ACCEPTÉ SOUS RÉSERVE

### Bloquant
1. [libs/core/crdt/src/lib/operations.ts:88](libs/core/crdt/src/lib/operations.ts#L88)
   Deux appareils qui cochent le même article hors ligne : le second `set` écrase le
   premier, la fusion garde un seul des deux au lieu des deux.
   → Passer par le G-Counter, comme `incrementQuantity` juste au-dessus.

### Sérieux
### Messages de commit
### Douteux — à confirmer
```

- **Bloquant** : perte de données, invariant CRDT violé, régression, test qui ment.
- **Sérieux** : ce qui coûtera cher plus tard — mauvaise frontière, convention rompue, cas
  limite ouvert, accessibilité absente.
- **Douteux** : soupçon non prouvé. Dire ce qui manque pour trancher.

Un verdict **ACCEPTÉ SOUS RÉSERVE** exige de lister ce qui a été cherché sans être trouvé.
Il n'y a pas de verdict « très bien ».

## Ranger les corrections dans les bons commits

Une correction de relecture n'est pas un commit de plus : c'est le commit d'origine qui
était faux. Elle doit y retourner, pour que l'historique dise la vérité.

**Ce qu'on corrige de sa propre initiative** : les **Bloquants** dont la correction est
mécanique et ne tranche aucun arbitrage de conception, et **tous les défauts de convention
et de message de commit** — c'est du formel, pas de la conception. Le reste reste à
l'arbitrage : ne pas refactoriser d'autorité, ne pas élargir le périmètre.

### Vérifications préalables, dans l'ordre

```bash
git log --oneline <base>..HEAD          # ce qui est réécrivable : rien avant <base>
git status --porcelain                  # doit être propre avant tout rebase
git log --oneline @{upstream}..HEAD     # si vide → déjà poussé, on ne réécrit pas
```

- **Ne jamais réécrire en deçà de `<base>`**, ni un commit déjà poussé. Si la correction
  vise un tel commit : la déposer en commit normal et le signaler dans le rapport.
- Si la ligne fautive n'est **pas encore commitée**, la corriger sur place. Pas de fixup.
- Travail en cours non commité au moment du rebase : le commiter ou `git stash` d'abord,
  puis `git stash pop`. Un rebase sur un arbre sale échoue.

### Corriger le contenu d'un commit

```bash
git blame -L 88,88 -- libs/core/crdt/src/lib/operations.ts   # quel commit a introduit la ligne
# … appliquer la correction …
git add libs/core/crdt/src/lib/operations.ts
git commit --fixup <sha-du-commit-fautif>
```

### Corriger le message d'un commit

`--fixup` ne touche pas au message. Écrire à la main un commit `amend!` dont le sujet
reprend **à l'identique** le sujet visé, suivi du message de remplacement complet :

```bash
cat > /tmp/amend.txt <<'EOF'
amend! Ajout du sélecteur de thème

Ajoute le choix du thème : clair, sombre, système

<corps récrit : le pourquoi, l'arbitrage, ce qui a été écarté>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit --allow-empty -F /tmp/amend.txt
```

### Replier le tout

```bash
git rebase --autosquash <base>
npm test && npm run lint
git log --oneline <base>..HEAD    # plus aucun fixup!/amend! ne doit subsister
```

`git rebase --autosquash <base>` suffit et ne demande rien (git ≥ 2.42 ; le dépôt est en
2.44). Ne pas passer `-i`.

**En cas de conflit** : `git rebase --abort`, laisser les `fixup!` / `amend!` en place, et
le dire dans le rapport. Un historique réécrit à moitié est pire que des commits de
correction visibles.

### Après

Rendre compte en deux lignes : ce qui a été replié dans quel commit, ce qui reste à
l'arbitrage. Ne pas relancer de relecture sur ses propres corrections. Ne pas pousser :
`push` reste sur demande explicite.
