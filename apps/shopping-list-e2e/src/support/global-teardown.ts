import { COVERAGE_ENABLED, coverageReport } from './coverage';

/** Fusionne les relevés de tous les workers et écrit le rapport. */
export default async function generateCoverageReport(): Promise<void> {
  if (!COVERAGE_ENABLED) return;

  const report = await coverageReport();
  await report.generate();
}
