import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { translateSignal } from '@jsverse/transloco';
import { displayQty, ItemView } from '@shopping-list/data-access/shopping';
import { ProductAvatar } from '@shopping-list/ui';

/** Amplitude à franchir pour qu'un glissé compte comme une intention. */
const COMMIT_PX = 88;
/** Au-delà, la ligne cesse de suivre le doigt : le geste est déjà décidé. */
const MAX_PX = 132;
/** En dessous, on ne sait pas encore si le geste est un glissé ou un tap. */
const SLOP_PX = 12;

/** Ce que le glissé en cours déclenchera s'il est relâché maintenant. */
type Swipe = 'none' | 'check' | 'remove';

/**
 * Une ligne de la liste.
 *
 * Composant muet : il ne connaît ni le store ni le CRDT, il émet des
 * intentions. Cocher et retirer passent par les mêmes deux voies : un geste du
 * pouce sur téléphone, un bouton au bureau.
 *
 * Sur téléphone, les deux gestes du pouce remplacent la case et le menu :
 * **glisser à droite** coche, **glisser à gauche** retire de la liste. Le tap
 * sur la ligne, lui, ne coche plus : viser un article pour le lire le cochait
 * une fois sur deux, du temps où toute la ligne était une case. La ligne se
 * borne désormais à exposer son état — cochée ou non — à l'assistance vocale.
 *
 * Il n'y a **plus de menu ⋯** sur la ligne. Il ne portait que deux entrées,
 * dont l'une — retirer — a son glissé ; et son popover, prisonnier du calque
 * que crée la ligne pour glisser, passait sous la ligne suivante. Reste
 * l'édition, qui n'a pas de geste : elle est un bouton, ici comme au bureau.
 *
 * Cocher et retirer ont chacun leur bouton, cachés sous 1040 px et montrés
 * au-delà : là, il y a la place, et la souris n'a pas le glissé comme cible
 * évidente. Cachés, mais pas absents — ils restent dans le DOM, seulement
 * effacés à l'œil, pour que le lecteur d'écran et le clavier, qui n'ont ni le
 * glissé ni la souris, gardent de quoi cocher et retirer.
 */
