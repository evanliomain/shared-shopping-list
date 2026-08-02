import * as Y from 'yjs';

import { itemsMap, listsMap } from './schema';

/** Trente jours. Au-delà, un article retiré n'intéresse plus personne. */
export const DEFAULT_PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Efface réellement les lignes de liste retirées depuis assez longtemps.
 *
 * Les tombstones servent à réconcilier une suppression avec une édition
 * concurrente ; passé quelques semaines, ce risque a disparu et les garder ne
 * fait plus que gonfler `state.bin`. Une fois la clé supprimée de la Y.Map, le
 * ramasse-miettes de Yjs (`doc.gc = true`) libère le contenu associé.
 *
 * Le **catalogue n'est jamais purgé** : c'est l'historique, c'est justement ce
 * qu'on veut conserver. Pour désencombrer les suggestions, on archive.
 *
 * @returns le nombre de lignes réellement effacées
 */
export function purgeRemovedItems(
  doc: Y.Doc,
  now: number,
  olderThanMs = DEFAULT_PURGE_AFTER_MS,
): number {
  const deadline = now - olderThanMs;
  let purged = 0;

  for (const listId of listsMap(doc).keys()) {
    const items = itemsMap(doc, listId);
    if (undefined === items) {
      continue;
    }

    // On collecte avant de supprimer : muter une Y.Map pendant qu'on itère
    // dessus n'est pas sûr.
    const expired = [...items.entries()]
      .filter(([, node]) => {
        const removedAt = node.get('removedAt');
        return 'number' === typeof removedAt && removedAt < deadline;
      })
      .map(([itemId]) => itemId);

    for (const itemId of expired) {
      items.delete(itemId);
      purged++;
    }
  }

  return purged;
}
