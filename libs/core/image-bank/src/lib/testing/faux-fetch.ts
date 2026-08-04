export interface Appel {
  readonly url: string;
}

export interface FauxFetch {
  readonly fetchImpl: typeof fetch;
  readonly appels: Appel[];
}

/**
 * Un `fetch` de papier, qui note ce qu'on lui demande.
 *
 * Écrit à la main plutôt que `vi.mock` : c'est le contrat de `fetch` qu'on veut
 * éprouver, et les URL demandées font partie de ce qu'on vérifie — c'est là que
 * vivent `origin=*` pour Wikimedia ou la taille de page.
 *
 * `répond` peut rendre un objet — sérialisé en JSON avec un 200 —, une `Response`
 * pour choisir le statut, ou lever pour simuler une coupure réseau.
 */
export function fauxFetch(répond: (appel: Appel) => unknown): FauxFetch {
  const appels: Appel[] = [];

  const fetchImpl = ((url: string) => {
    const appel = { url };
    appels.push(appel);

    try {
      const réponse = répond(appel);

      return Promise.resolve(
        réponse instanceof Response
          ? réponse
          : new Response(JSON.stringify(réponse), { status: 200 }),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }) as unknown as typeof fetch;

  return { fetchImpl, appels };
}
