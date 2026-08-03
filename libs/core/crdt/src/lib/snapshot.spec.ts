import * as Y from 'yjs';

import { addItem, createProduct, ensureList } from './operations';
import { catalogMap, itemsMap, YNode } from './schema';
import { readSnapshot } from './snapshot';
import { EMPTY_SNAPSHOT } from './types';

const LIST = 'maison';
const NOW = 1_764_000_000_000;

describe('projection du Y.Doc en objets ordinaires', () => {
  it('rend un document vierge indistinguable du snapshot vide', () => {
    expect(readSnapshot(new Y.Doc({ gc: true }))).toEqual(EMPTY_SNAPSHOT);
  });

  it('expose la liste, ses articles et l’usage du produit', () => {
    const doc = new Y.Doc({ gc: true });
    ensureList(doc, LIST, 'Maison', NOW);
    const productId = createProduct(
      doc,
      {
        label: 'Glace',
        description: 'vanille',
        defaultQty: '1 bac',
        category: 'surgeles',
        imageRef: 'emoji:🍦',
      },
      NOW,
    );
    const itemId = addItem(doc, {
      listId: LIST,
      productId,
      qty: '2 bacs',
      note: 'pour dimanche',
      addedBy: 'Evan',
      deviceId: 'device-A',
      now: NOW + 10,
    });

    expect(readSnapshot(doc)).toEqual({
      catalog: {
        [productId]: {
          id: productId,
          label: 'Glace',
          description: 'vanille',
          defaultQty: '1 bac',
          category: 'surgeles',
          imageRef: 'emoji:🍦',
          usage: { 'device-A': 1 },
          lastUsedAt: NOW + 10,
          archivedAt: null,
        },
      },
      lists: {
        [LIST]: {
          id: LIST,
          name: 'Maison',
          createdAt: NOW,
          items: {
            [itemId]: {
              id: itemId,
              productId,
              qty: '2 bacs',
              note: 'pour dimanche',
              checked: false,
              addedBy: 'Evan',
              createdAt: NOW + 10,
              removedAt: null,
            },
          },
        },
      },
    });
  });

  describe('lectures défensives', () => {
    it('complète un produit venu d’un schéma incomplet', () => {
      // Un document persisté par une version antérieure n'a pas forcément
      // toutes les clés, et son compteur d'usage peut n'être qu'un objet
      // ordinaire — auquel cas il n'est pas fusionnable, donc pas exploitable.
      const doc = new Y.Doc({ gc: true });
      const ancien: YNode = new Y.Map();
      ancien.set('label', 1970);
      ancien.set('usage', { 'device-A': 3 });
      catalogMap(doc).set('ancien', ancien);

      expect(readSnapshot(doc).catalog['ancien']).toEqual({
        id: 'ancien',
        label: '',
        description: '',
        defaultQty: '',
        category: '',
        imageRef: null,
        usage: {},
        lastUsedAt: 0,
        archivedAt: null,
      });
    });

    it('complète une ligne venue d’un schéma incomplet', () => {
      const doc = new Y.Doc({ gc: true });
      ensureList(doc, LIST, 'Maison', NOW);
      itemsMap(doc, LIST).set('ancienne', new Y.Map());

      expect(readSnapshot(doc).lists[LIST].items['ancienne']).toEqual({
        id: 'ancienne',
        productId: '',
        qty: null,
        note: null,
        checked: false,
        addedBy: '',
        createdAt: 0,
        removedAt: null,
      });
    });
  });
});
