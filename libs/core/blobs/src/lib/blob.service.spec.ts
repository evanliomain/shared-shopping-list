import { TestBed } from '@angular/core/testing';

import { StoredBlob } from './blob-store';
import { blobHashOf, BlobService, toBlobRef } from './blob.service';
import { hashContent, IMAGE_MIME } from './image-pipeline';
import { DEFAULT_BLOB_GRACE_MS } from './orphan-blobs';
import { FakeCanvas, installFakeCanvas } from './testing/fake-canvas';
import { FakeIndexedDb, installFakeIndexedDb } from './testing/fake-indexeddb';

const NOW = 1_764_000_000_000;
const OLD = NOW - DEFAULT_BLOB_GRACE_MS - 1;

/** Une photo de téléphone : seul compte ce que le service en fait. */
const PHOTO = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

/** Les octets que le canevas rend, reconnaissables à l'arrivée. */
const ENCODED = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x0a]);

/** Des octets propres à chaque empreinte, pour ne pas les confondre. */
function pixels(hash: string): Uint8Array {
  return Uint8Array.from(hash, (letter) => letter.charCodeAt(0));
}

function entry(hash: string, storedAt: number): StoredBlob {
  return { hash, mime: IMAGE_MIME, bytes: pixels(hash), storedAt };
}

/** Laisse les allers-retours vers IndexedDB se terminer. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface ObjectUrls {
  /** Les contenus confiés à `createObjectURL`, dans l'ordre. */
  readonly sources: Blob[];
  readonly created: string[];
  readonly revoked: string[];
  restore(): void;
}

