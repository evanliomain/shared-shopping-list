import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PluralPipe } from '@shopping-list/util/i18n';

import { ListUiStore } from '../list-ui.store';

/**
 * Le menu de l'en-tête : ce qui porte sur la liste entière.
 *
 * Il n'a qu'une entrée, « Vider la liste », et c'est déjà une raison d'exister
 * séparément du « Vider » du panier : l'un jette tout, l'autre seulement ce
 * qui est dans le caddie. Deux boutons du même nom à trois centimètres l'un de
 * l'autre finiraient par être tapés au hasard.
 *
 * Vider ne s'annule pas — le CRDT garde les tombstones, mais l'écran n'offre
 * aucun retour en arrière. D'où la confirmation, posée dans le popover
 * lui-même : le doigt est déjà là, et une boîte système au milieu des courses
 * se ferme sans être lue.
 */
@Component({
  selector: 'sl-list-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PluralPipe, RouterLink, TranslocoPipe],
  template: `
    <button
      type="button"
      class="toggle"
      [attr.aria-label]="'list.menu' | transloco"
      [attr.aria-expanded]="'closed' !== ui.listMenu()"
      (click)="ui.toggleListMenu()"
    >
      ⋯
    </button>

    @switch (ui.listMenu()) {
      @case ('open') {
        <div class="menu" role="menu">
          <!-- Régler le parcours vaut liste vide comme pleine : on arrange le
               magasin, pas les courses du jour. -->
          <a routerLink="/rayons" role="menuitem" (click)="ui.closeListMenu()">
            {{ 'list.reorderAisles' | transloco }}
          </a>
          <!-- Vider ne se propose que s'il y a de quoi vider. -->
          @if (0 < total()) {
            <button
              type="button"
              role="menuitem"
              class="danger"
              (click)="ui.askClearList()"
            >
              {{ 'list.clearList' | transloco }}
            </button>
          }
        </div>
      }
      @case ('confirmingClear') {
        <div class="menu" role="menu">
          <p>{{ 'list.clearListConfirm' | plural: total() }}</p>
          <button
            type="button"
            role="menuitem"
            class="danger"
            (click)="cleared.emit()"
          >
            {{ 'list.clearListAction' | transloco }}
          </button>
          <button type="button" role="menuitem" (click)="ui.closeListMenu()">
            {{ 'common.cancel' | transloco }}
          </button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      position: relative;
      flex: none;
    }

    .toggle {
      display: grid;
      place-items: center;
      inline-size: var(--sl-tap-target);
      block-size: var(--sl-tap-target);
      border: none;
      border-radius: var(--sl-radius-sm);
      background: transparent;
      color: var(--sl-text-muted);
      font-size: 1.125rem;
      line-height: 1;
    }

    .toggle[aria-expanded='true'] {
      background: var(--sl-surface-sunken);
      color: var(--sl-text);
    }

    /* Au-dessus de tout : il part de l'en-tête, qui surplombe déjà la liste et
       ses rayons collants. */
    .menu {
      position: absolute;
      inset-block-start: calc(100% - 0.375rem);
      inset-inline-end: 0;
      z-index: 40;
      display: flex;
      flex-direction: column;
      min-inline-size: 15rem;
      overflow: hidden;
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius);
      background: var(--sl-surface);
      box-shadow: var(--sl-shadow-lg);
    }

    p {
      margin: 0;
      padding: var(--sl-space-3) var(--sl-space-4);
      color: var(--sl-text-muted);
      font-size: var(--sl-font-md);
      line-height: 1.35;
    }

    /* Les issues empilées, pleine largeur : dans un rayon, on tape sans viser,
       et deux entrées côte à côte se touchent du même pouce. Un lien et un
       bouton doivent se présenter pareil, d'où le sélecteur commun. */
    [role='menuitem'] {
      display: flex;
      align-items: center;
      min-block-size: 3rem;
      padding-inline: var(--sl-space-4);
      border: none;
      background: transparent;
      color: var(--sl-text);
      font-size: 0.9375rem;
      text-align: start;
      text-decoration: none;
    }

    [role='menuitem']:not(:first-child) {
      border-block-start: 1px solid var(--sl-border);
    }

    [role='menuitem']:active {
      background: var(--sl-surface-sunken);
    }

    .danger {
      color: var(--sl-danger);
      font-weight: 600;
    }
  `,
})
export class ListMenu {
  /** Ce que vider retirerait — la question le dit plutôt que de le sous-entendre. */
  readonly total = input.required<number>();

  /** Confirmé : à l'écran de dispatcher, le menu ne connaît pas le store NgRx. */
  readonly cleared = output<void>();

  /**
   * L'état d'ouverture vit dans le SignalStore de la page, comme celui des
   * menus de ligne : c'est lui qui garantit qu'un seul popover est ouvert.
   */
  protected readonly ui = inject(ListUiStore);
}
