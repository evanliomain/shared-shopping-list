import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BlobService } from '@shopping-list/core/blobs';
import { ImageRef } from '@shopping-list/core/crdt';
import {
  GithubConfig,
  GithubConfigService,
  toBase64,
} from '@shopping-list/core/sync-github';

import { ProductImages } from './product-images.service';

const CONFIG: GithubConfig = {
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
  branch: 'main',
  path: 'state.bin',
};

const HASH = 'a3f9c2d1e8b47f05';
const REF: ImageRef = `blob:${HASH}`;
const EMOJI: ImageRef = 'emoji:🥛';
const BYTES = new Uint8Array([1, 2, 3, 4]);
const VRAI_FETCH = globalThis.fetch;

/** Doublure du stockage local des photos : jsdom n'a pas d'IndexedDB. */
class FauxBlobs {
  /** Photos rangées localement, avec l'URL qu'elles rendent. */
  readonly urls = new Map<string, string>();
  /** Photos dont les octets sont lisibles ici. */
  readonly octets = new Map<string, Uint8Array>();
  readonly adoptées: string[] = [];
  readonly demandes: string[] = [];
  /** Une adoption qui ne rend toujours pas d'URL : quota, navigation privée. */
  urlAprèsAdoption = true;

  async objectUrl(hash: string): Promise<string | null> {
    this.demandes.push(hash);
    return this.urls.get(hash) ?? null;
  }

  async bytesOf(hash: string): Promise<Uint8Array | null> {
    return this.octets.get(hash) ?? null;
  }

  async adopt(hash: string): Promise<void> {
    this.adoptées.push(hash);
    if (this.urlAprèsAdoption) {
      this.urls.set(hash, `objet:${hash}`);
    }
  }
}

interface Appel {
  readonly url: string;
  readonly method: string;
}

