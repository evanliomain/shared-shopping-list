import {
  newId,
  resolveDeviceId,
  resolveDeviceName,
  setDeviceName,
} from './ids';

const DEVICE_ID_KEY = 'sl.deviceId';
const DEVICE_NAME_KEY = 'sl.deviceName';

describe('identité locale de l’appareil', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('newId', () => {
    it('produit seize caractères hexadécimaux', () => {
      expect(newId()).toMatch(/^[0-9a-f]{16}$/);
    });

    it('ne redonne pas deux fois le même identifiant', () => {
      const ids = new Set(Array.from({ length: 200 }, () => newId()));

      expect(ids.size).toBe(200);
    });
  });

  describe('resolveDeviceId', () => {
    it('crée l’identifiant au premier appel puis le réutilise', () => {
      const created = resolveDeviceId();

      expect(created).toMatch(/^[0-9a-f]{16}$/);
      expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(created);
      expect(resolveDeviceId()).toBe(created);
    });

    it('reprend l’identifiant déjà persisté', () => {
      // C'est ce qui fait qu'une case du G-Counter reste celle du même
      // appareil d'une session à l'autre.
      localStorage.setItem(DEVICE_ID_KEY, 'ancien-appareil');

      expect(resolveDeviceId()).toBe('ancien-appareil');
    });

    it('remplace un identifiant vide au lieu de le renvoyer', () => {
      // Une clé vide dans le G-Counter serait partagée par tous les appareils,
      // et leurs incréments s'écraseraient.
      localStorage.setItem(DEVICE_ID_KEY, '');

      const resolved = resolveDeviceId();

      expect(resolved).not.toBe('');
      expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(resolved);
    });
  });

  describe('nom de l’appareil', () => {
    it('propose un libellé neutre tant que rien n’a été choisi', () => {
      expect(resolveDeviceName()).toBe('Cet appareil');
    });

    it('renvoie le nom choisi, et le persiste', () => {
      setDeviceName('Téléphone d’Evan');

      expect(localStorage.getItem(DEVICE_NAME_KEY)).toBe('Téléphone d’Evan');
      expect(resolveDeviceName()).toBe('Téléphone d’Evan');
    });
  });
});
