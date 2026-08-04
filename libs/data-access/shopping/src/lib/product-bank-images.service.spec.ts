import { TestBed } from '@angular/core/testing';
import { BlobService } from '@shopping-list/core/blobs';
import { ImageRef } from '@shopping-list/core/crdt';
import { BankImage } from '@shopping-list/core/image-bank';

import { ProductBankImages } from './product-bank-images.service';
import { ProductImages } from './product-images.service';

const HASH = 'a3f9c2d1e8b47f05';
const REF: ImageRef = `blob:${HASH}`;
const VRAI_FETCH = globalThis.fetch;

const IMAGE: BankImage = {
  id: 'b4ac74fc',
  provider: 'openverse',
  thumbUrl: 'https://api.openverse.org/v1/images/b4ac74fc/thumb/',
  credit: {
    title: 'Avocado Growing Project',
    author: 'skyseeker',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl: 'https://www.flickr.com/photos/40422902@N00/20207342',
  },
};

/**
 * Doublure du stockage local : jsdom n'a ni IndexedDB ni canvas, donc ni
 * réduction d'image ni empreinte. On note ce qui lui a été confié.
 */
class FauxBlobs {
  readonly rangés: Blob[] = [];
  ref: ImageRef = REF;

  async store(source: Blob): Promise<ImageRef> {
    this.rangés.push(source);
    return this.ref;
  }
}

/** Doublure du résolveur d'URL : on ne vérifie que les ordres donnés. */
class FaussesImages {
  readonly assurées: (ImageRef | null)[][] = [];
  readonly publiées: (ImageRef | null)[] = [];

  ensure(refs: readonly (ImageRef | null)[]): void {
    this.assurées.push([...refs]);
  }

  async publishToRemote(ref: ImageRef | null): Promise<void> {
    this.publiées.push(ref);
  }
}

describe('ProductBankImages', () => {
  let blobs: FauxBlobs;
  let images: FaussesImages;
  let appels: string[];

  beforeEach(() => {
    blobs = new FauxBlobs();
    images = new FaussesImages();
    appels = [];
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    globalThis.fetch = VRAI_FETCH;
  });

  /** Remplace `fetch` et note les URL demandées. */
  function répond(rend: (url: string) => Response | Error): void {
    globalThis.fetch = ((url: string) => {
      appels.push(url);
      const réponse = rend(url);
      return réponse instanceof Error
        ? Promise.reject(réponse)
        : Promise.resolve(réponse);
    }) as unknown as typeof fetch;
  }

  function service(): ProductBankImages {
    TestBed.configureTestingModule({
      providers: [
        { provide: BlobService, useValue: blobs },
        { provide: ProductImages, useValue: images },
      ],
    });
    return TestBed.inject(ProductBankImages);
  }

  const octets = () =>
    new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });

  describe('adopt', () => {
    it('fait d’une image de banque une photo ordinaire', async () => {
      // C'est tout le principe : après adoption, plus rien ne distingue cette
      // image d'une photo prise sur place — même réduction, même stockage, même
      // référence `blob:`. Le modèle n'a pas eu besoin d'un troisième genre de
      // référence, et rien de ce qui affiche des images n'a eu à changer.
      répond(() => octets());

      const adoptée = await service().adopt(IMAGE);

      expect(adoptée).toEqual({ imageRef: REF, credit: IMAGE.credit });
      expect(appels).toEqual([IMAGE.thumbUrl]);
      expect(blobs.rangés).toHaveLength(1);
    });

    it('rend l’image affichable tout de suite et la publie pour l’autre appareil', async () => {
      répond(() => octets());

      await service().adopt(IMAGE);

      expect(images.assurées).toEqual([[REF]]);
      expect(images.publiées).toEqual([REF]);
    });

    it('renonce quand la vignette ne se télécharge pas', async () => {
      // Le fournisseur a répondu mais son hébergeur d'images est tombé : rien à
      // ranger, et surtout pas de produit avec une référence vers du vide.
      répond(() => new Response('', { status: 404 }));

      expect(await service().adopt(IMAGE)).toBeNull();
      expect(blobs.rangés).toEqual([]);
    });
  });

  describe('propose', () => {
    it('adopte la première image trouvée pour le libellé', async () => {
      répond((url) =>
        url.includes('openverse.org/v1/images/?')
          ? new Response(
              JSON.stringify({
                results: [
                  {
                    id: 'b4ac74fc',
                    title: IMAGE.credit.title,
                    thumbnail: IMAGE.thumbUrl,
                    creator: 'skyseeker',
                    license: 'by',
                    license_version: '2.0',
                    license_url: IMAGE.credit.licenseUrl,
                    foreign_landing_url: IMAGE.credit.sourceUrl,
                  },
                ],
              }),
              { status: 200 },
            )
          : octets(),
      );

      const adoptée = await service().propose('avocat');

      expect(adoptée).toEqual({ imageRef: REF, credit: IMAGE.credit });
    });

    it('rend rien, sans bruit, quand aucun fournisseur ne trouve', async () => {
      // Personne n'a demandé cette recherche : l'emoji du rayon reste, et il n'y
      // a rien à annoncer.
      répond(() => new Response(JSON.stringify({}), { status: 200 }));

      expect(await service().propose('cadeau anniversaire mamie')).toBeNull();
    });
  });

  describe('search', () => {
    it('rend ce que les fournisseurs debout ont trouvé', async () => {
      répond((url) =>
        url.includes('openverse')
          ? new Response(
              JSON.stringify({
                results: [
                  {
                    id: 'b4ac74fc',
                    thumbnail: IMAGE.thumbUrl,
                    creator: 'skyseeker',
                    license: 'cc0',
                    license_version: '1.0',
                  },
                ],
              }),
              { status: 200 },
            )
          : new Response('', { status: 503 }),
      );

      const trouvées = await service().search('avocat');

      expect(trouvées).toHaveLength(1);
      expect(trouvées[0].credit.license).toBe('CC0 1.0');
    });
  });
});
