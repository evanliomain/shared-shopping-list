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
  setProductBankImage,
  updateProduct,
  writeImageCredit,
} from '@shopping-list/core/crdt';
import {
  GithubConfig,
  GithubConfigService,
} from '@shopping-list/core/sync-github';
import {
  AdoptedImage,
  crdtActions,
  DEFAULT_LIST_ID,
  ProductBankImages,
  shoppingFeature,
} from '@shopping-list/data-access/shopping';
import { BankImage } from '@shopping-list/core/image-bank';
import { TranslatableError } from '@shopping-list/util/i18n';
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
const BANK_HASH = 'b7e401aa22cc9930';
const BANK_REF: ImageRef = `blob:${BANK_HASH}`;
const BANK_URL = `blob:http://localhost/${BANK_HASH}`;

const CREDIT = {
  title: 'Avocado Hass',
  author: 'Ivar Leidus',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Avocado_Hass.jpg',
};

const RÉSULTAT: BankImage = {
  id: 'commons-114747058',
  provider: 'wikimedia',
  thumbUrl: 'https://upload.wikimedia.org/thumb/320px-Avocado_Hass.jpg',
  credit: CREDIT,
};

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
  /** Empreintes dont on a réclamé les octets, donc candidates à la publication. */
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

/**
 * Doublure des banques d'images : aucun appel réseau dans un test de composant.
 *
 * `résultats` et `adoptée` décident de ce que rendent la recherche et
 * l'adoption ; une `Error` à la place fait échouer l'appel, ce qui arrive
 * souvent en vrai — les fournisseurs tombent.
 */
class FausseBanque {
  readonly recherches: string[] = [];
  readonly adoptions: BankImage[] = [];
  résultats: readonly BankImage[] | Error = [RÉSULTAT];
  adoptée: AdoptedImage | null = { imageRef: BANK_REF, credit: CREDIT };
  /** Quand `true`, `search` reste en attente jusqu'à `termine()`. */
  lent = false;
  private libère: (() => void) | null = null;

  async search(query: string): Promise<readonly BankImage[]> {
    this.recherches.push(query);
    if (this.lent) {
      await new Promise<void>((resolve) => (this.libère = resolve));
    }
    if (this.résultats instanceof Error) {
      throw this.résultats;
    }
    return this.résultats;
  }

  termine(): void {
    this.libère?.();
  }

  async adopt(image: BankImage): Promise<AdoptedImage | null> {
    this.adoptions.push(image);
    return this.adoptée;
  }
}

