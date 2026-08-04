import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Store } from '@ngrx/store';
import { blobHashOf, BlobService } from '@shopping-list/core/blobs';
import { ImageCredit, ImageRef, ProductId } from '@shopping-list/core/crdt';
import { BankImage } from '@shopping-list/core/image-bank';
import {
  catalogActions,
  displayEmoji,
  ProductBankImages,
  ProductImages,
  selectCatalog,
  selectCredits,
} from '@shopping-list/data-access/shopping';
import { EmptyState, ProductAvatar } from '@shopping-list/ui';
import { ErrorText, TranslatableError } from '@shopping-list/util/i18n';
import { AISLE_EMOJI, AISLES } from '@shopping-list/util/categories';

/** Quelques emoji courants, pour ne pas imposer le clavier système. */
const EMOJI_CHOICES = [
  '🍎',
  '🍌',
  '🥕',
  '🥬',
  '🥔',
  '🍅',
  '🍇',
  '🍋',
  '🥩',
  '🍗',
  '🐟',
  '🥓',
  '🧀',
  '🥛',
  '🥚',
  '🧈',
  '🥖',
  '🥐',
  '🍞',
  '🍝',
  '🍚',
  '🥫',
  '🧂',
  '🫒',
  '🍫',
  '🍪',
  '🍯',
  '🥣',
  '☕',
  '🍵',
  '🧃',
  '💧',
  '🍺',
  '🍷',
  '🧊',
  '🍦',
  '🧴',
  '🧼',
  '🧻',
  '🪥',
  '🧺',
  '🧽',
  '🗑️',
  '🔋',
  '💡',
  '🍼',
  '🐾',
  '🛒',
];

/**
 * Fiche d'un produit du catalogue.
 *
 * Elle modifie le **catalogue**, pas la ligne de liste : corriger une
 * description ou une image ici se répercute sur toutes les listes, passées et
 * futures. C'est ce qui rend l'historique utilisable dans la durée.
 *
 * ## Trois sources d'image, et une seule affichée
 *
 * Un produit peut disposer de trois images à la fois, et l'écran doit dire
 * laquelle gagne sans faire deviner :
 *
 *  - une **photo** prise sur place, qui l'emporte sur tout ;
 *  - une **image de la banque**, mémorisée même quand elle n'est pas montrée —
 *    c'est ce qui permet de la retirer puis de la remettre ;
 *  - un **emoji**, qui est le repli et ne disparaît jamais.
 *
 * D'où deux signaux plutôt qu'un pour l'image de banque : `bankRef` dit qu'elle
 * existe, `bankShown` dit qu'elle est affichée. Les confondre reviendrait à
 * l'oublier en la retirant.
 */
@Component({
  selector: 'sl-product-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, FormsModule, ProductAvatar, TranslocoPipe],
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
})
export class ProductPage {
  /** Alimenté par `withComponentInputBinding()` depuis le paramètre de route. */
  readonly productId = input.required<ProductId>();

  private readonly store = inject(Store);
  private readonly location = inject(Location);
  private readonly blobs = inject(BlobService);
  private readonly bank = inject(ProductBankImages);
  private readonly errorText = inject(ErrorText);
  protected readonly images = inject(ProductImages);

  private readonly catalog = this.store.selectSignal(selectCatalog);
  private readonly credits = this.store.selectSignal(selectCredits);

  protected readonly product = computed(() => this.catalog()[this.productId()]);
  protected readonly aisles = AISLES.map((aisle) => ({
    key: aisle,
    emoji: AISLE_EMOJI[aisle],
  }));
  protected readonly emojiChoices = EMOJI_CHOICES;

  protected readonly label = signal('');
  protected readonly description = signal('');
  protected readonly defaultQty = signal('');
  protected readonly category = signal('');
  protected readonly emoji = signal('🛒');

  /** Photo prise sur place. L'emporte sur l'image de banque comme sur l'emoji. */
  protected readonly photoRef = signal<ImageRef | null>(null);
  protected readonly photoBusy = signal(false);

