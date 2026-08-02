/**
 * jsdom n'expose pas `CompressionStream`, contrairement à tous les navigateurs
 * visés (Chrome 80+, Safari 16.4+) et à Node lui-même. On emprunte donc
 * l'implémentation de Node pour les tests.
 *
 * Ce fichier n'est chargé que par Vitest : rien n'en arrive dans le bundle.
 */
import {
  CompressionStream as NodeCompressionStream,
  DecompressionStream as NodeDecompressionStream,
} from 'node:stream/web';

const holder = globalThis as unknown as Record<string, unknown>;

holder['CompressionStream'] ??= NodeCompressionStream;
holder['DecompressionStream'] ??= NodeDecompressionStream;
