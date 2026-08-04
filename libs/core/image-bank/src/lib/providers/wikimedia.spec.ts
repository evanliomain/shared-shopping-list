import { TranslatableError } from '@shopping-list/util/i18n';

import { fauxFetch } from '../testing/faux-fetch';
import { wikimediaProvider } from './wikimedia';

/**
 * Une page de résultat.
 *
 * `overrides` porte sur l'`imageinfo`, où vivent la vignette et les
 * métadonnées ; `pageOverrides` sur la page elle-même, où vit le rang de
 * pertinence. Les deux niveaux sont distincts dans la réponse de l'API, et les
 * confondre ferait passer un test d'ordre pour vert sans qu'il éprouve rien.
 */
function page(
  overrides: Record<string, unknown> = {},
  pageOverrides: Record<string, unknown> = {},
): unknown {
  return {
    title: 'File:Avocado Hass.jpg',
    index: 1,
    imageinfo: [
      {
        thumburl: 'https://upload.wikimedia.org/thumb/320px-Avocado_Hass.jpg',
        descriptionurl:
          'https://commons.wikimedia.org/wiki/File:Avocado_Hass.jpg',
        extmetadata: {
          Artist: {
            value:
              '<a href="//commons.wikimedia.org/wiki/User:Iifar">Ivar Leidus</a>',
          },
          LicenseShortName: { value: 'CC BY-SA 4.0' },
          LicenseUrl: {
            value: 'https://creativecommons.org/licenses/by-sa/4.0',
          },
          ObjectName: { value: 'Avocado Hass' },
        },
        ...overrides,
      },
    ],
    ...pageOverrides,
  };
}

const cherche = (fetchImpl: typeof fetch, query = 'avocat') =>
  wikimediaProvider.search(query, fetchImpl);

describe('fournisseur Wikimedia Commons', () => {
  it('rend l’image avec un auteur débarrassé de son HTML', async () => {
    // L'API rend l'auteur en HTML, et ce nom finit dans un nœud de texte du
    // CRDT : y laisser les balises les afficherait telles quelles.
    const { fetchImpl } = fauxFetch(() => ({
      query: { pages: { '114747058': page() } },
    }));

    expect(await cherche(fetchImpl)).toEqual([
      {
        id: '114747058',
        provider: 'wikimedia',
        thumbUrl: 'https://upload.wikimedia.org/thumb/320px-Avocado_Hass.jpg',
        credit: {
          title: 'Avocado Hass',
          author: 'Ivar Leidus',
          license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Avocado_Hass.jpg',
        },
      },
    ]);
  });

  it('demande le CORS explicitement, et écarte les schémas', async () => {
    // Sans `origin=*`, l'API MediaWiki n'envoie pas l'en-tête CORS et le
    // navigateur refuse la réponse — la fonctionnalité serait morte en ligne
    // tout en passant les tests.
    const { fetchImpl, appels } = fauxFetch(() => ({ query: { pages: {} } }));

    await cherche(fetchImpl);

    expect(appels[0].url).toContain('origin=*');
    expect(appels[0].url).toContain('filetype%3Abitmap');
  });

  it('rend les résultats par pertinence, non par identifiant', async () => {
    // Les identifiants et les rangs sont ceux d'une vraie recherche « avocat ».
    // L'API rend les pages dans un objet indexé par `pageid`, et JavaScript
    // énumère les clés entières par ordre numérique croissant : parcourir cet
    // objet trie par ancienneté d'import. Le premier résultat décide de l'image
    // choisie d'office — c'est donc la pertinence qui doit gagner.
    const { fetchImpl } = fauxFetch(() => ({
      query: {
        pages: {
          '164475152': page({}, { index: 3 }),
          '164475160': page({}, { index: 2 }),
          '4877156': page({}, { index: 1 }),
        },
      },
    }));

    expect((await cherche(fetchImpl)).map((i) => i.id)).toEqual([
      '4877156',
      '164475160',
      '164475152',
    ]);
  });

  it('garde les résultats même sans rang de pertinence', async () => {
    // `index` accompagne toujours `generator=search` aujourd'hui. S'il venait à
    // manquer, le tri ne doit pas faire disparaître des résultats parfaitement
    // affichables — mieux vaut un ordre quelconque qu'une grille vide.
    const { fetchImpl } = fauxFetch(() => ({
      query: {
        pages: {
          '1': page({}, { index: undefined }),
          '2': page({}, { index: undefined }),
        },
      },
    }));

    expect(await cherche(fetchImpl)).toHaveLength(2);
  });

  it('écarte une image dont l’auteur est inconnu', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      query: {
        pages: {
          '1': page({ extmetadata: { ObjectName: { value: 'Avocat' } } }),
          '2': page(),
        },
      },
    }));

    expect(await cherche(fetchImpl)).toHaveLength(1);
  });

  it('écarte une image sans vignette', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      query: { pages: { '1': page({ thumburl: undefined }) } },
    }));

    expect(await cherche(fetchImpl)).toEqual([]);
  });

  it('écarte une page sans information d’image', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      query: { pages: { '1': { title: 'File:Rien.jpg' } } },
    }));

    expect(await cherche(fetchImpl)).toEqual([]);
  });

  it('tolère une absence de correspondance', async () => {
    // MediaWiki omet `query` au lieu de rendre une liste vide.
    const { fetchImpl } = fauxFetch(() => ({ batchcomplete: '' }));

    expect(await cherche(fetchImpl)).toEqual([]);
  });

  it('complète un crédit dont les métadonnées sont mal typées', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      query: {
        pages: {
          '1': page({
            descriptionurl: undefined,
            extmetadata: {
              Artist: { value: 'Ivar Leidus' },
              LicenseShortName: { value: 1970 },
            },
          }),
        },
      },
    }));

    const [image] = await cherche(fetchImpl);

    expect(image.credit).toEqual({
      title: '',
      author: 'Ivar Leidus',
      license: '',
      licenseUrl: '',
      sourceUrl: '',
    });
  });

  it('signale un refus du service', async () => {
    const { fetchImpl } = fauxFetch(() => new Response('', { status: 500 }));

    await expect(cherche(fetchImpl)).rejects.toThrow(TranslatableError);
  });
});
