import { chain, filter, head } from 'taninsam';
import * as Y from 'yjs';

import { newId } from './ids';
import {
  buildItemNode,
  buildProductNode,
  catalogMap,
  itemNode,
  itemsMap,
  listExists,
  productNode,
  writeListCreatedAt,
  writeListName,
  YNode,
} from './schema';
import { incrementUsage } from './usage-counter';
import {
  DeviceId,
  ImageRef,
  ItemId,
  ListId,
  ProductDraft,
  ProductId,
} from './types';

/**
 * Mutations du CRDT.
 *
 * Toutes supposent d'être appelées dans un `doc.transact()` — c'est
 * `YDocService.transact()` qui s'en charge. Grouper les écritures dans une
 * transaction n'est pas cosmétique : ça produit une seule mise à jour Yjs, donc
 * un seul delta à synchroniser et un seul recalcul de snapshot.
 */

/**
 * Déclare la liste si elle n'est pas déjà connue. Idempotent.
 *
 * N'écrit que des scalaires : contrairement à la création d'un nœud imbriqué,
 * deux appareils qui déclarent la même liste chacun de leur côté ne peuvent pas
 * se faire perdre d'articles. Au pire, l'un des deux noms l'emporte.
 */
export function ensureList(
  doc: Y.Doc,
  id: ListId,
  name: string,
  now: number,
): void {
  if (listExists(doc, id)) {
    return;
  }
  writeListName(doc, id, name);
  writeListCreatedAt(doc, id, now);
}

export function renameList(doc: Y.Doc, id: ListId, name: string): void {
  writeListName(doc, id, name);
}

export function createProduct(
  doc: Y.Doc,
  draft: ProductDraft,
  now: number,
): ProductId {
  const id = newId();
  catalogMap(doc).set(
    id,
    buildProductNode({
      label: draft.label,
      description: draft.description ?? '',
      defaultQty: draft.defaultQty ?? '',
      category: draft.category ?? '',
      imageRef: draft.imageRef ?? null,
      lastUsedAt: now,
    }),
  );
  return id;
}

export function updateProduct(
  doc: Y.Doc,
  id: ProductId,
  patch: Partial<ProductDraft>,
): void {
  const node = productNode(doc, id);
  if (undefined === node) {
    return;
  }

  // On n'écrit que les champs réellement fournis : écrire une clé avec sa
  // valeur actuelle produirait quand même une mise à jour Yjs à synchroniser.
  for (const [key, value] of Object.entries(patch)) {
    if (undefined !== value) {
      node.set(key, value);
    }
  }
}

export function setProductImage(
  doc: Y.Doc,
  id: ProductId,
  imageRef: ImageRef | null,
): void {
  productNode(doc, id)?.set('imageRef', imageRef);
}

/** Archiver retire des suggestions sans rien perdre de l'historique. */
export function archiveProduct(doc: Y.Doc, id: ProductId, now: number): void {
  productNode(doc, id)?.set('archivedAt', now);
}

export function unarchiveProduct(doc: Y.Doc, id: ProductId): void {
  productNode(doc, id)?.set('archivedAt', null);
}

export interface AddItemParams {
  readonly listId: ListId;
  readonly productId: ProductId;
  readonly qty?: string | null;
  readonly note?: string | null;
  readonly addedBy: string;
  readonly deviceId: DeviceId;
  readonly now: number;
}

/**
 * Met un produit du catalogue dans une liste.
 *
 * Si le produit y figure déjà sans avoir été retiré, on **réutilise la ligne
 * existante** (en la décochant) plutôt que d'en créer une seconde : voir deux
 * fois « Lait » dans sa liste est une gêne, pas une information.
 *
 * Incrémente au passage le compteur d'usage et la date de dernière
 * utilisation — c'est ce qui alimente le classement des suggestions.
 */
export function addItem(doc: Y.Doc, params: AddItemParams): ItemId {
  const { listId, productId, addedBy, deviceId, now } = params;

  const product = productNode(doc, productId);
  if (undefined !== product) {
    incrementUsage(product, deviceId);
    product.set('lastUsedAt', now);
  }

  if (!listExists(doc, listId)) {
    // La racine des articles existerait quand même ; ce garde-fou évite qu'une
    // faute de frappe sur un identifiant crée silencieusement une liste.
    throw new Error(`Liste inconnue : ${listId}`);
  }

  const items = itemsMap(doc, listId);
  const existing = findActiveItemForProduct(items, productId);
  if (undefined !== existing) {
    const [existingId, node] = existing;
    node.set('checked', false);
    node.set('removedAt', null);
    if (undefined !== params.qty) {
      node.set('qty', params.qty);
    }
    if (undefined !== params.note) {
      node.set('note', params.note);
    }
    return existingId;
  }

  const id = newId();
  items.set(
    id,
    buildItemNode({
      productId,
      qty: params.qty ?? null,
      note: params.note ?? null,
      addedBy,
      createdAt: now,
    }),
  );
  return id;
}

function findActiveItemForProduct(
  items: Y.Map<YNode>,
  productId: ProductId,
): [ItemId, YNode] | undefined {
  return chain([...items.entries()])
    .chain(
      filter(
        ([, node]: [ItemId, YNode]) =>
          node.get('productId') === productId && null === node.get('removedAt'),
      ),
    )
    .chain(head<[ItemId, YNode]>())
    .value();
}

export function setItemChecked(
  doc: Y.Doc,
  listId: ListId,
  itemId: ItemId,
  checked: boolean,
): void {
  itemNode(doc, listId, itemId)?.set('checked', checked);
}

export function setItemQty(
  doc: Y.Doc,
  listId: ListId,
  itemId: ItemId,
  qty: string | null,
): void {
  itemNode(doc, listId, itemId)?.set('qty', qty);
}

export function setItemNote(
  doc: Y.Doc,
  listId: ListId,
  itemId: ItemId,
  note: string | null,
): void {
  itemNode(doc, listId, itemId)?.set('note', note);
}

/** Suppression douce : la ligne reste dans le CRDT jusqu'à la purge. */
export function removeItem(
  doc: Y.Doc,
  listId: ListId,
  itemId: ItemId,
  now: number,
): void {
  itemNode(doc, listId, itemId)?.set('removedAt', now);
}

export function restoreItem(doc: Y.Doc, listId: ListId, itemId: ItemId): void {
  itemNode(doc, listId, itemId)?.set('removedAt', null);
}

/** « Vider les articles cochés » à la fin des courses. */
export function clearCheckedItems(
  doc: Y.Doc,
  listId: ListId,
  now: number,
): void {
  for (const node of itemsMap(doc, listId).values()) {
    if (true === node.get('checked') && null === node.get('removedAt')) {
      node.set('removedAt', now);
    }
  }
}
