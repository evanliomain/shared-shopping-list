import * as Y from 'yjs';

import { createProduct } from './operations';
import { productNode } from './schema';
import { readSnapshot } from './snapshot';
import { forkReplica, syncPair } from './testing/replicas';
import { incrementUsage, usageTotal } from './usage-counter';

const NOW = 1_764_000_000_000;

describe('G-Counter d’usage', () => {
  it('somme les compteurs de tous les appareils', () => {
    expect(usageTotal({})).toBe(0);
    expect(usageTotal({ a: 4, b: 3 })).toBe(7);
  });

  it('ne perd pas les incréments concurrents de deux appareils hors ligne', () => {
    // Le test qui justifie l'existence du G-Counter. Avec un simple entier LWW,
    // les deux appareils passeraient de 0 à 1 et la fusion garderait 1.
    const origin = new Y.Doc({ gc: true });
    const productId = createProduct(origin, { label: 'Yaourt' }, NOW);

    const phoneA = forkReplica(origin);
    const phoneB = forkReplica(origin);

    // Chacun ajoute le produit à sa liste, hors ligne, sans voir l'autre.
    incrementUsage(productNode(phoneA, productId)!, 'device-A');
    incrementUsage(productNode(phoneB, productId)!, 'device-B');

    syncPair(phoneA, phoneB);

    const usageA = readSnapshot(phoneA).catalog[productId].usage;
    const usageB = readSnapshot(phoneB).catalog[productId].usage;

    expect(usageA).toEqual({ 'device-A': 1, 'device-B': 1 });
    expect(usageB).toEqual(usageA);
    expect(usageTotal(usageA)).toBe(2);
  });

  it('accumule les incréments successifs du même appareil', () => {
    const doc = new Y.Doc({ gc: true });
    const productId = createProduct(doc, { label: 'Pain' }, NOW);

    incrementUsage(productNode(doc, productId)!, 'device-A');
    incrementUsage(productNode(doc, productId)!, 'device-A');
    incrementUsage(productNode(doc, productId)!, 'device-B');

    expect(usageTotal(readSnapshot(doc).catalog[productId].usage)).toBe(3);
  });
});
