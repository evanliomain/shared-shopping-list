import { chain, map, toObject } from 'taninsam';
import * as Y from 'yjs';

import {
  catalogMap,
  CreditField,
  creditedHashes,
  creditKey,
  imageCreditsMap,
  itemsMap,
  listIds,
  readListCreatedAt,
  readListName,
  YNode,
} from './schema';
import {
  CrdtSnapshot,
  ImageCredit,
  ImageRef,
  ItemId,
  ListId,
  ListItem,
  ProductId,
  Product,
  ShoppingList,
} from './types';

/**
 * Convertit le Y.Doc en objets JavaScript ordinaires.
 *
 * Recalcul intégral à chaque changement, assumé : une liste de courses tient
 * dans quelques centaines d'entrées, et une projection incrémentale coûterait
 * bien plus en complexité qu'elle ne rapporterait en cycles.
 *
 * C'est la seule porte de sortie du CRDT : au-delà, plus personne ne voit Yjs.
 */
export function readSnapshot(doc: Y.Doc): CrdtSnapshot {
  return {
    catalog: readCatalog(doc),
    lists: readLists(doc),
    credits: readCredits(doc),
  };
}

function readCatalog(doc: Y.Doc): Record<ProductId, Product> {
  return chain([...catalogMap(doc).entries()])
    .chain(map(([id, node]: [ProductId, YNode]) => readProduct(id, node)))
    .chain(
      toObject<Product, Product>(
        (p) => p.id,
        (p) => p,
      ),
    )
    .value();
}

function readLists(doc: Y.Doc): Record<ListId, ShoppingList> {
  return chain(listIds(doc))
    .chain(map((id: ListId) => readList(doc, id)))
    .chain(
      toObject<ShoppingList, ShoppingList>(
        (l) => l.id,
        (l) => l,
      ),
    )
    .value();
}

function readProduct(id: ProductId, node: YNode): Product {
  return {
    id,
    label: str(node, 'label'),
    description: str(node, 'description'),
    defaultQty: str(node, 'defaultQty'),
    category: str(node, 'category'),
    imageRef: (node.get('imageRef') as ImageRef | null) ?? null,
    bankImageRef: (node.get('bankImageRef') as ImageRef | null) ?? null,
    usage: readUsage(node),
    lastUsedAt: num(node, 'lastUsedAt'),
    archivedAt: (node.get('archivedAt') as number | null) ?? null,
  };
}

/**
 * Les crédits, relus depuis leurs clés plates.
 *
 * Seul `author` décide qu'un crédit existe : les autres champs peuvent être
 * vides — une image de la banque n'a pas toujours de titre, et le domaine public
 * n'a pas d'URL de licence.
 */
function readCredits(doc: Y.Doc): Record<string, ImageCredit> {
  const credits = imageCreditsMap(doc);

  const read = (field: CreditField, hash: string): string => {
    const value = credits.get(creditKey(field, hash));
    return 'string' === typeof value ? value : '';
  };

  return Object.fromEntries(
    creditedHashes(doc).map((hash): [string, ImageCredit] => [
      hash,
      {
        title: read('title', hash),
        author: read('author', hash),
        license: read('license', hash),
        licenseUrl: read('licenseUrl', hash),
        sourceUrl: read('sourceUrl', hash),
      },
    ]),
  );
}

/**
 * Le G-Counter est une Y.Map imbriquée. On la fige en objet ordinaire ; la
 * somme est faite par `usageTotal`, côté selectors.
 */
function readUsage(node: YNode): Record<string, number> {
  const usage = node.get('usage');
  if (!(usage instanceof Y.Map)) {
    return {};
  }
  return Object.fromEntries(usage.entries()) as Record<string, number>;
}

function readList(doc: Y.Doc, id: ListId): ShoppingList {
  return {
    id,
    name: readListName(doc, id),
    createdAt: readListCreatedAt(doc, id),
    items: chain([...itemsMap(doc, id).entries()])
      .chain(map(([itemId, node]: [ItemId, YNode]) => readItem(itemId, node)))
      .chain(
        toObject<ListItem, ListItem>(
          (i) => i.id,
          (i) => i,
        ),
      )
      .value(),
  };
}

function readItem(id: ItemId, node: YNode): ListItem {
  return {
    id,
    productId: str(node, 'productId'),
    qty: (node.get('qty') as string | null) ?? null,
    note: (node.get('note') as string | null) ?? null,
    checked: true === node.get('checked'),
    addedBy: str(node, 'addedBy'),
    createdAt: num(node, 'createdAt'),
    removedAt: (node.get('removedAt') as number | null) ?? null,
  };
}

/**
 * Lectures défensives : un document venu d'une version antérieure du schéma
 * peut ne pas avoir toutes les clés. Mieux vaut une valeur vide qu'un plantage
 * au milieu des courses.
 */
function str(node: YNode, key: string): string {
  const value = node.get(key);
  return 'string' === typeof value ? value : '';
}

function num(node: YNode, key: string): number {
  const value = node.get(key);
  return 'number' === typeof value ? value : 0;
}
