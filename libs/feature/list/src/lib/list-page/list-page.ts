import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { PluralPipe } from '@shopping-list/util/i18n';
import { Store } from '@ngrx/store';
import {
  asCount,
  displayQty,
  filterSuggestions,
  ItemView,
  listActions,
  selectCheckedCount,
  selectCheckedItems,
  selectIsEmpty,
  selectListName,
  selectLoaded,
  selectPendingByAisle,
  selectItemViews,
  selectRemainingCount,
  ProductImages,
  selectSuggestions,
  SuggestionView,
} from '@shopping-list/data-access/shopping';
import { RouterLink } from '@angular/router';
import { SyncRegistry } from '@shopping-list/core/sync';
import {
  AddButton,
  EmptyState,
  SyncBadge,
  SyncBadgeStatus,
  ThemeSwitch,
} from '@shopping-list/ui';
import { normalize } from '@shopping-list/util/categories';
import { ThemeStore } from '@shopping-list/util/theme';

import { AddBar } from '../add-bar/add-bar';
import { DictationPad } from '../dictation-pad/dictation-pad';
import {
  Dictation,
  DictationReceipt,
  DictationRequantify,
} from '../dictation/dictation';
import { HistoryPane } from '../history-pane/history-pane';
import { ItemRow } from '../item-row/item-row';
import { ListMenu } from '../list-menu/list-menu';
import { DictationAdd, ListUiStore } from '../list-ui.store';

@Component({
  selector: 'sl-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddBar,
    AddButton,
    Dictation,
    DictationPad,
    EmptyState,
    HistoryPane,
    ItemRow,
    ListMenu,
    PluralPipe,
    RouterLink,
    SyncBadge,
    ThemeSwitch,
    TranslocoPipe,
  ],
  providers: [ListUiStore],
  templateUrl: './list-page.html',
  styleUrl: './list-page.scss',
})
export class ListPage {
  private readonly store = inject(Store);
  protected readonly ui = inject(ListUiStore);
  protected readonly theme = inject(ThemeStore);

  private readonly storedName = this.store.selectSignal(selectListName);
  private readonly fallbackName = translateSignal('app.defaultListName');

  /**
   * Le nom vient du CRDT, donc il manque avant le premier snapshot. Un titre
   * vide le temps qu'IndexedDB réponde serait pire qu'un nom par défaut.
   */
  protected readonly listName = computed(
    () => this.storedName() || this.fallbackName(),
  );

  protected readonly loaded = this.store.selectSignal(selectLoaded);
  protected readonly groups = this.store.selectSignal(selectPendingByAisle);
  protected readonly checkedItems = this.store.selectSignal(selectCheckedItems);
  protected readonly remaining = this.store.selectSignal(selectRemainingCount);
  protected readonly checkedCount = this.store.selectSignal(selectCheckedCount);
  protected readonly isEmpty = this.store.selectSignal(selectIsEmpty);

  /**
   * « 9 restants sur 13 » plutôt que « 9 articles à prendre » : le même
   * chiffre, mais qui dit aussi le chemin parcouru.
   */
  protected readonly total = computed(
    () => this.remaining() + this.checkedCount(),
  );

  protected readonly progress = computed(() => {
    const total = this.total();
    return 0 === total ? 0 : (this.checkedCount() / total) * 100;
  });

  private readonly registry = inject(SyncRegistry);
  protected readonly images = inject(ProductImages);

  /**
   * Sans appairage, on dit « appareil seul » plutôt que « hors ligne » : rien
   * n'est en panne, il n'y a simplement personne à qui parler.
   */
  protected readonly syncStatus = computed<SyncBadgeStatus>(() => {
    const github = this.registry.states().find((s) => 'github' === s.id);
    return undefined === github || 'idle' === github.status
      ? 'unpaired'
      : (github.status as SyncBadgeStatus);
  });

  protected readonly syncPending = computed(
    () => this.registry.states().find((s) => 'github' === s.id)?.pending ?? 0,
  );

  private readonly allSuggestions = this.store.selectSignal(selectSuggestions);

  private readonly itemViews = this.store.selectSignal(selectItemViews);

