import { Injectable, signal } from '@angular/core';
import { TranslatableError } from '@shopping-list/util/i18n';

import {
  checkAccess,
  DEFAULT_BRANCH,
  DEFAULT_STATE_PATH,
  GithubConfig,
} from './github-api';
import { deleteSetting, readSetting, writeSetting } from './settings-store';

const CONFIG_KEY = 'github.config';

/** Ce qu'un QR d'appairage transporte. Volontairement court. */
export interface PairingPayload {
  readonly v: 1;
  readonly owner: string;
  readonly repo: string;
  readonly token: string;
  readonly branch?: string;
  readonly path?: string;
}

/**
 * Détient la configuration GitHub et sait l'appairer.
 *
 * Le second téléphone n'a rien à saisir : il scanne un QR produit par le
 * premier. Ce QR contient le jeton — c'est donc un identifiant, à ne pas
 * laisser traîner dans une pellicule photo partagée.
 */
@Injectable({ providedIn: 'root' })
export class GithubConfigService {
  private readonly configSignal = signal<GithubConfig | null>(null);
  private readonly loadedSignal = signal(false);

  readonly config = this.configSignal.asReadonly();
  /** Passe à `true` une fois la lecture d'IndexedDB terminée. */
  readonly loaded = this.loadedSignal.asReadonly();

  async load(): Promise<GithubConfig | null> {
    try {
      const stored = await readSetting<GithubConfig>(CONFIG_KEY);
      this.configSignal.set(stored);
      return stored;
    } catch {
      // Navigation privée, quota, IndexedDB désactivé : l'application doit
      // rester utilisable, simplement sans synchronisation distante.
      this.configSignal.set(null);
      return null;
    } finally {
      this.loadedSignal.set(true);
    }
  }

  /**
   * Enregistre un appairage, après avoir vérifié qu'il fonctionne.
   *
   * On échoue tout de suite plutôt que d'accepter une configuration qui ne
   * marchera pas : découvrir un jeton invalide au milieu des courses serait
   * bien pire qu'un message d'erreur immédiat.
   */
  async pair(payload: PairingPayload): Promise<GithubConfig> {
    const config: GithubConfig = {
      owner: payload.owner.trim(),
      repo: payload.repo.trim(),
      token: payload.token.trim(),
      branch: payload.branch?.trim() || DEFAULT_BRANCH,
      path: payload.path?.trim() || DEFAULT_STATE_PATH,
    };

    await checkAccess(config);
    await writeSetting(CONFIG_KEY, config);
    this.configSignal.set(config);

    return config;
  }

  async unpair(): Promise<void> {
    await deleteSetting(CONFIG_KEY);
    this.configSignal.set(null);
  }

  /** Charge utile à encoder dans le QR d'appairage. */
  toPairingPayload(): PairingPayload | null {
    const config = this.configSignal();
    if (null === config) {
      return null;
    }

    return {
      v: 1,
      owner: config.owner,
      repo: config.repo,
      token: config.token,
      branch: config.branch,
      path: config.path,
    };
  }
}

/** Analyse un QR d'appairage. Rejette explicitement ce qui n'en est pas un. */
export function parsePairingPayload(raw: string): PairingPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TranslatableError('errors.pairing.invalidCode');
  }

  const candidate = parsed as Partial<PairingPayload>;

  if (
    1 !== candidate.v ||
    'string' !== typeof candidate.owner ||
    'string' !== typeof candidate.repo ||
    'string' !== typeof candidate.token
  ) {
    throw new TranslatableError('errors.pairing.invalidCode');
  }

  return {
    v: 1,
    owner: candidate.owner,
    repo: candidate.repo,
    token: candidate.token,
    branch: candidate.branch,
    path: candidate.path,
  };
}
