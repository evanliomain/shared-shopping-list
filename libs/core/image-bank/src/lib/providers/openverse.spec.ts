import { TranslatableError } from '@shopping-list/util/i18n';

import { PER_PROVIDER } from '../bank-image';
import { fauxFetch } from '../testing/faux-fetch';
import { openverseProvider } from './openverse';

/** Un résultat complet, dont chaque test retire ce qu'il veut éprouver. */
function resultat(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'b4ac74fc',
    title: 'Avocado Growing Project',
    thumbnail: 'https://api.openverse.org/v1/images/b4ac74fc/thumb/',
    creator: 'skyseeker',
    license: 'by',
    license_version: '2.0',
    license_url: 'https://creativecommons.org/licenses/by/2.0/',
    foreign_landing_url: 'https://www.flickr.com/photos/40422902@N00/20207342',
    ...overrides,
  };
}

const cherche = (fetchImpl: typeof fetch, query = 'avocat') =>
  openverseProvider.search(query, fetchImpl);

describe('fournisseur Openverse', () => {
  it('rend les images trouvées, crédit compris', async () => {
    const { fetchImpl } = fauxFetch(() => ({ results: [resultat()] }));

    expect(await cherche(fetchImpl)).toEqual([
      {
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
      },
    ]);
  });

  it('demande la vignette de la banque et non l’original', async () => {
    // C'est ce qui rend la fonctionnalité possible : l'hébergeur d'origine peut
    // refuser le CORS, le proxy de vignettes ne le refuse jamais.
    const { fetchImpl } = fauxFetch(() => ({
      results: [
        resultat({ url: 'https://live.staticflickr.com/original.jpg' }),
      ],
    }));

    const [image] = await cherche(fetchImpl);

    expect(image.thumbUrl).toContain('api.openverse.org');
  });

  it('interroge la banque avec la requête encodée et une page bornée', async () => {
    const { fetchImpl, appels } = fauxFetch(() => ({ results: [] }));

    await cherche(fetchImpl, 'papier toilette');

    expect(appels[0].url).toContain('q=papier%20toilette');
    expect(appels[0].url).toContain(`page_size=${PER_PROVIDER}`);
  });

  it('écarte un résultat qu’on ne pourrait ni montrer ni créditer', async () => {
    // Une image sans auteur ne peut pas être créditée, et l'application la
    // republie dans le dépôt de synchro : mieux vaut ne pas la proposer.
    const { fetchImpl } = fauxFetch(() => ({
      results: [
        resultat({ thumbnail: undefined }),
        resultat({ creator: undefined }),
        resultat({ license: undefined }),
        resultat({ id: undefined }),
        resultat(),
      ],
    }));

    expect(await cherche(fetchImpl)).toHaveLength(1);
  });

  it('tolère les champs facultatifs d’un service tiers', async () => {
    const { fetchImpl } = fauxFetch(() => ({
      results: [
        resultat({
          title: undefined,
          license_version: undefined,
          license_url: undefined,
          foreign_landing_url: undefined,
        }),
      ],
    }));

    const [image] = await cherche(fetchImpl);

    expect(image.credit).toEqual({
      title: '',
      author: 'skyseeker',
      license: 'CC BY',
      licenseUrl: '',
      sourceUrl: '',
    });
  });

  it('tolère une réponse sans tableau de résultats', async () => {
    const { fetchImpl } = fauxFetch(() => ({}));

    expect(await cherche(fetchImpl)).toEqual([]);
  });

  it('signale un refus de la banque', async () => {
    // La banque limite le débit des appels anonymes : ce cas se produira. C'est
    // l'agrégateur qui décidera s'il faut en parler à l'utilisateur.
    const { fetchImpl } = fauxFetch(() => new Response('', { status: 429 }));

    await expect(cherche(fetchImpl)).rejects.toThrow(TranslatableError);
  });
});