describe('ProductImages', () => {
  let blobs: FauxBlobs;
  let appels: Appel[];

  beforeEach(() => {
    blobs = new FauxBlobs();
    appels = [];
  });

  afterEach(() => {
    globalThis.fetch = VRAI_FETCH;
  });

  function répond(respond: (appel: Appel) => Response): void {
    globalThis.fetch = (async (
      url: string | URL | Request,
      init: RequestInit = {},
    ) => {
      const appel = { url: String(url), method: init.method ?? 'GET' };
      appels.push(appel);
      return respond(appel);
    }) as unknown as typeof fetch;
  }

  function trouvée(): Response {
    return new Response(JSON.stringify({ content: toBase64(BYTES) }), {
      status: 200,
    });
  }

  function images(config: GithubConfig | null = CONFIG): ProductImages {
    TestBed.configureTestingModule({
      providers: [
        { provide: BlobService, useValue: blobs },
        { provide: GithubConfigService, useValue: { config: signal(config) } },
      ],
    });

    return TestBed.inject(ProductImages);
  }

  describe('urlFor', () => {
    it('ne rend rien pour un emoji', () => {
      // Un emoji n'est pas une photo : rien à résoudre, rien à télécharger.
      expect(images().urlFor(EMOJI)).toBeNull();
    });

    it('ne rend rien tant que la photo n’est pas là', () => {
      // `null` est un état normal, pas une erreur : l'appelant affiche l'emoji.
      expect(images().urlFor(REF)).toBeNull();
    });

    it('rend l’URL d’une photo présente localement', async () => {
      blobs.urls.set(HASH, 'objet:local');
      const service = images();

      service.ensure([REF]);

      await vi.waitFor(() => expect(service.urlFor(REF)).toBe('objet:local'));
      expect(service.count()).toBe(1);
      expect(service.urls().get(HASH)).toBe('objet:local');
    });
  });

  describe('ensure', () => {
    it('ne demande qu’une fois une photo partagée par deux produits', async () => {
      blobs.urls.set(HASH, 'objet:local');
      const service = images();

      service.ensure([REF, REF, EMOJI, null]);

      await vi.waitFor(() => expect(service.count()).toBe(1));
      expect(blobs.demandes).toEqual([HASH]);
    });

    it('ne redemande pas une photo déjà résolue', async () => {
      // Idempotent et sans attente : l'écran l'appelle à chaque rendu.
      blobs.urls.set(HASH, 'objet:local');
      const service = images();

      service.ensure([REF]);
      await vi.waitFor(() => expect(service.count()).toBe(1));
      service.ensure([REF]);

      expect(blobs.demandes).toEqual([HASH]);
    });

    it('ne rattrape rien sans dépôt appairé', async () => {
      // Une application jamais appairée n'a rien à rattraper, et c'est normal.
      répond(trouvée);
      const service = images(null);

      service.ensure([REF]);

      await vi.waitFor(() => expect(blobs.demandes).toEqual([HASH]));
      expect(appels).toEqual([]);
      expect(service.count()).toBe(0);
    });

    it('rattrape une photo absente localement depuis le dépôt', async () => {
      // Le cas qui justifie ce service : après un échange par QR, les produits
      // arrivent sans leurs photos.
      répond(trouvée);
      const service = images();

      service.ensure([REF]);

      await vi.waitFor(() => expect(service.count()).toBe(1));
      expect(blobs.adoptées).toEqual([HASH]);
      expect(service.urlFor(REF)).toBe(`objet:${HASH}`);
      expect(appels[0].url).toContain(`/contents/images/${HASH}.webp`);
    });

    it('n’insiste pas sur une photo que le dépôt n’a pas encore', async () => {
      // L'autre appareil ne l'a pas encore publiée : elle arrivera peut-être
      // plus tard, mais la redemander à chaque rendu ne la fera pas venir.
      répond(() => new Response(null, { status: 404 }));
      const service = images();

      service.ensure([REF]);
      await vi.waitFor(() => expect(appels).toHaveLength(1));
      service.ensure([REF]);

      expect(appels).toHaveLength(1);
      expect(service.count()).toBe(0);
    });

    it('laisse l’emoji faire le travail quand le réseau tombe', async () => {
      // Une photo manquante ne doit jamais faire échouer l'affichage.
      répond(() => {
        throw new Error('hors ligne');
      });
      const service = images();

      service.ensure([REF]);

      await vi.waitFor(() => expect(appels).toHaveLength(1));
      expect(service.count()).toBe(0);
    });

    it('reste muet quand le stockage local ne rend pas d’URL', async () => {
      blobs.urlAprèsAdoption = false;
      répond(trouvée);
      const service = images();

      service.ensure([REF]);

      await vi.waitFor(() => expect(blobs.adoptées).toEqual([HASH]));
      expect(service.count()).toBe(0);
    });
  });

  describe('publishToRemote', () => {
    it('ne publie pas un emoji', async () => {
      répond(trouvée);

      await images().publishToRemote(EMOJI);

      expect(appels).toEqual([]);
    });

    it('ne publie rien sans dépôt appairé', async () => {
      répond(trouvée);
      blobs.octets.set(HASH, BYTES);

      await images(null).publishToRemote(REF);

      expect(appels).toEqual([]);
    });

    it('ne publie pas une photo qu’on n’a pas', async () => {
      répond(trouvée);

      await images().publishToRemote(REF);

      expect(appels).toEqual([]);
    });

    it('publie la photo prise avec l’appareil', async () => {
      blobs.octets.set(HASH, BYTES);
      répond((appel) =>
        'HEAD' === appel.method
          ? new Response(null, { status: 404 })
          : new Response(null, { status: 201 }),
      );

      await images().publishToRemote(REF);

      expect(appels.map((appel) => appel.method)).toEqual(['HEAD', 'PUT']);
    });

    it('rend de nouveau exigible une photo qu’on croyait introuvable', async () => {
      // Publier lève l'abandon : sans ce retrait, l'appareil resterait
      // persuadé que la photo n'existe nulle part, y compris chez lui.
      blobs.octets.set(HASH, BYTES);
      répond((appel) =>
        'PUT' === appel.method
          ? new Response(null, { status: 201 })
          : new Response(null, { status: 404 }),
      );
      const service = images();

      service.ensure([REF]);
      await vi.waitFor(() => expect(appels).toHaveLength(1));
      await service.publishToRemote(REF);
      service.ensure([REF]);

      await vi.waitFor(() =>
        expect(appels.map((appel) => appel.method)).toEqual([
          'GET',
          'HEAD',
          'PUT',
          'GET',
        ]),
      );
    });

    it('réessaiera plus tard si la publication échoue', async () => {
      // La photo est de toute façon disponible localement : rien d'urgent.
      blobs.octets.set(HASH, BYTES);
      répond(() => {
        throw new Error('hors ligne');
      });

      await expect(images().publishToRemote(REF)).resolves.toBeUndefined();
    });
  });
});
