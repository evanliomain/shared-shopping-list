import { chain, sum, values } from 'taninsam';

import { usageMap, YNode } from './schema';
import { DeviceId } from './types';

/**
 * Compteur d'usage réparti (G-Counter).
 *
 * Le problème qu'il résout : si on stockait un entier unique, deux appareils
 * hors ligne qui ajoutent le même produit passeraient tous les deux de 5 à 6,
 * et la fusion garderait 6 — un incrément perdu.
 *
 * Un G-Counter stocke un compteur *par appareil*. Chacun n'écrit que sa propre
 * case, donc il n'y a jamais d'écriture concurrente sur la même clé, et le
 * total est la somme :
 *
 *     A : {A: 4, B: 2}   B : {A: 3, B: 3}
 *     fusion → {A: 4, B: 3} → total 7
 *
 * Un compteur ne fait que croître, ce qui rend la fusion (max par clé, ici
 * assurée par le LWW de Yjs sur des valeurs monotones) toujours correcte.
 */
export function incrementUsage(
  product: YNode,
  deviceId: DeviceId,
  by = 1,
): void {
  const usage = usageMap(product);
  usage.set(deviceId, (usage.get(deviceId) ?? 0) + by);
}

/** Somme des compteurs de tous les appareils. */
export function usageTotal(usage: Readonly<Record<DeviceId, number>>): number {
  return chain(usage).chain(values()).chain(sum()).value();
}
