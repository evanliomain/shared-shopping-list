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
      align-items: stretch;
      gap: var(--sl-space-1);
      border-radius: var(--sl-radius);
    }

    .toggle {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--sl-space-3);
      min-block-size: var(--sl-tap-target);
      padding: var(--sl-space-2) var(--sl-space-2);
      border: none;
      border-radius: var(--sl-radius);
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
      inline-size: 1.5rem;
      block-size: 1.5rem;
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
      font-size: 0.8rem;
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

    .description {
      color: var(--sl-text-muted);
      font-size: 0.8125rem;
    }

    .note {
      color: var(--sl-warning);
      font-size: 0.8125rem;
    }

    .qty {
      flex: none;
      padding: 0.125rem var(--sl-space-2);
      border-radius: var(--sl-radius-full);
      background: var(--sl-surface-sunken);
      color: var(--sl-text-muted);
      font-size: 0.8125rem;
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
      inline-size: var(--sl-tap-target);
      block-size: 100%;
      min-block-size: var(--sl-tap-target);
      border: none;
      border-radius: var(--sl-radius);
      background: transparent;
      color: var(--sl-text-muted);
      font-size: 1.1rem;
      line-height: 1;
    }

    .menu-toggle:active {
      background: var(--sl-surface-sunken);
    }

    .menu {
      position: absolute;
      inset-block-start: calc(100% + var(--sl-space-1));
      inset-inline-end: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      min-inline-size: 12rem;
      overflow: hidden;
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius);
      background: var(--sl-surface);
      box-shadow: var(--sl-shadow);
    }

    .menu > * {
      min-block-size: var(--sl-tap-target);
      display: flex;
      align-items: center;
      padding-inline: var(--sl-space-3);
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      text-decoration: none;
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
