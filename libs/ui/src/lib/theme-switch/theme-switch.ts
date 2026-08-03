import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Theme, THEMES } from '@shopping-list/util/theme';

/** Le glyphe de chaque thème. Décoratif : c'est le nom accessible qui parle. */
const GLYPHS: Readonly<Record<Theme, string>> = {
  light: '☀',
  dark: '☾',
  system: '⌂',
};

/**
 * Choix du thème : clair, sombre, ou celui du système.
 *
 * Trois segments plutôt qu'un bouton qui fait le tour : « système » n'est pas
 * un troisième thème mais l'absence de choix, et un cycle ne dit jamais où il
 * en est sans qu'on le regarde. Ici les trois états sont visibles d'un coup, et
 * lisibles comme un groupe de boutons radio.
 *
 * Composant muet : il reçoit le thème, il émet celui qu'on demande. Le stockage
 * et l'attribut du document sont l'affaire de `ThemeStore`.
 */
@Component({
  selector: 'sl-theme-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div role="radiogroup" [attr.aria-label]="'theme.label' | transloco">
      @for (option of themes; track option) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option === theme()"
          [attr.aria-label]="'theme.' + option | transloco"
          [attr.title]="'theme.' + option | transloco"
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

    /* Un seul creux pour les trois : la pastille active se lit par contraste
       avec ses voisines, sans bordure à dessiner. */
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
export class ThemeSwitch {
  readonly theme = input.required<Theme>();
  readonly chosen = output<Theme>();

  protected readonly themes = THEMES;

  protected glyph(theme: Theme): string {
    return GLYPHS[theme];
  }
}
