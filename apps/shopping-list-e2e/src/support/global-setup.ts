import { COVERAGE_ENABLED, coverageReport } from './coverage';

/**
 * Repart d'un cache vide.
 *
 * Monocart accumule les relevés de tous les workers dans un cache sur disque.
 * Un run interrompu le laisse derrière lui, et le suivant annoncerait la
 * couverture des deux.
 */
export default async function cleanCoverageCache(): Promise<void> {
  if (!COVERAGE_ENABLED) return;

  const report = await coverageReport();
  await report.cleanCache();
}
