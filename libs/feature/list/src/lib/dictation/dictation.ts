import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProductImages, SuggestionView } from '@shopping-list/data-access/shopping';
import { MatchedText, ProductAvatar } from '@shopping-list/ui';
import { PluralPipe } from '@shopping-list/util/i18n';

import { DictationPad } from '../dictation-pad/dictation-pad';
import { trackKeyboardInset } from '../keyboard-inset';

/** L'écran affiché dans le plein écran de dictée : la saisie, ou le pavé libre. */
export type DictationView = 'input' | 'pad';

/** Ce que le reçu d'une ligne montre du dernier article dicté. */
export interface DictationReceipt {
  readonly label: string;
  /** Quantité déjà formatée (« ×4 »), vide pour un simple article. */
  readonly quantity: string;
  /** Compte tout juste ajouté quand l'article préexistait ; sinon `null`. */
  readonly delta: number | null;
}

/** Les comptes rapides de la rangée de validation. Le premier est le défaut. */
export const QUICK_COUNTS: readonly number[] = [1, 2, 4];

/**
 * Le mode dictée : un plein écran pour composer la liste en rafale.
 *
 * Le cas d'usage tranche tout : quelqu'un dicte, l'autre note. Le libellé et la
 * quantité arrivent dans la même phrase — « deux baguettes », « quatre
 * yaourts » —, il n'y a donc pas de raison de les séparer en deux moments
 * d'interface. La **rangée de quantité n'arme rien, elle valide** : taper ＋2
 * ajoute le libellé en cours avec la quantité 2 et vide le champ. Un seul tap
 * porte le nombre, la validation et le retour au champ vide ; plus de mode à
 * retenir, donc plus de remise à zéro à surveiller. Entrée reste le ＋1.
 *
 * Au repos c'est le disque vert du coin ; ouvert, le plein écran. La pile de
 * pastilles a disparu — un mur de vingt pastilles pousse le clavier hors de
 * l'écran et ne se relit jamais. À sa place, un **reçu d'une ligne** (le
 * « c'est noté » du dernier ajout, annulable) et un **compteur** qui dit le
 * nombre dicté.
 *
 * Le compte ne suffit pas toujours : ＋… bascule sur le **pavé de saisie libre**
 * (`sl-dictation-pad`) pour un poids ou un volume. Le plein écran ne montre
 * alors qu'un écran à la fois — la saisie, ou le pavé —, piloté par `view`.
 */
@Component({
  selector: 'sl-dictation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DictationPad, MatchedText, PluralPipe, ProductAvatar, TranslocoPipe],
  templateUrl: './dictation.html',
  styleUrl: './dictation.scss',
  host: {
    '[attr.data-open]': 'open()',
    '[attr.data-retracted]': 'retracted()',
    '[attr.role]': "open() ? null : 'button'",
    '[attr.tabindex]': 'open() ? null : 0',
    '[attr.aria-label]': "open() ? null : fabLabel()",
    '[style.--sl-kb]': 'kbStyle()',
    '(click)': 'onHostActivate()',
    '(keydown.enter)': 'onHostKey($event)',
    '(keydown.space)': 'onHostKey($event)',
  },
})
export class Dictation {
  /** Ouvert : le plein écran. Fermé : le bouton flottant du coin. */
  readonly open = input.required<boolean>();
  /** Bouton retiré sous le bord au défilement — ignoré une fois ouvert. */
  readonly retracted = input(false);
  readonly query = input.required<string>();
  readonly suggestions = input.required<readonly SuggestionView[]>();
  readonly receipt = input<DictationReceipt | null>(null);
  /** Nombre d'articles dictés depuis l'ouverture. */
  readonly counter = input.required<number>();
  /** Lu à voix haute sur le bouton fermé. */
  readonly fabLabel = input.required<string>();
  readonly placeholder = input.required<string>();

