import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { asCount, ItemView } from '@shopping-list/data-access/shopping';
import { PluralPipe } from '@shopping-list/util/i18n';

/** Un compte visé sur une ligne dictée. Sous 1, la ligne repart de la liste. */
export interface DictationStep {
  readonly item: ItemView;
  readonly count: number;
}

/**
 * La relecture de la dictée : ce qu'on vient de dicter, corrigeable d'un pas.
 *
 * On l'ouvre par le compteur, jamais imposée — en rafale on ne la regarde pas.
 * Chaque ligne comptée porte un stepper −/+ ; une quantité libre (« 500 g »)
 * ne se compte pas, elle offre un ✎ qui rouvre le pavé. « Reprendre la dictée »
 * (comme « Fermer ») ramène à la saisie, le curseur prêt pour la suite.
 */
@Component({
  selector: 'sl-dictation-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PluralPipe, TranslocoPipe],
  templateUrl: './dictation-review.html',
  styleUrl: './dictation-review.scss',
})
export class DictationReview {
  /** Les lignes dictées depuis l'ouverture, de la plus récente à la plus ancienne. */
  readonly entries = input.required<readonly ItemView[]>();

  /** −/+ : le compte visé sur une ligne. Sous 1, la ligne sera retirée. */
  readonly stepped = output<DictationStep>();
  /** ✎ : rouvrir le pavé sur une quantité libre. */
  readonly edit = output<ItemView>();
  /** « Fermer » ou « Reprendre la dictée » : retour à la saisie. */
  readonly dismissed = output<void>();

  /**
   * Chaque ligne avec son compte, ou `null` quand la quantité est libre : c'est
   * ce qui décide du stepper ou du ✎, calculé une fois plutôt qu'à chaque bouton.
   *
   * Une quantité vide vaut un : c'est le défaut d'un ＋1, qui ne s'écrit pas mais
   * se corrige au pas comme tout compte — sans quoi il tomberait à tort côté ✎.
   */
  protected readonly rows = computed(() =>
    this.entries().map((entry) => ({
      entry,
      count: '' === entry.qty ? 1 : asCount(entry.qty),
    })),
  );
}
