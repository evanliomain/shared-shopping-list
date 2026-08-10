import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
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
 * Un seul nœud, deux états, comme le bouton flottant qu'il remplace : au repos
 * c'est le disque vert du coin ; ouvert, le plein écran. La pile de pastilles a
 * disparu — un mur de vingt pastilles pousse le clavier hors de l'écran et ne
 * se relit jamais. À sa place, un **reçu d'une ligne** (le « c'est noté » du
 * dernier ajout, annulable) et un **compteur** qui dit le nombre dicté.
 */
@Component({
  selector: 'sl-dictation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatchedText, PluralPipe, ProductAvatar, TranslocoPipe],
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
  /** « Terminé » (ou Échap) : la dictée se referme. */
  readonly dismissed = output<void>();

  protected readonly images = inject(ProductImages);
  protected readonly quickCounts = QUICK_COUNTS;

  // Le champ n'existe que le plein écran ouvert ; fermé, il n'y a que le
  // bouton flottant.
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly hasQuery = computed(() => '' !== this.query().trim());

  /**
   * Décalage du bas imposé par le clavier virtuel, pour que la rangée reste
   * juste au-dessus de lui plutôt que dessous. Zéro tant qu'aucun clavier n'est
   * levé — ou quand le navigateur n'expose pas `visualViewport`.
   */
  private readonly kbInset = signal(0);
  protected readonly kbStyle = computed(() => `${this.kbInset()}px`);

  constructor() {
    // On ouvre loin du champ — c'est le bouton du coin qu'on tape. Sans ce
    // rappel de focus, il faudrait un second geste pour se mettre à taper. Le
    // focus est reporté d'un tour de boucle : donné dans la foulée du tap, sur
    // un champ tout juste inséré, il se fait reprendre par le bouton qu'on
    // vient de relâcher et ne se pose pas sur mobile.
    effect(() => {
      if (this.open()) {
        requestAnimationFrame(() => this.field()?.nativeElement.focus());
      }
    });

    // On ne résout que les photos réellement à l'écran, et seulement ouvert.
    effect(() => {
      if (this.open()) {
        this.images.ensure(this.suggestions().map((s) => s.imageRef));
      }
    });

    this.trackKeyboard();
  }

  /**
   * Suit la hauteur du clavier virtuel via `visualViewport`. Le champ étant en
   * haut, un clavier ancré en bas recouvrirait la rangée de validation : on
   * réserve sa hauteur en rembourrage pour que la rangée remonte avec lui.
   */
  private trackKeyboard(): void {
    const view = inject(DOCUMENT).defaultView;
    const viewport = view?.visualViewport;
    if (null == view || null == viewport) {
      return;
    }

    const onResize = (): void =>
      this.kbInset.set(
        Math.max(0, view.innerHeight - viewport.height - viewport.offsetTop),
      );
    viewport.addEventListener('resize', onResize);
    viewport.addEventListener('scroll', onResize);
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener('resize', onResize);
      viewport.removeEventListener('scroll', onResize);
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
}
