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
  templateUrl: './add-bar.html',
  styleUrl: './add-bar.scss',
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

  /**
   * Les pastilles, figées le temps de la fermeture.
   *
   * `added` se dérive de `picking` côté page : à la fermeture, il retombe à
   * vide dans la même frame que `picking`. Les pastilles s'effaceraient alors
   * d'un coup — leur contenu retiré avant qu'`animate.leave` n'ait pu le fondre.
   * On garde donc la dernière pile vue tant que le panneau est ouvert ; une fois
   * fermé, on la rejoue telle quelle, et la cascade de sortie l'emporte comme le
   * reste. À la réouverture, `picking` repasse à vrai et l'on suit de nouveau la
   * pile vive.
   */
  private readonly frozenAdded = signal<readonly ItemView[]>([]);
  protected readonly shownAdded = computed(() =>
    this.picking() ? this.added() : this.frozenAdded(),
  );

  constructor() {
    // Tant que le panneau est ouvert, la pile figée suit la pile vive. Fermé,
    // l'effet ne la touche plus : elle retient sa dernière valeur pour la sortie.
    effect(() => {
      if (this.picking()) {
        this.frozenAdded.set(this.added());
      }
    });

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
