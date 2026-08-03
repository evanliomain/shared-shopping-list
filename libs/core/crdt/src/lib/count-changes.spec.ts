import * as Y from 'yjs';

import { countTouchedEntities } from './count-changes';
import {
  addItem,
  createProduct,
  ensureList,
  setItemChecked,
  setItemNote,
  setItemQty,
  updateProduct,
} from './operations';
import { forkReplica } from './testing/replicas';
import { ItemId, ProductId } from './types';

const LIST = 'maison';
const NOW = 1_764_000_000_000;

function freshDoc(): Y.Doc {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, LIST, 'Maison', NOW);
  return doc;
}

function put(doc: Y.Doc, productId: ProductId, now = NOW): ItemId {
  return addItem(doc, {
    listId: LIST,
    productId,
    addedBy: 'Épouse',
    deviceId: 'device-B',
    now,
  });
}

/** Ce qui manque à `local` pour rattraper `remote`, comme le fera le QR code. */
function deltaFor(remote: Y.Doc, local: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(remote, Y.encodeStateVector(local));
}

describe('comptage des entités touchées', () => {
  it('compte le produit et la ligne apportés comme deux entités', () => {
    const local = freshDoc();
    const remote = forkReplica(local);

    remote.transact(() => {
      put(remote, createProduct(remote, { label: 'Lait' }, NOW));
    });
    const delta = deltaFor(remote, local);

    expect(countTouchedEntities(local, () => Y.applyUpdate(local, delta))).toBe(
      2,
    );
  });

  it('ne compte qu’une entité quand plusieurs de ses clés changent', () => {
    // « une modification » est ce que voit celui qui regarde l'écran : cocher
    // un article et corriger sa quantité, c'est un article touché.
    const local = freshDoc();
    const itemId = put(local, createProduct(local, { label: 'Lait' }, NOW));
    const remote = forkReplica(local);

    remote.transact(() => {
      setItemChecked(remote, LIST, itemId, true);
      setItemQty(remote, LIST, itemId, '2 L');
      setItemNote(remote, LIST, itemId, 'demi-écrémé');
    });
    const delta = deltaFor(remote, local);

    expect(countTouchedEntities(local, () => Y.applyUpdate(local, delta))).toBe(
      1,
    );
  });

  it('compte les modifications d’entités déjà connues', () => {
    // Le cas courant en rayon, et la raison pour laquelle on observe le
    // document au lieu de décoder le delta : celui-ci ne porte que les
    // opérations manquantes, et l'appliquer à un document vide donnerait zéro.
    const local = freshDoc();
    const yaourt = createProduct(local, { label: 'Yaourt' }, NOW);
    const pain = createProduct(local, { label: 'Pain' }, NOW);
    const remote = forkReplica(local);

    remote.transact(() => {
      updateProduct(remote, yaourt, { description: 'à la vanille' });
      updateProduct(remote, pain, { defaultQty: 'x2' });
    });
    const delta = deltaFor(remote, local);

    expect(countTouchedEntities(local, () => Y.applyUpdate(local, delta))).toBe(
      2,
    );
  });

  it('n’annonce rien quand le delta a déjà été appliqué', () => {
    const local = freshDoc();
    const productId = createProduct(local, { label: 'Lait' }, NOW);
    const remote = forkReplica(local);

    put(remote, productId);
    const delta = deltaFor(remote, local);
    Y.applyUpdate(local, delta);

    expect(countTouchedEntities(local, () => Y.applyUpdate(local, delta))).toBe(
      0,
    );
  });

  it('compte séparément les entités de deux listes', () => {
    const local = freshDoc();
    ensureList(local, 'parents', 'Chez les parents', NOW);
    const productId = createProduct(local, { label: 'Pain' }, NOW);
    const remote = forkReplica(local);

    remote.transact(() => {
      put(remote, productId);
      addItem(remote, {
        listId: 'parents',
        productId,
        addedBy: 'Épouse',
        deviceId: 'device-B',
        now: NOW,
      });
    });
    const delta = deltaFor(remote, local);

    // Une ligne par liste, plus le produit dont l'usage a été incrémenté.
    expect(countTouchedEntities(local, () => Y.applyUpdate(local, delta))).toBe(
      3,
    );
  });

  it('laisse remonter l’échec de l’application', () => {
    const local = freshDoc();

    expect(() =>
      countTouchedEntities(local, () => {
        throw new Error('delta illisible');
      }),
    ).toThrow('delta illisible');
  });
});
