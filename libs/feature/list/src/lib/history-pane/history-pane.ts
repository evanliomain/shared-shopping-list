import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Store } from '@ngrx/store';
import {
  filterSuggestions,
  ProductImages,
  selectSuggestions,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { EmptyState, MatchedText, ProductAvatar } from '@shopping-list/ui';
import { PluralPipe } from '@shopping-list/util/i18n';

/**
 * L'historique en colonne, sur écran large.
 *
 * Au-delà de 1040 px, l'historique cesse d'être un écran séparé : préparer la
 * liste de la semaine au bureau se fait alors sans aller-retour, en tapant sur
 * ce qu'on achète déjà.
 *
 * Volontairement distinct de l'écran `/historique`, et non un composant
 * partagé avec lui : ici on **ajoute**, là-bas on **range**. Les deux montrent
 * des produits, mais un archivage n'a rien à faire à côté d'une liste en cours
 * de composition, et un panneau qui saurait faire les deux serait plus gros
 * que les deux réunis.
 */
@Component({
  selector: 'sl-history-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, MatchedText, PluralPipe, ProductAvatar, TranslocoPipe],
  template: `
    <div class="head">
      <h2>{{ 'catalog.title' | transloco }}</h2>
      <div class="search">
        <span aria-hidden="true">🔍</span>
        <input
          type="search"
          [placeholder]="'catalog.search' | transloco"
          autocomplete="off"
          [value]="query()"
          (input)="onQuery($event)"
        />
      </div>
    </div>

    <div class="body">
      @if (0 === entries().length) {
        <sl-empty-state
          emoji="🔍"
          [title]="'catalog.noMatchTitle' | transloco"
          [hint]="'catalog.noMatchHint' | transloco"
        />
      } @else {
        <ul>
          @for (entry of entries(); track entry.productId) {
            <li>
              <sl-product-avatar
                [emoji]="entry.emoji"
                [imageUrl]="images.urlFor(entry.imageRef)"
              />
              <span class="text">
                <span class="label">
                  <sl-matched-text [text]="entry.label" [query]="query()" />
                </span>
                @if ('' !== entry.description) {
                  <span class="description">
                    <sl-matched-text
                      [text]="entry.description"
                      [query]="query()"
                    />
                  </span>
                }
                <span class="meta">
                  {{ 'aisles.' + entry.aisle | transloco }} ·
                  {{ 'catalog.usage' | plural: entry.usage }}
                </span>
              </span>
              @if (entry.alreadyInList) {
                <span class="chip">{{ 'catalog.inList' | transloco }}</span>
              } @else {
                <button
                  type="button"
                  class="add"
                  [attr.aria-label]="
                    'catalog.add' | transloco: { label: entry.label }
                  "
                  (click)="added.emit(entry)"
                >
                  ＋
                </button>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto 1fr;
      min-block-size: 0;
      border-inline-start: 1px solid var(--sl-border);
    }

    .head {
      padding: 1.25rem var(--sl-space-5) 0.875rem;
      border-block-end: 1px solid var(--sl-border);
      background: var(--sl-surface);
    }

    h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    .search {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-block-start: 0.625rem;
      min-block-size: var(--sl-tap-target);
      padding-inline: 0.875rem;
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius-full);
      background: var(--sl-bg);
    }

    .search:focus-within {
      padding-inline: calc(0.875rem - 1px);
      border: 2px solid var(--sl-brand);
    }

    input {
      flex: 1;
      min-inline-size: 0;
      align-self: stretch;
      border: none;
      background: transparent;
      font-size: 0.90625rem;
    }

    input:focus-visible {
      outline: none;
    }

    .body {
      min-block-size: 0;
      overflow-y: auto;
      padding: var(--sl-space-3);
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      overflow: hidden;
      border-radius: var(--sl-radius);
      background: var(--sl-surface);
      box-shadow: var(--sl-shadow);
    }

    li {
      display: flex;
      align-items: center;
      gap: var(--sl-space-3);
      min-block-size: 3.875rem;
      padding: 0.625rem 0.625rem 0.625rem 0.875rem;
    }

    li + li {
      position: relative;
    }

    li + li::before {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-inline: 3.875rem 0;
      block-size: 1px;
      background: var(--sl-border);
    }

    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-inline-size: 0;
    }

    .label,
    .description,
    .meta {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .label {
      font-size: var(--sl-font-base);
      font-weight: 550;
    }

    /* Affichée seulement ici quand elle existe : c'est souvent sur elle que la
       recherche a répondu (« vanille » pour « Yaourt »), et un surlignage sur
       un texte absent de l'écran ne se voit pas. */
    .description,
    .meta {
      color: var(--sl-text-muted);
      font-size: var(--sl-font-xs);
    }

    .chip {
      flex: none;
      padding: 0.1875rem 0.5625rem;
      border-radius: var(--sl-radius-full);
      background: var(--sl-surface-sunken);
      color: var(--sl-text-muted);
      font-size: var(--sl-font-2xs);
      font-weight: 600;
    }

    .add {
      flex: none;
      display: grid;
      place-items: center;
      inline-size: 2.5rem;
      block-size: 2.5rem;
      border: none;
      border-radius: var(--sl-radius-full);
      background: var(--sl-brand-soft);
      color: var(--sl-brand-ink);
      font-size: 1.125rem;
      font-weight: 600;
    }
  `,
})
export class HistoryPane {
  readonly added = output<SuggestionView>();

  private readonly store = inject(Store);
  protected readonly images = inject(ProductImages);

  private readonly all = this.store.selectSignal(selectSuggestions);

  /** Recherche propre au panneau, distincte de la barre d'ajout. */
  protected readonly query = signal('');

  protected readonly entries = computed(() =>
    filterSuggestions(this.all(), this.query().trim()),
  );

  constructor() {
    effect(() => this.images.ensure(this.entries().map((e) => e.imageRef)));
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
