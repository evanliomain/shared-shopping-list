import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ProductImages,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { ProductAvatar } from '@shopping-list/ui';
import { PluralPipe } from '@shopping-list/util/i18n';

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
  imports: [PluralPipe, ProductAvatar, TranslocoPipe],
  template: `
    @if (picking()) {
      <div class="grip" aria-hidden="true"><span></span></div>

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
                <sl-product-avatar
                  [emoji]="suggestion.emoji"
                  [imageUrl]="images.urlFor(suggestion.imageRef)"
                />
                <span class="text">
                  <span class="label">{{ suggestion.label }}</span>
                  <span class="second">
                    @if ('' !== suggestion.description) {
                      {{ suggestion.description }}
                    } @else {
                      {{ 'aisles.' + suggestion.aisle | transloco }} ·
                      {{ 'catalog.usage' | plural: suggestion.usage }}
                    }
                  </span>
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
      <div class="field">
        <span class="plus" aria-hidden="true">＋</span>
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
      </div>

      @if (picking()) {
        <button type="button" class="close" (click)="dismissed.emit()">
          {{ 'common.close' | transloco }}
        </button>
      }
    </form>
  `,
  styles: `
    /* Ouverte, la barre devient une feuille : coins arrondis, poignée, ombre
       portée. Elle reste dans le flux de la grille plutôt que de se
       superposer — la liste qui rétrécit et s'estompe derrière dit la même
       chose qu'un vrai calque, sans positionnement absolu dans un conteneur
       qui défile. */
    :host {
      display: block;
      position: relative;
      z-index: 40;
      border-block-start: 1px solid var(--sl-border);
      background: var(--sl-surface);
      padding-block-end: var(--sl-safe-bottom);
    }

    :host([data-picking='true']) {
      border-start-start-radius: var(--sl-radius-lg);
      border-start-end-radius: var(--sl-radius-lg);
      box-shadow: var(--sl-shadow-lg);
    }

    .grip {
      display: grid;
      place-items: center;
      padding-block: var(--sl-space-2) 0.125rem;
    }

    .grip span {
      inline-size: 2.25rem;
      block-size: 0.25rem;
      border-radius: var(--sl-radius-full);
      background: var(--sl-border);
    }

    .panel {
      max-block-size: min(26.25rem, 50dvh);
      overflow-y: auto;
    }

    .hint {
      margin: 0;
      padding: var(--sl-space-4);
      color: var(--sl-text-muted);
      font-size: var(--sl-font-md);
      text-align: center;
      text-wrap: pretty;
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
      min-block-size: 3.5rem;
      padding: var(--sl-space-2) 1.25rem;
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
    .second {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .label {
      font-size: var(--sl-font-base);
      font-weight: 550;
    }

    .second {
      color: var(--sl-text-muted);
      font-size: var(--sl-font-sm);
    }

    .badge {
      flex: none;
      color: var(--sl-text-muted);
      font-size: var(--sl-font-xs);
    }

    .create {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      inline-size: 100%;
      min-block-size: 3.5rem;
      padding: var(--sl-space-2) 1.25rem;
      border: none;
      border-block-start: 1px solid var(--sl-border);
      background: transparent;
      color: var(--sl-brand);
      font-size: var(--sl-font-base);
      font-weight: 650;
      text-align: start;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem var(--sl-space-3);
    }

    :host([data-picking='true']) .bar {
      border-block-start: 1px solid var(--sl-border);
    }

    .field {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 0.625rem;
      min-inline-size: 0;
      min-block-size: 3.125rem;
      padding-inline: var(--sl-space-4);
      border: 1px solid var(--sl-border);
      border-radius: var(--sl-radius-full);
      background: var(--sl-bg);
    }

    /* Le contour de 2 px en vert marque le champ actif partout dans l'app.
       Un contour dessiné par-dessus la bordure ferait un double trait sur la
       pilule : on épaissit la bordure et on rattrape la largeur au padding. */
    .field:focus-within {
      padding-inline: calc(var(--sl-space-4) - 1px);
      border: 2px solid var(--sl-brand);
    }

    .plus {
      flex: none;
      color: var(--sl-brand);
      font-size: 1.1875rem;
      font-weight: 600;
      line-height: 1;
    }

    input {
      flex: 1;
      min-inline-size: 0;
      align-self: stretch;
      border: none;
      background: transparent;
      font-size: var(--sl-font-base);
    }

    input:focus-visible {
      outline: none;
    }

    .close {
      flex: none;
      min-block-size: 3.125rem;
      padding-inline: 0.875rem;
      border: none;
      border-radius: var(--sl-radius-full);
      background: transparent;
      color: var(--sl-text-muted);
      font-size: var(--sl-font-md);
      font-weight: 600;
    }
  `,
  host: {
    '[attr.data-picking]': 'picking()',
  },
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

  protected readonly images = inject(ProductImages);

  constructor() {
    // Les suggestions arrivent déjà filtrées par la saisie : on ne résout que
    // ce qui est réellement à l'écran, et seulement panneau ouvert. Une photo
    // qui manque n'empêche rien — l'emoji tient la place en attendant.
    effect(() => {
      if (this.picking()) {
        this.images.ensure(this.suggestions().map((s) => s.imageRef));
      }
    });
  }

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
