import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { AppLang, AVAILABLE_LANGS } from './langs';
import { provideI18nWithoutDocument } from './provide-i18n';
import en from './translations/en.json';
import fr from './translations/fr.json';

type Node = string | { readonly [key: string]: Node };

/** Les catégories CLDR, plus les cas exacts `=N`. */
const FORMS = /^(zero|one|two|few|many|other|=\d+)$/;

function isPluralForms(node: Node): node is Record<string, string> {
  if ('string' === typeof node) {
    return false;
  }

  const entries = Object.entries(node);

  return (
    0 < entries.length &&
    entries.every(([key, form]) => 'string' === typeof form && FORMS.test(key))
  );
}

/**
 * Toutes les clés terminales, en notation pointée.
 *
 * Une forme plurielle compte pour **une** clé : ses branches dépendent de la
 * langue — le français en a deux, le polonais quatre — donc les comparer
 * langue à langue n'aurait pas de sens.
 */
function leaves(node: Node, prefix = ''): string[] {
  if ('string' === typeof node || isPluralForms(node)) {
    return [prefix];
  }

  return Object.entries(node).flatMap(([key, child]) =>
    leaves(child, '' === prefix ? key : `${prefix}.${key}`),
  );
}

function allStrings(node: Node): string[] {
  return 'string' === typeof node
    ? [node]
    : Object.values(node).flatMap(allStrings);
}

function serviceFor(lang: AppLang): TranslocoService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideI18nWithoutDocument(lang)],
  });

  return TestBed.inject(TranslocoService);
}

describe('fichiers de traduction', () => {
  it('couvrent exactement les mêmes clés dans les deux langues', () => {
    // Une clé oubliée retomberait silencieusement sur le français : mieux vaut
    // que le test le dise que l'utilisateur.
    expect(leaves(en as Node).sort()).toEqual(leaves(fr as Node).sort());
  });

  it.each(AVAILABLE_LANGS)('ne laisse aucun libellé vide en %s', (lang) => {
    const empty = allStrings(('fr' === lang ? fr : en) as Node).filter(
      (text) => '' === text.trim(),
    );

    expect(empty).toEqual([]);
  });

  it.each(AVAILABLE_LANGS)(
    'donne toujours une forme « other » au pluriel en %s',
    (lang) => {
      // Le dernier recours du sélecteur : sans elle, un compte inattendu
      // afficherait la clé nue.
      const withoutOther = Object.entries(
        flatten(('fr' === lang ? fr : en) as Node),
      ).filter(
        ([, node]) => isPluralForms(node) && undefined === node['other'],
      );

      expect(withoutOther.map(([key]) => key)).toEqual([]);
    },
  );
});

/** Chaque clé pointée vers son nœud, formes plurielles comprises. */
function flatten(node: Node, prefix = ''): Record<string, Node> {
  if ('string' === typeof node || isPluralForms(node)) {
    return { [prefix]: node };
  }

  return Object.entries(node).reduce<Record<string, Node>>(
    (all, [key, child]) => ({
      ...all,
      ...flatten(child, '' === prefix ? key : `${prefix}.${key}`),
    }),
    {},
  );
}

describe('rendu des traductions', () => {
  it('sert la langue demandée sans attendre de requête', () => {
    // Le chargeur est embarqué : la traduction doit être là dès l'injection,
    // sans tick supplémentaire.
    expect(serviceFor('fr').translate('product.save')).toBe('Enregistrer');
    expect(serviceFor('en').translate('product.save')).toBe('Save');
  });

  it('recopie une saisie utilisateur sans l’interpréter', () => {
    // Un libellé de produit part dans un paramètre : accolades et apostrophes
    // doivent ressortir telles quelles.
    expect(
      serviceFor('fr').translate('itemRow.actions', {
        label: "Lait {bio} d'ici",
      }),
    ).toBe("Actions pour Lait {bio} d'ici");
  });

  it('rend les libellés de rayon dans les deux langues', () => {
    expect(serviceFor('fr').translate('aisles.cremerie')).toBe('Crèmerie');
    expect(serviceFor('en').translate('aisles.cremerie')).toBe('Dairy');
  });
});
