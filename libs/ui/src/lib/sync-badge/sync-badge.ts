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
 *
 * D'où la puce teintée plutôt que du texte coloré : à bout de bras, un fond
 * se repère avant une nuance de gris, et le contraste du libellé ne dépend
 * plus de la couleur d'état.
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
      gap: 0.4375rem;
      block-size: 1.75rem;
      padding-inline: 0.6875rem;
      border: none;
      border-radius: var(--sl-radius-full);
      background: var(--sl-surface-sunken);
      color: var(--sl-text-muted);
      font-size: var(--sl-font-xs);
      font-weight: 600;
      white-space: nowrap;
    }

    .dot {
      inline-size: 0.4375rem;
      block-size: 0.4375rem;
      flex: none;
      border-radius: var(--sl-radius-full);
      background: currentColor;
    }

    :host([data-status='live']) {
      background: var(--sl-brand-soft);
      color: var(--sl-brand-ink);
    }

    :host([data-status='live']) .dot {
      background: var(--sl-brand);
    }

    :host([data-status='offline']) {
      background: var(--sl-warning-soft);
      color: var(--sl-warning-ink);
    }

    :host([data-status='offline']) .dot {
      background: var(--sl-warning);
    }

    :host([data-status='error']) {
      background: var(--sl-danger-soft);
      color: var(--sl-danger-ink);
    }

    :host([data-status='error']) .dot {
      background: var(--sl-danger);
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
