/**
 * jsdom expose `crypto.getRandomValues` mais pas `crypto.subtle`, dont on a
 * besoin pour SHA-256. Node l'implémente : on le lui emprunte.
 *
 * Ce fichier n'est chargé que par Vitest ; rien n'en arrive dans le bundle.
 */
import { webcrypto } from 'node:crypto';

if (undefined === globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: webcrypto.subtle,
  });
}
