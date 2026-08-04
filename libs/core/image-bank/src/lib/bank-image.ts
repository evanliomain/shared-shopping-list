/**
 * Le crédit d'une image, tel qu'il doit être affiché et conservé.
 *
 * Les images de la banque sont sous licence Creative Commons : la plupart
 * exigent de nommer l'auteur et la licence. Ce crédit voyage donc avec l'image,
 * jusque dans le CRDT — sans quoi l'appareil qui reçoit la photo l'afficherait
 * sans savoir à qui elle est.
 *
 * Les morceaux sont gardés séparés plutôt que la phrase toute faite que rend
 * l'API : celle-ci n'existe qu'en anglais, et l'interface est bilingue.
 */
export interface BankImageCredit {
  /** Le titre donné par l'auteur, souvent plus parlant que le libellé du produit. */
  readonly title: string;
  readonly author: string;
  /** Déjà mise en forme pour l'œil : « CC BY 2.0 », « CC0 1.0 ». */
  readonly license: string;
  readonly licenseUrl: string;
  /** La page d'origine, pour remonter à l'œuvre entière. */
  readonly sourceUrl: string;
}

/** Une image trouvée dans la banque, prête à être montrée puis choisie. */
export interface BankImage {
  readonly id: string;
  /**
   * Qui l'a fournie, pour le dire dans la grille de résultats.
   *
   * N'est pas conservé dans le CRDT : `sourceUrl` suffit à remonter à l'origine,
   * et le crédit doit rester le plus petit possible puisqu'il se synchronise.
   */
  readonly provider: string;
  /**
   * La vignette servie par la banque elle-même.
   *
   * Et non l'original chez l'hébergeur : c'est ce qui rend la fonctionnalité
   * possible. Il faut lire les octets pour les réduire en WebP de 160 px, donc
   * il faut le CORS — que Flickr accorde, mais pas tous les hébergeurs que la
   * banque agrège. Le proxy de vignettes, lui, l'accorde toujours.
   */
  readonly thumbUrl: string;
  readonly credit: BankImageCredit;
}

/**
 * « by » + « 2.0 » → « CC BY 2.0 ».
 *
 * Les deux codes qui ne sont pas des licences Creative Commons au sens strict
 * font exception : CC0 est une renonciation, et la marque du domaine public
 * n'est pas versionnée.
 *
 * Le résultat n'est pas traduit, et ne doit pas l'être : ce sont des noms
 * propres, et ils sont conservés tels quels dans le CRDT. Une étiquette
 * traduite à l'écriture s'afficherait en français sur le téléphone réglé en
 * anglais qui reçoit l'image.
 */
export function formatLicense(code: string, version: string): string {
  if ('pdm' === code) {
    return 'Public Domain Mark';
  }

  const name = 'cc0' === code ? 'CC0' : `CC ${code.toUpperCase()}`;
  return '' === version ? name : `${name} ${version}`;
}

/**
 * Réduit un fragment HTML à son texte.
 *
 * Wikimedia Commons rend l'auteur en HTML — un lien vers sa page utilisateur,
 * parfois emballé dans du gras. Or ce nom finit dans un nœud de texte du CRDT :
 * y laisser des balises afficherait le balisage, et l'y interpréter serait pire.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un fournisseur d'images.
 *
 * Le contrat est volontairement minuscule — une requête, des images — pour que
 * brancher une banque de plus reste un fichier et une ligne de registre. Il n'y
 * a pas de pagination : la grille montre une poignée de résultats et le champ de
 * recherche est là pour affiner, ce qui est plus rapide que de faire défiler.
 */
export interface BankProvider {
  readonly id: string;
  readonly search: (
    query: string,
    fetchImpl: typeof fetch,
  ) => Promise<readonly BankImage[]>;
}

/** Combien chaque fournisseur en rend au plus, avant l'entrelacement. */
export const PER_PROVIDER = 8;
