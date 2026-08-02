import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Écran vide : un emoji, un titre, une explication. */
@Component({
  selector: 'sl-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="glyph" aria-hidden="true">{{ emoji() }}</p>
    <p class="title">{{ title() }}</p>
    @if ('' !== hint()) {
      <p class="hint">{{ hint() }}</p>
    }
  `,
  styles: `
    /* Le centrage vertical et la hauteur pleine servent quand l'état vide est
       le seul enfant du corps de page : il se centre alors dans l'écran, au
       lieu de rester collé en haut d'une page par ailleurs vide. */
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      block-size: 100%;
      padding: var(--sl-space-6) 2.5rem;
      text-align: center;
    }

    p {
      margin: 0;
    }

    .glyph {
      font-size: 2.5rem;
      line-height: 1;
    }

    .title {
      font-size: var(--sl-font-lg);
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    .hint {
      color: var(--sl-text-muted);
      font-size: var(--sl-font-md);
      line-height: 1.5;
      max-inline-size: 28ch;
      text-wrap: pretty;
    }
  `,
})
export class EmptyState {
  readonly emoji = input('🛒');
  readonly title = input.required<string>();
  readonly hint = input('');
}
