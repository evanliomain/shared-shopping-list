import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Propose la nouvelle version, sans l'imposer.
 *
 * Le service worker télécharge la mise à jour en arrière-plan ; recharger
 * automatiquement rejouerait la page au milieu d'une course, potentiellement
 * pendant qu'on coche un article. On attend donc un geste explicite.
 */
@Component({
  selector: 'sl-update-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (available()) {
      <div class="prompt" role="status">
        <span>{{ 'update.available' | transloco }}</span>
        <button type="button" (click)="reload()">
          {{ 'update.reload' | transloco }}
        </button>
        <button type="button" class="dismiss" (click)="dismiss()">
          {{ 'update.later' | transloco }}
        </button>
      </div>
    }
  `,
  styles: `
    /* Ancré à la hauteur de la barre d'ajout de la liste : le bandeau se pose
       au-dessus d'elle, jamais dessus. Sur les autres écrans, ça le cale
       au-dessus du pied d'actions. */
    .prompt {
      position: fixed;
      inset-inline: var(--sl-space-3);
      inset-block-end: calc(6rem + var(--sl-safe-bottom));
      z-index: 90;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.625rem 0.625rem var(--sl-space-4);
      border-radius: var(--sl-radius);
      background: var(--sl-text);
      color: var(--sl-bg);
      box-shadow: var(--sl-shadow-lg);
      font-size: var(--sl-font-md);
      line-height: 1.35;
    }

    span {
      flex: 1;
    }

    button {
      flex: none;
      min-block-size: 2.375rem;
      padding-inline: 0.875rem;
      border: none;
      border-radius: var(--sl-radius-sm);
      background: var(--sl-brand);
      color: var(--sl-text-on-brand);
      font-size: var(--sl-font-md);
      font-weight: 650;
    }

    .dismiss {
      padding-inline: 0.625rem;
      background: transparent;
      color: inherit;
      opacity: 0.65;
    }
  `,
})
export class UpdatePrompt {
  private readonly updates = inject(SwUpdate);

  protected readonly available = signal(false);

  constructor() {
    if (!this.updates.isEnabled) {
      return;
    }

    this.updates.versionUpdates.subscribe((event) => {
      if ('VERSION_READY' === event.type) {
        this.available.set(true);
      }
    });
  }

  protected async reload(): Promise<void> {
    await this.updates.activateUpdate();
    location.reload();
  }

  protected dismiss(): void {
    this.available.set(false);
  }
}
