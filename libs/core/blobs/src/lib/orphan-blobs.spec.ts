import {
  BlobMeta,
  DEFAULT_BLOB_GRACE_MS,
  orphanBlobsToDelete,
} from './orphan-blobs';

const NOW = 1_764_000_000_000;
const OLD = NOW - DEFAULT_BLOB_GRACE_MS - 1;
const RECENT = NOW - 1000;

function meta(hash: string, storedAt: number): BlobMeta {
  return { hash, storedAt };
}

describe('orphanBlobsToDelete', () => {
  it('efface une orpheline dont le délai de grâce est écoulé', () => {
    expect(
      orphanBlobsToDelete({
        stored: [meta('a1', OLD)],
        reachable: new Set(),
        now: NOW,
      }),
    ).toEqual(['a1']);
  });

  it('garde une orpheline encore dans le délai de grâce', () => {
    // Le cas d'une photo qui vient d'être prise, dont la fiche n'est pas
    // encore enregistrée : elle n'est pas perdue, elle est en attente.
    expect(
      orphanBlobsToDelete({
        stored: [meta('a1', RECENT)],
        reachable: new Set(),
        now: NOW,
      }),
    ).toEqual([]);
  });

  it('garde une photo référencée, même très ancienne', () => {
    expect(
      orphanBlobsToDelete({
        stored: [meta('a1', 0)],
        reachable: new Set(['a1']),
        now: NOW,
      }),
    ).toEqual([]);
  });

  it('garde la photo d’un produit archivé', () => {
    // Le ménage lit le catalogue brut, pas les vues qui masquent les archives :
    // désarchiver doit rétablir la fiche *avec* son image.
    const archivedPhoto = 'b2';

    expect(
      orphanBlobsToDelete({
        stored: [meta(archivedPhoto, 0), meta('c3', OLD)],
        reachable: new Set([archivedPhoto]),
        now: NOW,
      }),
    ).toEqual(['c3']);
  });

  it('ne rend rien quand il n’y a rien à examiner', () => {
    expect(
      orphanBlobsToDelete({ stored: [], reachable: new Set(), now: NOW }),
    ).toEqual([]);
  });

  it('respecte un délai de grâce nul', () => {
    // Ce que fait le ménage déclenché à la main pour vérifier son effet.
    expect(
      orphanBlobsToDelete({
        stored: [meta('a1', NOW), meta('b2', NOW)],
        reachable: new Set(['b2']),
        now: NOW,
        graceMs: 0,
      }),
    ).toEqual(['a1']);
  });

  it('trie le bon grain de l’ivraie sur un lot mélangé', () => {
    const stored = [
      meta('référencée-ancienne', 0),
      meta('orpheline-ancienne', OLD),
      meta('orpheline-récente', RECENT),
      meta('référencée-récente', RECENT),
    ];

    expect(
      orphanBlobsToDelete({
        stored,
        reachable: new Set(['référencée-ancienne', 'référencée-récente']),
        now: NOW,
      }),
    ).toEqual(['orpheline-ancienne']);
  });
});
