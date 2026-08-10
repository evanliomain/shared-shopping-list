import * as Y from 'yjs';

import {
  addItem,
  archiveProduct,
  clearCheckedItems,
  clearList,
  createProduct,
  ensureList,
  removeItem,
  renameList,
  restoreItem,
  setAisleOrder,
  setItemChecked,
  setItemNote,
  setItemQty,
  setProductBankImage,
  setProductImage,
  unarchiveProduct,
  updateProduct,
  writeImageCredit,
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

  describe('renameList', () => {
    it('renomme sans toucher à la date ni aux articles', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);
      addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });

      renameList(doc, LIST, 'Chez les parents');

      const list = readSnapshot(doc).lists[LIST];
      expect(list.name).toBe('Chez les parents');
      expect(list.createdAt).toBe(NOW);
      expect(Object.values(list.items)).toHaveLength(1);
    });
  });

  describe('setAisleOrder', () => {
    it('part sur un ordre vide, faute de réglage', () => {
      // Vide veut dire « ordre par défaut » : c'est le métier qui retombera sur
      // le parcours codé en dur.
      expect(readSnapshot(freshDoc()).lists[LIST].aisleOrder).toEqual([]);
    });

    it('mémorise l’ordre choisi, tel quel', () => {
      const doc = freshDoc();
      setAisleOrder(doc, LIST, ['cave', 'boulangerie', 'fruits-legumes']);

      expect(readSnapshot(doc).lists[LIST].aisleOrder).toEqual([
        'cave',
        'boulangerie',
        'fruits-legumes',
      ]);
    });

    it('accepte un ordre partiel sans le compléter', () => {
      // La liste peut ne citer que quelques rayons : compléter revient au
      // métier, pas au stockage.
      const doc = freshDoc();
      setAisleOrder(doc, LIST, ['cave']);

      expect(readSnapshot(doc).lists[LIST].aisleOrder).toEqual(['cave']);
    });

    it('efface le réglage sur un tableau vide', () => {
      // Réinitialiser, c'est revenir à l'ordre par défaut — donc un ordre
      // stocké vide, indistinguable de « jamais réglé ».
      const doc = freshDoc();
      setAisleOrder(doc, LIST, ['cave', 'boulangerie']);
      setAisleOrder(doc, LIST, []);

      expect(readSnapshot(doc).lists[LIST].aisleOrder).toEqual([]);
    });

    it('converge sur un seul ordre après deux réglages concurrents', () => {
      // Une chaîne scalaire, donc un simple dernier-écrivain-gagne : l'un des
      // deux ordres l'emporte en entier, jamais un mélange des deux.
      const a = freshDoc();
      const b = forkReplica(a);
      setAisleOrder(a, LIST, ['cave', 'boulangerie']);
      setAisleOrder(b, LIST, ['fruits-legumes', 'surgeles']);

      syncPair(a, b);

      const orderA = readSnapshot(a).lists[LIST].aisleOrder;
      expect(orderA).toEqual(readSnapshot(b).lists[LIST].aisleOrder);
      expect([['cave', 'boulangerie'].join(), ['fruits-legumes', 'surgeles'].join()]).toContain(
        orderA.join(),
      );
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

    it('remplace la quantité et la note de la ligne réutilisée', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);
      const first = addItem(doc, {
        listId: LIST,
        productId,
        qty: '1 L',
        note: 'entier',
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });

      const second = addItem(doc, {
        listId: LIST,
        productId,
        qty: '2 L',
        note: 'demi-écrémé',
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW + 1000,
      });

      expect(second).toBe(first);
      expect(itemsOf(doc)[0].qty).toBe('2 L');
      expect(itemsOf(doc)[0].note).toBe('demi-écrémé');
    });

    it('préserve la quantité saisie quand on ne fournit rien', () => {
      // Remettre un produit depuis les suggestions ne doit pas effacer ce qui
      // avait été précisé sur la ligne.
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Lait' }, NOW);
      addItem(doc, {
        listId: LIST,
        productId,
        qty: '1 L',
        note: 'entier',
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });

      addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW + 1000,
      });

      expect(itemsOf(doc)[0].qty).toBe('1 L');
      expect(itemsOf(doc)[0].note).toBe('entier');
    });

    describe('compte de la dictée', () => {
      it('ne pose rien pour un compte de 1 sur une ligne neuve', () => {
        // « ×1 » n'apprend rien et masquerait le defaultQty du produit.
        const doc = freshDoc();
        const productId = createProduct(doc, { label: 'Lait' }, NOW);

        addItem(doc, {
          listId: LIST,
          productId,
          count: 1,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW,
        });

        expect(itemsOf(doc)[0].qty).toBeNull();
      });

      it('pose le compte sur une ligne neuve', () => {
        const doc = freshDoc();
        const productId = createProduct(doc, { label: 'Yaourt' }, NOW);

        addItem(doc, {
          listId: LIST,
          productId,
          count: 4,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW,
        });

        expect(itemsOf(doc)[0].qty).toBe('4');
      });

      it('incrémente le compte quand on redicte le même article', () => {
        // « quatre yaourts » puis « deux yaourts » font six, pas deux.
        const doc = freshDoc();
        const productId = createProduct(doc, { label: 'Yaourt' }, NOW);
        addItem(doc, {
          listId: LIST,
          productId,
          count: 4,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW,
        });

        addItem(doc, {
          listId: LIST,
          productId,
          count: 2,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW + 1000,
        });

        expect(itemsOf(doc)).toHaveLength(1);
        expect(itemsOf(doc)[0].qty).toBe('6');
      });

      it('compte une ligne déjà là pour au moins un, même sans quantité', () => {
        const doc = freshDoc();
        const productId = createProduct(doc, { label: 'Lait' }, NOW);
        addItem(doc, {
          listId: LIST,
          productId,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW,
        });

        addItem(doc, {
          listId: LIST,
          productId,
          count: 1,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW + 1000,
        });

        expect(itemsOf(doc)[0].qty).toBe('2');
      });

      it('repart d’une quantité libre en la comptant pour un', () => {
        // On ne sait pas additionner « un pack de 4 » : la redicter la remplace
        // par un compte, qui vaut au moins ce qui était déjà là.
        const doc = freshDoc();
        const productId = createProduct(doc, { label: 'Œufs' }, NOW);
        addItem(doc, {
          listId: LIST,
          productId,
          qty: 'un pack de 4',
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW,
        });

        addItem(doc, {
          listId: LIST,
          productId,
          count: 2,
          addedBy: 'Evan',
          deviceId: 'device-A',
          now: NOW + 1000,
        });

        expect(itemsOf(doc)[0].qty).toBe('3');
      });
    });

    it('crée la ligne même si le produit n’est pas encore au catalogue', () => {
      // Les deltas n'arrivent pas forcément dans l'ordre : refuser ici
      // perdrait l'article au lieu d'attendre son produit.
      const doc = freshDoc();

      const itemId = addItem(doc, {
        listId: LIST,
        productId: 'pas-encore-arrive',
        addedBy: 'Épouse',
        deviceId: 'device-B',
        now: NOW,
      });

      expect(itemsOf(doc)).toHaveLength(1);
      expect(itemsOf(doc)[0].id).toBe(itemId);
      expect(readSnapshot(doc).catalog).toEqual({});
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

  describe('champs ponctuels d’une ligne', () => {
    it('enregistre puis efface la note', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Pain' }, NOW);
      const itemId = addItem(doc, {
        listId: LIST,
        productId,
        addedBy: 'Evan',
        deviceId: 'device-A',
        now: NOW,
      });

      setItemNote(doc, LIST, itemId, 'bien cuit');
      expect(itemsOf(doc)[0].note).toBe('bien cuit');

      setItemNote(doc, LIST, itemId, null);
      expect(itemsOf(doc)[0].note).toBeNull();
    });

    it('laisse le document intact pour un identifiant périmé', () => {
      // Une ligne purgée sur un autre appareil : l'action arrive trop tard et
      // ne doit surtout pas recréer d'entrée fantôme.
      const doc = freshDoc();
      const before = readSnapshot(doc);

      setItemChecked(doc, LIST, 'disparue', true);
      setItemQty(doc, LIST, 'disparue', '2 L');
      setItemNote(doc, LIST, 'disparue', 'bien cuit');
      removeItem(doc, LIST, 'disparue', NOW + 1);
      restoreItem(doc, LIST, 'disparue');

      expect(readSnapshot(doc)).toEqual(before);
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

  describe('clearList', () => {
    it('retire tout, coché ou non, et garde le catalogue', () => {
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

      clearList(doc, LIST, NOW + 5);

      expect(itemsOf(doc).filter((i) => null === i.removedAt)).toHaveLength(0);
      // Vider la liste n'est pas vider l'historique : c'est ce qui permet de
      // refaire les courses sans rien retaper.
      expect(Object.keys(readSnapshot(doc).catalog)).toHaveLength(2);
    });

    it('ne réécrit pas la date des lignes déjà retirées', () => {
      // Sinon chaque « vider » produirait un delta par tombstone à
      // synchroniser, et effacerait la date où la ligne a réellement disparu.
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

      clearList(doc, LIST, NOW + 5);

      expect(itemsOf(doc)[0].removedAt).toBe(NOW + 1);
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

    it('n’écrase pas un champ absent du brouillon', () => {
      // Un formulaire partiel envoie `{ description: undefined }` : écrire la
      // clé produirait un delta à synchroniser pour ne rien changer.
      const doc = freshDoc();
      const productId = createProduct(
        doc,
        { label: 'Yaourt', description: 'vanille' },
        NOW,
      );

      updateProduct(doc, productId, {
        description: undefined,
        defaultQty: 'x4',
      });

      const product = readSnapshot(doc).catalog[productId];
      expect(product.description).toBe('vanille');
      expect(product.defaultQty).toBe('x4');
    });

    it('ignore les modifications d’un produit inconnu', () => {
      const doc = freshDoc();

      updateProduct(doc, 'jamais-cree', { label: 'Lait' });
      setProductImage(doc, 'jamais-cree', 'emoji:🥛');
      archiveProduct(doc, 'jamais-cree', NOW + 1);
      unarchiveProduct(doc, 'jamais-cree');

      expect(readSnapshot(doc).catalog).toEqual({});
    });

    it('archive sans supprimer, et sait revenir en arrière', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Bougie' }, NOW);

      archiveProduct(doc, productId, NOW + 1);

      const archived = readSnapshot(doc).catalog[productId];
      expect(archived.archivedAt).toBe(NOW + 1);
      expect(archived.label).toBe('Bougie');

      unarchiveProduct(doc, productId);

      expect(readSnapshot(doc).catalog[productId].archivedAt).toBeNull();
    });

    it('remplace puis retire la référence d’image', () => {
      const doc = freshDoc();
      const productId = createProduct(
        doc,
        { label: 'Glace', imageRef: 'emoji:🍦' },
        NOW,
      );

      setProductImage(doc, productId, 'blob:a3f9c2');
      expect(readSnapshot(doc).catalog[productId].imageRef).toBe('blob:a3f9c2');

      setProductImage(doc, productId, null);
      expect(readSnapshot(doc).catalog[productId].imageRef).toBeNull();
    });
  });

  describe('image de la banque', () => {
    const CREDIT = {
      title: 'Avocado Growing Project',
      author: 'skyseeker',
      license: 'CC BY 2.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
      sourceUrl: 'https://www.flickr.com/photos/40422902@N00/20207342',
    };

    it('garde l’image de la banque quand l’affichage revient à l’emoji', () => {
      // Tout l'intérêt du second champ : c'est ce qui rend le retrait
      // réversible sans redemander quoi que ce soit au réseau.
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Avocat' }, NOW);

      setProductBankImage(doc, productId, 'blob:a3f9c2');
      setProductImage(doc, productId, 'blob:a3f9c2');
      setProductImage(doc, productId, 'emoji:🛒');

      const product = readSnapshot(doc).catalog[productId];
      expect(product.imageRef).toBe('emoji:🛒');
      expect(product.bankImageRef).toBe('blob:a3f9c2');
    });

    it('oublie l’image de la banque quand on le demande', () => {
      const doc = freshDoc();
      const productId = createProduct(doc, { label: 'Avocat' }, NOW);
      setProductBankImage(doc, productId, 'blob:a3f9c2');

      setProductBankImage(doc, productId, null);

      expect(readSnapshot(doc).catalog[productId].bankImageRef).toBeNull();
    });

    it('ignore l’image de banque d’un produit inconnu', () => {
      const doc = freshDoc();

      setProductBankImage(doc, 'jamais-cree', 'blob:a3f9c2');

      expect(readSnapshot(doc).catalog).toEqual({});
    });

    it('relit le crédit qu’il a écrit', () => {
      const doc = freshDoc();

      writeImageCredit(doc, 'a3f9c2', CREDIT);

      expect(readSnapshot(doc).credits).toEqual({ a3f9c2: CREDIT });
    });

    it('tient plusieurs crédits sans les mélanger', () => {
      // Les clés étant plates et préfixées, un crédit de plus ne doit pas
      // écraser les champs d'un autre.
      const doc = freshDoc();

      writeImageCredit(doc, 'a3f9c2', CREDIT);
      writeImageCredit(doc, 'b7e401', { ...CREDIT, author: 'someone-else' });

      const credits = readSnapshot(doc).credits;
      expect(credits['a3f9c2'].author).toBe('skyseeker');
      expect(credits['b7e401'].author).toBe('someone-else');
    });

    it('accepte un crédit dont seul l’auteur est connu', () => {
      // Une image du domaine public n'a pas d'URL de licence, et toutes n'ont
      // pas de titre : n'exiger que l'auteur, c'est n'exiger que ce qui sert à
      // créditer.
      const doc = freshDoc();

      writeImageCredit(doc, 'a3f9c2', {
        title: '',
        author: 'skyseeker',
        license: 'Public Domain Mark',
        licenseUrl: '',
        sourceUrl: '',
      });

      expect(readSnapshot(doc).credits['a3f9c2'].author).toBe('skyseeker');
    });

    it('fait converger deux appareils qui choisissent la même image', () => {
      // Le cas que les clés plates rendent inoffensif : l'empreinte étant
      // calculée sur le contenu, les deux appareils écrivent la même clé. Avec
      // un nœud imbriqué par empreinte, l'un des deux crédits disparaîtrait.
      const a = freshDoc();
      const productId = createProduct(a, { label: 'Avocat' }, NOW);
      const b = forkReplica(a);

      writeImageCredit(a, 'a3f9c2', CREDIT);
      setProductBankImage(a, productId, 'blob:a3f9c2');
      writeImageCredit(b, 'a3f9c2', CREDIT);
      setProductBankImage(b, productId, 'blob:a3f9c2');

      syncPair(a, b);

      expect(readSnapshot(a).credits).toEqual({ a3f9c2: CREDIT });
      expect(readSnapshot(b).credits).toEqual({ a3f9c2: CREDIT });
      expect(readSnapshot(a).catalog[productId].bankImageRef).toBe(
        'blob:a3f9c2',
      );
    });
  });
});
