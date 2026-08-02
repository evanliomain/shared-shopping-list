import { EnvironmentProviders } from '@angular/core';

import { AppLang, DEFAULT_LANG } from './lib/langs';
import { provideI18nWithoutDocument } from './lib/provide-i18n';

/**
 * Les **vraies** traductions dans les tests, pas des doublures.
 *
 * `TranslocoTestingModule` sert à isoler d'un chargeur asynchrone ; le nôtre
 * est déjà synchrone et embarqué. Monter les vrais fichiers fait donc des
 * tests qui échouent quand une clé manque ou qu'un pluriel est mal écrit —
 * exactement ce qu'on veut vérifier.
 */
export function provideTestI18n(
  lang: AppLang = DEFAULT_LANG,
): EnvironmentProviders {
  return provideI18nWithoutDocument(lang);
}
