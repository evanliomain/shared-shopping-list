#!/usr/bin/env bash
#
# Déclenche la relecture sévère (skill « critique-code ») sur le travail d'une session.
#
# Deux points d'entrée, câblés dans .claude/settings.json :
#   critique.sh start   (SessionStart) — mémorise le commit de départ de la session
#   critique.sh stop    (Stop)         — si du code a été produit depuis, empêche Claude
#                                        de s'arrêter tant que la relecture n'a pas eu lieu
#
# Trois garde-fous, sans quoi le hook tournerait en boucle ou jacasserait :
#   1. `stop_hook_active` : la relecture vient de tourner — on enregistre l'état qu'elle
#      laisse, ses propres corrections comprises, et on se tait ;
#   2. aucun changement depuis <base> : rien à relire ;
#   3. empreinte identique à la dernière relecture : déjà vu, on se tait.
#
# `--no-optional-locks` sur chaque commande git n'est pas décoratif : sans lui, un `git
# diff` concurrent — l'extension git de l'éditeur scrute le dépôt en permanence — échoue
# sur `index.lock`, rend une sortie vide, et l'empreinte change sans que rien n'ait bougé.
# La relecture se redéclenchait alors au hasard. Toute commande git qui échoue ici fait
# sortir en silence : mieux vaut une relecture manquée qu'une relecture parasite.
#
set -uo pipefail

mode=${1:-stop}
payload=$(cat)

git rev-parse --git-dir >/dev/null 2>&1 || exit 0
etat="$(git rev-parse --git-dir)/claude-critique"
mkdir -p "$etat" || exit 0

session=$(printf '%s' "$payload" | jq -r '.session_id // "hors-session"')
actif=$(printf '%s' "$payload" | jq -r '.stop_hook_active // false')

if [ "$mode" = 'start' ]; then
  git rev-parse HEAD > "$etat/$session.base" 2>/dev/null
  exit 0
fi

base=$(cat "$etat/$session.base" 2>/dev/null || true)
# Session ouverte avant l'installation du hook, ou commit de départ disparu (rebase,
# reset) : on se rabat sur HEAD, ce qui limite la relecture aux changements non commités.
git cat-file -e "${base:-x}^{commit}" 2>/dev/null || base=$(git rev-parse HEAD 2>/dev/null) || exit 0

modifie=$(git --no-optional-locks diff "$base") || exit 0
nouveaux=$(git --no-optional-locks ls-files --others --exclude-standard | sort) || exit 0

[ -n "$modifie$nouveaux" ] || exit 0

# Le contenu des fichiers non suivis compte : un fichier neuf n'apparaît pas dans `git diff`.
courante=$(
  {
    printf '%s\n' "$modifie" "$nouveaux"
    [ -z "$nouveaux" ] || printf '%s\n' "$nouveaux" | while IFS= read -r f; do
      cat -- "$f" 2>/dev/null
    done
  } | shasum | cut -d' ' -f1
)

if [ "$actif" = 'true' ]; then
  printf '%s' "$courante" > "$etat/$session.vue"
  exit 0
fi

[ "$courante" != "$(cat "$etat/$session.vue" 2>/dev/null || true)" ] || exit 0

printf '%s' "$courante" > "$etat/$session.vue"

raison="Cette session a produit du code. Avant de t'arrêter, charge la skill « critique-code » \
(.claude/skills/critique-code/SKILL.md) et applique-la intégralement, sans en sauter d'étape.

Périmètre : les changements depuis $base — \`git diff $base\`, les fichiers non suivis, et les \
messages de \`git log $base..HEAD\`.

Rends le rapport au format imposé par la skill, puis range les corrections que la skill \
t'autorise à faire dans les commits d'origine (--fixup / amend!, puis \
\`git rebase --autosquash $base\`). Ne relance pas de relecture sur tes propres corrections."

jq -n --arg raison "$raison" '{
  decision: "block",
  reason: $raison,
  systemMessage: "Relecture sévère déclenchée sur le travail de la session."
}'
