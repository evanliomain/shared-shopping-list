import { TranslatableError } from '@shopping-list/util/i18n';

import { BankImage, BankProvider } from './bank-image';
import {
  BANK_PAGE_SIZE,
  BANK_PROVIDERS,
  findBankImage,
  searchBankImages,
} from './image-bank';

/** Une image de papier, identifiable par son fournisseur et son rang. */
function image(provider: string, rank: number): BankImage {
  return {
    id: `${provider}-${rank}`,
    provider,
    thumbUrl: `https://${provider}.example/${rank}.jpg`,
    credit: {
      title: `${provider} ${rank}`,
      author: 'quelqu’un',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: `https://${provider}.example/page/${rank}`,
    },
  };
}

/**
 * Un fournisseur de papier.
 *
 * `rend` reçoit la requête : c'est ce qui permet d'éprouver l'élargissement au
 * premier mot, où un fournisseur répond à « yaourt » mais pas à « yaourt
 * vanille ».
 */
function fournisseur(
  id: string,
  rend: (query: string) => readonly BankImage[] | Error,
): BankProvider {
  return {
    id,
    search: (query) => {
      const réponse = rend(query);
      return réponse instanceof Error
        ? Promise.reject(réponse)
        : Promise.resolve(réponse);
    },
  };
}

const combien = (id: string, n: number) =>
  Array.from({ length: n }, (_, rank) => image(id, rank));

describe('BANK_PROVIDERS', () => {
  it('préfère la précision à la beauté', () => {
    // Cet ordre a été mesuré sur de vraies requêtes françaises, et il est
    // l'inverse de ce qu'on suppose : Open Food Facts rend le produit exact,
    // tandis qu'Openverse rend des avocats du barreau pour « avocat ». Une image
    // choisie d'office n'a personne pour la valider — c'est la justesse qui
    // compte, pas l'esthétique.
    expect(BANK_PROVIDERS.map((p) => p.id)).toEqual([
      'openfoodfacts',
      'wikimedia',
      'openverse',
    ]);
  });
});

describe('searchBankImages', () => {
  it('entrelace les fournisseurs au lieu de les concaténer', async () => {
    // Concaténer cacherait les deux derniers : huit résultats du premier
    // remplissent la grille, et le packshot exact du second passerait sous la
    // ligne de flottaison.
    const providers = [
      fournisseur('a', () => combien('a', 3)),
      fournisseur('b', () => combien('b', 3)),
      fournisseur('c', () => combien('c', 3)),
    ];

    const images = await searchBankImages('avocat', fetch, providers);

    expect(images.map((i) => i.provider)).toEqual([
      'a',
      'b',
      'c',
      'a',
      'b',
      'c',
      'a',
      'b',
      'c',
    ]);
  });

  it('entrelace sans trou quand les réponses sont de tailles inégales', async () => {
    const providers = [
      fournisseur('a', () => combien('a', 1)),
      fournisseur('b', () => combien('b', 3)),
    ];

    const images = await searchBankImages('avocat', fetch, providers);

    expect(images.map((i) => i.id)).toEqual(['a-0', 'b-0', 'b-1', 'b-2']);
  });

  it('garde ce qu’ont répondu les fournisseurs debout', async () => {
    // Le cœur de la stratégie : Open Food Facts rend régulièrement un 503, et
    // ça ne doit pas vider une grille que les autres avaient remplie.
    const providers = [
      fournisseur('a', () => new Error('503')),
      fournisseur('b', () => combien('b', 2)),
    ];

    const images = await searchBankImages('avocat', fetch, providers);

    expect(images.map((i) => i.id)).toEqual(['b-0', 'b-1']);
  });

  it('ne se plaint que si aucun fournisseur n’a répondu', async () => {
    // C'est le seul cas où il y a quelque chose à dire à l'utilisateur.
    const providers = [
      fournisseur('a', () => new Error('503')),
      fournisseur('b', () => new Error('429')),
    ];

    await expect(searchBankImages('avocat', fetch, providers)).rejects.toThrow(
      TranslatableError,
    );
  });

  it('ne rend pas deux fois la même image', async () => {
    // Openverse indexant Wikimedia, la même photo peut arriver par deux
    // chemins.
    const commune = image('a', 0);
    const providers = [
      fournisseur('a', () => [commune]),
      fournisseur('b', () => [commune, image('b', 1)]),
    ];

    const images = await searchBankImages('avocat', fetch, providers);

    expect(images.map((i) => i.id)).toEqual(['a-0', 'b-1']);
  });

  it('borne ce que la grille reçoit', async () => {
    const providers = [
      fournisseur('a', () => combien('a', 20)),
      fournisseur('b', () => combien('b', 20)),
    ];

    expect(await searchBankImages('avocat', fetch, providers)).toHaveLength(
      BANK_PAGE_SIZE,
    );
  });

  it('ne dérange personne pour une requête vide', async () => {
    // C'est l'état du champ à l'ouverture de la banque, pas une erreur.
    let appelé = false;
    const providers = [
      fournisseur('a', () => {
        appelé = true;
        return [];
      }),
    ];

    expect(await searchBankImages('   ', fetch, providers)).toEqual([]);
    expect(appelé).toBe(false);
  });

  it('rend une liste vide quand tous ont répondu sans rien trouver', async () => {
    const providers = [fournisseur('a', () => [])];

    expect(await searchBankImages('xyzzy', fetch, providers)).toEqual([]);
  });
});

