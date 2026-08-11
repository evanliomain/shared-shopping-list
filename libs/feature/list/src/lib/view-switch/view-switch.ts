import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { ViewMode, VIEW_MODES } from '../list-ui.store';

/** Le glyphe de chaque disposition. Décoratif : c'est le nom accessible qui parle. */
const GLYPHS: Readonly<Record<ViewMode, string>> = {
  aisle: '🗂',
  recent: '🕑',
};

/**
 * Choix de la disposition du corps de liste : par rayon, ou par récence.
 *
 * Deux segments plutôt qu'un bouton qui bascule : les deux états sont visibles
 * d'un coup et se lisent comme une paire de boutons radio — un simple toggle ne
 * dirait jamais laquelle des deux vues est active sans qu'on la regarde. C'est
 * le même parti que `sl-theme-switch`, dont il reprend le gabarit.
 *
 * Composant muet : il reçoit le mode, il émet celui qu'on demande. L'état vit
 * dans le `ListUiStore` de la page.
 */
@Component({
  selector: 'sl-view-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div role="radiogroup" [attr.aria-label]="'list.viewSwitch' | transloco">
      @for (option of modes; track option) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option === mode()"
          [attr.aria-label]="'list.view.' + option | transloco"
          [attr.title]="'list.view.' + option | transloco"
          (click)="chosen.emit(option)"
        >
          <span aria-hidden="true">{{ glyph(option) }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      flex: none;
    }

    /* Un seul creux pour les deux : la pastille active se lit par contraste
       avec sa voisine, sans bordure à dessiner. */
    div {
      display: flex;
      gap: 0.125rem;
      padding: 0.125rem;
      border-radius: var(--sl-radius-full);
      background: var(--sl-surface-sunken);
    }

    button {
      display: grid;
      place-items: center;
      inline-size: 2rem;
      block-size: 2rem;
      border: none;
      border-radius: var(--sl-radius-full);
      background: transparent;
      color: var(--sl-text-muted);
      font-size: 0.875rem;
      line-height: 1;
    }

    /* La couleur ne porte pas le message toute seule : le choix se voit aussi
       à sa pastille pleine, et s'annonce par aria-checked. */
    button[aria-checked='true'] {
      background: var(--sl-surface);
      color: var(--sl-text);
      box-shadow: var(--sl-shadow);
    }
  `,
})
export class ViewSwitch {
  readonly mode = input.required<ViewMode>();
  readonly chosen = output<ViewMode>();

  protected readonly modes = VIEW_MODES;

  protected glyph(mode: ViewMode): string {
    return GLYPHS[mode];
  }
}
