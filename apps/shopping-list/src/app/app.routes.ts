import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'liste',
    loadComponent: () =>
      import('@shopping-list/feature/list').then((m) => m.ListPage),
  },
  {
    // `withComponentInputBinding()` injecte `productId` dans l'input du même nom.
    path: 'produit/:productId',
    loadComponent: () =>
      import('@shopping-list/feature/product').then((m) => m.ProductPage),
  },
  {
    path: 'rayons',
    loadComponent: () =>
      import('@shopping-list/feature/list').then((m) => m.AisleOrderPage),
  },
  {
    path: 'synchronisation',
    loadComponent: () =>
      import('@shopping-list/feature/pairing').then((m) => m.PairingPage),
  },
  {
    path: 'proximite',
    loadComponent: () =>
      import('@shopping-list/feature/nearby').then((m) => m.NearbyPage),
  },
  {
    path: 'historique',
    loadComponent: () =>
      import('@shopping-list/feature/catalog').then((m) => m.CatalogPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'liste' },
  { path: '**', redirectTo: 'liste' },
];
