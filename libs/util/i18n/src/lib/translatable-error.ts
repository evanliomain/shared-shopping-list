export type ErrorParams = Readonly<Record<string, string | number>>;

/**
 * Une erreur qui transporte sa clé de traduction, pas sa phrase.
 *
 * Les couches basses — CRDT, API GitHub, lecture de QR — lèvent des erreurs
 * que l'utilisateur finit par lire. Elles ne peuvent pas les traduire
 * elles-mêmes : ce sont des fonctions pures, sans injection, et la langue
 * n'est pas leur affaire. Elles nomment donc le message, et c'est la couche
 * d'affichage qui le rend, via {@link ErrorText}.
 *
 * `message` reçoit la clé : un `TranslatableError` qui remonte dans une console
 * ou un rapport de crash reste identifiable.
 */
export class TranslatableError extends Error {
  constructor(
    readonly key: string,
    readonly params: ErrorParams = {},
  ) {
    super(key);
    this.name = 'TranslatableError';
  }
}
