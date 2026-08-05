import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Store } from '@ngrx/store';
import {
  listActions,
  selectOrderedAisles,
} from '@shopping-list/data-access/shopping';
import { AISLE_EMOJI } from '@shopping-list/util/categories';

/**
 * Régler le parcours : l'ordre dans lequel les rayons se suivent dans la liste.
 *
 * Deux boutons par ligne plutôt qu'un glisser-déposer. Le glissé sur téléphone
 * demanderait une dépendance (le CDK n'est pas là) et reste pénible au lecteur
 * d'écran ; deux flèches marchent au pouce comme au clavier, et réordonner est
 * un geste assez rare pour que leur lenteur relative ne pèse pas.
 *
 * L'écran montre **tous** les rayons, pas seulement ceux de la liste du jour :
 * on règle ici le magasin, pas les courses de la semaine. L'ordre effectif
 * vient de `selectOrderedAisles`, qui complète déjà tout réglage partiel.
 */
@Component({
  selector: 'sl-aisle-order-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './aisle-order-page.html',
  styleUrl: './aisle-order-page.scss',
})
export class AisleOrderPage {
  private readonly store = inject(Store);
  private readonly location = inject(Location);

  private readonly order = this.store.selectSignal(selectOrderedAisles);

  /** Chaque rayon avec son emoji, dans l'ordre effectif. */
  protected readonly aisles = computed(() =>
    this.order().map((aisle) => ({ key: aisle, emoji: AISLE_EMOJI[aisle] })),
  );

  protected back(): void {
    this.location.back();
  }

  /**
   * Déplace un rayon d'un cran. Les extrémités sont bloquées côté template : on
   * échange donc toujours avec un voisin qui existe.
   *
   * On dispatche l'ordre **entier**, pas seulement la paire changée : c'est ce
   * que le CRDT stocke, et ce qui garde le réglage stable quand un rayon
   * s'ajoute plus tard.
   */
  protected move(index: number, delta: number): void {
    const order = [...this.order()];
    const target = index + delta;
    [order[index], order[target]] = [order[target], order[index]];
    this.store.dispatch(listActions.rayonsRéordonnés({ order }));
  }

  /** Rétablit le parcours par défaut : un ordre vide, que le CRDT sait lire. */
  protected reset(): void {
    this.store.dispatch(listActions.rayonsRéordonnés({ order: [] }));
  }
}
