import { DOCUMENT, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Store } from '@ngrx/store';
import {
  listActions,
  selectOrderedAisles,
} from '@shopping-list/data-access/shopping';
import { AISLE_EMOJI, Aisle } from '@shopping-list/util/categories';

/** Déplace un élément du rang `from` au rang `to`, sans muter l'entrée. */
function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Deux parcours identiques, rayon pour rayon. Les deux couvrent les mêmes
 * rayons — l'un est une permutation de l'autre —, la longueur est donc acquise.
 */
function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.every((aisle, i) => aisle === b[i]);
}

/** Un glissé en cours : le pointeur suivi, le rayon soulevé, l'ordre courant. */
interface Drag {
  readonly pointerId: number;
  readonly key: Aisle;
  readonly order: readonly Aisle[];
}

/**
 * Régler le parcours : l'ordre dans lequel les rayons se suivent dans la liste.
 *
 * On range **au doigt en glissant** — une poignée par ligne — ou **aux deux
 * flèches**. Le glissé va vite quand on déplace loin, mais il reste réservé au
 * pointeur : au clavier comme au lecteur d'écran, ce sont les flèches qui
 * rangent, chacune nommant son rayon. Les deux mènent au même geste métier —
 * dispatcher l'ordre entier — et aucune dépendance n'entre pour autant : le
 * glissé est tenu à la main sur les mêmes évènements pointeur que les gestes de
 * la liste, sans le CDK.
 *
 * Le déplacé se lit sous le doigt, pas à la géométrie : `elementFromPoint`
 * donne la ligne survolée, et le rayon soulevé prend sa place. L'ordre affiché
 * vient de ce glissé tant qu'il dure, sinon du réglage stocké.
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
  host: {
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerEnd($event)',
    '(pointercancel)': 'onPointerCancel($event)',
  },
})
export class AisleOrderPage {
  private readonly store = inject(Store);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly order = this.store.selectSignal(selectOrderedAisles);

  /** Le glissé en cours, ou `null` au repos : c'est lui qui prime à l'affichage. */
  private readonly drag = signal<Drag | null>(null);

  /** Le rayon soulevé par le doigt, pour le styler ; `null` hors glissé. */
  protected readonly draggingKey = computed(() => this.drag()?.key ?? null);

  /** Chaque rayon avec son emoji, dans l'ordre affiché — glissé ou réglé. */
  protected readonly aisles = computed(() =>
    (this.drag()?.order ?? this.order()).map((aisle) => ({
      key: aisle,
      emoji: AISLE_EMOJI[aisle],
    })),
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

  /**
   * Saisit un rayon par sa poignée. On fige l'ordre courant comme point de
   * départ ; un second doigt pendant le glissé est ignoré.
   *
   * On capture le pointeur, comme les gestes de la liste : sans quoi une souris
   * relâchée hors du composant n'enverrait jamais son `pointerup` ici, et le
   * glissé resterait figé, ligne soulevée et prochaine prise bloquée.
   */
  protected onGripDown(event: PointerEvent, key: Aisle): void {
    if (null !== this.drag()) {
      return;
    }
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.drag.set({
      pointerId: event.pointerId,
      key,
      order: [...this.order()],
    });
  }

  /**
   * Suit le doigt : le rayon survolé cède sa place au rayon soulevé. La ligne
   * survolée se lit à `elementFromPoint` et non à la cible de l'évènement : le
   * pointeur étant capturé, celle-ci est toujours le composant, jamais le rayon
   * qu'on survole.
   */
  protected onPointerMove(event: PointerEvent): void {
    const drag = this.dragFor(event);
    if (null === drag) {
      return;
    }

    const over = this.aisleUnder(event.clientX, event.clientY);
    if (null === over) {
      return;
    }

    const from = drag.order.indexOf(drag.key);
    const to = drag.order.indexOf(over);
    if (from === to) {
      return;
    }

    this.drag.set({ ...drag, order: moveItem(drag.order, from, to) });
  }

  /**
   * Relâche : on descend l'ordre obtenu dans le document, par le même chemin
   * que les flèches. Un glissé qui revient à son point de départ ne dispatche
   * rien.
   */
  protected onPointerEnd(event: PointerEvent): void {
    const drag = this.dragFor(event);
    if (null === drag) {
      return;
    }

    this.drag.set(null);
    if (!sameOrder(drag.order, this.order())) {
      this.store.dispatch(listActions.rayonsRéordonnés({ order: drag.order }));
    }
  }

  /** Le navigateur a repris la main : on abandonne sans rien enregistrer. */
  protected onPointerCancel(event: PointerEvent): void {
    if (null !== this.dragFor(event)) {
      this.drag.set(null);
    }
  }

  /** Le glissé en cours s'il appartient à ce pointeur, sinon `null`. */
  private dragFor(event: PointerEvent): Drag | null {
    const drag = this.drag();
    return null !== drag && event.pointerId === drag.pointerId ? drag : null;
  }

  /**
   * La clé du rayon dont la ligne est sous ce point, ou `null`. Le `data-key`
   * ne porte que des rayons connus — c'est le template qui l'y a posé.
   */
  private aisleUnder(x: number, y: number): Aisle | null {
    const li = this.document.elementFromPoint(x, y)?.closest('li[data-key]');
    return (li?.getAttribute('data-key') ?? null) as Aisle | null;
  }
}
