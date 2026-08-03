import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/** Les deux échelles auxquelles l'ajout porte l'écran. */
export type AddButtonVariant = 'floating' | 'block';

/**
 * Le bouton d'ajout.
 *
 * Une seule couleur, deux échelles : c'est le même geste, pas deux boutons.
 *
 * - `floating` — 62 px en pastille, pendant la lecture de la liste. Le libellé
 *   n'est qu'un `aria-label` : à cette taille, le ＋ se lit de plus loin que
 *   n'importe quel mot. Il se place lui-même en bas à droite, et se retire sous
 *   le bord sur `retracted` — à charge de l'écran qui l'accueille d'être un
 *   contexte de positionnement, et de ne pas laisser dépasser ce qui sort.
 * - `block` — 64 px libellé, quand l'ajout est la seule chose à faire. Là,
 *   l'ajout *est* l'écran, et le bouton a la place de le dire.
 */
@Component({
  selector: 'sl-add-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [attr.aria-label]="'block' === variant() ? null : label()"
      (click)="pressed.emit()"
    >
      <span class="plus" aria-hidden="true">＋</span>
      @if ('block' === variant()) {
        {{ label() }}
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--sl-space-3);
      inline-size: 100%;
      border: none;
      background: var(--sl-brand);
      color: var(--sl-text-on-brand);
      box-shadow: var(--sl-shadow-lg);
    }

    button:active {
      background: var(--sl-brand-strong);
    }

    .plus {
      font-weight: 400;
      line-height: 1;
    }

    /* À 16 px du bord droit : dans le pouce d'une main droite comme d'une main
       gauche tenant le téléphone par le bas. */
    :host([data-variant='floating']) {
      position: absolute;
      inset-block-end: calc(1.875rem + var(--sl-safe-bottom));
      inset-inline-end: var(--sl-space-4);
      z-index: 30;
      inline-size: 3.875rem;
      block-size: 3.875rem;
      transition:
        transform 140ms ease,
        visibility 140ms;
    }

    /* Retiré, il glisse de 88 px sous le bord. La visibilité se transitionne
       comme un pas : elle ne tombe qu'à la fin du glissé, mais le bouton sort
       alors de l'ordre de tabulation — un bouton invisible et atteignable au
       clavier serait pire que pas de bouton du tout. */
    :host([data-variant='floating'][data-retracted='true']) {
      visibility: hidden;
      transform: translateY(5.5rem);
    }

    :host([data-variant='floating']) button {
      block-size: 100%;
      border-radius: var(--sl-radius-full);
    }

    :host([data-variant='floating']) .plus {
      font-size: 1.875rem;
    }

    :host([data-variant='block']) {
      inline-size: 100%;
      max-inline-size: 18.125rem;
    }

    :host([data-variant='block']) button {
      min-block-size: 4rem;
      border-radius: var(--sl-radius);
      font-size: var(--sl-font-lg);
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    :host([data-variant='block']) .plus {
      font-size: 1.5rem;
    }
  `,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-retracted]': 'retracted()',
  },
})
export class AddButton {
  /** Ce que l'ajout ajoute : lu à voix haute, ou écrit en `block`. */
  readonly label = input.required<string>();
  readonly variant = input<AddButtonVariant>('floating');
  /** Retiré sous le bord de l'écran. `floating` seulement. */
  readonly retracted = input(false);

  readonly pressed = output<void>();
}
