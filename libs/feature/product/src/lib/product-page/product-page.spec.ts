import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { provideStore, Store } from '@ngrx/store';
import { BlobService } from '@shopping-list/core/blobs';
import {
  createProduct,
  ensureList,
  ImageRef,
  ProductId,
  readSnapshot,
} from '@shopping-list/core/crdt';
import {
  GithubConfig,
  GithubConfigService,
} from '@shopping-list/core/sync-github';
import {
  crdtActions,
  DEFAULT_LIST_ID,
  shoppingFeature,
} from '@shopping-list/data-access/shopping';
import { signal } from '@angular/core';
import * as Y from 'yjs';
import { provideTestI18n } from '@shopping-list/util/i18n/testing';

import { ProductPage } from './product-page';

const NOW = 1_764_000_000_000;
const LIST_NAME = 'Nos courses';
const PHOTO_HASH = 'a3f9c2d1e8b47f05';
const PHOTO_REF: ImageRef = `blob:${PHOTO_HASH}`;
/** Une URL objet plausible : `blob:` est le seul schéma qu'Angular laisse passer
 * dans un `src` sans le préfixer d'`unsafe:`. */
const PHOTO_URL = `blob:http://localhost/${PHOTO_HASH}`;
const CONFIG: GithubConfig = {
  owner: 'evanliomain',
  repo: 'shopping-list-data',
  token: 'github_pat_xxx',
  branch: 'main',
  path: 'state.bin',
};

/**
 * Doublure du stockage des photos : jsdom n'a ni IndexedDB ni canvas, donc ni
 * le pipeline d'encodage ni le magasin réel ne peuvent tourner ici.
 */
class FauxBlobs {
  /** Ce qui a été rangé, pour vérifier qu'on n'attend pas l'enregistrement. */
  readonly rangées: Blob[] = [];
  /** Empreintes dont on a réclamé les octets, donc offertes au dépôt. */
  readonly relues: string[] = [];
  /** Quand `true`, `store` reste en attente jusqu'à `termine()`. */
  lent = false;
  private libère: (() => void) | null = null;

  async store(source: Blob): Promise<ImageRef> {
    this.rangées.push(source);
    if (this.lent) {
      await new Promise<void>((resolve) => (this.libère = resolve));
    }

    return PHOTO_REF;
  }

  termine(): void {
    this.libère?.();
  }

  async objectUrl(hash: string): Promise<string | null> {
    return `blob:http://localhost/${hash}`;
  }

  /** Empreintes dont on a réclamé les octets, donc candidates à la publication. */
  readonly relues: string[] = [];

  async bytesOf(hash: string): Promise<Uint8Array | null> {
    this.relues.push(hash);
    // `null` arrête la publication avant tout appel réseau, qui ne regarde pas
    // cet écran : c'est `ProductImages` qui en répond.
    return null;
  }

  async adopt(): Promise<void> {
    return;
  }
}

function providers() {
  return [
    provideRouter([]),
    provideLocationMocks(),
    provideTestI18n(),
    provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
    { provide: BlobService, useClass: FauxBlobs },
    {
      provide: GithubConfigService,
      useValue: { config: signal(CONFIG), loaded: signal(true) },
    },
  ];
}

/**
 * On monte un vrai Store avec la vraie tranche, et on l'alimente par un
 * snapshot produit par le vrai CRDT. Les effects d'écriture ne sont pas
 * branchés : on vérifie ici ce que la page *dispatche*, pas ce que le CRDT en
 * fait — c'est déjà couvert côté core/crdt.
 */
async function render(seed: (doc: Y.Doc) => ProductId) {
  const doc = new Y.Doc({ gc: true });
  ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
  const productId = seed(doc);

  TestBed.configureTestingModule({ providers: providers() });

  const store = TestBed.inject(Store);
  const dispatched: unknown[] = [];
  store.dispatch(crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }));
  store.dispatch = ((action: unknown) => dispatched.push(action)) as never;

  const fixture = TestBed.createComponent(ProductPage);
  fixture.componentRef.setInput('productId', productId);
  await fixture.whenStable();

  const blobs = TestBed.inject(BlobService) as unknown as FauxBlobs;

  return { fixture, productId, dispatched, blobs };
}

function click(fixture: { nativeElement: HTMLElement }, label: string): void {
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (undefined === button) {
    throw new Error(`Bouton introuvable : ${label}`);
  }
  button.click();
}

/** Le libellé du bouton de prise de vue, qui dit aussi l'attente en cours. */
function photoLabel(fixture: { nativeElement: HTMLElement }): string {
  return (
    fixture.nativeElement.querySelector('.photo-button')?.textContent?.trim() ??
    ''
  );
}