  /** L'image de banque connue du produit, affichée ou non. */
  protected readonly bankRef = signal<ImageRef | null>(null);
  /** Est-elle celle qu'on montre ? Retirer met ceci à faux sans vider `bankRef`. */
  protected readonly bankShown = signal(false);
  /**
   * L'image choisie pendant cette visite, pas encore enregistrée.
   *
   * Elle porte son crédit, qui n'est dans le CRDT qu'après l'enregistrement.
   */
  private readonly pickedBank = signal<{
    /** L'identifiant du résultat, pour marquer la vignette retenue. */
    readonly id: string;
    readonly imageRef: ImageRef;
    readonly credit: ImageCredit;
  } | null>(null);

  /** Quelle vignette de la grille porte la marque du choix. */
  protected readonly pickedBankId = computed(
    () => this.pickedBank()?.id ?? null,
  );

  protected readonly bankQuery = signal('');
  protected readonly bankBusy = signal(false);
  protected readonly bankError = signal<string | null>(null);
  protected readonly bankResults = signal<readonly BankImage[]>([]);
  /** Vrai après une recherche qui n'a rien rendu, pour distinguer de « pas cherché ». */
  protected readonly bankSearched = signal(false);

  /** La référence réellement affichée, dans l'ordre de priorité. */
  protected readonly shownRef = computed(
    () => this.photoRef() ?? (this.bankShown() ? this.bankRef() : null),
  );

  protected readonly shownUrl = computed(() =>
    this.images.urlFor(this.shownRef()),
  );

  /**
   * Le crédit à afficher pour l'image de banque du produit.
   *
   * Celui de la visite en cours d'abord : le CRDT ne l'aura qu'après
   * l'enregistrement, et l'écran doit pourtant créditer ce qu'il montre.
   */
  protected readonly bankCredit = computed<ImageCredit | null>(() => {
    const picked = this.pickedBank();
    if (null !== picked) {
      return picked.credit;
    }

    // Le gabarit ne lit ce crédit qu'à l'intérieur d'un `@if` sur `bankRef`, et
    // une référence d'image de banque est toujours un `blob:` : l'empreinte ne
    // peut pas manquer ici. Le repli ne garde que le type.
    /* v8 ignore next -- empreinte absente inatteignable, voir ci-dessus */
    const hash = blobHashOf(this.bankRef()) ?? '';
    return this.credits()[hash] ?? null;
  });

  protected readonly canSave = computed(() => '' !== this.label().trim());

  constructor() {
    // Le produit peut arriver après le premier rendu : IndexedDB restaure de
    // façon asynchrone, et un delta distant peut le créer plus tard encore.
    effect(() => {
      const product = this.product();
      if (undefined === product) {
        return;
      }

      this.label.set(product.label);
      this.description.set(product.description);
      this.defaultQty.set(product.defaultQty);
      this.category.set(product.category);
      this.emoji.set(displayEmoji(product));

      const ref = product.imageRef;
      const bank = product.bankImageRef;

      this.bankRef.set(bank);
      // L'image de banque est celle qu'on montre si c'est exactement elle.
      this.bankShown.set(null !== bank && ref === bank);
      // Une photo, c'est un blob qui n'est pas l'image de banque. Sans cette
      // distinction, retirer l'image de banque effacerait aussi la photo.
      this.photoRef.set(
        null !== ref && ref.startsWith('blob:') && ref !== bank ? ref : null,
      );

      this.images.ensure([ref, bank]);
    });
  }

  /**
   * Prend une photo et la range immédiatement.
   *
   * On enregistre avant même que l'utilisateur valide la fiche : la photo est
   * adressée par son contenu, donc la stocker deux fois ne coûte rien, et une
   * photo perdue parce qu'on a quitté l'écran serait irritante.
   */
  protected async onPhotoPicked(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (undefined === file) {
      return;
    }

    this.photoBusy.set(true);
    try {
      const ref = await this.blobs.store(file);
      this.photoRef.set(ref);
      this.images.ensure([ref]);
    } finally {
      this.photoBusy.set(false);
    }
  }

  /** Revenir à l'emoji : la photo reste en cache, seule la référence change. */
  protected clearPhoto(): void {
    this.photoRef.set(null);
  }

