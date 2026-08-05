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
import { AddControl } from '../add-control/add-control';
import { HistoryPane } from '../history-pane/history-pane';
import { ItemRow } from '../item-row/item-row';
import { ListMenu } from '../list-menu/list-menu';
import { ListUiStore } from '../list-ui.store';

@Component({
  selector: 'sl-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddBar,
    AddButton,
    AddControl,
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
   * Le contrôle d'ajout se retire sous le bord quand on défile vers l'avant de
   * la liste, et sur la liste vide où le gros bouton du centre prend le relais.
   * Pendant la saisie il ne se retire pas : il *devient* le champ, à la place
   * du bouton.
   */
  protected readonly controlRetracted = computed(
    () => this.ui.fabHidden() || this.isEmpty(),
  );

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
   * « Entrée » dans le champ overlay du téléphone : on prend la première
   * suggestion si elle existe, sinon on crée. Le même arbitrage que la barre au
   * clavier, mais porté ici — l'overlay ne connaît ni les suggestions ni le
   * catalogue, seule la page les a.
   */
  protected submitQuery(): void {
    const [first] = this.suggestions();
    if (undefined !== first) {
      this.addExisting(first);
      return;
    }

    if (this.canCreate()) {
      this.createAndAdd(this.ui.trimmedQuery());
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
