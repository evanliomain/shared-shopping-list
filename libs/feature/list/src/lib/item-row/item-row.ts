import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { translateSignal, TranslocoPipe } from '@jsverse/transloco';
import { ItemView } from '@shopping-list/data-access/shopping';
import { ProductAvatar } from '@shopping-list/ui';

/**
 * Une ligne de la liste.
 *
 * Composant muet : il ne connaît ni le store ni le CRDT, il émet des
 * intentions. Toute la ligne est cliquable pour cocher — dans un rayon, viser
 * une case à cocher de 20 px avec un caddie dans l'autre main ne marche pas.
 */
@Component({
  selector: 'sl-item-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductAvatar, RouterLink, TranslocoPipe],
  template: `
    <button
      type="button"
      class="toggle"
      role="checkbox"
      [attr.aria-checked]="item().checked"
      (click)="toggled.emit(!item().checked)"
    >
      <span class="box" aria-hidden="true">
        @if (item().checked) {
          <span class="tick">✓</span>
        }
      </span>

      <sl-product-avatar [emoji]="item().emoji" [imageUrl]="imageUrl()" />

      <span class="text">
        <span class="label">{{ displayLabel() }}</span>
        @if ('' !== item().description) {
          <span class="description">{{ item().description }}</span>
        }
        @if (null !== item().note) {
          <span class="note">{{ item().note }}</span>
        }
      </span>

      @if ('' !== item().qty) {
        <span class="qty">{{ item().qty }}</span>
      }
    </button>

    <div class="actions">
      <button
        type="button"
        class="menu-toggle"
        [attr.aria-label]="
          'itemRow.actions' | transloco: { label: displayLabel() }
        "
        [attr.aria-expanded]="menuOpen()"
        (click)="menuToggled.emit()"
      >
        ⋯
      </button>

      @if (menuOpen()) {
        <div class="menu" role="menu">
          <a
            role="menuitem"
            [routerLink]="['/produit', item().productId]"
            (click)="menuToggled.emit()"
          >
            {{ 'itemRow.edit' | transloco }}
          </a>
          <button type="button" role="menuitem" (click)="removed.emit()">
            {{ 'itemRow.remove' | transloco }}
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      min-block-size: var(--sl-row-height);
      padding-inline-end: var(--sl-space-2);
    }

    :host([data-checked='true']) {
      opacity: 0.85;
    }

    .toggle {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--sl-space-3);
      min-inline-size: 0;
      min-block-size: var(--sl-row-height);
      padding: 0.5625rem 0 0.5625rem var(--sl-space-3);
      border: none;
      background: transparent;
      text-align: start;
    }

    .toggle:active {
      background: var(--sl-surface-sunken);
    }

    .box {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 1.625rem;
      block-size: 1.625rem;
      border: 2px solid var(--sl-border);
      border-radius: var(--sl-radius-full);
      transition:
        background 120ms ease,
        border-color 120ms ease;
    }

    :host([data-checked='true']) .box {
      border-color: var(--sl-brand);
      background: var(--sl-brand);
    }

    .tick {
      color: var(--sl-text-on-brand);
      font-size: var(--sl-font-sm);
      line-height: 1;
    }

    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-inline-size: 0;
    }

    .label,
    .description,
    .note {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .label {
      font-size: var(--sl-font-base);
      font-weight: 550;
      letter-spacing: -0.01em;
    }

    .description {
      color: var(--sl-text-muted);
      font-size: var(--sl-font-sm);
    }

    .note {
      color: var(--sl-warning);
      font-size: var(--sl-font-sm);
    }

    .qty {
      flex: none;
      padding: 0.1875rem 0.5625rem;
      border-radius: var(--sl-radius-full);
      background: var(--sl-surface-sunken);
      color: var(--sl-text-muted);
      font-size: var(--sl-font-xs);
      font-weight: 550;
      font-variant-numeric: tabular-nums;
    }

    :host([data-checked='true']) .label,
    :host([data-checked='true']) .qty {
      color: var(--sl-text-muted);
      text-decoration: line-through;
    }

    :host([data-checked='true']) sl-product-avatar {
      opacity: 0.5;
    }

    .actions {
      position: relative;
      flex: none;
    }

    .menu-toggle {
      inline-size: 2.5rem;
      min-block-size: var(--sl-tap-target);
      border: none;
      border-radius: var(--sl-radius-sm);
      background: transparent;
      color: var(--sl-text-muted);
      font-size: 1.125rem;
      line-height: 1;
    }

    /* Le bouton ouvert se teinte : avec plusieurs lignes à l'écran, la seule
       position du popover ne dit pas toujours de laquelle il est parti. */
    .menu-toggle[aria-expanded='true'] {
      background: var(--sl-surface-sunken);
      color: var(--sl-text);
    }

    .menu {
      position: absolute;
      inset-block-start: calc(100% - 0.375rem);
      inset-inline-end: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      min-inline-size: 13.5rem;
      overflow: hidden;
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius);
      background: var(--sl-surface);
      box-shadow: var(--sl-shadow-lg);
    }

    .menu > * {
      min-block-size: 3rem;
      display: flex;
      align-items: center;
      padding-inline: var(--sl-space-4);
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.9375rem;
      text-align: start;
      text-decoration: none;
    }

    .menu > * + * {
      border-block-start: 1px solid var(--sl-border);
    }

    .menu > *:active {
      background: var(--sl-surface-sunken);
    }

    .menu > button {
      color: var(--sl-danger);
    }
  `,
  host: {
    '[attr.data-checked]': 'item().checked',
  },
})
export class ItemRow {
  readonly item = input.required<ItemView>();
  readonly menuOpen = input(false);
  /** Photo du produit, si elle est déjà disponible localement. */
  readonly imageUrl = input<string | null>(null);

  readonly toggled = output<boolean>();
  readonly removed = output<void>();
  readonly menuToggled = output<void>();

  private readonly unknownLabel = translateSignal('list.unknownItem');

  /**
   * Le produit peut manquer : un delta qui ajoute la ligne peut arriver avant
   * celui qui le crée. La vue signale le cas par un drapeau, à charge pour
   * l'écran de trouver les mots — un selector, lui, ne connaît pas la langue.
   */
  protected readonly displayLabel = computed(() =>
    this.item().unknownProduct ? this.unknownLabel() : this.item().label,
  );
}
