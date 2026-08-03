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

/**
 * Le `Blob` de jsdom s'arrête à `slice`, `size` et `type` : ni `arrayBuffer`,
 * ni `text`. Or c'est par `arrayBuffer` que la réduction d'image récupère les
 * octets encodés. `FileReader`, lui, est bien là.
 */
if (undefined === Blob.prototype.arrayBuffer) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    value: function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    },
  });
}
