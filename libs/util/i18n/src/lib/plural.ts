import { inject, Injectable, Pipe, PipeTransform } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Les catégories CLDR, dans l'ordre où `Intl.PluralRules` peut les rendre.
 * Aucune langue ne les utilise toutes : le français en a deux, le polonais
 * quatre.
 */
export type PluralCategory = Intl.LDMLPluralRule;

/**
 * Sélection de la forme plurielle d'un libellé.
 *
 * Une traduction au pluriel s'écrit comme un petit objet, une entrée par
 * forme, plus des cas exacts si la langue ou le propos le demandent :
 *
 * ```json
 * "usage": { "one": "{{count}} achat", "other": "{{count}} achats" },
 * "offline": {
 *   "=0": "Hors ligne",
 *   "one": "Hors ligne · {{count}} modif en attente",
 *   "other": "Hors ligne · {{count}} modifs en attente"
 * }
 * ```
 *
 * La forme est choisie par `Intl.PluralRules`, présent dans tous les
 * navigateurs visés et adossé aux données CLDR. C'est ce qui rend « 0 produit
 * archivé » correct en français et « 0 archived products » en anglais : aucun
 * `count === 1` écrit à la main dans un template ne connaît cette règle, et
 * l'écrire pour chaque langue qu'on ajoutera est un piège.
 *
 * L'alternative officielle, `@jsverse/transloco-messageformat`, embarque un
 * compilateur ICU complet : ~19 ko compressés — plus que Transloco lui-même —
 * pour cinq messages, et de quoi faire sortir l'application du budget de
 * bundle qu'elle s'est fixé.
 */
@Injectable({ providedIn: 'root' })
export class Plural {
  private readonly transloco = inject(TranslocoService);
  /**
   * La langue vient du navigateur et ne change pas en cours de session : les
   * règles se construisent une fois.
   */
  private readonly rules = new Intl.PluralRules(this.transloco.getActiveLang());

  /**
   * Traduit `key` en accordant le libellé sur `count`.
   *
   * `count` est toujours passé en paramètre d'interpolation, donc `{{count}}`
   * est disponible dans chaque forme. Une clé sans forme plurielle est rendue
   * telle quelle : l'appelant n'a pas à savoir si un libellé s'accorde ou non.
   */
  translate(
    key: string,
    count: number,
    params: Readonly<Record<string, unknown>> = {},
  ): string {
    const form = this.formOf(key, count);

    return this.transloco.translate(null === form ? key : `${key}.${form}`, {
      ...params,
      count,
    });
  }

  private formOf(key: string, count: number): string | null {
    // Transloco aplatit les traductions : les formes sont des clés pointées.
    const has = (form: string): boolean =>
      undefined !==
      this.transloco.getTranslation(this.transloco.getActiveLang())[
        `${key}.${form}`
      ];

    const exact = `=${count}`;
    if (has(exact)) {
      return exact;
    }

    const category = this.rules.select(count);
    if (has(category)) {
      return category;
    }

    // `other` est la seule forme que le CLDR garantit dans toutes les langues.
    return has('other') ? 'other' : null;
  }
}

/**
 * `{{ 'catalog.usage' | plural: entry.usage }}`
 *
 * Pure : la langue est figée pour la session, et `count` fait partie des
 * arguments — Angular réévalue donc dès qu'il change.
 */
@Pipe({ name: 'plural' })
export class PluralPipe implements PipeTransform {
  private readonly plural = inject(Plural);

  transform(
    key: string,
    count: number,
    params?: Readonly<Record<string, unknown>>,
  ): string {
    return this.plural.translate(key, count, params);
  }
}
