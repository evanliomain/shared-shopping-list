import { test as base } from '@playwright/test';

import { COVERAGE_ENABLED, coverageReport } from './coverage';

/**
 * `test` étendu d'un relevé de couverture.
 *
 * Playwright n'offre aucun crochet global sur les pages : la seule façon
 * d'instrumenter *tous* les parcours est de leur donner un `test` qui embarque
 * une fixture `auto`. Les specs importent donc `test` d'ici plutôt que de
 * `@playwright/test` — c'est le seul effet visible côté test.
 */
export const test = base.extend<{ coverage: void }>({
  coverage: [
    async ({ page, browserName }, use) => {
      // `page.coverage` passe par le protocole Chrome DevTools, que WebKit
      // n'expose pas. Les parcours Mobile Safari tournent donc sans relevé, et
      // le rapport ne parle que de ce que Chromium a exécuté.
      const collecting = COVERAGE_ENABLED && 'chromium' === browserName;

      if (collecting) {
        // Sans `resetOnNavigation: false`, un `page.reload()` — il y en a —
        // effacerait tout ce qui précède.
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      }

      await use();

      if (collecting) {
        const entries = await page.coverage.stopJSCoverage();

        // Certains tests ne parlent qu'à `request` et n'ouvrent jamais la page :
        // ils n'ont aucun script à déclarer, et Monocart refuse un relevé vide.
        if (0 < entries.length) {
          // Chaque worker Playwright est un processus : il dépose ses données
          // dans le cache de Monocart, que `generate()` fusionne à la fin.
          const report = await coverageReport();
          await report.add(entries);
        }
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