function stubObjectUrls(): ObjectUrls {
  const sources: Blob[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;

  URL.createObjectURL = (source: Blob | MediaSource): string => {
    sources.push(source as Blob);
    const url = `blob:faux/${created.length}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    revoked.push(url);
  };

  return {
    sources,
    created,
    revoked,
    restore: () => {
      URL.createObjectURL = previousCreate;
      URL.revokeObjectURL = previousRevoke;
    },
  };
}

describe('BlobService', () => {
  let db: FakeIndexedDb;
  let canvas: FakeCanvas;
  let urls: ObjectUrls;

  /** Garnit le magasin. À appeler avant `blobService()`. */
  function seed(...entries: StoredBlob[]): void {
    db = installFakeIndexedDb(0 === entries.length ? {} : { entries });
  }

  function blobService(): BlobService {
    TestBed.configureTestingModule({});
    return TestBed.inject(BlobService);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    canvas = installFakeCanvas({ width: 800, height: 800, encoded: ENCODED });
    urls = stubObjectUrls();
    seed();
  });

  afterEach(() => {
    urls.restore();
    canvas.restore();
    db.restore();
  });

  describe('store', () => {
    it('range une photo réduite et la déclare disponible', async () => {
      const hash = await hashContent(ENCODED);
      const blobs = blobService();

      expect(await blobs.store(PHOTO, NOW)).toBe(toBlobRef(hash));
      expect(db.rows()).toEqual([
        { hash, mime: IMAGE_MIME, bytes: ENCODED, storedAt: NOW },
      ]);
      expect([...blobs.available()]).toEqual([hash]);
    });

    it('ne réécrit pas une photo déjà rangée', async () => {
      // Deux produits illustrés par la même photo ne la stockent qu'une fois. Sa
      // date de rangement ne bouge pas non plus : c'est elle qui décide du délai
      // de grâce avant effacement.
      const blobs = blobService();
      const ref = await blobs.store(PHOTO, NOW);

      expect(await blobs.store(PHOTO)).toBe(ref);
      expect(db.rows()).toEqual([
        {
          hash: blobHashOf(ref),
          mime: IMAGE_MIME,
          bytes: ENCODED,
          storedAt: NOW,
        },
      ]);
    });
  });

  describe('adopt', () => {
    it('range un contenu déjà encodé venu du dépôt', async () => {
      const blobs = blobService();
      const before = Date.now();

      await blobs.adopt('a1', pixels('a1'), IMAGE_MIME);

      expect(db.rows()).toMatchObject([{ hash: 'a1', mime: IMAGE_MIME }]);
      expect(db.rows()[0].storedAt).toBeGreaterThanOrEqual(before);
      expect([...blobs.available()]).toEqual(['a1']);
    });

    it('ne repasse pas l’image dans la réduction', async () => {
      // Ré-encoder changerait les octets, donc l'empreinte, donc le nom : la
      // référence portée par le CRDT ne désignerait plus rien.
      await blobService().adopt('a1', pixels('a1'), IMAGE_MIME);

      expect(canvas.canvases).toEqual([]);
      expect(db.rows()[0].bytes).toEqual(pixels('a1'));
    });
  });

  describe('objectUrl', () => {
    it('rend une URL portant le type sous lequel la photo est rangée', async () => {
      // Un type perdu en route, et le navigateur refuse d'afficher l'image.
      seed(entry('a1', NOW));
      const blobs = blobService();

      expect(await blobs.objectUrl('a1')).toBe(urls.created[0]);
      expect(urls.sources[0].type).toBe(IMAGE_MIME);
      expect(urls.sources[0].size).toBe(pixels('a1').length);
    });

    it('ne recrée pas une URL déjà donnée', async () => {
      // Chaque `createObjectURL` retient les octets jusqu'à révocation : en
      // créer une par affichage ferait grossir la mémoire à chaque défilement.
      seed(entry('a1', NOW));
      const blobs = blobService();

      expect(await blobs.objectUrl('a1')).toBe(await blobs.objectUrl('a1'));
      expect(urls.created).toHaveLength(1);
    });

    it('ne rend pas d’URL pour une photo qui n’est pas là', async () => {
      // Après un échange par QR, les produits arrivent sans leurs photos :
      // l'appelant retombe sur l'emoji.
      expect(await blobService().objectUrl('a1')).toBeNull();
      expect(urls.created).toEqual([]);
    });
  });

  describe('bytesOf', () => {
    it('rend les octets rangés, tels qu’ils seront publiés', async () => {
      seed(entry('a1', NOW));

      expect(await blobService().bytesOf('a1')).toEqual(pixels('a1'));
    });

    it('ne rend pas d’octets pour une photo qui n’est pas là', async () => {
      expect(await blobService().bytesOf('a1')).toBeNull();
    });
  });

  describe('collectGarbage', () => {
    it('efface les photos que plus aucun produit ne réclame', async () => {
      seed(entry('réclamée', OLD), entry('orpheline', OLD));
      const blobs = blobService();

      expect(await blobs.collectGarbage(new Set(['réclamée']), NOW)).toBe(1);
      expect(db.rows().map((row) => row.hash)).toEqual(['réclamée']);
      expect([...blobs.available()]).toEqual(['réclamée']);
    });

    it('révoque l’URL d’une photo effacée', async () => {
      // Sans ça la table des URLs garderait un lien mort, et le navigateur les
      // octets avec lui.
      seed(entry('affichée', OLD), entry('jamais-affichée', OLD));
      const blobs = blobService();
      const url = await blobs.objectUrl('affichée');

      expect(await blobs.collectGarbage(new Set(), NOW)).toBe(2);
      expect(urls.revoked).toEqual([url]);
      expect(await blobs.objectUrl('affichée')).toBeNull();
    });

    it('ne touche à rien quand tout est réclamé', async () => {
      seed(entry('a1', OLD), entry('b2', OLD));
      const blobs = blobService();

      expect(await blobs.collectGarbage(new Set(['a1', 'b2']), NOW)).toBe(0);
      expect(db.rows()).toHaveLength(2);
      expect(urls.revoked).toEqual([]);
    });

    it('garde une photo tout juste prise, même sans référence', async () => {
      // Elle est rangée avant que la fiche du produit soit enregistrée : sans
      // délai de grâce, un ménage au mauvais moment l'effacerait.
      seed(entry('a1', Date.now()));

      expect(await blobService().collectGarbage(new Set())).toBe(0);
      expect(db.rows()).toHaveLength(1);
    });

    it('efface une orpheline oubliée depuis plus d’une semaine', async () => {
      seed(entry('a1', 0));

      expect(await blobService().collectGarbage(new Set())).toBe(1);
      expect(db.rows()).toEqual([]);
    });

    it('ignore une photo disparue entre l’inventaire et la lecture', async () => {
      // Un autre onglet a fait son propre ménage entre-temps.
      seed(entry('a1', OLD), entry('b2', OLD));
      const blobs = blobService();
      db.onRead = (hash) => {
        if ('a1' === hash) {
          db.remove('a1');
        }
      };

      expect(await blobs.collectGarbage(new Set(), NOW)).toBe(1);
      expect(db.rows()).toEqual([]);
    });

    it('ne fait pas échouer l’écran quand le ménage est impossible', async () => {
      // Un ménage raté se retente à la session suivante ; il ne doit jamais
      // remonter jusqu'à l'appelant.
      seed(entry('a1', OLD));
      const blobs = blobService();
      db.failing.add('getAllKeys');

      expect(await blobs.collectGarbage(new Set(), NOW)).toBe(0);
      expect(db.rows()).toHaveLength(1);
    });
  });

  describe('available', () => {
    it('connaît les photos déjà rangées dès la création du service', async () => {
      seed(entry('a1', NOW), entry('b2', NOW));
      const blobs = blobService();

      await flush();

      expect([...blobs.available()].sort()).toEqual(['a1', 'b2']);
    });

    it('retombe sur un inventaire vide quand l’énumération échoue', async () => {
      // L'écran montrera les emoji : c'est un repli, pas une erreur à remonter
      // — et surtout pas un rejet non capturé au démarrage.
      seed(entry('a1', NOW));
      const blobs = blobService();
      await flush();
      expect([...blobs.available()]).toEqual(['a1']);

      db.failing.add('getAllKeys');

      expect(await blobs.store(PHOTO, NOW)).toBe(
        toBlobRef(await hashContent(ENCODED)),
      );
      expect(blobs.available().size).toBe(0);
    });

    it('démarre sur un inventaire vide quand la base ne s’ouvre pas', async () => {
      // Navigation privée sur Safari : l'application doit démarrer quand même.
      db.failing.add('open');
      const blobs = blobService();

      await flush();

      expect(blobs.available().size).toBe(0);
    });
  });

  it('révoque ses URLs quand le service disparaît', async () => {
    // Sans ce ménage, quitter l'application laisserait le navigateur retenir
    // les octets de chaque photo affichée.
    seed(entry('a1', NOW));
    const url = await blobService().objectUrl('a1');

    TestBed.resetTestingModule();

    expect(urls.revoked).toEqual([url]);
  });
});