  private readonly itemImageRefs = computed(() =>
    this.itemViews().map((view) => view.imageRef),
  );

  /**
   * Les articles entrés depuis l'ouverture du panneau d'ajout, du plus récent
   * au plus ancien : la pile de pastilles annulables.
   *
   * Dérivés de la liste plutôt que journalisés au fil des ajouts. Une pile
   * tenue à part mentirait dès qu'un article en sortirait autrement — retiré
   * d'un glissé, ou emporté par un delta reçu de l'autre téléphone. Un article
   * déjà présent n'y apparaît pas non plus : `addItem` réutilise sa ligne au
   * lieu d'en créer une seconde, donc sa date de création ne bouge pas.
   */
  protected readonly justAdded = computed<readonly ItemView[]>(() => {
    if (!this.ui.picking()) {
      return [];
    }

    const since = this.ui.pickingSince();
    return this.itemViews()
      .filter((view) => view.createdAt >= since)
      .sort((a, b) => b.createdAt - a.createdAt);
  });

  /**
   * Le bouton flottant de la dictée se retire sous le bord quand on défile vers
   * l'avant de la liste, et sur la liste vide où le gros bouton du centre prend
   * le relais. Ouvert, l'attribut est ignoré : c'est le plein écran.
   */
  protected readonly fabRetracted = computed(
    () => this.ui.fabHidden() || this.isEmpty(),
  );

  /**
   * Le reçu d'une ligne : le dernier article dicté, sa quantité, et le compte
   * tout juste ajouté quand il préexistait. Dérivé de la liste vive plutôt que
   * figé : si l'article ressort — annulé, ou emporté par un delta reçu de
   * l'autre téléphone —, le reçu disparaît de lui-même.
   */
  protected readonly dictationReceipt = computed<DictationReceipt | null>(() => {
    const last = this.ui.lastAdd();
    if (null === last) {
      return null;
    }

    const item = this.receiptItem(last);
    if (undefined === item) {
      return null;
    }

    const count = asCount(item.qty);
    return {
      label: item.label,
      quantity: displayQty(item.qty),
      // « (+2) » seulement si l'article était déjà là : un premier ajout de
      // quatre n'est pas un « +4 » de plus, c'est le compte lui-même. Une
      // quantité libre (« 500 g ») n'est pas un compte : jamais de « +N ».
      delta: null !== count && count > last.delta ? last.delta : null,
    };
  });

