import * as Y from 'yjs';

import { addItem, createProduct, ensureList } from './operations';
import { catalogMap, imageCreditsMap, itemsMap, YNode } from './schema';
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
          bankImageRef: null,
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
      credits: {},
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
        bankImageRef: null,
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

    it('complète un crédit dont un champ n’est pas une chaîne', () => {
      // Les crédits arrivent par la synchro, donc d'un appareil dont on ne
      // maîtrise pas la version. Un champ mal typé doit se lire comme vide, pas
      // faire tomber l'écran au milieu des courses.
      const doc = new Y.Doc({ gc: true });
      const credits = imageCreditsMap(doc);
      credits.set('author:a3f9c2', 'skyseeker');
      credits.set('license:a3f9c2', 1970 as unknown as string);

      expect(readSnapshot(doc).credits['a3f9c2']).toEqual({
        title: '',
        author: 'skyseeker',
        license: '',
        licenseUrl: '',
        sourceUrl: '',
      });
    });

    it('n’invente pas de crédit pour une image qui n’a pas d’auteur', () => {
      // Sans auteur il n'y a rien à créditer : la clé ne doit pas apparaître.
      const doc = new Y.Doc({ gc: true });
      imageCreditsMap(doc).set('title:a3f9c2', 'Avocado');

      expect(readSnapshot(doc).credits).toEqual({});
    });
  });
});
