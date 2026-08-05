import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Le contrôle d'ajout, sur téléphone : **un seul nœud** qui est le bouton
 * flottant au repos, et le champ de saisie une fois ouvert. Il ne s'agit pas de
 * deux objets qui se croisent — c'est le même qui change de dimensions. Le
 * disque vert et son ＋ s'effacent à mesure que la pilule s'allonge et que le
 * champ paraît ; le bord droit ne bouge pas, seul le gauche recule.
 *
 * Toute la trajectoire est en transitions CSS pilotées par `data-open` : aucun
 * calcul de position en JavaScript. Au repos c'est un bouton (`role`,
 * `tabindex`, `aria-label`) ; ouvert, c'est le champ qui porte l'étiquette et le
 * bouton s'efface de l'arbre d'accessibilité.
 *
 * Au bureau, ce nœud n'existe pas : la barre d'ajout garde son propre champ,
 * permanent dans le pied de la grille. Le morph est un geste de téléphone.
 */
@Component({
  selector: 'sl-add-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="disc" aria-hidden="true"></span>
    <span class="glyph" aria-hidden="true">＋</span>
    <input
      #field
      class="field"
      type="text"
      name="article"
      autocomplete="off"
      enterkeyhint="done"
      [attr.aria-label]="label()"
      [attr.aria-hidden]="open() ? null : 'true'"
      [attr.tabindex]="open() ? 0 : -1"
      [value]="query()"
      [placeholder]="placeholder()"
      (input)="onInput($event)"
      (focus)="focused.emit()"
      (keydown.enter)="onEnter($event)"
    />
  `,
  styles: `
    /* Le nœud unique : positionné dans la scène de la page liste (son :host est
       le contexte). Bord droit invariant à 16 px : c'est inset-inline-end qui
       tient, et inline-size qui s'ouvre — le côté gauche recule, le droit
       reste. La bordure bascule d'un pas, mais le disque la couvre le temps de
       s'effacer, si bien qu'elle paraît naître du vert qui part. */
    :host {
      /* À la fermeture, le morph attend que la feuille soit repartie : la
         pilule ne redevient bouton qu'une fois le panneau parti. Ce délai ne
         porte que sur les propriétés de géométrie — le retrait au défilement
         (transform/opacity/visibility) garde ses propres transitions, sans
         délai, ses propriétés étant disjointes de celles-ci. À l'ouverture le
         morph est immédiat : c'est l'état ouvert qui remet ce délai à zéro. */
      --sl-morph-out-delay: 180ms;

      position: absolute;
      z-index: 45;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      overflow: hidden;
      inset-inline-end: var(--sl-space-4);
      inset-block-end: calc(1.875rem + var(--sl-safe-bottom));
      inline-size: 3.875rem;
      block-size: 3.875rem;
      padding-inline-start: 1.25rem;
      border: 0 solid var(--sl-brand);
      border-radius: var(--sl-radius-full);
      background: var(--sl-bg);
      transition:
        inline-size var(--sl-dur-slow) var(--sl-ease-spring)
          var(--sl-morph-out-delay),
        block-size var(--sl-dur-base) var(--sl-ease-out)
          var(--sl-morph-out-delay),
        inset-block-end var(--sl-dur-slow) var(--sl-ease-spring)
          var(--sl-morph-out-delay),
        padding-inline-start var(--sl-dur-base) var(--sl-ease-out)
          var(--sl-morph-out-delay),
        transform var(--sl-dur-slow) var(--sl-ease-spring),
        opacity var(--sl-dur-base) var(--sl-ease-out),
        visibility var(--sl-dur-slow);
    }

    /* Ouvert : la pilule pleine largeur, à 16 px de chaque bord (le droit n'a
       pas bougé). Elle se pose sur l'emplacement que la feuille lui réserve. Le
       morph est immédiat — pas de délai —, c'est la feuille qui l'attend. */
    :host([data-open='true']) {
      inline-size: calc(100% - 2 * var(--sl-space-4));
      block-size: 3.125rem;
      inset-block-end: calc(0.625rem + var(--sl-safe-bottom));
      padding-inline-start: 1.125rem;
      border-width: 2px;
      transition:
        inline-size var(--sl-dur-slow) var(--sl-ease-spring),
        block-size var(--sl-dur-base) var(--sl-ease-out),
        inset-block-end var(--sl-dur-slow) var(--sl-ease-spring),
        padding-inline-start var(--sl-dur-base) var(--sl-ease-out),
        transform var(--sl-dur-base) var(--sl-ease-out),
        opacity var(--sl-dur-base) var(--sl-ease-out),
        visibility var(--sl-dur-base);
    }

    /* Au repos, retiré sous le bord quand on défile vers l'avant de la liste,
       ou quand la liste est vide (le gros bouton du centre prend le relais).
       Ouvert, l'attribut est ignoré : c'est le champ, il ne se retire pas. Même
       ressort de sortie que le bouton flottant d'origine. */
    :host([data-open='false'][data-retracted='true']) {
      visibility: hidden;
      opacity: 0;
      transform: translateY(5.5rem) scale(0.9);
      transition:
        transform var(--sl-dur-base) var(--sl-ease-in),
        opacity var(--sl-dur-base) var(--sl-ease-in),
        visibility var(--sl-dur-base);
    }

    /* Le disque vert et son ombre : c'est lui qui fait le bouton. Il s'efface à
       l'ouverture, découvrant la pilule bordée qui vivait dessous. */
    .disc {
      position: absolute;
      inset: 0;
      border-radius: var(--sl-radius-full);
      background: var(--sl-brand);
      box-shadow: var(--sl-shadow-lg);
      opacity: 1;
      transition: opacity var(--sl-dur-base) linear var(--sl-morph-out-delay);
    }

    :host([data-open='true']) .disc {
      opacity: 0;
      transition: opacity var(--sl-dur-base) linear;
    }

    /* Le ＋ : blanc et large sur le disque, il rapetisse et passe au vert de
       marque en devenant le repère du champ. Sa boîte est fixe pour que le
       champ commence toujours au même point. */
    .glyph {
      position: relative;
      flex: none;
      inline-size: 1.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      font-weight: 400;
      font-size: 1.875rem;
      color: var(--sl-text-on-brand);
      transition:
        font-size var(--sl-dur-base) var(--sl-ease-out)
          var(--sl-morph-out-delay),
        color var(--sl-dur-base) linear var(--sl-morph-out-delay);
    }

    :host([data-open='true']) .glyph {
      font-size: 1.1875rem;
      color: var(--sl-brand);
      transition:
        font-size var(--sl-dur-base) var(--sl-ease-out),
        color var(--sl-dur-base) linear;
    }

    /* Le champ n'existe visuellement qu'ouvert ; fermé, il ne capte pas le tap —
       c'est l'hôte qui est le bouton. */
    .field {
      position: relative;
      flex: 1;
      min-inline-size: 0;
      block-size: 100%;
      padding-inline: 0.5rem var(--sl-space-4);
      border: none;
      background: transparent;
      font-size: var(--sl-font-base);
      color: var(--sl-text);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--sl-dur-base) linear var(--sl-morph-out-delay);
    }

    :host([data-open='true']) .field {
      opacity: 1;
      pointer-events: auto;
      transition: opacity var(--sl-dur-base) linear;
    }

    .field::placeholder {
      color: var(--sl-text-muted);
    }

    .field:focus-visible {
      outline: none;
    }
  `,
  host: {
    '[attr.data-open]': 'open()',
    '[attr.data-retracted]': 'retracted()',
    '[attr.role]': "open() ? null : 'button'",
    '[attr.tabindex]': 'open() ? null : 0',
    '[attr.aria-label]': "open() ? null : label()",
    '(click)': 'onHostActivate()',
    '(keydown.enter)': 'onHostKey($event)',
    '(keydown.space)': 'onHostKey($event)',
  },
})
export class AddControl {
  /** Ouvert : le nœud est le champ. Fermé : c'est le bouton flottant. */
  readonly open = input.required<boolean>();
  /** Retiré sous le bord, au repos seulement. Ignoré une fois ouvert. */
  readonly retracted = input(false);
  readonly query = input.required<string>();
  /** Lu à voix haute : sur le bouton fermé, puis sur le champ ouvert. */
  readonly label = input.required<string>();
  readonly placeholder = input.required<string>();

  /** Tapé alors qu'il était fermé : la feuille s'ouvre. */
  readonly pressed = output<void>();
  readonly queryChanged = output<string>();
  readonly focused = output<void>();
  /** « Entrée » dans le champ : à la page de décider quoi en faire. */
  readonly submitted = output<void>();

  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // Le nœud s'ouvre loin du champ — c'est le bouton du coin qu'on tape. Sans
    // ce rappel de focus, il faudrait un second geste pour se mettre à taper.
    effect(() => {
      if (this.open()) {
        this.field().nativeElement.focus();
      }
    });
  }

  protected onHostActivate(): void {
    // Ouvert, l'hôte n'est plus le bouton : un tap y laisse le champ tranquille.
    if (!this.open()) {
      this.pressed.emit();
    }
  }

  protected onHostKey(event: Event): void {
    if (this.open()) {
      return;
    }

    // Fermé, l'hôte est un bouton : Entrée et Espace l'activent, et n'ont pas à
    // remonter défiler la page.
    event.preventDefault();
    this.pressed.emit();
  }

  protected onInput(event: Event): void {
    this.queryChanged.emit((event.target as HTMLInputElement).value);
  }

  protected onEnter(event: Event): void {
    event.preventDefault();
    this.submitted.emit();
  }
}
