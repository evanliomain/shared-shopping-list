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
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sl-space-2);
      padding: var(--sl-space-6) var(--sl-space-4);
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
      font-weight: 600;
    }

    .hint {
      color: var(--sl-text-muted);
      font-size: 0.875rem;
      max-inline-size: 24rem;
    }
  `,
})
export class EmptyState {
  readonly emoji = input('🛒');
  readonly title = input.required<string>();
  readonly hint = input('');
}
