import { blobHashOf, isBlobRef, toBlobRef } from './blob.service';
import {
  hashContent,
  IMAGE_MIME,
  IMAGE_QUALITY,
  IMAGE_SIZE,
  processImage,
} from './image-pipeline';
import { FakeCanvas, installFakeCanvas } from './testing/fake-canvas';

/** Une photo de téléphone : ce qui compte est ce qu'on en fait, pas son contenu. */
const PHOTO = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

/** Les octets que le canevas rend, reconnaissables à l'arrivée. */
const ENCODED = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x0a]);

describe('références d’image', () => {
  it('distingue une photo d’un emoji', () => {
    expect(isBlobRef('blob:a3f9c2d1e8b47f05')).toBe(true);
    expect(isBlobRef('emoji:🍦')).toBe(false);
    expect(isBlobRef(null)).toBe(false);
  });

  it('fait un aller-retour entre empreinte et référence', () => {
    expect(blobHashOf(toBlobRef('a3f9c2d1e8b47f05'))).toBe('a3f9c2d1e8b47f05');
  });

  it('ne rend pas d’empreinte pour un emoji', () => {
    expect(blobHashOf('emoji:🥕')).toBeNull();
  });
});

describe('processImage', () => {
  let canvas: FakeCanvas;

  afterEach(() => {
    canvas.restore();
  });

  it('réduit toute photo à une vignette carrée', async () => {
    canvas = installFakeCanvas({
      width: 3024,
      height: 4032,
      encoded: ENCODED,
    });

    const processed = await processImage(PHOTO);

    expect(canvas.canvases).toEqual([
      { width: IMAGE_SIZE, height: IMAGE_SIZE },
    ]);
    expect(processed).toEqual({ bytes: ENCODED, mime: IMAGE_MIME });
  });

  it('recadre depuis le centre d’une photo en portrait', async () => {
    canvas = installFakeCanvas({ width: 1200, height: 1600 });

    await processImage(PHOTO);

    // Les 200 px retirés en haut et en bas gardent le sujet centré, là où un
    // simple redimensionnement l'aurait écrasé.
    expect(canvas.draws).toEqual([
      {
        left: 0,
        top: 200,
        sourceWidth: 1200,
        sourceHeight: 1200,
        targetLeft: 0,
        targetTop: 0,
        targetWidth: IMAGE_SIZE,
        targetHeight: IMAGE_SIZE,
      },
    ]);
  });

  it('recadre depuis le centre d’une photo en paysage', async () => {
    canvas = installFakeCanvas({ width: 1600, height: 1200 });

    await processImage(PHOTO);

    expect(canvas.draws[0]).toMatchObject({
      left: 200,
      top: 0,
      sourceWidth: 1200,
      sourceHeight: 1200,
    });
  });

  it('ne recadre rien quand la photo est déjà carrée', async () => {
    canvas = installFakeCanvas({ width: 512, height: 512 });

    await processImage(PHOTO);

    expect(canvas.draws[0]).toMatchObject({
      left: 0,
      top: 0,
      sourceWidth: 512,
      sourceHeight: 512,
    });
  });

  it('agrandit une photo plus petite que la vignette', async () => {
    // Une image de 64 px ressortirait floue si on la laissait telle quelle
    // dans un emplacement de 160 px : la sortie garde toujours la même taille.
    canvas = installFakeCanvas({ width: 64, height: 64 });

    await processImage(PHOTO);

    expect(canvas.draws[0]).toMatchObject({
      targetWidth: IMAGE_SIZE,
      targetHeight: IMAGE_SIZE,
    });
  });

  it('demande du WebP à la qualité retenue', async () => {
    canvas = installFakeCanvas({ width: 800, height: 800 });

    await processImage(PHOTO);

    expect(canvas.encodings).toEqual([
      { type: IMAGE_MIME, quality: IMAGE_QUALITY },
    ]);
  });

  it('rend le type réellement produit, pas celui demandé', async () => {
    // Un navigateur qui ne sait pas encoder en WebP rend du PNG sans le dire.
    // C'est ce type-là qui doit accompagner les octets, sinon l'image ne
    // s'affiche plus après un aller-retour par le dépôt.
    canvas = installFakeCanvas({
      width: 800,
      height: 800,
      encodedMime: 'image/png',
    });

    expect((await processImage(PHOTO)).mime).toBe('image/png');
  });

  it('libère le bitmap une fois la vignette encodée', async () => {
    // Sans ça, chaque photo choisie laisse ses pixels décodés en mémoire.
    canvas = installFakeCanvas({ width: 800, height: 800 });

    await processImage(PHOTO);

    expect(canvas.closed).toBe(1);
  });

  it('échoue de façon traduisible quand le canevas ne rend aucun contexte', async () => {
    canvas = installFakeCanvas({
      width: 800,
      height: 800,
      withoutContext: true,
    });

    await expect(processImage(PHOTO)).rejects.toThrow(
      'errors.image.processingFailed',
    );
  });

  it('libère le bitmap même quand le rendu échoue', async () => {
    canvas = installFakeCanvas({
      width: 800,
      height: 800,
      withoutContext: true,
    });

    await expect(processImage(PHOTO)).rejects.toThrow();

    expect(canvas.closed).toBe(1);
  });
});

describe('hashContent', () => {
  it('produit une empreinte hexadécimale stable', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const first = await hashContent(bytes);
    const second = await hashContent(new Uint8Array([1, 2, 3, 4, 5]));

    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(second).toBe(first);
  });

  it('sépare deux contenus différents', async () => {
    // C'est ce qui garantit qu'un fichier n'est jamais écrasé par un autre :
    // l'empreinte *est* le nom.
    const a = await hashContent(new Uint8Array([1, 2, 3]));
    const b = await hashContent(new Uint8Array([1, 2, 4]));

    expect(a).not.toBe(b);
  });

  it('donne la même empreinte au même contenu encodé deux fois', async () => {
    // Deux produits illustrés par la même photo ne la stockent qu'une fois, et
    // ne l'envoient qu'une fois.
    const content = crypto.getRandomValues(new Uint8Array(512));

    expect(await hashContent(content)).toBe(
      await hashContent(Uint8Array.from(content)),
    );
  });
});
