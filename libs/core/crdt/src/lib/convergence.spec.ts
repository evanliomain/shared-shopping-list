import * as Y from 'yjs';

import {
  addItem,
  clearCheckedItems,
  createProduct,
  ensureList,
  removeItem,
  setItemChecked,
  setItemQty,
  updateProduct,
} from './operations';
import { readSnapshot } from './snapshot';
import { forkReplica, pick, seededRandom, syncAll } from './testing/replicas';
import { CrdtSnapshot, ProductId } from './types';

const LIST = 'maison';
const NOW = 1_764_000_000_000;

/**
 * Le test qui protège tout le reste.
 *
 * Si la convergence est acquise, alors la synchro GitHub, l'échange par QR et
 * la file hors ligne peuvent délivrer les deltas dans n'importe quel ordre,
 * en double, ou avec des heures de retard : les appareils finiront identiques.
 * Tout le reste de l'architecture repose là-dessus.
 */
describe('convergence du CRDT', () => {
  function seedCatalog(doc: Y.Doc): ProductId[] {
    ensureList(doc, LIST, 'Maison', NOW);
    return [
      createProduct(doc, { label: 'Yaourt', description: 'vanille' }, NOW),
      createProduct(doc, { label: 'Yaourt', description: 'Firen' }, NOW),
      createProduct(doc, { label: 'Pain' }, NOW),
      createProduct(doc, { label: 'Lait' }, NOW),
      createProduct(doc, { label: 'Pommes' }, NOW),
    ];
  }

  /** Applique une opération plausible, tirée au sort. */
  function applyRandomOperation(
    doc: Y.Doc,
    deviceId: string,
    products: readonly ProductId[],
    random: () => number,
    clock: number,
  ): void {
    const snapshot = readSnapshot(doc);
    const items = Object.values(snapshot.lists[LIST]?.items ?? {});
    const operation = Math.floor(random() * 6);

    doc.transact(() => {
      switch (operation) {
        case 0:
          addItem(doc, {
            listId: LIST,
            productId: pick(random, products),
            addedBy: deviceId,
            deviceId,
            now: clock,
          });
          return;

        case 1:
          if (items.length > 0) {
            const item = pick(random, items);
            setItemChecked(doc, LIST, item.id, !item.checked);
          }
          return;

        case 2:
          if (items.length > 0) {
            removeItem(doc, LIST, pick(random, items).id, clock);
          }
          return;

        case 3:
          if (items.length > 0) {
            setItemQty(doc, LIST, pick(random, items).id, `${operation} u`);
          }
          return;

        case 4:
          updateProduct(doc, pick(random, products), {
            description: `variante ${clock % 7}`,
          });
          return;

        default:
          clearCheckedItems(doc, LIST, clock);
          return;
      }
    });
  }

  /**
   * Les identifiants d'articles sont tirés aléatoirement, donc deux répliques
   * peuvent créer des lignes différentes. On compare le contenu observable,
   * pas les clés techniques.
   */
  function comparable(snapshot: CrdtSnapshot): unknown {
    const list = snapshot.lists[LIST];
    return {
      catalog: Object.values(snapshot.catalog)
        .map((p) => ({
          label: p.label,
          description: p.description,
          usage: p.usage,
          archivedAt: p.archivedAt,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      items: Object.values(list?.items ?? {})
        .map((i) => ({
          productId: i.productId,
          qty: i.qty,
          checked: i.checked,
          removed: null !== i.removedAt,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    };
  }

  // Plusieurs graines : chacune produit un entrelacement d'opérations différent.
  it.each([1, 7, 42, 1337, 90210])(
    'trois répliques modifiées hors ligne convergent (graine %i)',
    (seed) => {
      const random = seededRandom(seed);

      const origin = new Y.Doc({ gc: true });
      const products = seedCatalog(origin);

      const replicas = [
        forkReplica(origin),
        forkReplica(origin),
        forkReplica(origin),
      ];

      // Chaque appareil travaille dans son coin, sans réseau.
      for (let step = 0; step < 40; step++) {
        const index = Math.floor(random() * replicas.length);
        applyRandomOperation(
          replicas[index],
          `device-${index}`,
          products,
          random,
          NOW + step * 1000,
        );
      }

      // Puis tout le monde se resynchronise, dans un ordre quelconque.
      syncAll(replicas);

      const [first, ...others] = replicas.map((doc) =>
        comparable(readSnapshot(doc)),
      );
      for (const other of others) {
        expect(other).toEqual(first);
      }
    },
  );

  it('appliquer deux fois le même delta ne change rien', () => {
    const origin = new Y.Doc({ gc: true });
    const [product] = seedCatalog(origin);

    const replica = forkReplica(origin);
    origin.transact(() =>
      addItem(origin, {
        listId: LIST,
        productId: product,
        addedBy: 'A',
        deviceId: 'device-A',
        now: NOW,
      }),
    );

    const delta = Y.encodeStateAsUpdate(origin);
    Y.applyUpdate(replica, delta);
    const afterFirst = readSnapshot(replica);
    Y.applyUpdate(replica, delta);
    const afterSecond = readSnapshot(replica);

    expect(afterSecond).toEqual(afterFirst);
  });

  it('l’ordre d’arrivée des deltas est indifférent', () => {
    const origin = new Y.Doc({ gc: true });
    const products = seedCatalog(origin);

    const author = forkReplica(origin);
    const deltas: Uint8Array[] = [];
    let previous = Y.encodeStateVector(author);

    for (const productId of products) {
      author.transact(() =>
        addItem(author, {
          listId: LIST,
          productId,
          addedBy: 'A',
          deviceId: 'device-A',
          now: NOW,
        }),
      );
      deltas.push(Y.encodeStateAsUpdate(author, previous));
      previous = Y.encodeStateVector(author);
    }

    const inOrder = forkReplica(origin);
    for (const delta of deltas) {
      Y.applyUpdate(inOrder, delta);
    }

    const reversed = forkReplica(origin);
    for (const delta of [...deltas].reverse()) {
      Y.applyUpdate(reversed, delta);
    }

    expect(readSnapshot(reversed)).toEqual(readSnapshot(inOrder));
  });
});
