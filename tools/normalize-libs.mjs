/**
 * Rectifie ce que le générateur Nx produit pour nos bibliothèques.
 *
 * Deux corrections, appliquées à chaque lib :
 *
 *  1. `src/test-setup.ts` — le générateur écrit un setup basé sur zone.js.
 *     L'application est zoneless, et zone.js n'est même pas installé.
 *     On le remplace par `setupTestBed()`, qui provisionne
 *     `provideZonelessChangeDetection()`.
 *
 *  2. `project.json` — le générateur écrit
 *     `outputs: ["{options.reportsDirectory}"]`, qui vaut `../../../coverage/…`
 *     et que Nx refuse ("Cache output is outside the workspace").
 *     On retire la clé pour retomber sur le `targetDefaults` de nx.json, qui
 *     utilise `{workspaceRoot}/coverage/{projectRoot}`.
 *
 *   node tools/normalize-libs.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIBS = join(ROOT, 'libs');

const TEST_SETUP = `import '@angular/compiler';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

// L'application est zoneless : pas de zone.js, y compris en test.
setupTestBed();
`;

/** Remonte tous les project.json sous libs/. */
function findProjects(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    if (entry === 'node_modules' || entry === 'src') continue;

    try {
      statSync(join(path, 'project.json'));
      found.push(path);
    } catch {
      found.push(...findProjects(path));
    }
  }
  return found;
}

let touched = 0;

for (const projectDir of findProjects(LIBS)) {
  const relative = projectDir.slice(ROOT.length + 1);
  const changes = [];

  const setupPath = join(projectDir, 'src', 'test-setup.ts');
  try {
    if (readFileSync(setupPath, 'utf8') !== TEST_SETUP) {
      writeFileSync(setupPath, TEST_SETUP);
      changes.push('test-setup zoneless');
    }
  } catch {
    // Pas de test-setup : rien à faire.
  }

  const projectPath = join(projectDir, 'project.json');
  const project = JSON.parse(readFileSync(projectPath, 'utf8'));
  if (project.targets?.test?.outputs) {
    delete project.targets.test.outputs;
    writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
    changes.push('outputs de couverture');
  }

  if (changes.length > 0) {
    touched++;
    console.log(`✔ ${relative} — ${changes.join(', ')}`);
  }
}

console.log(
  touched === 0
    ? '── rien à rectifier'
    : `── ${touched} bibliothèque(s) rectifiée(s)`,
);
