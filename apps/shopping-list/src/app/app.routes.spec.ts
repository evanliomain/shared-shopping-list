import { Route } from '@angular/router';

import { appRoutes } from './app.routes';

type Chargeur = NonNullable<Route['loadComponent']>;

/** Les routes paresseuses, dans l'ordre où elles sont déclarées. */
function paresseuses(): [string, Chargeur][] {
  const paires: [string, Chargeur][] = [];

  for (const route of appRoutes) {
    if (undefined !== route.path && undefined !== route.loadComponent) {
      paires.push([route.path, route.loadComponent]);
    }
  }

  return paires;
}

describe('appRoutes', () => {
  it('mène chaque adresse à sa page', async () => {
    // Import dynamique : un import statique de ces bibliothèques les ferait
    // basculer dans le lot initial, ce que le garde-fou Nx refuse.
    const [liste, produit, appairage, proximite, historique] =
      await Promise.all([
        import('@shopping-list/feature/list'),
        import('@shopping-list/feature/product'),
        import('@shopping-list/feature/pairing'),
        import('@shopping-list/feature/nearby'),
        import('@shopping-list/feature/catalog'),
      ]);

    const pages = await Promise.all(
      paresseuses().map(async ([chemin, chargeur]) => [
        chemin,
        await chargeur(),
      ]),
    );

    expect(pages).toEqual([
      ['liste', liste.ListPage],
      ['produit/:productId', produit.ProductPage],
      ['synchronisation', appairage.PairingPage],
      ['proximite', proximite.NearbyPage],
      ['historique', historique.CatalogPage],
    ]);
  });

  it('n’embarque aucune page dans le lot initial', () => {
    // Tout est paresseux : le premier écran doit s'afficher sans télécharger
    // l'appairage, la proximité ni l'historique.
    expect(appRoutes.filter((r) => undefined !== r.component)).toEqual([]);
    expect(paresseuses()).toHaveLength(5);
  });

  it('ramène à la liste tout ce qui ne correspond à rien', () => {
    // L'attrape-tout doit rester en dernier, sinon il avalerait les autres
    // adresses ; et la redirection de la racine doit être exacte, faute de
    // quoi elle avalerait aussi « /liste ».
    expect(appRoutes.map((r) => r.path).slice(-2)).toEqual(['', '**']);
    expect(appRoutes.filter((r) => undefined !== r.redirectTo)).toEqual([
      { path: '', pathMatch: 'full', redirectTo: 'liste' },
      { path: '**', redirectTo: 'liste' },
    ]);
  });
});