function providers() {
  return [
    provideRouter([]),
    provideLocationMocks(),
    provideTestI18n(),
    provideStore({ [shoppingFeature.name]: shoppingFeature.reducer }),
    { provide: BlobService, useClass: FauxBlobs },
    { provide: ProductBankImages, useClass: FausseBanque },
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
  const banque = TestBed.inject(ProductBankImages) as unknown as FausseBanque;

  return { fixture, productId, dispatched, blobs, banque };
}

/**
 * Un produit tel qu'il arrive du CRDT avec une image de banque déjà mémorisée :
 * `imageRef` et `bankImageRef` désignent la même image.
 */
function avecImageDeBanque(
  doc: Y.Doc,
  label: string,
  category: string,
): ProductId {
  const productId = createProduct(
    doc,
    { label, category, imageRef: BANK_REF },
    NOW,
  );
  setProductBankImage(doc, productId, BANK_REF);
  return productId;
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

/** Déplie le plein écran des rayons et rend ses tuiles, dans l'ordre du parcours. */
async function ouvreRayons(fixture: {
  nativeElement: HTMLElement;
  whenStable: () => Promise<unknown>;
}): Promise<HTMLButtonElement[]> {
  fixture.nativeElement
    .querySelector<HTMLButtonElement>('.aisle-trigger')
    ?.click();
  await fixture.whenStable();
  return [
    ...fixture.nativeElement.querySelectorAll<HTMLButtonElement>('.aisle-tile'),
  ];
}

/** Rejoue une touche sur une cible, comme le ferait le clavier. */
function presseTouche(cible: HTMLElement, touche: string): void {
  cible.dispatchEvent(
    new KeyboardEvent('keydown', { key: touche, bubbles: true }),
  );
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
    const rayon = fixture.nativeElement.querySelector('.aisle-trigger-value');
    expect(rayon?.textContent).toContain('Crèmerie');
  });

  it('choisit un rayon dans le plein écran déplié', async () => {
    const { fixture } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt', category: 'cremerie' }, NOW),
    );

    // Le plein écran est fermé au départ : aucune tuile n'est rendue.
    expect(fixture.nativeElement.querySelector('.aisle-tile')).toBeNull();

    fixture.nativeElement
      .querySelector<HTMLButtonElement>('.aisle-trigger')
      ?.click();
    await fixture.whenStable();

    const boucherie = [
      ...fixture.nativeElement.querySelectorAll<HTMLButtonElement>(
        '.aisle-tile',
      ),
    ].find((tile) => 'Boucherie' === tile.getAttribute('aria-label'));
    boucherie?.click();
    await fixture.whenStable();

    // Choisir referme le plein écran et reporte le rayon sur le champ replié.
    expect(fixture.nativeElement.querySelector('.aisle-picker')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.aisle-trigger-value')?.textContent,
    ).toContain('Boucherie');
  });

  it('pose le focus sur le rayon retenu à l’ouverture', async () => {
    const { fixture } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt', category: 'cremerie' }, NOW),
    );

    // Crèmerie est le sixième rayon du parcours (index 5).
    const tiles = await ouvreRayons(fixture);
    expect(document.activeElement).toBe(tiles[5]);
  });

  it('pose le focus sur la première tuile quand le rayon est inconnu', async () => {
    const { fixture } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt', category: 'venu-d-ailleurs' }, NOW),
    );

    const tiles = await ouvreRayons(fixture);
    expect(document.activeElement).toBe(tiles[0]);
  });

  it('déplace le focus dans la grille avec les flèches', async () => {
    const { fixture } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt', category: 'cremerie' }, NOW),
    );
    const tiles = await ouvreRayons(fixture);

    presseTouche(tiles[5], 'ArrowRight');
    expect(document.activeElement).toBe(tiles[6]);

    presseTouche(tiles[6], 'ArrowLeft');
    expect(document.activeElement).toBe(tiles[5]);

    // Descendre puis remonter ramène à la même tuile : le pas vertical vaut
    // une rangée entière.
    presseTouche(tiles[5], 'ArrowDown');
    const descendu = document.activeElement as HTMLButtonElement;
    expect(descendu).not.toBe(tiles[5]);
    presseTouche(descendu, 'ArrowUp');
    expect(document.activeElement).toBe(tiles[5]);
  });

  it('repart du rayon retenu quand aucune tuile n’a le focus', async () => {
    const { fixture } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt', category: 'cremerie' }, NOW),
    );
    const tiles = await ouvreRayons(fixture);

    (document.activeElement as HTMLElement | null)?.blur();
    presseTouche(tiles[0], 'ArrowRight');

    // Focus perdu → on reprend à Crèmerie (5), la flèche mène donc à la 6.
    expect(document.activeElement).toBe(tiles[6]);
  });

  it('ignore une touche non gérée', async () => {
    const { fixture } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt', category: 'cremerie' }, NOW),
    );
    const tiles = await ouvreRayons(fixture);

    presseTouche(tiles[5], 'Tab');
    expect(document.activeElement).toBe(tiles[5]);
  });

  it('referme le plein écran avec Échap et rend le focus au champ', async () => {
    const { fixture } = await render((doc) =>
      createProduct(doc, { label: 'Yaourt', category: 'cremerie' }, NOW),
    );
    const tiles = await ouvreRayons(fixture);

    presseTouche(tiles[5], 'Escape');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.aisle-picker')).toBeNull();
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('.aisle-trigger'),
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
        "Une image est utilisée à la place de l'emoji.",
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
        imageRef: 'emoji:🥛',
      });
    });
  });

  describe('banque d’images', () => {
    /** Les vignettes de la grille de résultats. */
    function vignettes(fixture: { nativeElement: HTMLElement }): HTMLElement[] {
      return [...fixture.nativeElement.querySelectorAll('.bank-choice')];
    }

    function cherche(fixture: { nativeElement: HTMLElement }): void {
      click(fixture, 'Chercher une image');
    }

    function champRecherche(fixture: {
      nativeElement: HTMLElement;
    }): HTMLInputElement {
      return fixture.nativeElement.querySelector<HTMLInputElement>(
        'input[type="search"]',
      ) as HTMLInputElement;
    }

    it('ouvre le champ déjà rempli du libellé', async () => {
      // La recherche porte presque toujours sur le libellé : il est dans le
      // champ dès l'ouverture, sans attendre le clic sur « Chercher ».
      const { fixture } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );

      expect(champRecherche(fixture).value).toBe('Avocat');
    });

    it('ne ressème pas le champ quand le produit se met à jour', async () => {
      // Le libellé n'est semé qu'une fois : un delta reçu après coup — ici un
      // renommage — ne doit pas reprendre la main sur ce qu'on a tapé.
      const doc = new Y.Doc({ gc: true });
      ensureList(doc, DEFAULT_LIST_ID, LIST_NAME, NOW);
      const productId = createProduct(doc, { label: 'Avocat' }, NOW);

      TestBed.configureTestingModule({ providers: providers() });
      const store = TestBed.inject(Store);
      store.dispatch(
        crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }),
      );

      const fixture = TestBed.createComponent(ProductPage);
      fixture.componentRef.setInput('productId', productId);
      await fixture.whenStable();

      const champ = champRecherche(fixture);
      champ.value = 'avocat fruit';
      champ.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      // Le produit change : l'effet de chargement se rejoue, mais le champ
      // reste sur la recherche affinée.
      updateProduct(doc, productId, { label: 'Avocat mûr' });
      store.dispatch(
        crdtActions.snapshotProduit({ snapshot: readSnapshot(doc) }),
      );
      await fixture.whenStable();

      expect(champRecherche(fixture).value).toBe('avocat fruit');
    });

    it('cherche avec le libellé du produit, sans le faire retaper', async () => {
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );

      cherche(fixture);
      await fixture.whenStable();

      expect(banque.recherches).toEqual(['Avocat']);
      expect(vignettes(fixture)).toHaveLength(1);
    });

    it('laisse affiner la recherche à la main', async () => {
      // Le rattrapage le plus utile quand la proposition d'office tombe à côté :
      // chercher « avocat fruit » plutôt qu'« avocat ».
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );

      const champ = fixture.nativeElement.querySelector<HTMLInputElement>(
        'input[type="search"]',
      );
      champ.value = 'avocat fruit';
      champ.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      cherche(fixture);
      await fixture.whenStable();

      expect(banque.recherches).toEqual(['avocat fruit']);
    });

    it('dit d’où vient chaque vignette', async () => {
      // Les trois fournisseurs ne se valent pas, et un packshot exact ne se
      // distingue pas d'une photo d'auteur au premier coup d'œil.
      const { fixture } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );

      cherche(fixture);
      await fixture.whenStable();

      expect(
        fixture.nativeElement
          .querySelector('.bank-provider')
          .textContent.trim(),
      ).toBe('wikimedia');
    });

    it('affiche l’image choisie et son crédit', async () => {
      // Créditer n'est pas décoratif : les licences Creative Commons l'exigent.
      const { fixture } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );
      cherche(fixture);
      await fixture.whenStable();

      vignettes(fixture)[0].click();

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(photoSrc(fixture)).toBe(BANK_URL);
      });
      expect(fixture.nativeElement.textContent).toContain('Avocado Hass');
      expect(fixture.nativeElement.textContent).toContain('Ivar Leidus');
      expect(fixture.nativeElement.textContent).toContain('CC BY-SA 4.0');
    });

    it('mémorise l’image et son crédit à l’enregistrement', async () => {
      const { fixture, productId, dispatched } = await render((doc) =>
        createProduct(doc, { label: 'Avocat', imageRef: 'emoji:🛒' }, NOW),
      );
      cherche(fixture);
      await fixture.whenStable();
      vignettes(fixture)[0].click();
      await fixture.whenStable();

      click(fixture, 'Enregistrer');

      expect(dispatched).toContainEqual({
        type: '[Catalogue] Image de banque choisie',
        productId,
        imageRef: BANK_REF,
        credit: CREDIT,
      });
      expect(dispatched).toContainEqual({
        type: '[Catalogue] Image modifiée',
        productId,
        imageRef: BANK_REF,
      });
    });

    it('retire l’image de l’affichage sans l’oublier', async () => {
      // Le cœur de la demande : retirer doit rester réversible, donc l'image
      // reste mémorisée et seul l'affichage change.
      const { fixture, productId, dispatched } = await render((doc) =>
        avecImageDeBanque(doc, 'Avocat', 'fruits-legumes'),
      );
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(photoSrc(fixture)).toBe(BANK_URL);
      });

      click(fixture, "Retirer l'image");
      await fixture.whenStable();

      expect(photoSrc(fixture)).toBeNull();
      click(fixture, 'Enregistrer');

      expect(dispatched).toContainEqual({
        type: '[Catalogue] Image modifiée',
        productId,
        imageRef: 'emoji:🥕',
      });
      // Rien n'a été oublié : l'enregistrement ne dit que ce qui s'affiche, et
      // n'émet aucune action qui réécrirait l'image mémorisée.
      expect(
        (dispatched as { type: string }[]).map((action) => action.type),
      ).toEqual(['[Catalogue] Produit modifié', '[Catalogue] Image modifiée']);
    });

    it('remet l’image retirée sans rien redemander au réseau', async () => {
      const { fixture, productId, dispatched, banque } = await render((doc) =>
        avecImageDeBanque(doc, 'Avocat', 'fruits-legumes'),
      );
      await fixture.whenStable();

      click(fixture, "Retirer l'image");
      await fixture.whenStable();
      click(fixture, "Remettre l'image");
      await fixture.whenStable();

      click(fixture, 'Enregistrer');

      expect(dispatched).toContainEqual({
        type: '[Catalogue] Image modifiée',
        productId,
        imageRef: BANK_REF,
      });
      // Aucune recherche : l'image n'a jamais quitté l'appareil.
      expect(banque.recherches).toEqual([]);
      expect(banque.adoptions).toEqual([]);
    });

    it('garde le crédit affiché même quand l’image est retirée', async () => {
      // Elle est toujours là et prête à revenir : la masquer masquerait aussi
      // le bouton qui la ramène.
      const { fixture } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );
      cherche(fixture);
      await fixture.whenStable();
      vignettes(fixture)[0].click();
      await fixture.whenStable();

      click(fixture, "Retirer l'image");
      await fixture.whenStable();

      expect(fixture.nativeElement.textContent).toContain('Ivar Leidus');
      expect(fixture.nativeElement.textContent).toContain("Remettre l'image");
    });

    it('fait gagner l’image choisie sur la photo déjà prise', async () => {
      // Sans ça, choisir une image n'aurait aucun effet visible et paraîtrait
      // ignoré.
      const { fixture } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );
      choisitPhoto(fixture, [new File(['pixels'], 'photo.jpg')]);
      await fixture.whenStable();
      cherche(fixture);
      await fixture.whenStable();

      vignettes(fixture)[0].click();

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(photoSrc(fixture)).toBe(BANK_URL);
      });
    });

    it('dit qu’elle cherche, et se protège du double clic', async () => {
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );
      banque.lent = true;

      cherche(fixture);
      await fixture.whenStable();
      expect(
        fixture.nativeElement.querySelector('.bank-go').textContent.trim(),
      ).toBe('Recherche…');

      banque.termine();
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(vignettes(fixture)).toHaveLength(1);
      });
      expect(banque.recherches).toHaveLength(1);
    });

    it('annonce qu’aucune banque n’a répondu', async () => {
      // Contrairement à la recherche d'office, quelqu'un attend ici une réponse
      // et mérite de savoir qu'il n'y en aura pas.
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );
      banque.résultats = new TranslatableError('errors.imageBank.noProvider');

      cherche(fixture);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(
          fixture.nativeElement.querySelector('.bank-error'),
        ).not.toBeNull();
      });

      expect(fixture.nativeElement.textContent).toContain(
        "Aucune banque d'images n'a répondu",
      );
    });

    it('distingue « rien trouvé » de « pas encore cherché »', async () => {
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: 'Xyzzy' }, NOW),
      );
      banque.résultats = [];

      expect(fixture.nativeElement.textContent).not.toContain(
        'Aucune image trouvée',
      );

      cherche(fixture);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(fixture.nativeElement.textContent).toContain(
          'Aucune image trouvée',
        );
      });
    });

    it('signale une vignette qui ne se télécharge pas', async () => {
      // Le fournisseur a répondu mais son hébergeur d'images est tombé : mieux
      // vaut le dire que laisser un choix sans effet.
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );
      banque.adoptée = null;
      cherche(fixture);
      await fixture.whenStable();

      vignettes(fixture)[0].click();
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(fixture.nativeElement.textContent).toContain(
          "Cette image n'a pas pu être téléchargée",
        );
      });

      expect(photoSrc(fixture)).toBeNull();
    });

    it('ne cherche rien avec un champ vide', async () => {
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: '   ' }, NOW),
      );

      cherche(fixture);
      await fixture.whenStable();

      expect(banque.recherches).toEqual([]);
    });

    it('crédite une image reçue de l’autre appareil', async () => {
      // Le crédit voyage dans le CRDT justement pour ce cas : cet appareil n'a
      // jamais fait la recherche et ne pourrait pas retrouver l'auteur.
      const { fixture } = await render((doc) => {
        const productId = avecImageDeBanque(doc, 'Avocat', 'fruits-legumes');
        writeImageCredit(doc, BANK_HASH, CREDIT);
        return productId;
      });

      expect(fixture.nativeElement.textContent).toContain('Ivar Leidus');
      expect(
        fixture.nativeElement
          .querySelector('.bank-credit a')
          ?.getAttribute('href'),
      ).toBe(CREDIT.sourceUrl);
    });

    it('ne télécharge pas deux fois sur un double appui', async () => {
      // Les vignettes sont petites et collées : un doigt en touche deux, ou la
      // même deux fois. Sans la garde, deux téléchargements pour une image.
      const { fixture, banque } = await render((doc) =>
        createProduct(doc, { label: 'Avocat' }, NOW),
      );
      cherche(fixture);
      await fixture.whenStable();

      // Deux appuis avant que la première adoption ait rendu la main.
      vignettes(fixture)[0].click();
      vignettes(fixture)[0].click();
      await fixture.whenStable();

      expect(banque.adoptions).toHaveLength(1);
    });

    it('confie l’image de banque au dépôt une fois enregistrée', async () => {
      // Sans quoi l'autre téléphone recevrait la référence sans les pixels.
      const { fixture, blobs } = await render((doc) =>
        createProduct(doc, { label: 'Avocat', imageRef: 'emoji:🛒' }, NOW),
      );
      cherche(fixture);
      await fixture.whenStable();
      vignettes(fixture)[0].click();
      await fixture.whenStable();

      click(fixture, 'Enregistrer');

      await vi.waitFor(() => expect(blobs.relues).toEqual([BANK_HASH]));
    });
  });
});
