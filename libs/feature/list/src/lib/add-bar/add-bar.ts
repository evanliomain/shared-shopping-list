import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SuggestionView } from '@shopping-list/data-access/shopping';
import { ProductAvatar } from '@shopping-list/ui';

/**
 * Barre d'ajout et panneau de suggestions.
 *
 * Le geste que l'application doit rendre trivial : refaire la liste de la
 * semaine sans rien retaper. Le panneau propose donc **l'historique d'abord**,
 * classé par usage et récence, et ne propose de créer un produit qu'en dernier
 * recours, quand la saisie ne correspond à rien de connu.
 */
@Component({
  selector: 'sl-add-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductAvatar, TranslocoPipe],
  template: `
    @if (picking()) {
      <div class="panel">
        @if (0 === suggestions().length && !canCreate()) {
          <p class="hint">{{ 'addBar.emptyHistory' | transloco }}</p>
        }

        <ul class="suggestions">
          @for (suggestion of suggestions(); track suggestion.productId) {
            <li>
              <button
                type="button"
                class="suggestion"
                [class.already]="suggestion.alreadyInList"
                (click)="picked.emit(suggestion)"
              >
                <sl-product-avatar [emoji]="suggestion.emoji" />
                <span class="text">
                  <span class="label">{{ suggestion.label }}</span>
                  @if ('' !== suggestion.description) {
                    <span class="description">{{
                      suggestion.description
                    }}</span>
                  }
                </span>
                @if (suggestion.alreadyInList) {
                  <span class="badge">
                    {{ 'addBar.alreadyInList' | transloco }}
                  </span>
                }
              </button>
            </li>
          }
        </ul>

        @if (canCreate()) {
          <button type="button" class="create" (click)="created.emit(query())">
            <span class="plus" aria-hidden="true">＋</span>
            {{ 'addBar.create' | transloco: { label: query() } }}
          </button>
        }
      </div>
    }

    <form class="bar" (submit)="submit($event)">
      <input
        type="text"
        name="article"
        autocomplete="off"
        enterkeyhint="done"
        [placeholder]="'addBar.placeholder' | transloco"
        [value]="query()"
        (input)="onInput($event)"
        (focus)="focused.emit()"
      />

      @if (picking()) {
        <button type="button" class="close" (click)="dismissed.emit()">
          {{ 'common.close' | transloco }}
        </button>
      }
    </form>
  `,
  styles: `
    :host {
      display: block;
      border-block-start: 1px solid var(--sl-border);
      background: var(--sl-surface);
      padding-block-end: var(--sl-safe-bottom);
    }

    .panel {
      max-block-size: 50dvh;
      overflow-y: auto;
      border-block-end: 1px solid var(--sl-border);
    }

    .hint {
      margin: 0;
      padding: var(--sl-space-4);
      color: var(--sl-text-muted);
      font-size: 0.875rem;
      text-align: center;
    }

    .suggestions {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .suggestion {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      inline-size: 100%;
      min-block-size: var(--sl-tap-target);
      padding: var(--sl-space-2) var(--sl-space-4);
      border: none;
      background: transparent;
      text-align: start;
    }

    .suggestion:active {
      background: var(--sl-surface-sunken);
    }

    .suggestion.already {
      opacity: 0.55;
    }

    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-inline-size: 0;
    }

    .label,
    .description {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .description {
      color: var(--sl-text-muted);
      font-size: 0.8125rem;
    }

    .badge {
      flex: none;
      color: var(--sl-text-muted);
      font-size: 0.75rem;
    }

    .create {
      display: flex;
      align-items: center;
      gap: var(--sl-space-2);
      inline-size: 100%;
      min-block-size: var(--sl-tap-target);
      padding: var(--sl-space-2) var(--sl-space-4);
      border: none;
      border-block-start: 1px solid var(--sl-border);
      background: transparent;
      color: var(--sl-brand);
      font-weight: 600;
      text-align: start;
    }

    .plus {
      font-size: 1.1rem;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: var(--sl-space-2);
      padding: var(--sl-space-2) var(--sl-space-3);
    }

    input {
      flex: 1;
      min-block-size: var(--sl-tap-target);
      padding: 0 var(--sl-space-3);
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius-full);
      background: var(--sl-bg);
    }

    .close {
      flex: none;
      min-block-size: var(--sl-tap-target);
      padding: 0 var(--sl-space-3);
      border: none;
      border-radius: var(--sl-radius-full);
      background: transparent;
      color: var(--sl-text-muted);
      font-size: 0.875rem;
    }
  `,
})
export class AddBar {
  readonly query = input.required<string>();
  readonly picking = input.required<boolean>();
  readonly suggestions = input.required<readonly SuggestionView[]>();
  /** Vrai quand la saisie ne correspond à aucun produit connu. */
  readonly canCreate = input.required<boolean>();

  readonly queryChanged = output<string>();
  readonly picked = output<SuggestionView>();
  readonly created = output<string>();
  readonly focused = output<void>();
  readonly dismissed = output<void>();

  protected onInput(event: Event): void {
    this.queryChanged.emit((event.target as HTMLInputElement).value);
  }

  /**
   * Entrée au clavier : on prend la première suggestion si elle existe, sinon
   * on crée. C'est le geste rapide quand on prépare la liste au bureau.
   */
  protected submit(event: Event): void {
    event.preventDefault();

    const [first] = this.suggestions();
    if (undefined !== first) {
      this.picked.emit(first);
      return;
    }

    if (this.canCreate()) {
      this.created.emit(this.query());
    }
  }
}
