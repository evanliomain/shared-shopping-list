---
name: commit-regulier
description: Découper le travail en paquets fonctionnels et commiter dès qu'un paquet tient debout, sans attendre la fin de la demande. À charger au début de toute tâche qui modifie du code dans ce dépôt, et à relire chaque fois qu'un morceau cohérent vient d'être terminé, que les tests viennent de passer, ou que la question « est-ce que je commite maintenant ? » se pose.
---

# Commiter régulièrement

Dans ce dépôt, **on commite dès qu'un paquet fonctionnel est fait** — pas à la fin de la
demande, pas quand l'utilisateur le réclame. C'est l'autorisation permanente de commiter
sans demander à chaque fois.

En revanche `git push` reste sur demande explicite. Et si la branche courante est la branche
par défaut (`main`), créer une branche avant le premier commit.

## Ce qu'est un « paquet fonctionnel »

Un ensemble de modifications qui **tient debout tout seul** : l'application compile, les
tests passent, et un lecteur du seul message de commit comprend ce qui a changé et pourquoi.

Un paquet, typiquement :

- une fonctionnalité visible de l'utilisateur, avec ses tests ;
- une correction de bug, avec le test qui la verrouille ;
- un refactoring à comportement constant, isolé des changements de comportement ;
- l'outillage ou la CI, séparé du code applicatif qu'il vérifie.

Ce n'est **pas** un paquet : « j'ai touché trois fichiers », « c'est un bon moment pour
sauvegarder », ou la moitié d'une fonctionnalité dont l'autre moitié arrive juste après.

Deux découpages valent mieux qu'un fourre-tout : si le message de commit a besoin d'un
« et aussi », c'étaient deux commits.

## Quand commiter

Après chaque paquet terminé, dans cet ordre :

1. `npm test` — ou, si le paquet est circonscrit, `npx nx test <projet>` ;
2. `npm run lint` si des fichiers source ont bougé ;
3. relire le diff (`git diff`, `git status`) — rien de temporaire, pas de `console.log`,
   pas de fichier de brouillon ;
4. commiter ;
5. dire en une ligne ce qui vient d'être commité, puis enchaîner sur la suite.

Si les tests échouent, on ne commite pas : on corrige, ou on le signale. Un commit rouge
n'est pas un point de sauvegarde.

Sur une tâche longue, énoncer le découpage en paquets **avant** de commencer à coder, et
s'y tenir : c'est ce découpage qui donne les commits.

## Le message

Le dépôt a une convention nette, visible dans `git log`. La suivre.

**Sujet** — français, à l'indicatif présent, à la troisième personne, ~50 caractères, pas
de point final, pas de préfixe `feat:`/`fix:`. Il décrit l'effet pour l'utilisateur, pas la
manipulation technique :

```
Ajoute les rayons pharmacie, librairie et multimédia
Rend lisibles les boutons pleins, en clair comme en sombre
Ne laisse plus la caméra tourner sans rien détecter
```

et non « Ajout de rayons », « update theme service », « fix: bouton ».

**Corps** — séparé par une ligne vide, en prose française, à la ligne vers 75 colonnes. Il
raconte **pourquoi**, pas quoi : ce qui n'allait pas avant, l'arbitrage qui a été tranché et
ce qui a été écarté, les conséquences non évidentes. Le diff dit déjà quels fichiers ont
changé — le corps dit ce que le diff ne peut pas dire.

**Pied** — terminer par :

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Écrire le message dans un fichier temporaire et utiliser `git commit -F`, pour garder les
retours à la ligne et les accents intacts.

## Ce qu'on ne fait pas

- pas de `git add -A` à l'aveugle : ajouter les fichiers du paquet, nommément ;
- pas de commit « wip », « fixup », « sauvegarde » ;
- pas de mélange refactoring + changement de comportement dans le même commit ;
- pas de `--amend` ni de `git reset` sur un commit déjà poussé ;
- pas de `push`, de PR, ni de modification de la branche distante sans demande explicite.
