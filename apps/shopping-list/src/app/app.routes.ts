import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'liste',
    loadComponent: () =>
      import('./shell/placeholder-page').then((m) => m.PlaceholderPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'liste' },
  { path: '**', redirectTo: 'liste' },
];
