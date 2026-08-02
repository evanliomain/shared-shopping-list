import * as Y from 'yjs';

import { ItemId, ListId, ProductId } from './types';

/**
 * Accesseurs structurels du Y.Doc.
 *
 * ```
 * Y.Doc
 * ├── catalog          : Y.Map<productId, Y.Map>   racine
 * ├── listMeta         : Y.Map<string, string|number>
 * │                      clés plates « name:<listId> », « createdAt:<listId> »
 * └── items:<listId>   : Y.Map<itemId, Y.Map>      une racine par liste
 * ```
 *
 * ## Pourquoi les articles sont à la racine, et pas dans `lists.get(listId)`
 *
 * `doc.getMap(nom)` est **déterministe** : deux appareils qui appellent
 * `getMap('items:maison')` désignent le même type partagé, même s'ils ne se
 * sont jamais parlé. Leurs contenus fusionnent.
 *
 * `lists.set('maison', new Y.Map())` ne l'est pas : chaque appareil crée un
 * nœud *distinct*, et la fusion n'en garde qu'un. Tout ce que contenait le
 * perdant devient inatteignable.
 *
 * Ce n'est pas théorique — c'était un bug reproductible : au démarrage,
 * l'application créait la liste par défaut sur un document vide, puis
 * IndexedDB restaurait le document persisté avec *son* nœud `maison`. Une fois
 * sur trois, le nœud vide gagnait et toute la liste disparaissait. Le même
 * scénario se serait rejoué à chaque premier appairage avec GitHub.
 *
 * Les métadonnées de liste sont donc stockées en **clés plates scalaires** :
 * une écriture concurrente y est un simple dernier-écrivain-gagne sur une
 * chaîne, sans perte de contenu.
 *
 * Le catalogue, lui, est déjà sûr : c'est une racine, et les produits ont des
 * identifiants aléatoires qui ne peuvent pas entrer en collision.
 */
export type YNode = Y.Map<unknown>;

const CATALOG = 'catalog';
const LIST_META = 'listMeta';
const ITEMS_ROOT = 'items:';
const NAME_KEY = 'name:';
const CREATED_AT_KEY = 'createdAt:';
const USAGE = 'usage';

export function catalogMap(doc: Y.Doc): Y.Map<YNode> {
  return doc.getMap<YNode>(CATALOG);
}

export function listMetaMap(doc: Y.Doc): Y.Map<string | number> {
  return doc.getMap<string | number>(LIST_META);
}

/** Racine des articles d'une liste. Toujours définie, jamais en conflit. */
export function itemsMap(doc: Y.Doc, listId: ListId): Y.Map<YNode> {
  return doc.getMap<YNode>(`${ITEMS_ROOT}${listId}`);
}

/** Les listes déclarées, dans l'ordre d'insertion des clés. */
export function listIds(doc: Y.Doc): ListId[] {
  return [...listMetaMap(doc).keys()]
    .filter((key) => key.startsWith(NAME_KEY))
    .map((key) => key.slice(NAME_KEY.length));
}

export function listExists(doc: Y.Doc, listId: ListId): boolean {
  return listMetaMap(doc).has(`${NAME_KEY}${listId}`);
}

export function readListName(doc: Y.Doc, listId: ListId): string {
  const name = listMetaMap(doc).get(`${NAME_KEY}${listId}`);
  return 'string' === typeof name ? name : '';
}

export function readListCreatedAt(doc: Y.Doc, listId: ListId): number {
  const createdAt = listMetaMap(doc).get(`${CREATED_AT_KEY}${listId}`);
  return 'number' === typeof createdAt ? createdAt : 0;
}

export function writeListName(doc: Y.Doc, listId: ListId, name: string): void {
  listMetaMap(doc).set(`${NAME_KEY}${listId}`, name);
}

export function writeListCreatedAt(
  doc: Y.Doc,
  listId: ListId,
  createdAt: number,
): void {
  listMetaMap(doc).set(`${CREATED_AT_KEY}${listId}`, createdAt);
}

export function productNode(doc: Y.Doc, id: ProductId): YNode | undefined {
  return catalogMap(doc).get(id);
}

export function itemNode(
  doc: Y.Doc,
  listId: ListId,
  itemId: ItemId,
): YNode | undefined {
  return itemsMap(doc, listId).get(itemId);
}

/** Sous-map du G-Counter d'un produit. */
export function usageMap(product: YNode): Y.Map<number> {
  return product.get(USAGE) as Y.Map<number>;
}

/**
 * Construit le nœud Yjs d'un produit, `usage` compris.
 *
 * Le G-Counter doit être une `Y.Map` imbriquée dès la création : le remplacer
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
