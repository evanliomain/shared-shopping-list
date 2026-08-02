#!/usr/bin/env bash
# Génère les bibliothèques Nx du projet.
#
# Deux réglages non évidents :
#  - --unitTestRunner=vitest-analog : vitest-angular impose des libs buildables,
#    or on veut des libs non-buildables, bundlées directement avec l'app.
#  - --skipPackageJson : sinon chaque génération relance un npm install complet.
#
# Après génération, `tools/normalize-libs.mjs` rectifie le setup de test
# (zoneless) et les chemins de couverture.
set -euo pipefail

gen () {
  local path="$1" name="$2" tags="$3"
  if [ -d "libs/$path" ]; then
    echo "· libs/$path (déjà présente)"
    return
  fi
  npx nx g @nx/angular:library "libs/$path" \
    --name="$name" \
    --importPath="@shopping-list/$path" \
    --prefix=sl \
    --standalone=true \
    --unitTestRunner=vitest-analog \
    --linter=eslint \
    --strict=true \
    --skipModule=true \
    --skipPackageJson=true \
    --tags="$tags" \
    --skipFormat \
    --no-interactive > /dev/null
  echo "✔ libs/$path"
}

gen "util/categories"     "util-categories"     "type:util,scope:shared"
gen "ui"                  "ui"                  "type:ui,scope:shared"
gen "core/crdt"           "core-crdt"           "type:core,scope:shared"
gen "core/sync"           "core-sync"           "type:core,scope:shared"
gen "core/sync-indexeddb" "core-sync-indexeddb" "type:core,scope:shared"
gen "data-access/list"    "data-access-list"    "type:data-access,scope:shared"
gen "data-access/catalog" "data-access-catalog" "type:data-access,scope:shared"
gen "feature/list"        "feature-list"        "type:feature,scope:shared"
gen "feature/product"     "feature-product"     "type:feature,scope:shared"

echo "── toutes les bibliothèques sont générées"