  /**
   * Cherche dans les banques d'images.
   *
   * Le champ est prérempli avec le libellé, mais reste modifiable : c'est le
   * rattrapage le plus utile quand la proposition d'office est tombée à côté —
   * chercher « avocat fruit » plutôt qu'« avocat ».
   */
  protected async searchBank(): Promise<void> {
    const query = this.bankQuery().trim();
    if ('' === query || this.bankBusy()) {
      return;
    }

    this.bankBusy.set(true);
    this.bankError.set(null);
    try {
      this.bankResults.set(await this.bank.search(query));
      this.bankSearched.set(true);
    } catch (error) {
      // Toutes les banques à terre : là, contrairement à la recherche d'office,
      // quelqu'un attend une réponse et mérite de savoir qu'il n'y en aura pas.
      this.bankError.set(this.errorText.describe(error));
      this.bankResults.set([]);
    } finally {
      this.bankBusy.set(false);
    }
  }

  /** Prérenseigne le champ avec le libellé quand on n'a pas encore cherché. */
  protected openBank(): void {
    if ('' === this.bankQuery()) {
      this.bankQuery.set(this.label().trim());
    }
    void this.searchBank();
  }

  /**
   * Adopte une image de la grille.
   *
   * Le téléchargement et la réduction ont lieu tout de suite, pour la même
   * raison que la photo : quitter l'écran ne doit pas coûter le travail déjà
   * fait. L'écriture dans le CRDT, elle, attend l'enregistrement.
   */
  protected async chooseBankImage(image: BankImage): Promise<void> {
    if (this.bankBusy()) {
      return;
    }

    this.bankBusy.set(true);
    this.bankError.set(null);
    try {
      const adopted = await this.bank.adopt(image);
      if (null === adopted) {
        // Le fournisseur a répondu mais son hébergeur d'images est tombé :
        // mieux vaut le dire que laisser un choix sans effet.
        this.bankError.set(
          this.errorText.describe(
            new TranslatableError('errors.imageBank.thumbnailFailed'),
          ),
        );
        return;
      }

      this.pickedBank.set({ id: image.id, ...adopted });
      this.bankRef.set(adopted.imageRef);
      this.bankShown.set(true);
      // L'écran affiche cette référence : c'est à lui d'en réclamer l'URL, sans
      // compter sur le fait que l'adoption l'ait déjà fait.
      this.images.ensure([adopted.imageRef]);
      // Une image explicitement choisie l'emporte sur la photo : sans ça, le
      // choix n'aurait aucun effet visible et paraîtrait ignoré.
      this.photoRef.set(null);
    } finally {
      this.bankBusy.set(false);
    }
  }

  /** Retire l'image de la banque de l'affichage — sans l'oublier. */
  protected hideBankImage(): void {
    this.bankShown.set(false);
  }

  /** La remet : elle n'a jamais quitté l'appareil, rien à redemander au réseau. */
  protected showBankImage(): void {
    this.photoRef.set(null);
    this.bankShown.set(true);
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }

    this.store.dispatch(
      catalogActions.produitModifié({
        productId: this.productId(),
        patch: {
          label: this.label().trim(),
          description: this.description().trim(),
          defaultQty: this.defaultQty().trim(),
          category: this.category(),
        },
      }),
    );

    // D'abord mémoriser l'image de banque et son crédit, s'il y en a une de
    // nouvelle. Ensuite seulement dire ce qui s'affiche — car on a le droit de
    // choisir une image puis de la retirer avant d'enregistrer, et c'est la
    // seconde action qui doit avoir le dernier mot.
    const picked = this.pickedBank();
    if (null !== picked) {
      this.store.dispatch(
        catalogActions.imageDeBanqueChoisie({
          productId: this.productId(),
          imageRef: picked.imageRef,
          credit: picked.credit,
        }),
      );
    }

    this.store.dispatch(
      catalogActions.imageModifiée({
        productId: this.productId(),
        imageRef: this.shownRef() ?? `emoji:${this.emoji()}`,
      }),
    );

    // Publication en tâche de fond : le dépôt n'est pas sur le chemin critique
    // de l'enregistrement.
    void this.images.publishToRemote(this.shownRef());

    this.close();
  }

  protected archive(): void {
    this.store.dispatch(
      catalogActions.produitArchivé({ productId: this.productId() }),
    );
    this.close();
  }

  protected close(): void {
    this.location.back();
  }
}