@Component({
  selector: 'sl-item-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductAvatar, RouterLink],
  template: `
    <!-- Sous la ligne : ce que le glissé va faire. Décoratif, le geste double
         des commandes qui restent atteignables autrement. -->
    <div class="lane" aria-hidden="true">
      <span class="lane-glyph">{{ laneGlyph() }}</span>
    </div>

    <div class="content" [style.transform]="slide()">
      <!-- La ligne n'est plus une cible pour cocher : la lire du doigt la
           cochait par accident. Elle garde le rôle « case à cocher », mais en
           lecture seule — elle dit son état à l'assistance vocale sans promettre
           un geste qu'elle n'a plus. On coche par le glissé ou le bouton ✓. -->
      <div
        class="toggle"
        role="checkbox"
        aria-readonly="true"
        [attr.aria-checked]="item().checked"
      >
        <!-- Un article coché part dans le panier, barré. Le ✓ vert n'est plus
             une cible : il dit l'état, là où une case de 26 px invitait à
             viser. -->
        @if (item().checked) {
          <span class="tick" aria-hidden="true">✓</span>
        }

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

        @if ('' !== qtyLabel()) {
          <span class="qty">{{ qtyLabel() }}</span>
        }
      </div>

      <!-- Chaque bouton porte deux fois son intention : en aria-label pour la
           lecture d'écran, en title pour l'infobulle. Un glyphe seul ne dit
           rien à personne, et à la souris on veut savoir avant de cliquer. -->
      <div class="actions">
        <!-- Cocher et retirer ne sont des boutons qu'au-delà de 1040 px : sur
             téléphone, ce sont les deux gestes du pouce, et 80 px de plus se
             prendraient sur un libellé qui en manque déjà. -->
        <button
          type="button"
          class="action check"
          [attr.aria-label]="checkLabel()"
          [attr.title]="checkLabel()"
          (click)="onTap()"
        >
          {{ item().checked ? '↩' : '✓' }}
        </button>

        <!-- L'édition, elle, n'a aucun geste : son bouton est partout. -->
        <a
          class="action edit"
          [routerLink]="['/produit', item().productId]"
          [attr.aria-label]="editLabel()"
          [attr.title]="editLabel()"
        >
          ✏️
        </a>

        <button
          type="button"
          class="action remove"
          [attr.aria-label]="removeLabel()"
          [attr.title]="removeLabel()"
          (click)="onRemoveTap()"
        >
          ✕
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      /* Ancrage de la voie révélée par le glissé. */
      position: relative;
      display: flex;
      align-items: center;
      min-block-size: var(--sl-row-height);
      /* Le geste horizontal nous revient ; le défilement vertical et le zoom
         restent au navigateur, sinon la liste ne défilerait plus. */
      touch-action: pan-y pinch-zoom;
    }

    :host([data-checked='true']) {
      opacity: 0.85;
    }

    /* Filet du dessus, aligné sur le texte comme une liste iOS. En
       pseudo-élément plutôt qu'en bordure : une marge décalerait la ligne. La
       carte parente n'en donne la couleur qu'aux lignes qui en portent un.
       Au-dessus du contenu, devenu opaque pour masquer sa voie de glissé. */
    :host::before {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-inline: 1.5rem 0;
      z-index: 1;
      block-size: 1px;
      background: var(--sl-row-rule, transparent);
    }

    /* Pendant le glissé, le filet ne barre pas la voie colorée. */
    :host(:not([data-swipe='none']))::before {
      background: transparent;
    }

    /* Le contenu glisse d'un bloc et masque la voie au repos : opaque, donc,
       sinon la couleur se verrait en permanence. */
    .content {
      position: relative;
      display: flex;
      flex: 1;
      align-items: center;
      min-inline-size: 0;
      padding-inline-end: var(--sl-space-2);
      background: var(--sl-surface);
    }

    /* Pendant le geste, la ligne suit le doigt sans amortissement. Au
       relâcher — le seul moment où le décalage revient à zéro — elle se
       remet en place. */
    :host([data-swipe='none']) .content {
      transition: transform 180ms ease;
    }

    .lane {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      padding-inline: 1.25rem;
      font-size: 1.125rem;
      line-height: 1;
    }

    /* Teinte douce tant que le geste peut encore être abandonné, saturée une
       fois le seuil franchi : le point de bascule se voit au lieu de se
       deviner. */
    :host([data-swipe='check']) .lane {
      justify-content: flex-start;
      background: var(--sl-brand-soft);
      color: var(--sl-brand-ink);
    }

    :host([data-swipe='remove']) .lane {
      justify-content: flex-end;
      background: var(--sl-danger-soft);
      color: var(--sl-danger-ink);
    }

    :host([data-armed='true'][data-swipe='check']) .lane {
      background: var(--sl-brand);
      color: var(--sl-text-on-brand);
    }

    :host([data-armed='true'][data-swipe='remove']) .lane {
      background: var(--sl-danger);
      color: var(--sl-text-on-danger);
    }

    .lane-glyph {
      transition: transform 120ms ease;
    }

    :host([data-armed='true']) .lane-glyph {
      transform: scale(1.3);
    }

    .toggle {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--sl-space-3);
      min-inline-size: 0;
      min-block-size: var(--sl-row-height);
      padding: 0.5625rem 0 0.5625rem var(--sl-space-3);
    }

    /* La case à cocher a disparu de la ligne : elle ne disait rien que la ligne
       ne dise déjà. On coche par le glissé ou le bouton ✓ du bureau — et un
       article coché part dans le panier, barré et marqué d'un ✓ vert. Le barré
       et le rangement disent l'état mieux qu'un cercle de 26 px. */
    .tick {
      flex: none;
      inline-size: 1.125rem;
      color: var(--sl-brand);
      font-size: 0.9375rem;
      font-weight: 700;
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
      display: flex;
      flex: none;
      gap: 0.125rem;
    }

    .action {
      display: grid;
      place-items: center;
      inline-size: 2.5rem;
      block-size: 2.5rem;
      border: none;
      border-radius: var(--sl-radius-sm);
      background: transparent;
      font-size: 0.9375rem;
      text-decoration: none;
    }

    .action:hover {
      background: var(--sl-surface-sunken);
    }

    /* Cocher est l'action de l'écran : seule des trois à porter la marque. */
    .check {
      background: var(--sl-brand-soft);
      color: var(--sl-brand-ink);
      font-weight: 700;
    }

    .check:hover {
      background: var(--sl-brand);
      color: var(--sl-text-on-brand);
    }

    /* La cible tactile va chercher les 44 px exigés : au bureau, la souris se
       contente des 40 px de la vignette. */
    .edit {
      block-size: var(--sl-tap-target);
      color: var(--sl-text-muted);
    }

    .remove {
      color: var(--sl-danger);
      font-weight: 700;
    }

    /* Cocher et retirer n'ont pas de bouton visible sur téléphone — ce sont les
       deux gestes du pouce, et 40 px de plus se prendraient sur un libellé qui
       en manque déjà. Mais les boutons restent dans le DOM et l'arbre
       d'accessibilité : le lecteur d'écran et le clavier, qui n'ont ni le glissé
       ni la souris, gardent ainsi de quoi cocher et retirer. Effacés à l'œil,
       ils reparaissent au focus, pour que le clavier voie où il se trouve. */
    @media (max-width: 64.9375rem) {
      .check:not(:focus-visible),
      .remove:not(:focus-visible) {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }

    @media (min-width: 65rem) {
      .edit {
        block-size: 2.5rem;
      }
    }
  `,
  host: {
    '[attr.data-checked]': 'item().checked',
    '[attr.data-swipe]': 'swipe()',
    '[attr.data-armed]': 'armed()',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerEnd($event)',
    '(pointercancel)': 'onPointerEnd($event)',
    // Les photos de produits sont des `<img>`, donc glissables par défaut : à
    // la souris, le glissé natif volerait le geste dès qu'on part de la
    // vignette.
    '(dragstart)': '$event.preventDefault()',
  },
})
export class ItemRow {
  readonly item = input.required<ItemView>();
  /** Photo du produit, si elle est déjà disponible localement. */
  readonly imageUrl = input<string | null>(null);