function photoSrc(fixture: { nativeElement: HTMLElement }): string | null {
  return (
    fixture.nativeElement.querySelector('.preview img')?.getAttribute('src') ??
    null
  );
}

/**
 * Rejoue une prise de vue. jsdom ne construit pas de `FileList` et `files` n'est
 * pas assignable : on la pose sur l'élément, ce que le composant lit tel quel.
 */
function choisitPhoto(
  fixture: { nativeElement: HTMLElement },
  files: readonly File[],
): void {
  const input =
    fixture.nativeElement.querySelector<HTMLInputElement>('input[type="file"]');
  if (null === input) {
    throw new Error('Champ de prise de vue introuvable');
  }

  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}

describe('ProductPage', () => {
  it('préremplit le formulaire avec le produit', async () => {
    const { fixture } = await render((doc) =>
      createProduct(
        doc,
        {
          label: 'Yaourt',
          description: 'à la vanille',
          defaultQty: 'x4',
          category: 'cremerie',
          imageRef: 'emoji:🍦',
        },
        NOW,
      ),
    );

    const inputs = fixture.nativeElement.querySelectorAll('input');
    expect(inputs[0].value).toBe('Yaourt');
    expect(inputs[1].value).toBe('à la vanille');
    expect(inputs[2].value).toBe('x4');
    expect(fixture.nativeElement.querySelector('select').value).toBe(
      'cremerie',
    );
  });

  it('affiche un message quand le produit n’existe pas', async () => {
    TestBed.configureTestingModule({ providers: providers() });

    const fixture = TestBed.createComponent(ProductPage);
    fixture.componentRef.setInput('productId', 'inconnu');
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      "Ce produit n'existe pas ou plus",
    );
  });

  it('enregistre les modifications du catalogue', async () => {
    const { fixture, productId, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt' }, NOW),
    );

    const description = fixture.nativeElement.querySelectorAll('input')[1];
    description.value = 'Firen, pour le petit';
    description.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    click(fixture, 'Enregistrer');

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: '[Catalogue] Produit modifié',
        productId,
        patch: expect.objectContaining({
          label: 'Yaourt',
          description: 'Firen, pour le petit',
        }),
      }),
    );
  });

  it('refuse d’enregistrer un libellé vide', async () => {
    const { fixture, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt' }, NOW),
    );

    const label = fixture.nativeElement.querySelectorAll('input')[0];
    label.value = '   ';
    label.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    click(fixture, 'Enregistrer');

    expect(dispatched).toHaveLength(0);
  });

  it('ne se laisse pas prendre par un clic plus rapide que le rendu', async () => {
    // Le bouton se grise, mais au rendu suivant : entre la frappe et lui, un
    // clic passe encore. Sans la garde, on écrirait un produit sans nom.
    const { fixture, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt' }, NOW),
    );

    const label = fixture.nativeElement.querySelectorAll('input')[0];
    label.value = '   ';
    label.dispatchEvent(new Event('input'));
    expect(fixture.nativeElement.querySelector('.save').disabled).toBe(false);

    click(fixture, 'Enregistrer');

    expect(dispatched).toHaveLength(0);
  });

  it('archive le produit sans le supprimer', async () => {
    const { fixture, productId, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Bougie' }, NOW),
    );

    click(fixture, 'Archiver');

    expect(dispatched).toEqual([
      { type: '[Catalogue] Produit archivé', productId },
    ]);
  });

  it('enregistre l’emoji choisi dans la grille', async () => {
    const { fixture, productId, dispatched } = await render((doc) =>
      createProduct(doc, { label: 'Lait', imageRef: 'emoji:🛒' }, NOW),
    );

    click(fixture, '🥛');
    await fixture.whenStable();

    click(fixture, 'Enregistrer');

    expect(dispatched).toContainEqual({
      type: '[Catalogue] Image modifiée',
      productId,
      imageRef: 'emoji:🥛',
    });
  });

  describe('photo', () => {
    it('affiche la photo du produit à la place de son emoji', async () => {
      const { fixture } = await render((doc) =>
        createProduct(
          doc,
          { label: 'Yaourt', category: 'cremerie', imageRef: PHOTO_REF },
          NOW,
        ),
      );

      // La résolution passe par le magasin local : elle aboutit un tour plus
      // tard, et l'emoji du rayon tient la place en attendant.
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(photoSrc(fixture)).toBe(PHOTO_URL);
      });
      expect(fixture.nativeElement.querySelector('.preview .glyph')).toBeNull();
    });

    it('signale que la photo l’emporte sur l’emoji', async () => {
      const { fixture } = await render((doc) =>
        createProduct(doc, { label: 'Yaourt', imageRef: PHOTO_REF }, NOW),
      );

      expect(fixture.nativeElement.textContent).toContain(
        "La photo est utilisée à la place de l'emoji.",
      );
    });

    it('laisse l’emoji tel quel pour un produit sans photo', async () => {
      const { fixture } = await render((doc) =>
        createProduct(
          doc,
          { label: 'Yaourt', category: 'cremerie', imageRef: 'emoji:🍦' },
          NOW,
        ),
      );

      expect(photoSrc(fixture)).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain(
        'Revenir à un emoji',
      );
    });

    it('range la photo sans attendre l’enregistrement de la fiche', async () => {
      // Une photo est adressée par son contenu : la ranger deux fois ne coûte
      // rien, alors qu'une photo perdue en quittant l'écran serait irritante.
      const { fixture, blobs } = await render((doc) =>
        createProduct(doc, { label: 'Yaourt' }, NOW),
      );

      choisitPhoto(fixture, [new File(['pixels'], 'photo.jpg')]);
      await fixture.whenStable();

      expect(blobs.rangées).toHaveLength(1);
      expect(fixture.nativeElement.textContent).toContain('Revenir à un emoji');
    });

    it('enregistre la photo comme image du produit', async () => {
      const { fixture, productId, dispatched } = await render((doc) =>
        createProduct(doc, { label: 'Yaourt', imageRef: 'emoji:🍦' }, NOW),
      );

      choisitPhoto(fixture, [new File(['pixels'], 'photo.jpg')]);
      await fixture.whenStable();

      click(fixture, 'Enregistrer');

      expect(dispatched).toContainEqual({
        type: '[Catalogue] Image modifiée',
        productId,
        imageRef: PHOTO_REF,
      });
    });

    it('confie la photo au dépôt une fois la fiche enregistrée', async () => {
      // Sans cette publication, l'autre téléphone recevrait la référence sans
      // jamais pouvoir en retrouver les pixels.
      const { fixture, blobs } = await render((doc) =>
        createProduct(doc, { label: 'Yaourt', imageRef: 'emoji:🍦' }, NOW),
      );

      choisitPhoto(fixture, [new File(['pixels'], 'photo.jpg')]);
      await fixture.whenStable();
      click(fixture, 'Enregistrer');

      await vi.waitFor(() => expect(blobs.relues).toEqual([PHOTO_HASH]));
    });

    it('ne confie rien au dépôt pour un produit qui n’a qu’un emoji', async () => {
      const { fixture, blobs } = await render((doc) =>
        createProduct(doc, { label: 'Yaourt', imageRef: 'emoji:🍦' }, NOW),
      );

      click(fixture, 'Enregistrer');
      await fixture.whenStable();

      expect(blobs.relues).toEqual([]);
    });

    it('dit qu’elle travaille pendant l’encodage', async () => {
      // Réduire et encoder prend un instant sur un téléphone : sans ce signal,
      // l'utilisateur reprend une seconde photo.
      const { fixture, blobs } = await render((doc) =>
        createProduct(doc, { label: 'Yaourt' }, NOW),
      );
      blobs.lent = true;

      choisitPhoto(fixture, [new File(['pixels'], 'photo.jpg')]);
      await fixture.whenStable();
      expect(photoLabel(fixture)).toBe('Traitement…');

      blobs.termine();

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(photoLabel(fixture)).toBe('Prendre une photo');
      });
    });

    it('ne retient rien d’une prise de vue annulée', async () => {
      // Fermer l'appareil sans déclencher émet quand même un `change`.
      const { fixture, blobs } = await render((doc) =>
        createProduct(doc, { label: 'Yaourt', imageRef: 'emoji:🍦' }, NOW),
      );

      choisitPhoto(fixture, []);
      await fixture.whenStable();

      expect(blobs.rangées).toEqual([]);
      expect(fixture.nativeElement.textContent).not.toContain(
        'Revenir à un emoji',
      );
    });

    it('revient à l’emoji sans jeter la photo', async () => {
      const { fixture, productId, dispatched } = await render((doc) =>
        createProduct(
          doc,
          { label: 'Yaourt', category: 'cremerie', imageRef: PHOTO_REF },
          NOW,
        ),
      );
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(photoSrc(fixture)).toBe(PHOTO_URL);
      });

      click(fixture, 'Revenir à un emoji');
      await fixture.whenStable();

      expect(photoSrc(fixture)).toBeNull();
      click(fixture, 'Enregistrer');

      expect(dispatched).toContainEqual({
        type: '[Catalogue] Image modifiée',
        productId,
        imageRef: 'emoji:🧀',
      });
    });
  });
});
