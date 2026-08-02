/**
 * Conversions binaire ↔ base64.
 *
 * L'API Contents de GitHub ne transporte que du texte : un delta Yjs doit donc
 * être encodé à l'aller, et décodé au retour. Aucune dépendance — `atob` et
 * `btoa` suffisent, à condition de passer par des chaînes latin-1.
 */

/** Taille de bloc : `String.fromCharCode(...)` explose au-delà de ~64 k arguments. */
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * GitHub renvoie du base64 découpé en lignes de 60 caractères ; `atob` refuse
 * les sauts de ligne, il faut donc les retirer.
 */
export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
