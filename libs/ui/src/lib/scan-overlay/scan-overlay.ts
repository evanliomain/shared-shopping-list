import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Lecteur de QR code en plein cadre.
 *
 * Appairage et échange de proximité montrent exactement le même écran : fond
 * noir, lucarne, une consigne, un bouton pour renoncer. Une seule chose à
 * faire, une seule à lire.
 *
 * L'élément `<video>` est **projeté** par la page plutôt que déclaré ici :
 * c'est elle qui le passe au lecteur, via un `viewChild` qui doit être résolu
 * avant que le scan démarre. Il reste donc monté en permanence, l'attribut
 * `active` ne faisant que l'afficher — dans un `@if`, le scan démarrait avant
 * que l'élément existe et échouait en silence.
 *
 * En contrepartie, la page garde à sa charge la mise en forme de son `<video>`
 * (l'encapsulation Angular rattache le contenu projeté à la feuille de styles
 * de la page, pas à celle-ci).
 */
@Component({
  selector: 'sl-scan-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="head"><ng-content select="[data-slot='head']" /></div>

    <div class="viewfinder">
      <ng-content select="video" />
      <span class="window" aria-hidden="true"></span>
      <div class="status"><ng-content select="[data-slot='status']" /></div>
    </div>

    <div class="actions">
      <button type="button" (click)="cancelled.emit()">
        {{ 'common.cancel' | transloco }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: none;
    }

    :host([data-active='true']) {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: #000;
    }

    .head:not(:empty) {
      padding: calc(var(--sl-safe-top) + var(--sl-space-3)) var(--sl-space-4)
        var(--sl-space-3);
    }

    .viewfinder {
      position: relative;
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    /* L'ombre portée démesurée assombrit tout sauf la lucarne — un seul
       élément plutôt que quatre voiles à positionner. */
    .window {
      inline-size: min(15rem, 62vw);
      aspect-ratio: 1;
      border-radius: var(--sl-radius-lg);
      box-shadow: 0 0 0 100vmax rgb(0 0 0 / 45%);
      outline: 3px solid rgb(255 255 255 / 90%);
      outline-offset: -3px;
    }

    .status {
      position: absolute;
      inset-inline: var(--sl-space-6);
      inset-block-end: 3.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sl-space-3);
      color: #fff;
      font-size: 1.0625rem;
      font-weight: 650;
      line-height: 1.35;
      text-align: center;
      text-wrap: pretty;
      /* Seules les propriétés héritées atteignent le contenu projeté : la
         page garde à sa charge marges et dimensions de ce qu'elle glisse
         ici. */
    }

    .actions {
      padding: var(--sl-space-3) var(--sl-space-4);
      padding-block-end: calc(var(--sl-safe-bottom) + 1.625rem);
      background: #000;
    }

    button {
      inline-size: 100%;
      min-block-size: 3.125rem;
      border: 1px solid rgb(255 255 255 / 30%);
      border-radius: var(--sl-radius);
      background: transparent;
      color: #fff;
      font-size: 0.96875rem;
      font-weight: 650;
    }
  `,
  host: {
    '[attr.data-active]': 'active()',
  },
})
export class ScanOverlay {
  readonly active = input.required<boolean>();

  /** Renoncer : la page décide ce que « annuler » veut dire pour elle. */
  readonly cancelled = output<void>();
}
