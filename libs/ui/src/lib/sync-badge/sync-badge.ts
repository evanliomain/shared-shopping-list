import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Plural } from '@shopping-list/util/i18n';

export type SyncBadgeStatus =
  | 'unpaired'
  | 'connecting'
  | 'live'
  | 'offline'
  | 'error';

/**
 * Pastille d'état de synchronisation.
 *
 * Le message compte autant que la couleur. « Hors ligne » tout court inquiète
 * pour rien : ce qui rassure, c'est de savoir que **rien n'est perdu** et
 * combien de modifications attendent. C'est le bandeau qu'on regarde au fond
 * d'un rayon quand le réseau ne passe plus.
 */
@Component({
  selector: 'sl-sync-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="dot" aria-hidden="true"></span>
    <span class="text">{{ text() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--sl-space-2);
      min-block-size: var(--sl-tap-target);
      padding-inline: var(--sl-space-2);
      border: none;
      border-radius: var(--sl-radius-full);
      background: transparent;
      color: var(--sl-text-muted);
      font-size: 0.8125rem;
      white-space: nowrap;
    }

    .dot {
      inline-size: 0.5rem;
      block-size: 0.5rem;
      flex: none;
      border-radius: var(--sl-radius-full);
      background: currentColor;
    }

    :host([data-status='live']) {
      color: var(--sl-brand);
    }

    :host([data-status='offline']) {
      color: var(--sl-warning);
    }

    :host([data-status='error']) {
      color: var(--sl-danger);
    }

    :host([data-status='connecting']) .dot {
      animation: pulse 1.2s ease-in-out infinite;
    }

    @keyframes pulse {
      50% {
        opacity: 0.25;
      }
    }
  `,
  host: {
    '[attr.data-status]': 'status()',
    '[attr.title]': 'text()',
  },
})
export class SyncBadge {
  readonly status = input.required<SyncBadgeStatus>();
  /** Modifications écrites localement mais pas encore publiées. */
  readonly pending = input(0);

  /**
   * Le nombre en attente fait partie du message, pas d'une concaténation.
   *
   * « 1 modif » contre « 3 modifs » est une règle de langue, pas une
   * condition : c'est à `Plural` de la trancher, langue par langue.
   */
  private readonly key = computed(() => {
    switch (this.status()) {
      case 'live':
        return 0 === this.pending() ? 'sync.synced' : 'sync.sending';
      case 'connecting':
        return 'sync.connecting';
      case 'offline':
        return 'sync.offline';
      case 'error':
        return 'sync.failed';
      default:
        return 'sync.alone';
    }
  });

  private readonly plural = inject(Plural);

  protected readonly text = computed(() =>
    this.plural.translate(this.key(), this.pending()),
  );
}
