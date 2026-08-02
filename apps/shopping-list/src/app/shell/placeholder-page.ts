import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * Page temporaire du lot 0 : elle sert uniquement à vérifier que la PWA
 * s'installe et démarre sur les deux téléphones. Le lot 1 la remplace par la
 * vraie page de liste.
 */
@Component({
  selector: 'sl-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <img src="icons/icon-192.png" alt="" width="96" height="96" />
      <h1>Liste de courses</h1>
      <p>
        L'application est installée et fonctionne hors ligne.
        <br />
        La liste arrive au lot suivant.
      </p>
      <p class="status">
        Service worker :
        <strong>{{
          swEnabled ? 'actif' : 'inactif (mode développement)'
        }}</strong>
      </p>
    </main>
  `,
  styles: `
    main {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sl-space-3);
      min-height: 100dvh;
      padding: var(--sl-space-6) var(--sl-space-4);
      text-align: center;
    }

    img {
      border-radius: var(--sl-radius);
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
    }

    p {
      margin: 0;
      color: var(--sl-text-muted);
    }

    .status {
      margin-top: var(--sl-space-4);
      font-size: 0.875rem;
    }
  `,
})
export class PlaceholderPage {
  protected readonly swEnabled = inject(SwUpdate).isEnabled;
}
