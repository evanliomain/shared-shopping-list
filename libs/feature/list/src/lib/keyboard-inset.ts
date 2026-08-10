import { DestroyRef, inject, signal, Signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * Suit la hauteur du clavier virtuel via `visualViewport`.
 *
 * Les plein écrans de la dictée collent leur rangée d'action au bas de l'écran.
 * Un clavier ancré en bas la recouvrirait : on renvoie l'espace qu'il mange,
 * en pixels, pour que la rangée remonte juste au-dessus de lui. Zéro tant
 * qu'aucun clavier n'est levé, ou quand le navigateur n'expose pas
 * `visualViewport`.
 *
 * À appeler dans un contexte d'injection (un constructeur de composant) : le
 * suivi se débranche tout seul à la destruction.
 */
export function trackKeyboardInset(): Signal<number> {
  const inset = signal(0);
  const view = inject(DOCUMENT).defaultView;
  const viewport = view?.visualViewport;
  if (null == view || null == viewport) {
    return inset;
  }

  const onResize = (): void =>
    inset.set(
      Math.max(0, view.innerHeight - viewport.height - viewport.offsetTop),
    );
  viewport.addEventListener('resize', onResize);
  viewport.addEventListener('scroll', onResize);
  inject(DestroyRef).onDestroy(() => {
    viewport.removeEventListener('resize', onResize);
    viewport.removeEventListener('scroll', onResize);
  });

  return inset;
}
