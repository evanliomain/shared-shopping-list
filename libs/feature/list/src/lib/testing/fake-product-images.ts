/**
 * Faux service de photos : la vraie résolution passe par IndexedDB, que jsdom
 * n'implémente pas. Seul compte ici ce que les écrans font de l'URL, et les
 * références dont ils demandent la résolution.
 */
export class FakeProductImages {
  /** Les lots réellement demandés, dans l'ordre. */
  readonly ensured: (string | null)[][] = [];
  /** URL rendue pour n'importe quelle référence, ou `null` : photo absente. */
  url: string | null = null;

  urlFor(): string | null {
    return this.url;
  }

  ensure(refs: readonly (string | null)[]): void {
    this.ensured.push([...refs]);
  }
}
