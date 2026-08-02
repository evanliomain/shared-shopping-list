import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

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

  protected readonly text = computed(() => {
    const pending = this.pending();
    const waiting =
      0 === pending
        ? ''
        : ` · ${pending} ${1 === pending ? 'modif' : 'modifs'} en attente`;

    switch (this.status()) {
      case 'live':
        return 0 === pending ? 'Synchronisé' : `Envoi…${waiting}`;
      case 'connecting':
        return 'Connexion…';
      case 'offline':
        return `Hors ligne${waiting}`;
      case 'error':
        return 'Synchro en panne';
      default:
        return 'Hors ligne · appareil seul';
    }
  });
}
