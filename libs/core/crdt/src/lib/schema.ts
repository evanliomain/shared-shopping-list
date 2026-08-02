import * as Y from 'yjs';

import { ItemId, ListId, ProductId } from './types';

/**
 * Accesseurs structurels du Y.Doc.
 *
 * Toute la connaissance de la forme du document est concentrée ici :
 *
 * ```
 * Y.Doc
 * ├── catalog : Y.Map<productId, Y.Map>
 * │   └── label, description, defaultQty, category, imageRef,
 * │       usage : Y.Map<deviceId, number>, lastUsedAt, archivedAt
 * └── lists   : Y.Map<listId, Y.Map>
 *     ├── name, createdAt
 *     └── items : Y.Map<itemId, Y.Map>
 *         └── productId, qty, note, checked, addedBy, createdAt, removedAt
 * ```
 *
 * Les valeurs d'un nœud sont hétérogènes (chaînes, nombres, sous-Y.Map), d'où
 * le `Y.Map<unknown>` : le typage fort est rétabli à la lecture, dans
 * `snapshot.ts`.
 */
export type YNode = Y.Map<unknown>;

const CATALOG = 'catalog';
const LISTS = 'lists';
const ITEMS = 'items';
const USAGE = 'usage';

export function catalogMap(doc: Y.Doc): Y.Map<YNode> {
  return doc.getMap<YNode>(CATALOG);
}

export function listsMap(doc: Y.Doc): Y.Map<YNode> {
  return doc.getMap<YNode>(LISTS);
}

export function productNode(doc: Y.Doc, id: ProductId): YNode | undefined {
  return catalogMap(doc).get(id);
}

export function listNode(doc: Y.Doc, id: ListId): YNode | undefined {
  return listsMap(doc).get(id);
}

/** Sous-map des lignes d'une liste. `undefined` si la liste n'existe pas. */
export function itemsMap(doc: Y.Doc, listId: ListId): Y.Map<YNode> | undefined {
  return listNode(doc, listId)?.get(ITEMS) as Y.Map<YNode> | undefined;
}

export function itemNode(
  doc: Y.Doc,
  listId: ListId,
  itemId: ItemId,
): YNode | undefined {
  return itemsMap(doc, listId)?.get(itemId);
}

/** Sous-map du G-Counter d'un produit. */
export function usageMap(product: YNode): Y.Map<number> {
  return product.get(USAGE) as Y.Map<number>;
}

/**
 * Construit le nœud Yjs d'un produit, `usage` compris.
 *
 * Le G-Counter doit être une `Y.Map` imbriquée dès la création : la remplacer
 * plus tard par un objet ordinaire ferait perdre la fusion par appareil.
 */
export function buildProductNode(values: {
  label: string;
  description: string;
  defaultQty: string;
  category: string;
  imageRef: string | null;
  lastUsedAt: number;
}): YNode {
  const node: YNode = new Y.Map();
  node.set('label', values.label);
  node.set('description', values.description);
  node.set('defaultQty', values.defaultQty);
  node.set('category', values.category);
  node.set('imageRef', values.imageRef);
  node.set('lastUsedAt', values.lastUsedAt);
  node.set('archivedAt', null);
  node.set(USAGE, new Y.Map<number>());
  return node;
}

export function buildListNode(values: {
  name: string;
  createdAt: number;
}): YNode {
  const node: YNode = new Y.Map();
  node.set('name', values.name);
  node.set('createdAt', values.createdAt);
  node.set(ITEMS, new Y.Map<YNode>());
  return node;
}

export function buildItemNode(values: {
  productId: ProductId;
  qty: string | null;
  note: string | null;
  addedBy: string;
  createdAt: number;
}): YNode {
  const node: YNode = new Y.Map();
  node.set('productId', values.productId);
  node.set('qty', values.qty);
  node.set('note', values.note);
  node.set('checked', false);
  node.set('addedBy', values.addedBy);
  node.set('createdAt', values.createdAt);
  node.set('removedAt', null);
  return node;
}
