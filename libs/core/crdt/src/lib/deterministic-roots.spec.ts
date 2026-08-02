import * as Y from 'yjs';

import { addItem, createProduct, ensureList } from './operations';
import { readSnapshot } from './snapshot';
import { forkReplica, syncPair } from './testing/replicas';

const LIST = 'maison';
const NOW = 1_764_000_000_000;

/**
 * Non-régression sur une perte de données réelle.
 *
 * Symptôme observé : une fois sur trois, recharger la page vidait la liste.
 *
 * Cause : au démarrage, l'application déclarait la liste par défaut sur un
 * `Y.Doc` encore vide, puis IndexedDB restaurait le document persisté qui
 * contenait *sa* liste. Tant que la liste était un nœud imbriqué créé par
 * `lists.set('maison', new Y.Map())`, les deux appareils créaient des nœuds
 * **distincts** ; la fusion n'en gardait qu'un, et le contenu du perdant
 * devenait inatteignable.
 *
 * Attendre IndexedDB n'aurait été qu'un pansement : le même scénario se
 * reproduit au premier appairage avec GitHub, quand le document distant arrive
 * après l'amorçage local.
 *
 * Correction : les articles vivent dans une racine `doc.getMap('items:<id>')`,
 * qui désigne le même type partagé sur tous les appareils, et les métadonnées
 * de liste sont des clés plates scalaires.
 */
describe('racines déterministes', () => {
  it('ne perd pas les articles quand deux appareils déclarent la même liste', () => {
    // L'appareil qui a déjà des courses en cours.
    const stored = new Y.Doc({ gc: true });
    ensureList(stored, LIST, 'Nos courses', NOW);
    const productId = createProduct(stored, { label: 'Lait' }, NOW);
    addItem(stored, {
      listId: LIST,
      productId,
      addedBy: 'Evan',
      deviceId: 'device-A',
      now: NOW,
    });

    // L'onglet qui vient de démarrer et amorce la liste sur un document vide.
    const booting = new Y.Doc({ gc: true });
    ensureList(booting, LIST, 'Nos courses', NOW + 1);

    syncPair(stored, booting);

    for (const [name, doc] of [
      ['restauré', stored],
      ['amorcé', booting],
    ] as const) {
      const items = readSnapshot(doc).lists[LIST].items;
      expect(Object.values(items), `document ${name}`).toHaveLength(1);
      expect(Object.values(items)[0].productId, `document ${name}`).toBe(
        productId,
      );
    }
  });

  it('fusionne les articles ajoutés des deux côtés avant tout échange', () => {
    const phoneA = new Y.Doc({ gc: true });
    ensureList(phoneA, LIST, 'Nos courses', NOW);
    const lait = createProduct(phoneA, { label: 'Lait' }, NOW);
    addItem(phoneA, {
      listId: LIST,
      productId: lait,
      addedBy: 'Evan',
      deviceId: 'device-A',
      now: NOW,
    });

    // Le second téléphone n'a jamais vu le premier : il déclare la liste, lui
    // aussi, et y met ses propres articles.
    const phoneB = new Y.Doc({ gc: true });
    ensureList(phoneB, LIST, 'Nos courses', NOW);
    const pain = createProduct(phoneB, { label: 'Pain' }, NOW);
    addItem(phoneB, {
      listId: LIST,
      productId: pain,
      addedBy: 'Épouse',
      deviceId: 'device-B',
      now: NOW,
    });

    syncPair(phoneA, phoneB);

    const labelsOf = (doc: Y.Doc): string[] => {
      const snapshot = readSnapshot(doc);
      return Object.values(snapshot.lists[LIST].items)
        .map((item) => snapshot.catalog[item.productId].label)
        .sort();
    };

    expect(labelsOf(phoneA)).toEqual(['Lait', 'Pain']);
    expect(labelsOf(phoneB)).toEqual(['Lait', 'Pain']);
  });

  it('garde la liste déclarée idempotente', () => {
    const doc = new Y.Doc({ gc: true });
    ensureList(doc, LIST, 'Nos courses', NOW);
    ensureList(doc, LIST, 'Autre nom', NOW + 5000);

    const list = readSnapshot(doc).lists[LIST];
    expect(list.name).toBe('Nos courses');
    expect(list.createdAt).toBe(NOW);
  });

  it('n’expose pas de liste tant qu’aucune n’a été déclarée', () => {
    const doc = new Y.Doc({ gc: true });
    expect(readSnapshot(doc).lists).toEqual({});
  });

  it('conserve les articles d’une réplique clonée puis modifiée', () => {
    const origin = new Y.Doc({ gc: true });
    ensureList(origin, LIST, 'Nos courses', NOW);
    const productId = createProduct(origin, { label: 'Pommes' }, NOW);
    addItem(origin, {
      listId: LIST,
      productId,
      addedBy: 'Evan',
      deviceId: 'device-A',
      now: NOW,
    });

    const replica = forkReplica(origin);
    ensureList(replica, LIST, 'Nos courses', NOW + 10);

    expect(Object.values(readSnapshot(replica).lists[LIST].items)).toHaveLength(
      1,
    );
  });
});
