import { deleteSetting, readSetting, writeSetting } from './settings-store';
import { FakeIndexedDb, installFakeIndexedDb } from './testing/fake-indexeddb';

const KEY = 'github.config';
const CONFIG = { owner: 'evanliomain', repo: 'shopping-list-data' };

describe('stockage des réglages', () => {
  let base: FakeIndexedDb;

  beforeEach(() => {
    base = installFakeIndexedDb();
  });

  afterEach(() => base.restore());

  it('relit ce qui a été écrit', async () => {
    await writeSetting(KEY, CONFIG);

    expect(await readSetting(KEY)).toEqual(CONFIG);
  });

  it('rend null pour une clé jamais écrite', async () => {
    // Le `undefined` que rend IndexedDB remonterait jusqu'au signal de
    // configuration, où seul `null` veut dire « pas appairé ».
    expect(await readSetting(KEY)).toBeNull();
  });

  it('remplace la valeur précédente', async () => {
    await writeSetting(KEY, CONFIG);
    await writeSetting(KEY, { ...CONFIG, repo: 'autre-depot' });

    expect(await readSetting<typeof CONFIG>(KEY)).toMatchObject({
      repo: 'autre-depot',
    });
  });

  it('oublie une clé supprimée', async () => {
    await writeSetting(KEY, CONFIG);
    await deleteSetting(KEY);

    expect(await readSetting(KEY)).toBeNull();
  });

  it('tient plusieurs clés indépendantes', async () => {
    await writeSetting('a', 1);
    await writeSetting('b', 2);
    await deleteSetting('a');

    expect(await readSetting('b')).toBe(2);
  });

  it('referme la connexion après chaque opération', async () => {
    // Une connexion oubliée bloquerait toute montée de version ultérieure de la
    // base, dans cet onglet comme dans les autres.
    await writeSetting(KEY, CONFIG);
    await readSetting(KEY);
    await deleteSetting(KEY);

    expect(base.openConnections()).toBe(0);
  });

  it('remonte un refus d’ouverture de la base', async () => {
    // Navigation privée, quota épuisé, IndexedDB désactivé : l'appelant doit
    // pouvoir décider de continuer sans stockage.
    base.failNextOpen();

    await expect(readSetting(KEY)).rejects.toBeInstanceOf(DOMException);
  });

  it('remonte un refus de requête sans laisser la connexion ouverte', async () => {
    base.failNextRequest();

    await expect(writeSetting(KEY, CONFIG)).rejects.toBeInstanceOf(
      DOMException,
    );
    expect(base.openConnections()).toBe(0);
  });
});
