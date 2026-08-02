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
    .prompt {
      position: fixed;
      inset-inline: var(--sl-space-3);
      inset-block-end: calc(var(--sl-safe-bottom) + var(--sl-space-3));
      z-index: 100;
      display: flex;
      align-items: center;
      gap: var(--sl-space-2);
      padding: var(--sl-space-2) var(--sl-space-3);
      border-radius: var(--sl-radius);
      background: var(--sl-text);
      color: var(--sl-bg);
      box-shadow: var(--sl-shadow);
      font-size: 0.875rem;
    }

    span {
      flex: 1;
    }

    button {
      flex: none;
      min-block-size: 2.25rem;
      padding-inline: var(--sl-space-3);
      border: none;
      border-radius: var(--sl-radius-sm);
      background: var(--sl-brand);
      color: var(--sl-text-on-brand);
      font-weight: 600;
    }

    .dismiss {
      background: transparent;
      color: inherit;
      opacity: 0.7;
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
