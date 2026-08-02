import { DeviceId } from './types';

const DEVICE_ID_KEY = 'sl.deviceId';
const DEVICE_NAME_KEY = 'sl.deviceName';

/**
 * Identifiant aléatoire court, suffisant pour des clés locales.
 *
 * On ne cherche pas l'unicité globale : Yjs sait réconcilier deux appareils
 * qui créeraient la même clé, et la probabilité de collision sur 128 bits est
 * hors de propos pour une liste de courses.
 */
export function newId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}

/**
 * Identifiant stable de cet appareil, persisté en `localStorage`.
 *
 * Il sert de clé dans le G-Counter d'usage des produits : c'est ce qui permet
 * à deux appareils d'incrémenter en parallèle sans s'écraser.
 */
export function resolveDeviceId(): DeviceId {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (null !== stored && '' !== stored) {
    return stored;
  }

  const created = newId();
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

/** Nom lisible de l'appareil, affiché dans « ajouté par … ». */
export function resolveDeviceName(): string {
  return localStorage.getItem(DEVICE_NAME_KEY) ?? 'Cet appareil';
}

export function setDeviceName(name: string): void {
  localStorage.setItem(DEVICE_NAME_KEY, name);
}
