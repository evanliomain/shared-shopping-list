import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Vignette d'un produit.
 *
 * Au lot 1 elle n'affiche qu'un emoji. Le lot 5 y branchera les photos
 * (`blob:`), et l'emoji restera le repli tant que l'image n'est pas
 * téléchargée — ce qui est le cas normal juste après un échange par QR code.
 * Toute l'application passe par ce composant pour que ce basculement n'ait
 * qu'un seul endroit à changer.
 */
@Component({
  selector: 'sl-product-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (null !== imageUrl()) {
      <img [src]="imageUrl()" [alt]="alt()" />
    } @else {
      <span class="glyph" aria-hidden="true">{{ emoji() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      inline-size: var(--avatar-size, 2.25rem);
      block-size: var(--avatar-size, 2.25rem);
      border-radius: var(--sl-radius-sm);
      background: var(--sl-surface-sunken);
      user-select: none;
    }

    :host([data-size='lg']) {
      --avatar-size: 3.5rem;
    }

    .glyph {
      font-size: calc(var(--avatar-size, 2.25rem) * 0.62);
      line-height: 1;
    }

    img {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
      border-radius: inherit;
    }
  `,
  host: {
    '[attr.data-size]': 'size()',
  },
})
export class ProductAvatar {
  readonly emoji = input.required<string>();
  readonly size = input<'md' | 'lg'>('md');
  /**
   * Photo déjà résolue, ou `null`.
   *
   * Le composant ne va rien chercher lui-même : un composant muet ne fait pas
   * d'entrées-sorties. `null` est un état normal — après un échange par QR, la
   * photo n'est pas encore là et l'emoji fait le travail.
   */
  readonly imageUrl = input<string | null>(null);
  /** Vide par défaut : l'image double le libellé, déjà lu juste à côté. */
  readonly alt = input('');
}
