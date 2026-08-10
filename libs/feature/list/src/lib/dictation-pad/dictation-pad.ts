import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { trackKeyboardInset } from '../keyboard-inset';

/**
 * Les unités de la saisie libre, dans l'ordre des jetons.
 *
 * `u` est le compte pur : il ne s'écrit pas dans la quantité, « 3 u » se pose
 * comme « 3 » et se relit « ×3 ». Les autres sont des symboles (g, kg, L) ou un
 * mot voyageur (pack) : ils restent tels quels, communs aux deux langues, pour
 * qu'une quantité saisie sur un téléphone se lise à l'identique sur l'autre.
 */
export const PAD_UNITS: readonly string[] = ['u', 'g', 'kg', 'L', 'pack'];

/**
 * Le pavé de saisie libre : « 500 g », « 2 packs », « 1,5 L ».
 *
 * Il s'ouvre depuis ＋… quand le compte ne suffit pas — un poids, un volume, un
 * conditionnement. Une seule vue, une seule sortie : la valeur au pavé numérique,
 * l'unité en jetons, et le bouton « Ajouter 500 g » qui pose la quantité et
 * rend la main à la dictée. `＋…` construit une valeur ; il ne la choisit pas,
 * donc il **pose** la quantité au lieu de l'incrémenter comme la rangée.
 */
@Component({
  selector: 'sl-dictation-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './dictation-pad.html',
  styleUrl: './dictation-pad.scss',
  host: {
    '[style.--sl-kb]': 'kbStyle()',
  },
})
export class DictationPad {
  /** L'article qu'on quantifie — le libellé en cours, ou la ligne qu'on réédite. */
  readonly article = input.required<string>();
  /** Valeur d'amorce : vide pour une saisie neuve, « 500 » pour une réédition. */
  readonly value = input('');
  /** Unité d'amorce, un des `PAD_UNITS`. */
  readonly unit = input('u');

  /** « Retour » : on quitte le pavé sans rien poser. */
  readonly back = output<void>();
  /** « Ajouter » : la quantité composée, prête à poser sur la ligne. */
  readonly submitted = output<string>();

  protected readonly units = PAD_UNITS;

  // Valeur et unité éditables, amorcées sur les entrées. Le pavé se recrée à
  // chaque ouverture : l'amorce se lit une fois, puis la saisie prend la main.
  protected readonly draft = linkedSignal(() => this.value());
  protected readonly chosenUnit = linkedSignal(() => this.unit());

  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  // Le pavé se dresse sur le clavier numérique : sa rangée d'action remonte de
  // la hauteur du clavier, comme celle de la dictée.
  private readonly kbInset = trackKeyboardInset();
  protected readonly kbStyle = computed(() => `${this.kbInset()}px`);

  /**
   * La quantité composée, telle qu'elle sera posée sur la ligne. Une unité `u`
   * se réduit au nombre nu (« 3 » → « ×3 ») ; les autres accolent leur symbole
   * (« 500 g »). Vide tant que rien n'est saisi : il n'y a alors rien à poser.
   */
  protected readonly composed = computed(() => {
    const value = this.draft().trim();
    if ('' === value) {
      return '';
    }
    return 'u' === this.chosenUnit() ? value : `${value} ${this.chosenUnit()}`;
  });

  /** Ce que le bouton annonce : la valeur suivie de son unité, toujours. */
  protected readonly label = computed(() => {
    const value = this.draft().trim();
    return '' === value ? '' : `${value} ${this.chosenUnit()}`;
  });

  constructor() {
    // Comme la dictée, le pavé donne le focus à la frame suivante : le champ
    // vient d'être inséré, le focus posé dans la foulée se ferait reprendre.
    afterNextRender(() =>
      requestAnimationFrame(() => this.field().nativeElement.focus()),
    );
  }

  protected onInput(event: Event): void {
    // Le clavier numérique ne rend que des chiffres et un séparateur ; on s'en
    // tient là, virgule ramenée au point pour une quantité qui se relit partout.
    const cleaned = (event.target as HTMLInputElement).value
      .replace(/[^\d.,]/g, '')
      .replace(/,/g, '.');
    this.draft.set(cleaned);
  }

  protected chooseUnit(unit: string): void {
    this.chosenUnit.set(unit);
  }

  /**
   * « Ajouter » pose la quantité composée. Le bouton est éteint tant que rien
   * n'est saisi (voir `[disabled]`) ; la garde ici double la touche Entrée, qui
   * n'a pas de `disabled` à respecter.
   */
  protected submit(): void {
    const composed = this.composed();
    if ('' !== composed) {
      this.submitted.emit(composed);
    }
  }
}
