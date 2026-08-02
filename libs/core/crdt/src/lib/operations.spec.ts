import * as Y from 'yjs';

import {
  addItem,
  archiveProduct,
  clearCheckedItems,
  createProduct,
  ensureList,
  removeItem,
  restoreItem,
  setItemChecked,
  updateProduct,
} from './operations';
import { readSnapshot } from './snapshot';
import { forkReplica, syncPair } from './testing/replicas';
import { usageTotal } from './usage-counter';

const LIST = 'maison';
const NOW = 1_764_000_000_000;

function freshDoc(): Y.Doc {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, LIST, 'Maison', NOW);
  return doc;
}

function itemsOf(doc: Y.Doc) {
  return Object.values(readSnapshot(doc).lists[LIST].items);
}

describe('opérations sur le CRDT', () => {
  describe('ensureList', () => {
    it('est idempotent', () => {
      const doc = freshDoc();
      ensureList(doc, LIST, 'Renommée ?', NOW + 1);

      const lists = readSnapshot(doc).lists;
      expect(Object.keys(lists)).toEqual([LIST]);
      expect(lists[LIST].name).toBe('Maison');
    });
  });

  describe('addItem', () => {
    it('crée la ligne et incrémente l’usage du produit', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);

      addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });

      const snapshot = readSnapshot(doc);
      const [item] = Object.values(snapshot.lists[LIST].items);

      expect(item.productId).toBe(productId);
      expect(item.checked).toBe(false);
      expect(item.addedBy).toBe('Evan');
      expect(usageTotal(snapshot.catalog[productId].usage)).toBe(1);
      expect(snapshot.catalog[productId].lastUsedAt).toBe(NOW);
    });

    it('réutilise la ligne existante au lieu de créer un doublon', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);

      const first = addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });
      setItemChecked(doc, LIST, first, true);

      const second = addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW + 1000,
      });

      expect(second).toBe(first);
      expect(itemsOf(doc)).toHaveLength(1);
      // Remettre un article déjà coché doit le décocher : on le veut à nouveau.
      expect(itemsOf(doc)[0].checked).toBe(false);
    });

    it('recrée une ligne pour un produit précédemment retiré', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);

      const first = addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });
      removeItem(doc, LIST, first, NOW + 1);

      const second = addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW + 2,
      });

      expect(second).not.toBe(first);
      expect(itemsOf(doc).filter((i) => null === i.removedAt)).toHaveLength(1);
    });

    it('distingue deux produits de même libellé', () => {
      const doc = freshDoc();
      const vanille = createProduct(
        doc,
        { label: 'Yaourt', description: 'à la vanille' },
        NOW,
      );
      const firen = createProduct(
        doc,
        { label: 'Yaourt', description: 'Firen, pour le petit' },
        NOW,
      );

      for (const productId of [vanille, firen]) {
        addItem(doc, {
          listId: LIST,
          productId,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW,
        });
      }

      expect(itemsOf(doc)).toHaveLength(2);
    });

    it('refuse une liste inconnue', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);

      expect(() =>
        addItem(doc, {
          listId: 'inexistante',
          productId,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW,
        }),
      ).toThrow(/inconnue/);
    });
  });

  describe('suppression douce', () => {
    it('conserve la ligne et permet de l’annuler', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);
      const itemId = addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });

      removeItem(doc, LIST, itemId, NOW + 1);
      expect(itemsOf(doc)[0].removedAt).toBe(NOW + 1);

      restoreItem(doc, LIST, itemId);
      expect(itemsOf(doc)[0].removedAt).toBeNull();
    });

    it('reste réconciliable avec un décochage concurrent', () => {
      // Avec un Y.Map.delete(), la suppression gagnerait et le décochage de
      // l'épouse serait perdu sans trace. Avec un tombstone, les deux
      // intentions survivent et l'utilisateur peut arbitrer.
      const origin = freshDoc();
      const productId = createProduct(origin, { label: 'Lait' }, NOW);
      const itemId = addItem(origin, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });
      setItemChecked(origin, LIST, itemId, true);

      const phoneA = forkReplica(origin);
      const phoneB = forkReplica(origin);

      removeItem(phoneA, LIST, itemId, NOW + 10);
      setItemChecked(phoneB, LIST, itemId, false);

      syncPair(phoneA, phoneB);

      const merged = readSnapshot(phoneA).lists[LIST].items[itemId];
      expect(merged).toBeDefined();
      expect(merged.removedAt).toBe(NOW + 10);
      expect(merged.checked).toBe(false);
      expect(readSnapshot(phoneB).lists[LIST].items[itemId]).toEqual(merged);
    });
  });

  describe('clearCheckedItems', () => {
    it('ne retire que les articles cochés', () => {
      const doc = freshDoc();
      const lait = createProduct(doc, { label: 'Lait' }, NOW);
      const pain = createProduct(doc, { label: 'Pain' }, NOW);

      const laitItem = addItem(doc, {
        listId: LIST,
        productId: lait,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });
      addItem(doc, {
        listId: LIST,
        productId: pain,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });
      setItemChecked(doc, LIST, laitItem, true);

      clearCheckedItems(doc, LIST, NOW + 5);

      const remaining = itemsOf(doc).filter((i) => null === i.removedAt);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].productId).toBe(pain);
    });
  });

  describe('catalogue', () => {
    it('met à jour uniquement les champs fournis', () => {
      const doc = freshDoc();
      const productId = createProduct(
        doc,
        { label: 'Yaourt', description: 'vanille', defaultQty: 'x4' },
        NOW,
      );

      updateProduct(doc, productId, { description: 'nature' });

      const product = readSnapshot(doc).catalog[productId];
      expect(product.description).toBe('nature');
      expect(product.label).toBe('Yaourt');
      expect(product.defaultQty).toBe('x4');
    });

    it('archive sans supprimer', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Bougie' }, NOW);

      archiveProduct(doc, productId, NOW + 1);

      const product = readSnapshot(doc).catalog[productId];
      expect(product.archivedAt).toBe(NOW + 1);
      expect(product.label).toBe('Bougie');
    });
  });
});
