# Consignes de travail

- **Commiter régulièrement** : dès qu'un paquet fonctionnel est fait, sans attendre la fin de
  la demande et sans redemander l'autorisation. Charger la skill `commit-regulier`
  (`.claude/skills/commit-regulier/SKILL.md`) au début de toute tâche qui modifie du code —
  elle définit ce qu'est un paquet, la procédure de vérification et la convention de message.

- **Relecture sévère en fin de session** : la skill `critique-code`
  (`.claude/skills/critique-code/SKILL.md`) est déclenchée automatiquement par le hook
  `Stop` (`.claude/hooks/critique.sh`) dès qu'une session a produit du code. Elle relit la
  correction, les conventions et les messages de commit, puis range ses corrections dans
  les commits d'origine via `--fixup` et `git rebase --autosquash`.

📐 Architecture, modèle CRDT et choix techniques : [docs/architecture.md](docs/architecture.md).
Commandes et démarrage : [README.md](README.md).
