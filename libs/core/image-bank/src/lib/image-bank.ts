import { TranslatableError } from '@shopping-list/util/i18n';

import { BankImage, BankProvider } from './bank-image';
import { openFoodFactsProvider } from './providers/open-food-facts';
import { openverseProvider } from './providers/openverse';
import { wikimediaProvider } from './providers/wikimedia';

/**
 * Les fournisseurs interrogés, **dans l'ordre de préférence**.
 *
 * Cet ordre ne sert qu'au choix d'office : `findBankImage` prend le premier
 * résultat du premier fournisseur qui a répondu quelque chose. La grille, elle,
 * les entrelace — c'est l'œil qui tranche, et il tranche mieux avec de la
 * variété.
 *
 * L'ordre a été mesuré sur de vraies requêtes françaises, et il est l'inverse de
 * ce qu'on suppose : c'est la **précision** qui compte, pas la beauté, parce
 * qu'une image d'office n'a personne pour la valider.
 *
 *  - **Open Food Facts** d'abord. Il rend le produit exact — « papier toilette »
 *    y donne « Papier toilette double épaisseur ultra doux ». Aucun autre ne fait
 *    ça. Il ne connaît que l'alimentaire et l'entretien, et il tombe souvent,
 *    d'où la suite ;
 *  - **Wikimedia Commons** ensuite : des photos propres et bien nommées, et une
 *    disponibilité que rien n'égale ici ;
 *  - **Openverse** en dernier, malgré la plus large couverture des trois. Son
 *    classement sur des libellés français est bruyant : « avocat » y rend des
 *    photos d'avocats du barreau, « lessive » du linge qui sèche. Il reste
 *    indispensable comme filet — c'est le seul à rendre quelque chose pour un
 *    libellé qui n'est pas un produit, du genre « cadeau anniversaire mamie ».
 *
 * Tous les trois sont **sans clé** et **CORS ouvert** sur la recherche comme sur
 * les octets. Ce n'est pas un hasard mais le critère de sélection : sans clé
 * parce que le bundle est public, et avec CORS parce qu'il faut lire les pixels
 * pour les réduire en WebP de 160 px.
 *
 * Ce que cette liste ne peut pas contenir, et pourquoi :
 *
 *  - **Unsplash, Pexels, Pixabay** — exigent une clé d'API, qui serait lisible
 *    par tout le monde dans un bundle servi depuis un dépôt public ;
 *  - **Google Images** — n'a plus d'API publique depuis 2011. Son seul
 *    successeur, l'API Custom Search, exige une clé, devient payante au-delà de
 *    cent requêtes par jour, et rend des vignettes servies par `gstatic.com`
 *    **sans en-tête CORS** : le navigateur ne pourrait pas en lire les octets,
 *    donc pas les réduire, donc pas les stocker. S'y ajoute que ses résultats
 *    n'ont aucune licence, alors que l'application republie chaque image dans le
 *    dépôt de synchro.
 */
export const BANK_PROVIDERS: readonly BankProvider[] = [
  openFoodFactsProvider,
  wikimediaProvider,
  openverseProvider,
];

/** Ce que la grille montre au plus, tous fournisseurs confondus. */
export const BANK_PAGE_SIZE = 12;

/**
 * Entrelace les réponses, un résultat par fournisseur à tour de rôle.
 *
 * Concaténer les listes reviendrait à cacher les deux derniers fournisseurs :
 * huit résultats du premier suffisent à remplir la grille, et le packshot exact
 * d'Open Food Facts se retrouverait sous la ligne de flottaison. L'entrelacement
 * garantit que chacun est représenté dès la première rangée.
 *
 * La déduplication porte sur l'URL de vignette : Openverse indexant Wikimedia,
 * la même image peut arriver deux fois.
 */
function interleave(
  responses: readonly (readonly BankImage[])[],
): readonly BankImage[] {
  const longest = Math.max(0, ...responses.map((list) => list.length));
  const seen = new Set<string>();
  const merged: BankImage[] = [];

  for (let rank = 0; rank < longest; rank++) {
    for (const list of responses) {
      const image = list[rank];

      if (undefined !== image && !seen.has(image.thumbUrl)) {
        seen.add(image.thumbUrl);
        merged.push(image);
      }
    }
  }

  return merged;
}

/**
 * Interroge tous les fournisseurs de front et rend ce qui est revenu.
 *
 * `allSettled` et non `all` : c'est le cœur de la stratégie à plusieurs
 * fournisseurs. Open Food Facts rend régulièrement un 503, Openverse limite le
 * débit des appels anonymes — avec `all`, un seul service à terre viderait la
 * grille alors que les deux autres avaient répondu.
 *
 * L'erreur n'est levée que si **aucun** n'a répondu : c'est le seul cas où il y
 * a quelque chose à dire à l'utilisateur.
 */
export async function searchBankImages(
  query: string,
  fetchImpl: typeof fetch = fetch,
  providers: readonly BankProvider[] = BANK_PROVIDERS,
): Promise<readonly BankImage[]> {
  const trimmed = query.trim();

  // L'état du champ à l'ouverture de la banque, pas une erreur.
  if ('' === trimmed) {
    return [];
  }

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.search(trimmed, fetchImpl)),
  );

  const answered = settled.filter(
    (result): result is PromiseFulfilledResult<readonly BankImage[]> =>
      'fulfilled' === result.status,
  );

  if (0 === answered.length) {
    throw new TranslatableError('errors.imageBank.noProvider');
  }

  return interleave(answered.map((result) => result.value)).slice(
    0,
    BANK_PAGE_SIZE,
  );
}

/**
 * Le meilleur résultat pour une requête, par ordre de préférence des
 * fournisseurs.
 *
 * `allSettled` préservant l'ordre des entrées, parcourir ses résultats revient à
 * parcourir `BANK_PROVIDERS` : le premier qui a trouvé quelque chose gagne. Un
 * fournisseur muet ou tombé est simplement sauté.
 */
async function bestOf(
  query: string,
  fetchImpl: typeof fetch,
  providers: readonly BankProvider[],
): Promise<BankImage | null> {
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.search(query, fetchImpl)),
  );

  for (const result of settled) {
    if ('fulfilled' === result.status && 0 < result.value.length) {
      return result.value[0];
    }
  }

  return null;
}

/**
 * L'image à proposer d'office pour un libellé, s'il en existe une.
 *
 * Deux tours au plus, et le second est ce qui fait la différence en pratique. La
 * recherche automatique se déclenche là où le dictionnaire d'emoji n'a rien
 * reconnu — donc sur des libellés inhabituels, souvent en français et souvent à
 * plusieurs mots, que les banques ne connaissent pas tels quels. « Yaourt
 * vanille » ne rend presque rien chez les généralistes ; « yaourt » rend ce
 * qu'il faut.
 *
 * On n'élargit qu'après un échec complet, jamais pour compléter une réponse
 * maigre : un seul résultat exact vaut mieux que douze approximatifs.
 */
export async function findBankImage(
  label: string,
  fetchImpl: typeof fetch = fetch,
  providers: readonly BankProvider[] = BANK_PROVIDERS,
): Promise<BankImage | null> {
  const trimmed = label.trim();

  if ('' === trimmed) {
    return null;
  }

  const exact = await bestOf(trimmed, fetchImpl, providers);

  if (null !== exact) {
    return exact;
  }

  const firstWord = trimmed.split(/\s+/)[0];

  // Ce serait la même requête : un appel de plus pour la même réponse.
  if (firstWord === trimmed) {
    return null;
  }

  return bestOf(firstWord, fetchImpl, providers);
}
