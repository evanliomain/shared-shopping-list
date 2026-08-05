import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * Le bouton d'ajout de la liste vide.
 *
 * Quand il n'y a rien à cocher, l'ajout *est* l'écran : le geste monte au
 * centre en 64 px avec son libellé écrit en toutes lettres, au lieu de rester
 * tapi dans un coin. Sur une liste déjà pleine, ce n'est plus lui qui porte
 * l'ajout mais le contrôle flottant `sl-add-control`, qui se fait champ.
 */
@Component({
  selector: 'sl-add-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="pressed.emit()">
      <span class="plus" aria-hidden="true">＋</span>
      {{ label() }}
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      inline-size: 100%;
      max-inline-size: 18.125rem;
    }

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--sl-space-3);
      inline-size: 100%;
      min-block-size: 4rem;
      border: none;
      border-radius: var(--sl-radius);
      background: var(--sl-brand);
      color: var(--sl-text-on-brand);
      box-shadow: var(--sl-shadow-lg);
      font-size: var(--sl-font-lg);
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    button:active {
      background: var(--sl-brand-strong);
    }

    .plus {
      font-size: 1.5rem;
      font-weight: 400;
      line-height: 1;
    }
  `,
})
export class AddButton {
  /** Ce que l'ajout ajoute, écrit sur le bouton. */
  readonly label = input.required<string>();

  readonly pressed = output<void>();
}
