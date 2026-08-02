import '@angular/compiler';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

// L'application est zoneless : pas de zone.js, y compris en test.
setupTestBed();

// jsdom connaît `PointerEvent` mais pas la capture de pointeur, dont le glissé
// d'une ligne a besoin pour survivre au doigt qui sort de la ligne. On la
// bouche ici plutôt que de la rendre optionnelle dans le composant : tous les
// navigateurs visés l'implémentent depuis des années.
Element.prototype.setPointerCapture ??= function (): void {
  /* rien à simuler : aucun événement n'est redirigé en test */
};
Element.prototype.releasePointerCapture ??= function (): void {
  /* idem */
};
