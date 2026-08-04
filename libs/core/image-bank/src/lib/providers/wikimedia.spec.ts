import { TranslatableError } from '@shopping-list/util/i18n';

import { fauxFetch } from '../testing/faux-fetch';
import { wikimediaProvider } from './wikimedia';

function page(overrides: Record<string, unknown> = {}): unknown {
  return {
    title: 'File:Avocado Hass.jpg',
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
