import { workspaceRoot } from '@nx/devkit';
import { join } from 'node:path';

/**
 * Couverture des parcours end-to-end.
 *
 * Le navigateur n'exécute pas nos `.ts` mais leur compilation. V8 sait dire
 * quelles portions de ce JavaScript ont tourné, et les *source maps* du serveur
 * de développement savent les ramener aux fichiers d'origine. Monocart fait ce
 * chemin inverse et écrit un `coverage-summary.json` au même format que Vitest —
 * c'est ce qui permet d'afficher les deux couvertures côte à côte.
 *
 * Le relevé est optionnel : il ralentit chaque test, et personne ne le lit en
 * local. `E2E_COVERAGE=true` l'allume, la CI le fait.
 */
export const COVERAGE_ENABLED = 'true' === process.env['E2E_COVERAGE'];

/**
 * Les chemins remontés par les *source maps* sont absolus, parfois préfixés par
 * l'alias `/@fs/` du serveur. On les ramène à la racine du dépôt pour que le
 * rapport se lise comme le code.
 */
const REPO_RELATIVE = /^.*?(?=(?:libs|apps)\/)/;

const options = {
  name: 'Couverture end-to-end',
  // Nx lance Playwright depuis le dossier du projet : un chemin relatif
  // écrirait dans `apps/shopping-list-e2e/coverage`.
  outputDir: join(workspaceRoot, 'coverage', 'e2e'),
  // `json-summary` alimente tools/rapport-couverture.mjs, `lcovonly`
  // l'artefact, `v8` la page HTML qu'on ouvre quand un chiffre surprend.
  // Pas de `console-summary` : il compte en octets de bundle, et afficher un
  // second pourcentage à côté de celui du rapport ne ferait que semer le doute.
  reports: ['json-summary', 'lcovonly', 'v8'],
  // Le navigateur charge aussi le runtime Angular, Yjs et les pré-bundles de
  // Vite. Les écarter tôt évite de résoudre des source maps pour rien.
  entryFilter: (entry: { url: string }) =>
    !entry.url.includes('/node_modules/'),
  // Le `.ts` est délibéré : les bibliothèques ne comptent que leurs `.ts` en
  // unitaire, et deux chiffres ne se comparent que s'ils comptent la même chose.
  sourceFilter: (sourcePath: string) =>
    /(^|\/)(libs|apps\/shopping-list\/src)\//.test(sourcePath) &&
    sourcePath.endsWith('.ts'),
  sourcePath: (filePath: string) => filePath.replace(REPO_RELATIVE, ''),
};

/**
 * Monocart n'est chargé qu'au moment de relever. Les parcours doivent pouvoir
 * tourner sans lui : c'est un outil de mesure, pas une dépendance des tests.
 */
export async function coverageReport() {
  const { default: MCR } = await import('monocart-coverage-reports');

  return MCR(options);
}
