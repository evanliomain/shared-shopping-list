import { Aisle } from './aisles';
import { KEYWORDS_EN } from './keywords.en';
import { KEYWORDS_FR } from './keywords.fr';

/**
 * Dictionnaire mot-clé → { rayon, emoji }.
 *
 * Sert uniquement à *proposer* un rayon et un emoji au moment de la création
 * d'un produit : l'utilisateur peut toujours corriger, et sa correction est
 * ce qui est stocké dans le CRDT. On ne cherche donc pas l'exhaustivité, juste
 * à couvrir ce qu'on achète réellement toutes les semaines.
 *
 * **Toutes les langues sont fusionnées, sans dépendre de la langue de
 * l'interface.** Ce n'est pas un fichier de traduction : c'est le
 * dictionnaire qui reconnaît ce que l'utilisateur *tape*. Et ce qu'on tape ne
 * suit pas la langue de l'application — on écrit « pasta » dans une interface
 * française, et « baguette » dans une interface anglaise. Un dictionnaire par
 * langue rendrait le rangement dépendant d'un réglage système, alors que le
 * rayon proposé finit dans un CRDT partagé entre des appareils qui peuvent
 * très bien ne pas être réglés pareil.
 *
 * Le rayon et l'emoji, eux, sont des clés : elles ne changent pas d'une langue
 * à l'autre.
 */
export const KEYWORDS: ReadonlyArray<readonly [string, Aisle, string]> = [
  ...KEYWORDS_FR,
  ...KEYWORDS_EN,
];

export { KEYWORDS_EN, KEYWORDS_FR };