describe('findBankImage', () => {
  it('suit l’ordre de préférence des fournisseurs', async () => {
    // La grille entrelace pour laisser l'œil trancher ; le choix d'office, lui,
    // n'a pas d'œil et doit donc préférer explicitement.
    const providers = [
      fournisseur('a', () => combien('a', 2)),
      fournisseur('b', () => combien('b', 2)),
    ];

    const trouvée = await findBankImage('avocat', fetch, providers);

    expect(trouvée?.id).toBe('a-0');
  });

  it('passe au suivant quand le préféré ne trouve rien', async () => {
    const providers = [
      fournisseur('a', () => []),
      fournisseur('b', () => combien('b', 1)),
    ];

    expect((await findBankImage('avocat', fetch, providers))?.id).toBe('b-0');
  });

  it('passe au suivant quand le préféré est tombé', async () => {
    const providers = [
      fournisseur('a', () => new Error('503')),
      fournisseur('b', () => combien('b', 1)),
    ];

    expect((await findBankImage('avocat', fetch, providers))?.id).toBe('b-0');
  });

  it('élargit au premier mot quand le libellé entier ne rend rien', async () => {
    // Le cas qui justifie tout : la recherche automatique se déclenche là où
    // l'emoji manque, donc sur des libellés que les banques ignorent tels
    // quels.
    const requêtes: string[] = [];
    const providers = [
      fournisseur('a', (query) => {
        requêtes.push(query);
        return 'yaourt' === query ? combien('a', 1) : [];
      }),
    ];

    expect((await findBankImage('yaourt vanille', fetch, providers))?.id).toBe(
      'a-0',
    );
    expect(requêtes).toEqual(['yaourt vanille', 'yaourt']);
  });

  it('n’élargit pas un libellé d’un seul mot', async () => {
    // Ce serait la même requête : un appel de plus pour la même réponse.
    const requêtes: string[] = [];
    const providers = [
      fournisseur('a', (query) => {
        requêtes.push(query);
        return [];
      }),
    ];

    expect(await findBankImage('  yaourt  ', fetch, providers)).toBeNull();
    expect(requêtes).toEqual(['yaourt']);
  });

  it('rend rien quand même le mot élargi ne trouve rien', async () => {
    const providers = [fournisseur('a', () => [])];

    expect(
      await findBankImage('cadeau anniversaire mamie', fetch, providers),
    ).toBeNull();
  });

  it('ne cherche pas d’image pour un libellé vide', async () => {
    const providers = [fournisseur('a', () => combien('a', 1))];

    expect(await findBankImage('   ', fetch, providers)).toBeNull();
  });
});
