import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    // L'application suit la langue du navigateur. On la fixe ici pour que les
    // parcours s'écrivent dans une langue connue, plutôt que dans celle de la
    // machine qui lance les tests. `langue.spec.ts` couvre la bascule.
    locale: 'fr-FR',
  },
  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npx nx run shopping-list:serve',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  // L'app est mobile d'abord : on teste les deux moteurs qui comptent
  // réellement (Chrome Android côté Android, WebKit côté iOS) plus un
  // desktop pour le poste de préparation de la liste.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
});
