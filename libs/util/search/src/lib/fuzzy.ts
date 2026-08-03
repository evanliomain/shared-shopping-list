import fuzzysort from 'fuzzysort';

/**
 * Recherche approximative, et de quoi en montrer le résultat.
 *
 * Toutes les recherches de l'application passent par ici. On ne cherche pas une
 * sous-chaîne : « lat » doit sortir « Lait », « ptdt » « Pommes de terre », et
 * « vanil » « Yaourt / à la vanille ». Dans un rayon, à une main, la frappe est
 * approximative — l'exigence d'exactitude était du côté de l'utilisateur.
 *
 * Le classement en découle : c'est le score qui ordonne, pas l'alphabet.
 *
 * Et puisque la correspondance n'est plus évidente à l'œil — les lettres
 * trouvées peuvent être éparpillées — chaque résultat sait dire *où* il a
 * répondu, pour que l'écran le surligne.
 */

/** Un fragment de texte, marqué s'il a répondu à la saisie. */
export interface Segment {
  readonly text: string;
  readonly matched: boolean;
}

/** Les diacritiques, une fois le texte décomposé. */
const COMBINING = /[̀-ͯ]/g;

/**
 * Un texte réduit à sa forme cherchable, sans perdre le chemin du retour.
 *
 * `fuzzysort` compare des chaînes telles quelles : sans repli, « cafe » ne
 * trouverait pas « Café ». Mais un repli qui déplace les caractères rendrait
 * les index inexploitables pour surligner l'original — d'où la table qui, pour
 * chaque caractère replié, dit d'où il vient.
 */
interface Folded {
  readonly text: string;
  readonly origins: readonly number[];
}

function fold(source: string): Folded {
  let text = '';
  const origins: number[] = [];

  // Caractère par caractère, et non sur la chaîne entière : c'est ce qui
  // garantit la table des origines même quand un caractère en donne deux
  // (« ﬁ » → « fi ») ou zéro (un accent isolé).
  for (let index = 0; index < source.length; index++) {
    const folded = source
      .charAt(index)
      .normalize('NFD')
      .replace(COMBINING, '')
      .toLowerCase();

    text += folded;
    for (let n = 0; n < folded.length; n++) {
      origins.push(index);
    }
  }

  return { text, origins };
}

function foldQuery(query: string): string {
  return fold(query).text.trim();
}

/**
 * Score d'une saisie contre les textes d'un candidat.
 *
 * 1 pour une correspondance parfaite, 0 exclu pour une lointaine, `null` quand
 * rien ne répond — c'est ce `null` qui écarte le candidat. Le meilleur des
 * textes l'emporte : trouver dans la description vaut trouver.
 *
 * Une saisie vide répond 1 partout. Les appelants n'ont donc pas à la traiter
 * à part : tout passe, et à score égal l'ordre reçu est conservé.
 */
export function fuzzyScore(
  query: string,
  ...texts: readonly string[]
): number | null {
  const search = foldQuery(query);
  if ('' === search) {
    return 1;
  }

  let best: number | null = null;

  for (const text of texts) {
    const result = fuzzysort.single(search, fold(text).text);
    if (null !== result && (null === best || result.score > best)) {
      best = result.score;
    }
  }

  return best;
}

/**
 * Découpe un texte en fragments, marquant ce que la saisie y a atteint.
 *
 * Saisie vide, texte vide ou sans correspondance : un seul fragment, non
 * marqué. L'appelant affiche donc toujours le même découpage, sans avoir à
 * distinguer les cas.
 */
export function segments(text: string, query: string): readonly Segment[] {
  const search = foldQuery(query);
  if ('' === search || '' === text) {
    return [{ text, matched: false }];
  }

  const folded = fold(text);
  const result = fuzzysort.single(search, folded.text);
  if (null === result) {
    return [{ text, matched: false }];
  }

  const hit = new Set(result.indexes.map((index) => folded.origins[index]));

  const parts: Segment[] = [];
  let at = 0;

  // Par point de code, et non par unité : un emoji en occupe deux, et le
  // couper en deux fragments en ferait deux losanges. Le compteur `at` suit
  // les unités, puisque c'est ce que compte la table des origines.
  for (const char of text) {
    const matched = hit.has(at);
    const last = parts[parts.length - 1];

    if (undefined !== last && last.matched === matched) {
      parts[parts.length - 1] = { text: last.text + char, matched };
    } else {
      parts.push({ text: char, matched });
    }

    at += char.length;
  }

  return parts;
}