  /** Tapé alors qu'il était fermé : le plein écran s'ouvre. */
  readonly pressed = output<void>();
  readonly queryChanged = output<string>();
  /** Un tap sur une suggestion : il **complète** le champ, il n'ajoute pas. */
  readonly picked = output<SuggestionView>();
  /** ＋N (ou Entrée pour ＋1) : valide l'article en cours avec ce compte. */
  readonly quantified = output<number>();
  /** ✕ du reçu : le dernier article dicté ressort. */
  readonly undone = output<void>();
  /** ＋… puis « Ajouter » : l'article en cours prend cette quantité libre. */
  readonly freeQuantified = output<string>();
  /** « Terminé » (ou Échap) : la dictée se referme. */
  readonly dismissed = output<void>();

  protected readonly images = inject(ProductImages);
  protected readonly quickCounts = QUICK_COUNTS;

  /** L'écran en cours dans le plein écran : la saisie, sinon le pavé libre. */
  protected readonly view = signal<DictationView>('input');

  // Le champ n'existe que le plein écran ouvert ; fermé, il n'y a que le
  // bouton flottant.
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly hasQuery = computed(() => '' !== this.query().trim());

  // Le champ est en haut ; le clavier ancré en bas recouvrirait la rangée de
  // validation. On réserve sa hauteur pour que la rangée remonte avec lui.
  private readonly kbInset = trackKeyboardInset();
  protected readonly kbStyle = computed(() => `${this.kbInset()}px`);

  constructor() {
    // On ouvre loin du champ — c'est le bouton du coin qu'on tape. Sans ce
    // rappel de focus, il faudrait un second geste pour se mettre à taper. Le
    // focus est reporté d'un tour de boucle : donné dans la foulée du tap, sur
    // un champ tout juste inséré, il se fait reprendre par le bouton qu'on
    // vient de relâcher et ne se pose pas sur mobile. Rendu aussi au retour du
    // pavé, quand la saisie reparaît.
    effect(() => {
      if (this.open() && 'input' === this.view()) {
        requestAnimationFrame(() => this.field()?.nativeElement.focus());
      }
    });

    // Fermé, on repart de la saisie : la prochaine ouverture ne rouvre jamais
    // sur le pavé laissé derrière soi.
    effect(() => {
      if (!this.open()) {
        this.view.set('input');
      }
    });

    // On ne résout que les photos réellement à l'écran, et seulement ouvert.
    effect(() => {
      if (this.open()) {
        this.images.ensure(this.suggestions().map((s) => s.imageRef));
      }
    });
  }

  protected onHostActivate(): void {
    // Ouvert, l'hôte n'est plus le bouton : un tap y laisse l'écran tranquille.
    if (!this.open()) {
      this.pressed.emit();
    }
  }

  protected onHostKey(event: Event): void {
    if (this.open()) {
      return;
    }

    event.preventDefault();
    this.pressed.emit();
  }

  protected onInput(event: Event): void {
    this.queryChanged.emit((event.target as HTMLInputElement).value);
  }

  /** Entrée dans le champ : c'est le raccourci de ＋1. */
  protected onEnter(event: Event): void {
    event.preventDefault();
    if (this.hasQuery()) {
      this.quantified.emit(1);
    }
  }

  protected onEscape(event: Event): void {
    event.preventDefault();
    this.dismissed.emit();
  }

  /**
   * ＋N valide l'article en cours avec ce compte. Le bouton est désactivé tant
   * que le champ est vide (voir `[disabled]`), donc il n'a rien à re-vérifier :
   * quand il agit, il y a toujours quelque chose à valider.
   */
  protected onQuantify(count: number): void {
    this.quantified.emit(count);
  }

  /** ＋… : le compte ne suffit pas, on passe au pavé de saisie libre. */
  protected openPad(): void {
    this.view.set('pad');
  }

  /** « Retour » du pavé : on revient à la saisie sans rien poser. */
  protected closePad(): void {
    this.view.set('input');
  }

  /** « Ajouter » du pavé : la quantité libre remonte, et la saisie reparaît. */
  protected onFreeQuantified(qty: string): void {
    this.freeQuantified.emit(qty);
    this.view.set('input');
  }
}