  /**
   * Retrouve la ligne du dernier ajout. Par son produit quand on le connaît ;
   * par son libellé sinon — la dictée vient alors de créer le produit, et son
   * identifiant n'était pas connu dans la frame de l'intention.
   */
  private receiptItem(last: DictationAdd): ItemView | undefined {
    const views = this.itemViews();
    if (null !== last.productId) {
      return views.find((view) => view.productId === last.productId);
    }

    const since = this.ui.pickingSince();
    return views
      .filter(
        (view) =>
          view.createdAt >= since &&
          normalize(view.label) === normalize(last.label),
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  /**
   * Le filtrage vit ici et non dans un selector : la requête change à chaque
   * frappe, ce qui invaliderait la mémoïsation à chaque caractère.
   */
  protected readonly suggestions = computed(() =>
    filterSuggestions(this.allSuggestions(), this.ui.trimmedQuery()),
  );

  /**
   * Proposer « Créer » seulement si rien d'existant ne porte exactement ce
   * libellé — sinon on fabriquerait des doublons dans l'historique, ce qui
   * ruinerait précisément ce à quoi il sert.
   */
  protected readonly canCreate = computed(() => {
    const query = normalize(this.ui.trimmedQuery());
    if ('' === query) {
      return false;
    }

    return !this.allSuggestions().some((s) => normalize(s.label) === query);
  });

  /**
   * Vrai quand l'écran est assez large pour afficher l'historique à côté.
   *
   * Un signal plutôt qu'une règle CSS : la colonne compte plusieurs centaines
   * de lignes, et les rendre pour les masquer coûterait sur téléphone
   * exactement là où on ne peut pas se le permettre.
   */
  protected readonly wide = signal(false);

  /**
   * Le pavé de saisie libre, ouvert au bureau par ＋… de la barre. Sur téléphone
   * c'est la dictée qui le porte ; ici il n'a pas de plein écran où vivre, la
   * page le pose donc elle-même par-dessus.
   */
  protected readonly desktopFree = signal(false);

  constructor() {
    // Les photos se résolvent au fil de l'eau, sans jamais retarder
    // l'affichage : `ensure` est idempotent et ne rend pas la main.
    effect(() => this.images.ensure(this.itemImageRefs()));

    this.watchWidth();
  }

  private watchWidth(): void {
    const view = inject(DOCUMENT).defaultView;
    if ('function' !== typeof view?.matchMedia) {
      return;
    }

    const query = view.matchMedia('(min-width: 1040px)');
    this.wide.set(query.matches);

    const onChange = (event: MediaQueryListEvent): void =>
      this.wide.set(event.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() =>
      query.removeEventListener('change', onChange),
    );
  }

  /** Depuis le bouton flottant ou celui de la liste vide : la feuille s'ouvre. */
  protected startAdding(): void {
    this.ui.startPicking();
  }

  protected onScroll(event: Event): void {
    this.ui.noteScroll((event.target as HTMLElement).scrollTop);
  }

  protected addExisting(suggestion: SuggestionView): void {
    this.store.dispatch(
      listActions.produitAjouté({ productId: suggestion.productId }),
    );
    this.ui.clearQuery();
  }

  /** Depuis la colonne historique : la barre d'ajout n'est pas concernée. */
  protected addFromHistory(suggestion: SuggestionView): void {
    this.store.dispatch(
      listActions.produitAjouté({ productId: suggestion.productId }),
    );
  }

  protected createAndAdd(label: string): void {
    this.store.dispatch(
      listActions.produitCrééEtAjouté({ draft: { label: label.trim() } }),
    );
    this.ui.clearQuery();
  }

  /**
   * ＋N de la dictée : valide l'article en cours avec ce compte. La première
   * suggestion si elle existe, une création sinon — la quantité voyage avec
   * l'ajout. La rangée étant éteinte sur un champ vide, `label` n'est jamais
   * vide ici ; et un libellé sans suggestion est forcément à créer, sans quoi
   * la suggestion de même libellé serait remontée.
   */
  protected addCounted(count: number): void {
    const label = this.ui.trimmedQuery();
    const [first] = this.suggestions();

    if (undefined !== first) {
      this.store.dispatch(
        listActions.produitAjouté({ productId: first.productId, qty: count }),
      );
      this.ui.noteAdd({
        productId: first.productId,
        label: first.label,
        delta: count,
      });
    } else {
      this.store.dispatch(
        listActions.produitCrééEtAjouté({ draft: { label }, qty: count }),
      );
      this.ui.noteAdd({ productId: null, label, delta: count });
    }

    this.ui.clearQuery();
  }

  /**
   * ＋… puis « Ajouter 500 g » : l'article en cours prend cette quantité libre.
   * Elle **écrase** au lieu d'incrémenter — c'est une valeur qu'on construit,
   * pas un compte. On retient la quantité d'avant pour que l'annulation la
   * restaure, ou `null` quand la ligne naît de ce geste : elle repartira alors.
   */
  protected addFree(qty: string): void {
    const label = this.ui.trimmedQuery();
    const [first] = this.suggestions();

    if (undefined !== first) {
      const existing = this.itemViews().find(
        (view) => view.productId === first.productId,
      );
      this.store.dispatch(
        listActions.produitAjouté({ productId: first.productId, qty }),
      );
      this.ui.noteAdd({
        productId: first.productId,
        label: first.label,
        delta: 0,
        previousQty: existing?.qty ?? null,
      });
    } else {
      this.store.dispatch(
        listActions.produitCrééEtAjouté({ draft: { label }, qty }),
      );
      this.ui.noteAdd({ productId: null, label, delta: 0, previousQty: null });
    }

    this.ui.clearQuery();
  }

  /** ＋… de la barre du bureau : on ouvre le pavé de saisie libre par-dessus. */
  protected openDesktopFree(): void {
    this.desktopFree.set(true);
  }

  /** « Ajouter » du pavé au bureau : on pose la quantité libre et on referme. */
  protected addFreeDesktop(qty: string): void {
    this.addFree(qty);
    this.desktopFree.set(false);
  }

  /**
   * Un tap sur une suggestion **complète** le champ, il n'ajoute pas : un seul
   * point de validation dans tout l'écran — la rangée du bas —, c'est ce qui
   * rend le geste prévisible en rafale.
   */
  protected pickSuggestion(suggestion: SuggestionView): void {
    this.ui.setQuery(suggestion.label);
  }

  /**
   * ✕ du reçu : on défait le dernier ajout. Une saisie libre restaure la
   * quantité d'avant, ou retire la ligne qu'elle avait créée. Un comptage
   * retranche ce qu'il venait d'ajouter ; si c'était toute la ligne, elle sort.
   */
  protected undoLast(): void {
    const last = this.ui.lastAdd();
    /* v8 ignore next 3 -- garde : le ✕ n'existe que si un reçu est posé, donc lastAdd aussi */
    if (null === last) {
      return;
    }

    const item = this.receiptItem(last);
    this.ui.clearLastAdd();
    /* v8 ignore next 3 -- garde : le reçu ne s'affiche que si sa ligne existe encore */
    if (undefined === item) {
      return;
    }

    if (undefined !== last.previousQty) {
      this.undoFree(item, last.previousQty);
      return;
    }

    const count = asCount(item.qty) ?? 1;
    if (count > last.delta) {
      this.store.dispatch(
        listActions.quantitéModifiée({
          itemId: item.id,
          qty: String(count - last.delta),
        }),
      );
    } else {
      this.store.dispatch(listActions.articleRetiré({ itemId: item.id }));
    }
  }

  /** Annule une saisie libre : la ligne née du geste sort, sinon on restaure. */
  private undoFree(item: ItemView, previousQty: string | null): void {
    if (null === previousQty) {
      this.store.dispatch(listActions.articleRetiré({ itemId: item.id }));
    } else {
      this.store.dispatch(
        listActions.quantitéModifiée({ itemId: item.id, qty: previousQty }),
      );
    }
  }

  /**
   * Relecture : une ligne change de quantité, ou sort. Le stepper descendu sous
   * 1 et le ✎ qui n'a rien laissé passent tous deux par un retrait ; toute autre
   * valeur se pose sur la ligne.
   */
  protected requantify(change: DictationRequantify): void {
    if (null === change.qty) {
      this.store.dispatch(
        listActions.articleRetiré({ itemId: change.item.id }),
      );
    } else {
      this.store.dispatch(
        listActions.quantitéModifiée({
          itemId: change.item.id,
          qty: change.qty,
        }),
      );
    }
  }

  protected toggle(item: ItemView, checked: boolean): void {
    this.store.dispatch(listActions.articleCoché({ itemId: item.id, checked }));

    // Cocher fait disparaître la ligne du corps de liste. Décocher la fait
    // revenir : c'est déjà son propre retour en arrière, pas la peine d'un
    // bandeau.
    if (checked) {
      this.ui.noteChecked({ itemId: item.id, label: item.label });
    } else {
      this.ui.dismissUndo();
    }
  }

  protected undo(): void {
    const undoable = this.ui.undoable();
    if (null === undoable) {
      return;
    }

    this.ui.dismissUndo();
    this.store.dispatch(
      listActions.articleCoché({ itemId: undoable.itemId, checked: false }),
    );
  }

  protected remove(item: ItemView): void {
    this.store.dispatch(listActions.articleRetiré({ itemId: item.id }));
  }

  protected clearChecked(): void {
    this.ui.dismissUndo();
    this.store.dispatch(listActions.articlesCochésVidés());
  }

  /**
   * Vide la liste, pas l'historique : les produits restent au catalogue, donc
   * les prochaines courses se refont en tapant sur ce qu'on achète déjà.
   */
  protected clearList(): void {
    this.ui.closeListMenu();
    this.ui.dismissUndo();
    this.store.dispatch(listActions.listeVidée());
  }
}
