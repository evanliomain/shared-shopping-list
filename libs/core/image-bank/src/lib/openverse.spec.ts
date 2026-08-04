import { TranslatableError } from '@shopping-list/util/i18n';

import { BANK_PAGE_SIZE, findBankImage, searchBankImages } from './openverse';

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

interface Appel {
  readonly url: string;
}

/**
 * Un `fetch` de papier, qui note ce qu'on lui demande.
 *
 * Écrit à la main plutôt que `vi.mock` : c'est le contrat de `fetch` qu'on veut
 * éprouver, et les URL demandées font partie de ce qu'on vérifie.
 */
function faussefetch(répond: (appel: Appel) => unknown): {
  fetchImpl: typeof fetch;
  appels: Appel[];
} {
  const appels: Appel[] = [];

  const fetchImpl = ((url: string) => {
    const appel = { url };
    appels.push(appel);
    const réponse = répond(appel);

    return Promise.resolve(
      réponse instanceof Response
        ? réponse
        : new Response(JSON.stringify(réponse), { status: 200 }),
    );
  }) as unknown as typeof fetch;

  return { fetchImpl, appels };
}

describe('searchBankImages', () => {
  it('rend les images trouvées, crédit compris', async () => {
    const { fetchImpl } = faussefetch(() => ({ results: [resultat()] }));

    const images = await searchBankImages('avocat', fetchImpl);

    expect(images).toEqual([
      {
        id: 'b4ac74fc',
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
    const { fetchImpl } = faussefetch(() => ({
      results: [
        resultat({ url: 'https://live.staticflickr.com/original.jpg' }),
      ],
    }));

    const [image] = await searchBankImages('avocat', fetchImpl);

    expect(image.thumbUrl).toContain('api.openverse.org');
  });

  it('interroge la banque avec la requête encodée et une page bornée', async () => {
    const { fetchImpl, appels } = faussefetch(() => ({ results: [] }));

    await searchBankImages('papier toilette', fetchImpl);

    expect(appels[0].url).toContain('q=papier%20toilette');
    expect(appels[0].url).toContain(`page_size=${BANK_PAGE_SIZE}`);
  });

  it('ne part pas en réseau pour une requête vide', async () => {
    // C'est l'état du champ à l'ouverture de la banque, pas une erreur.
    const { fetchImpl, appels } = faussefetch(() => ({ results: [] }));

    expect(await searchBankImages('   ', fetchImpl)).toEqual([]);
    expect(appels).toEqual([]);
  });

  it('écarte un résultat qu’on ne pourrait ni montrer ni créditer', async () => {
    // Une image sans auteur ne peut pas être créditée, et l'application la
    // republie dans le dépôt de synchro : mieux vaut ne pas la proposer.
    const { fetchImpl } = faussefetch(() => ({
      results: [
        resultat({ thumbnail: undefined }),
        resultat({ creator: undefined }),
        resultat({ license: undefined }),
        resultat({ id: undefined }),
        resultat(),
      ],
    }));

    expect(await searchBankImages('avocat', fetchImpl)).toHaveLength(1);
  });

  it('tolère les champs facultatifs d’un service tiers', async () => {
    const { fetchImpl } = faussefetch(() => ({
      results: [
        resultat({
          title: undefined,
          license_version: undefined,
          license_url: undefined,
          foreign_landing_url: undefined,
        }),
      ],
    }));

    const [image] = await searchBankImages('avocat', fetchImpl);

    expect(image.credit).toEqual({
      title: '',
      author: 'skyseeker',
      license: 'CC BY',
      licenseUrl: '',
      sourceUrl: '',
    });
  });

  it('tolère une réponse sans tableau de résultats', async () => {
    const { fetchImpl } = faussefetch(() => ({}));

    expect(await searchBankImages('avocat', fetchImpl)).toEqual([]);
  });

  it('traduit un refus de la banque en erreur affichable', async () => {
    // La banque limite le débit des appels anonymes : ce cas se produira.
    const { fetchImpl } = faussefetch(() => new Response('', { status: 429 }));

    await expect(searchBankImages('avocat', fetchImpl)).rejects.toThrow(
      TranslatableError,
    );
  });
});

describe('findBankImage', () => {
  it('prend le premier résultat de la requête exacte', async () => {
    const { fetchImpl, appels } = faussefetch(() => ({
      results: [resultat({ id: 'premier' }), resultat({ id: 'second' })],
    }));

    const image = await findBankImage('yaourt vanille', fetchImpl);

    expect(image?.id).toBe('premier');
    expect(appels).toHaveLength(1);
  });

  it('élargit au premier mot quand le libellé entier ne rend rien', async () => {
    // Le cas qui justifie tout : la recherche automatique se déclenche là où
    // l'emoji manque, donc sur des libellés que la banque ignore tels quels.
    const { fetchImpl, appels } = faussefetch(({ url }) =>
      url.includes('vanille') ? { results: [] } : { results: [resultat()] },
    );

    expect(await findBankImage('yaourt vanille', fetchImpl)).not.toBeNull();
    expect(appels).toHaveLength(2);
    expect(appels[1].url).toContain('q=yaourt');
  });

  it('n’élargit pas un libellé d’un seul mot', async () => {
    // Ce serait la même requête : un appel de plus pour la même réponse.
    const { fetchImpl, appels } = faussefetch(() => ({ results: [] }));

    expect(await findBankImage('  yaourt  ', fetchImpl)).toBeNull();
    expect(appels).toHaveLength(1);
  });

  it('rend rien quand même le mot élargi ne trouve rien', async () => {
    const { fetchImpl } = faussefetch(() => ({ results: [] }));

    expect(
      await findBankImage('cadeau anniversaire mamie', fetchImpl),
    ).toBeNull();
  });
});
