/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/feature/catalog',
  plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  test: {
    name: 'feature-catalog',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/feature/catalog',
      provider: 'v8' as const,
      // `json-summary` alimente tools/rapport-couverture.mjs, `lcovonly`
      // l'artefact téléchargeable, `text-summary` la sortie du terminal.
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      // Vitest 4 n'exclut plus rien par défaut, et ne compte que les fichiers
      // chargés par un test : sans `include`, une lib non testée n'apparaît
      // pas du tout au lieu d'apparaître à 0 %.
      include: ['src/**/*.ts'],
      exclude: ['src/test-setup.ts', '**/*.spec.ts', 'src/**/testing/**'],
    },
  },
}));