  readonly toggled = output<boolean>();
  readonly removed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly unknownLabel = translateSignal('list.unknownItem');

  /**
   * Les intentions des trois boutons, traduites une fois pour deux emplois :
   * le nom accessible et l'infobulle disent la même chose, il n'y a aucune
   * raison de les faire diverger.
   */
  protected readonly checkLabel = translateSignal(
    computed(() => (this.item().checked ? 'itemRow.uncheck' : 'itemRow.check')),
  );
  protected readonly editLabel = translateSignal('itemRow.edit');
  protected readonly removeLabel = translateSignal('itemRow.remove');

  /**
   * Le produit peut manquer : un delta qui ajoute la ligne peut arriver avant
   * celui qui le crée. La vue signale le cas par un drapeau, à charge pour
   * l'écran de trouver les mots — un selector, lui, ne connaît pas la langue.
   */
  protected readonly displayLabel = computed(() =>
    this.item().unknownProduct ? this.unknownLabel() : this.item().label,
  );

  /** « ×4 » pour un compte, la quantité libre telle quelle, rien pour un seul. */
  protected readonly qtyLabel = computed(() => displayQty(this.item().qty));

  /** Décalage horizontal courant, en pixels signés. Zéro : ligne au repos. */
  private readonly offset = signal(0);

  protected readonly swipe = computed<Swipe>(() => {
    const offset = this.offset();
    return 0 === offset ? 'none' : 0 < offset ? 'check' : 'remove';
  });

  /** Le seuil est franchi : relâcher maintenant déclenchera l'action. */
  protected readonly armed = computed(
    () => COMMIT_PX <= Math.abs(this.offset()),
  );

  protected readonly slide = computed(() => `translateX(${this.offset()}px)`);

  /**
   * Glisser à droite sur un article déjà coché le renvoie dans la liste : le
   * geste reste réversible du même côté, sans avoir à viser la case.
   */
  protected readonly laneGlyph = computed(() => {
    switch (this.swipe()) {
      case 'check':
        return this.item().checked ? '↩' : '✓';
      case 'remove':
        return '✕';
      default:
        return '';
    }
  });

  /** Pointeur suivi, et endroit où il a touché la ligne. */
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private horizontal = false;

  /**
   * Un glissé se termine par un `click` sur la ligne — au doigt comme à la
   * souris — qui cocherait par-dessus le geste. On l'avale une fois.
   */
  private swipeFallout = false;

  protected onPointerDown(event: PointerEvent): void {
    // Un second doigt est un pincement, pas un glissé.
    if (null !== this.pointerId) {
      return;
    }

    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.horizontal = false;
    this.swipeFallout = false;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (!this.horizontal) {
      if (SLOP_PX > Math.max(Math.abs(dx), Math.abs(dy))) {
        return;
      }

      // Le premier mouvement franc décide de l'axe. S'il est vertical, la main
      // est en train de défiler : la ligne ne doit pas bouger d'un pixel.
      if (Math.abs(dy) >= Math.abs(dx)) {
        this.pointerId = null;
        return;
      }

      this.horizontal = true;
      // Le doigt sort vite de la ligne. Sans capture, la fin du geste
      // arriverait sur un autre élément et la ligne resterait de travers.
      this.host.nativeElement.setPointerCapture(event.pointerId);
    }

    this.offset.set(Math.max(-MAX_PX, Math.min(MAX_PX, dx)));
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    // `pointercancel` : le navigateur a repris la main (défilement, zoom).
    // Rien n'a été demandé, la ligne se remet simplement en place.
    const committed = 'pointerup' === event.type ? this.offset() : 0;

    this.pointerId = null;
    this.swipeFallout = this.horizontal && 'pointerup' === event.type;
    this.horizontal = false;
    this.offset.set(0);

    if (COMMIT_PX <= committed) {
      this.toggled.emit(!this.item().checked);
    } else if (-COMMIT_PX >= committed) {
      this.removed.emit();
    }
  }

  /**
   * Le bouton ✓ coche — sauf quand le clic n'est qu'une fin de glissé à la
   * souris, boutons visibles.
   */
  protected onTap(): void {
    if (this.consumeSwipeFallout()) {
      return;
    }

    this.toggled.emit(!this.item().checked);
  }

  /**
   * Le glissé se pratique aussi à la souris, boutons visibles : sans ce garde,
   * un geste qui finit sur le ✕ retirerait deux fois.
   */
  protected onRemoveTap(): void {
    if (this.consumeSwipeFallout()) {
      return;
    }

    this.removed.emit();
  }

  private consumeSwipeFallout(): boolean {
    const fallout = this.swipeFallout;
    this.swipeFallout = false;
    return fallout;
  }
}
