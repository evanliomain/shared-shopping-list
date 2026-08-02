import * as Y from 'yjs';

import { addItem, createProduct, ensureList, removeItem } from './operations';
import { DEFAULT_PURGE_AFTER_MS, purgeRemovedItems } from './purge';
import { readSnapshot } from './snapshot';

const LIST = 'maison';
const NOW = 1_764_000_000_000;
const OLD = NOW - DEFAULT_PURGE_AFTER_MS - 1;
const RECENT = NOW - 1000;

function docWithItems(): { doc: Y.Doc; old: string; recent: string } {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, LIST, 'Maison', NOW);

  const lait = createProduct(doc, { label: 'Lait' }, NOW);
  const pain = createProduct(doc, { label: 'Pain' }, NOW);

  const old = addItem(doc, {
    listId: LIST,
    productId: lait,
    addedBy: 'Evan',
    deviceId: 'device-A',
    now: OLD,
  });
  const recent = addItem(doc, {
    listId: LIST,
    productId: pain,
    addedBy: 'Evan',
    deviceId: 'device-A',
    now: RECENT,
  });

  removeItem(doc, LIST, old, OLD);
  removeItem(doc, LIST, recent, RECENT);

  return { doc, old, recent };
}

describe('purge des tombstones', () => {
  it('efface les lignes retirées depuis plus de 30 jours', () => {
    const { doc, old, recent } = docWithItems();

    expect(purgeRemovedItems(doc, NOW)).toBe(1);

    const items = readSnapshot(doc).lists[LIST].items;
    expect(items[old]).toBeUndefined();
    expect(items[recent]).toBeDefined();
  });

  it('ne touche jamais aux lignes actives', () => {
    const doc = new Y.Doc({ gc: true });
    ensureList(doc, LIST, 'Maison', NOW);
    const productId = createProduct(doc, { label: 'Lait' }, NOW);
    addItem(doc, {
      listId: LIST,
      productId,
      addedBy: 'Evan',
      deviceId: 'device-A',
      now: OLD,
    });

    expect(purgeRemovedItems(doc, NOW)).toBe(0);
    expect(Object.keys(readSnapshot(doc).lists[LIST].items)).toHaveLength(1);
  });

  it('ne purge jamais le catalogue — c’est l’historique', () => {
    const { doc } = docWithItems();

    purgeRemovedItems(doc, NOW);

    // Le produit du seul article purgé doit rester proposable la semaine
    // prochaine : c'est tout l'intérêt de séparer catalogue et liste.
    expect(Object.keys(readSnapshot(doc).catalog)).toHaveLength(2);
  });

  it('est idempotente', () => {
    const { doc } = docWithItems();

    expect(purgeRemovedItems(doc, NOW)).toBe(1);
    expect(purgeRemovedItems(doc, NOW)).toBe(0);
  });
});
