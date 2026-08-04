import { chain, find, map, sortBy } from 'taninsam';

import { Aisle, AISLE_EMOJI, aisleOf, DEFAULT_AISLE } from './aisles';
import { KEYWORDS } from './keywords';

export interface CategorySuggestion {
  readonly aisle: Aisle;
  /** Emoji proposé, prêt à devenir un `imageRef` de la forme `emoji:🥕`. */
  readonly emoji: string;
  /**
   * Vrai si un mot-clé a effectivement reconnu le libellé.
   *
   * Sans ce drapeau, l'emoji du repli — le 🛒 du rayon « divers » — est
   * indiscernable d'un emoji trouvé. Or les deux ne valent pas la même chose :
   * le premier avoue qu'on n'a rien compris au libellé, et c'est précisément là
   * qu'une image de la banque vaut mieux qu'un caddie générique.
   *
   * Aucun mot-clé ne rangeant aujourd'hui dans « divers », `aisle` répondrait
   * la même chose. Mais cette équivalence tient à l'état du dictionnaire, pas à
   * une règle : le premier mot-clé rangé dans « divers » la casserait sans que
   * rien ne le signale. D'où un drapeau dit, plutôt que déduit.
   */
  readonly recognized: boolean;
}

/**
 * Minuscules, sans accents, espaces normalisés.
 *
 * Sert autant à la catégorisation qu'à la recherche dans le catalogue : taper
 * « creme » doit trouver « Crème fraîche ».
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface CompiledKeyword {
  readonly pattern: RegExp;
  readonly aisle: Aisle;
  readonly emoji: string;
  readonly words: number;
  readonly length: number;
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * Un motif par mot-clé, tolérant le pluriel sur chaque mot.
 *
 * Deux exigences qui se contredisent naïvement :
 *
 *  - « pomme » doit reconnaître « pommes » → d'où le `[sx]?` après chaque mot ;
 *  - « ail » ne doit **pas** être reconnu dans « volaille » → d'où les
 *    frontières de mot. Une simple recherche de sous-chaîne rangerait le poulet
 *    au rayon fruits et légumes.
 */
function compile([key, aisle, emoji]: readonly [
  string,
  Aisle,
  string,
]): CompiledKeyword {
  const words = normalize(key).split(' ');
  const body = words
    .map((w) => `${w.replace(ESCAPE, '\\$&')}[sx]?`)
    .join('\\s+');

  return {
    pattern: new RegExp(`(?:^|\\s)${body}(?:\\s|$)`),
    aisle,
    emoji,
    words: words.length,
    length: key.length,
  };
}

/**
 * Les mots-clés les plus spécifiques d'abord.
 *
 * Sans ce tri, « pommes de terre » serait capté par « pomme » et rangé au rayon
 * fruits avec une image de pomme. On teste donc les expressions les plus
 * longues, en nombre de mots puis en caractères, avant les mots isolés.
 */
const COMPILED: readonly CompiledKeyword[] = chain([...KEYWORDS])
  .chain(map(compile))
  .chain(
    sortBy<CompiledKeyword>(
      (k) => -k.words,
      (k) => -k.length,
    ),
  )
  .value() as CompiledKeyword[];

/**
 * Propose un rayon et un emoji pour un libellé.
 *
 * Ce n'est qu'une **proposition** : l'utilisateur peut toujours corriger, et
 * c'est sa correction qui est stockée dans le CRDT. On ne vise donc pas
 * l'exhaustivité, juste ce qu'on achète toutes les semaines.
 */
export function suggestCategory(label: string): CategorySuggestion {
  const haystack = normalize(label);

  const matched = chain([...COMPILED])
    .chain(find<CompiledKeyword>((k) => k.pattern.test(haystack)))
    .value();

  return undefined === matched
    ? {
        aisle: DEFAULT_AISLE,
        emoji: AISLE_EMOJI[DEFAULT_AISLE],
        recognized: false,
      }
    : { aisle: matched.aisle, emoji: matched.emoji, recognized: true };
}

/** Emoji par défaut d'un rayon, quand un produit n'a pas d'image à lui. */
export function emojiForAisle(aisle: string): string {
  return AISLE_EMOJI[aisleOf(aisle)];
}
