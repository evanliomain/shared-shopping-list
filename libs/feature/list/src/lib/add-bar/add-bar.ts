import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ItemView,
  ProductImages,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { MatchedText, ProductAvatar } from '@shopping-list/ui';
import { PluralPipe } from '@shopping-list/util/i18n';

/**
 * Barre d'ajout et panneau de suggestions.
 *
 * Le geste que l'application doit rendre trivial : refaire la liste de la
 * semaine sans rien retaper. Le panneau propose donc **l'historique d'abord**,
 * classé par usage et récence, et ne propose de créer un produit qu'en dernier
 * recours, quand la saisie ne correspond à rien de connu.
 *
 * La feuille **reste ouverte après chaque ajout** : le champ se vide, l'article
 * rejoint la pile de pastilles en haut, les suggestions se réordonnent. On
 * enchaîne dix articles sans revenir à la liste, et « Terminé » ferme tout.
 * Chaque pastille porte son ✕ : tant que la feuille est ouverte, un ajout se
 * défait d'un geste, sans bandeau d'annulation à chronométrer.
 */
@Component({
  selector: 'sl-add-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatchedText, PluralPipe, ProductAvatar, TranslocoPipe],
  template: `
    @if (picking()) {
      <div class="grip" aria-hidden="true" animate.leave="leaving">
        <span></span>
      </div>

      <!-- L'en-tête porte la sortie, permanente tant qu'on ajoute et
           atteignable au clavier : « Fermer » vivait dans la barre, absente sur
           téléphone où c'est l'overlay qui tient le champ. « Fermer » tant que
           rien n'est entré (on annule), puis « Terminé » quand des articles
           s'enchaînent, avec leur décompte. -->
      <div class="head" animate.leave="leaving">
        @if (0 < added().length) {
          <p class="tally-count">
            {{ 'addBar.added' | plural: added().length }}
          </p>
        }
        <button type="button" class="done" (click)="dismissed.emit()">
          {{
            (0 < added().length ? 'addBar.done' : 'common.close') | transloco
          }}
        </button>
      </div>

      @if (0 < added().length) {
        <ul class="chips" animate.leave="leaving">
          @for (item of added(); track item.id) {
            <li>
              <span class="chip">
                <span aria-hidden="true">{{ item.emoji }}</span>
                {{ item.label }}
                <button
                  type="button"
                  class="undo"
                  [attr.aria-label]="
                    'addBar.undoAdd' | transloco: { label: item.label }
                  "
                  (click)="undone.emit(item)"
                >
                  ✕
                </button>
              </span>
            </li>
          }
        </ul>
      }

      <div class="panel" animate.leave="leaving">
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
                  <span class="label">
                    <sl-matched-text
                      [text]="suggestion.label"
                      [query]="query()"
                    />
                  </span>
                  <span class="second">
                    @if ('' !== suggestion.description) {
                      <sl-matched-text
                        [text]="suggestion.description"
                        [query]="query()"
                      />
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

    <!-- Au bureau, la barre garde son champ, permanent dans le pied de la
         grille. Sur téléphone, le champ est l'overlay sl-add-control posé
         par-dessus : ici on ne réserve que sa place, à la même hauteur et aux
         mêmes marges, pour que la pilule qui morphe s'y pose pile. -->
    @if (wide()) {
      <form class="bar" (submit)="submit($event)">
        <div class="field">
          <span class="plus" aria-hidden="true">＋</span>
          <input
            #field
            type="text"
            name="article"
            autocomplete="off"
            enterkeyhint="done"
            [placeholder]="
              (0 < added().length
                ? 'addBar.nextPlaceholder'
                : 'addBar.placeholder'
              ) | transloco
            "
            [value]="query()"
            (input)="onInput($event)"
            (focus)="focused.emit()"
          />
        </div>
      </form>
    } @else {
      <div class="field-slot" aria-hidden="true"></div>
    }
  `,
  styles: `
    /* Ouverte, la barre devient une feuille : coins arrondis, poignée, ombre
       portée. */
    :host {
      display: flex;
      flex-direction: column;
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

    /* Sur téléphone, la feuille se pose au-dessus de la liste au lieu de la
       comprimer : la liste estompée derrière garde sa place et son défilement.
       Le plafond compte autant que le calque : sans lui, dix articles
       enchaînés poussaient la saisie hors de l'écran — on ne pouvait plus
       taper le onzième. Ce qui cède est le panneau de suggestions, jamais le
       champ. Au bureau la barre reste dans le pied de la grille, où elle est
       permanente.

       Elle est posée hors champ sous le bord, et remonte à la saisie. Toujours
       montée, même fermée : c'est ce qui lui permet de *repartir* en glissant
       plutôt que de disparaître d'un coup — un démontage conditionnel n'a pas
       de sortie. Montée en ressort, repli plus sec. Cachée, elle sort de
       l'ordre de tabulation : la visibilité ne tombe qu'en fin de glissé. */
    @media (max-width: 64.9375rem) {
      :host {
        position: absolute;
        inset: auto 0 0;
        max-block-size: 80dvh;
        visibility: hidden;
        transform: translateY(100%);
        /* À la fermeture, la feuille glisse hors champ pendant que le contenu se
           fond sur place : la directive animate.leave garde le contenu monté le
           temps de sa transition, si bien qu'il s'efface tandis que la feuille
           descend. La montée, elle, est pilotée par la règle d'ouverture
           ci-dessous, avec son propre délai. */
        transition:
          transform var(--sl-dur-base) var(--sl-ease-in),
          visibility var(--sl-dur-base);
      }

      :host([data-picking='true']) {
        visibility: visible;
        transform: translateY(0);
        /* La feuille attend que le bouton soit devenu champ avant de monter :
           le morph d'abord, le panneau juste après. À la fermeture, c'est la
           règle de repos ci-dessus qui joue, sans délai : elle repart aussitôt,
           avant que le champ ne redevienne bouton. */
        transition:
          transform var(--sl-dur-slow) var(--sl-ease-spring) 280ms,
          visibility var(--sl-dur-slow) 280ms;
      }

      /* Le contenu se révèle en cascade une fois la feuille montée — donc après
         le morph : chaque bloc s'affiche en montant de 8 px, décalé de 35 ms
         sur le précédent, à partir du moment où la feuille arrive. Le champ n'en
         est pas — c'est l'ancre qu'on vient chercher, déjà en place. */
      :host([data-picking='true']) .grip,
      :host([data-picking='true']) .head,
      :host([data-picking='true']) .chips,
      :host([data-picking='true']) .panel {
        animation: sl-sheet-reveal var(--sl-dur-base) var(--sl-ease-out) both;
      }

      :host([data-picking='true']) .grip {
        animation-delay: 300ms;
      }

      :host([data-picking='true']) .head {
        animation-delay: 335ms;
      }

      :host([data-picking='true']) .chips {
        animation-delay: 370ms;
      }

      :host([data-picking='true']) .panel {
        animation-delay: 405ms;
      }

      /* À la fermeture, chaque bloc redescend de 8 px en s'effaçant, décalé pour
         rejouer la cascade à l'envers : le panneau part le premier, la poignée
         en dernier. La directive animate.leave garde le bloc dans le DOM le
         temps de la transition, puis le retire — c'est Angular qui tient la
         sortie, plus aucun sursis à gérer à la main. Une transition (pas de
         keyframe) : rien à scoper, rien à faire retirer par un timer. */
      .grip.leaving,
      .head.leaving,
      .chips.leaving,
      .panel.leaving {
        opacity: 0;
        transform: translateY(0.5rem);
        transition:
          opacity var(--sl-dur-fast) var(--sl-ease-in),
          transform var(--sl-dur-fast) var(--sl-ease-in);
      }

      .chips.leaving {
        transition-delay: 35ms;
      }

      .head.leaving {
        transition-delay: 70ms;
      }

      .grip.leaving {
        transition-delay: 105ms;
      }
    }

    @keyframes sl-sheet-reveal {
      from {
        opacity: 0;
        transform: translateY(0.5rem);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
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

    /* L'en-tête de la feuille : le décompte des ajouts à gauche (dès qu'il y en
       a), la sortie à droite — seule, elle s'y range quand même. */
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.625rem;
      padding: 0.25rem var(--sl-space-4) 0.625rem;
      border-block-end: 1px solid var(--sl-border);
    }

    .tally-count {
      flex: 1;
      min-inline-size: 0;
      margin: 0;
      color: var(--sl-text-muted);
      font-size: var(--sl-font-sm);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .done {
      flex: none;
      min-block-size: 2.25rem;
      padding-inline: var(--sl-space-3);
      border: none;
      border-radius: var(--sl-radius-sm);
      background: var(--sl-surface-sunken);
      font-size: var(--sl-font-sm);
      font-weight: 650;
    }

    /* La pile de pastilles est le filet de sécurité de l'enchaînement : chaque
       ajout reste annulable d'un ✕ tant que la feuille est ouverte. */
    /* Deux rangées visibles, le reste défile : la pile est un filet, pas un
       inventaire. Les plus récents sont en tête, donc en haut. */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      margin: 0;
      padding: 0.625rem var(--sl-space-4);
      max-block-size: 5.5rem;
      overflow-y: auto;
      border-block-end: 1px solid var(--sl-border);
      list-style: none;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      max-inline-size: 100%;
      min-block-size: 2rem;
      padding-inline: 0.625rem 0.25rem;
      border-radius: var(--sl-radius-full);
      background: var(--sl-brand-soft);
      color: var(--sl-brand-ink);
      font-size: var(--sl-font-sm);
      font-weight: 600;
    }

    /* Cible de 32 px : sous les 44 px de la règle, mais l'action est doublée
       par le glissé à gauche sur la ligne, et se rejoue à volonté. */
    .undo {
      flex: none;
      display: grid;
      place-items: center;
      inline-size: 2rem;
      block-size: 2rem;
      border: none;
      border-radius: var(--sl-radius-full);
      background: transparent;
      color: inherit;
      font-size: var(--sl-font-xs);
    }

    /* La taille minimale nulle est ce qui autorise le panneau à céder : sans
       elle, un enfant de flex ne descend pas sous la hauteur de son contenu. */
    .panel {
      min-block-size: 0;
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

    /* Le champ ne cède jamais : c'est lui qu'on vient chercher. */
    .bar {
      flex: none;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem var(--sl-space-3);
    }

    /* Sur téléphone, la place réservée au champ : mêmes hauteur (50 px) et
       marges (16 px de côté, 10 px sous le bord) que la pilule ouverte de
       sl-add-control, qui vient s'y poser pile. */
    .field-slot {
      flex: none;
      block-size: 3.125rem;
      margin: 0.625rem var(--sl-space-4);
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
  /** Les articles entrés depuis l'ouverture, du plus récent au plus ancien. */
  readonly added = input.required<readonly ItemView[]>();
  /**
   * Vrai au bureau, où la barre est permanente et porte son propre champ. Sur
   * téléphone (faux), le champ est l'overlay `sl-add-control` posé par-dessus,
   * et la barre ne réserve que sa place sous les suggestions.
   */
  readonly wide = input.required<boolean>();

  readonly queryChanged = output<string>();
  readonly picked = output<SuggestionView>();
  readonly created = output<string>();
  readonly focused = output<void>();
  readonly dismissed = output<void>();
  /** Un ✕ de pastille : cet article-là ressort de la liste. */
  readonly undone = output<ItemView>();

  protected readonly images = inject(ProductImages);

  // Le champ n'existe qu'au bureau ; sur téléphone c'est l'overlay qui le
  // porte, et ce viewChild reste vide.
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // Les suggestions arrivent déjà filtrées par la saisie : on ne résout que
    // ce qui est réellement à l'écran, et seulement panneau ouvert. Une photo
    // qui manque n'empêche rien — l'emoji tient la place en attendant.
    effect(() => {
      if (this.picking()) {
        this.images.ensure(this.suggestions().map((s) => s.imageRef));
      }
    });

    // Au bureau, le champ prend le focus à l'ouverture du panneau. Sur
    // téléphone il n'y a pas de champ ici — c'est l'overlay `sl-add-control`
    // qui se donne le focus —, d'où le chaînage optionnel.
    effect(() => {
      if (this.picking()) {
        this.field()?.nativeElement.focus();
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
