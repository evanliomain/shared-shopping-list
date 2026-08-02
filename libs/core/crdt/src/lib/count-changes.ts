import * as Y from 'yjs';

import { catalogMap, itemsMap, listIds, YNode } from './schema';

/**
 * Compte les entités touchées par une modification du document.
 *
 * Sert à dire, à la fin d'un échange de proximité, combien de choses viennent
 * d'arriver. Sans ce chiffre, deux minutes de manipulation se terminent sur
 * « c'est bon » sans qu'on sache si quoi que ce soit a circulé.
 *
 * On compte des **entités** — un produit, une ligne de liste — et non des
 * clés : cocher un article et corriger sa quantité dans le même échange reste
 * « une modification » pour qui regarde l'écran.
 *
 * Le comptage se fait en observant l'application plutôt qu'en décodant la
 * mise à jour : un delta Yjs ne porte que les opérations manquantes, et
 * l'appliquer à un document vide pour compter laisserait de côté toutes les
 * modifications d'entités déjà connues — c'est-à-dire précisément le cas
 * courant en rayon.
 */
export function countTouchedEntities(doc: Y.Doc, apply: () => void): number {
  const touched = new Set<string>();

  const watch = (root: Y.Map<YNode>, name: string): (() => void) => {
    const handler = (events: Y.YEvent<Y.AbstractType<unknown>>[]): void => {
      for (const event of events) {
        // Chemin vide : l'événement porte sur la racine, et ses clés sont des
        // identifiants d'entités. Sinon, la première composante du chemin est
        // l'entité modifiée.
        if (0 === event.path.length) {
          for (const key of event.changes.keys.keys()) {
            touched.add(`${name}/${key}`);
          }
        } else {
          touched.add(`${name}/${String(event.path[0])}`);
        }
      }
    };

    root.observeDeep(handler);
    return () => root.unobserveDeep(handler);
  };

  const stops = [
    watch(catalogMap(doc), 'catalog'),
    ...listIds(doc).map((listId) => watch(itemsMap(doc, listId), listId)),
  ];

  try {
    apply();
  } finally {
    for (const stop of stops) {
      stop();
    }
  }

  return touched.size;
}
