/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/feature/nearby',
  plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  test: {
    name: 'feature-nearby',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-polyfills.ts', 'src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/feature/nearby',
      provider: 'v8' as const,
      // `json-summary` alimente tools/rapport-couverture.mjs, `lcovonly`
      // l'artefact téléchargeable, `text-summary` la sortie du terminal.
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      // Vitest 4 n'exclut plus rien par défaut, et ne compte que les fichiers
      // chargés par un test : sans `include`, une lib non testée n'apparaît
      // pas du tout au lieu d'apparaître à 0 %.
      include: ['src/**/*.ts'],
      exclude: ['src/test-setup.ts', '**/*.spec.ts', 'src/**/testing/**'],
      // Le dépôt est à 100 % : ce seuil est un cliquet, pas une cible. Sans
      // lui, la couverture redescend au premier test oublié et personne ne le
      // voit avant la revue. `perFile` nomme le fichier fautif au lieu de
      // n'annoncer qu'un total en baisse.
      thresholds: {
        perFile: true,
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
}));
