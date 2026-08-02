import * as Y from 'yjs';

/**
 * Outils pour simuler plusieurs appareils dans les tests.
 *
 * L'idée est de reproduire ce qui se passe réellement : chacun travaille sur sa
 * réplique, hors ligne, puis les répliques s'échangent des deltas dans un ordre
 * quelconque.
 */

/** Générateur pseudo-aléatoire déterministe — un test qui échoue doit rejouer. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

/**
 * Échange bidirectionnel de deltas entre deux répliques.
 *
 * On passe par les vecteurs d'état, exactement comme le fera l'échange par QR
 * code : chacun n'envoie que ce qui manque à l'autre.
 */
export function syncPair(a: Y.Doc, b: Y.Doc): void {
  const aToB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const bToA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, aToB);
  Y.applyUpdate(a, bToA);
}

/**
 * Fait converger un ensemble de répliques.
 *
 * Plusieurs passes sont nécessaires : avec trois répliques ou plus, un seul
 * tour de paires ne propage pas forcément tout le monde à tout le monde.
 */
export function syncAll(docs: readonly Y.Doc[], rounds = 3): void {
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        syncPair(docs[i], docs[j]);
      }
    }
  }
}

/** Clone l'état d'un document dans une nouvelle réplique. */
export function forkReplica(source: Y.Doc): Y.Doc {
  const replica = new Y.Doc({ gc: true });
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(source));
  return replica;
}
