import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { segments } from '@shopping-list/util/search';

/**
 * Un texte, avec ce que la saisie y a trouvé mis en évidence.
 *
 * La recherche étant approximative, la correspondance ne se voit plus : taper
 * « lat » sort « Lait », et sans surlignage on se demande pourquoi. Les
 * lettres trouvées répondent à la place — c'est ce qui rend une liste de
 * résultats flous lisible au lieu d'arbitraire.
 *
 * Le surlignage double la couleur d'un gras : la teinte seule ne porte jamais
 * l'information (RGAA 3.1), et un `<mark>` reste annoncé comme tel.
 */
@Component({
  selector: 'sl-matched-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (part of parts(); track $index) {
      @if (part.matched) {
        <mark>{{ part.text }}</mark>
      } @else {
        <span>{{ part.text }}</span>
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    mark {
      background: var(--sl-brand-soft);
      color: var(--sl-brand-ink);
      font-weight: 700;
      border-radius: 0.1875rem;
    }
  `,
})
export class MatchedText {
  readonly text = input.required<string>();
  /** La saisie en cours. Vide : le texte sort tel quel, sans surlignage. */
  readonly query = input('');

  protected readonly parts = computed(() =>
    segments(this.text(), this.query()),
  );
}
