import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { TranslatableError } from './translatable-error';

/**
 * Transforme n'importe quoi d'attrapé en phrase affichable.
 *
 * Les erreurs que nous levons nous-mêmes portent une clé
 * ({@link TranslatableError}) ; celles que lève la plateforme — `TypeError:
 * Failed to fetch` d'un réseau coupé, par exemple — n'en ont pas. On affiche
 * alors leur message brut : imparfait, mais toujours préférable à un écran qui
 * échoue en silence.
 */
@Injectable({ providedIn: 'root' })
export class ErrorText {
  private readonly transloco = inject(TranslocoService);

  describe(error: unknown): string {
    if (error instanceof TranslatableError) {
      return this.transloco.translate(error.key, error.params);
    }

    return error instanceof Error ? error.message : String(error);
  }
}
