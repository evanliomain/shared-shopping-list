import * as Y from 'yjs';

import {
  buildProductNode,
  catalogMap,
  listExists,
  listIds,
  listMetaMap,
  readListCreatedAt,
  readListName,
  usageMap,
  YNode,
} from './schema';

const LIST = 'maison';
const NOW = 1_764_000_000_000;

describe('accesseurs structurels du Y.Doc', () => {
  it('ne déclare aucune liste sur un document vierge', () => {
    const doc = new Y.Doc({ gc: true });

    expect(listIds(doc)).toEqual([]);
    expect(listExists(doc, LIST)).toBe(false);
  });

  it('lit une liste inconnue comme une liste sans nom ni date', () => {
    // Appelé pendant qu'un delta arrive : la racine des articles existe déjà
    // alors que les métadonnées ne sont pas encore là.
    const doc = new Y.Doc({ gc: true });

    expect(readListName(doc, LIST)).toBe('');
    expect(readListCreatedAt(doc, LIST)).toBe(0);
  });

  it('ignore une métadonnée de liste du mauvais type', () => {
    // Un document écrit par une version antérieure du schéma peut porter
    // n'importe quoi ; mieux vaut une liste sans nom qu'un plantage en rayon.
    const doc = new Y.Doc({ gc: true });
    listMetaMap(doc).set(`name:${LIST}`, 1970);
    listMetaMap(doc).set(`createdAt:${LIST}`, 'hier');

    expect(listIds(doc)).toEqual([LIST]);
    expect(readListName(doc, LIST)).toBe('');
    expect(readListCreatedAt(doc, LIST)).toBe(0);
  });

  it('ne prend pour listes que les clés de nom', () => {
    // `createdAt:` partage la même Y.Map plate : le confondre avec un nom
    // ferait apparaître chaque liste deux fois.
    const doc = new Y.Doc({ gc: true });
    listMetaMap(doc).set(`name:${LIST}`, 'Maison');
    listMetaMap(doc).set(`createdAt:${LIST}`, NOW);

    expect(listIds(doc)).toEqual([LIST]);
  });

  it('donne au produit un G-Counter partagé dès sa construction', () => {
    // Un objet ordinaire à cette place ferait perdre la fusion par appareil au
    // premier échange.
    const doc = new Y.Doc({ gc: true });
    const node: YNode = buildProductNode({
      label: 'Yaourt',
      description: 'à la vanille',
      defaultQty: 'x4',
      category: 'frais',
      imageRef: null,
      lastUsedAt: NOW,
    });
    catalogMap(doc).set('yaourt', node);

    expect(usageMap(node)).toBeInstanceOf(Y.Map);
    expect(node.get('archivedAt')).toBeNull();
  });
});
