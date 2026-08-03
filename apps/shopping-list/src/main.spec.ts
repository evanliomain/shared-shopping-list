import { App } from './app/app';
import { appConfig } from './app/app.config';

/**
 * `bootstrapApplication` monterait la vraie application dans le document de
 * test. On la remplace par une doublure dont l'amorçage reste en suspens :
 * `main.ts` s'exécute donc une seule fois, à l'import, et on décide ensuite de
 * son issue.
 */
const amorcage = vi.hoisted(() => {
  const appels: unknown[][] = [];
  let rejeter: (raison: unknown) => void = () => undefined;

  const resultat = new Promise<never>((_, reject) => {
    rejeter = reject;
  });

  return {
    appels,
    resultat,
    echoue: (raison: unknown): void => rejeter(raison),
  };
});

vi.mock('@angular/platform-browser', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  bootstrapApplication: (...args: unknown[]) => {
    amorcage.appels.push(args);
    return amorcage.resultat;
  },
}));

// Importer `main` déclenche l'amorçage — c'est tout ce que fait ce fichier.
// L'import est écrit ici pour se lire dans l'ordre : `vi.hoisted` et `vi.mock`
// sont de toute façon remontés au-dessus des imports.
import './main';

describe('main', () => {
  it('amorce la coquille avec la configuration de l’application', () => {
    expect(amorcage.appels).toEqual([[App, appConfig]]);
  });

  it('trace un amorçage échoué au lieu de le laisser filer', async () => {
    // Une promesse rejetée sans `catch` ne dirait rien à personne : sur mobile,
    // la console du navigateur est le seul indice qu'on aura.
    const trace = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const panne = new Error('injecteur incomplet');

    amorcage.echoue(panne);
    await vi.waitFor(() => expect(trace).toHaveBeenCalledWith(panne));

    trace.mockRestore();
  });
});
