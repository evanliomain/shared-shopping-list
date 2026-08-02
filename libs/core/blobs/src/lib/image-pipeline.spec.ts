import { blobHashOf, isBlobRef, toBlobRef } from './blob.service';
import { hashContent } from './image-pipeline';

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
