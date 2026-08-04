import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

/**
 * Où le choix est gardé.
 *
 * Le `localStorage` et non le CRDT, pour la même raison que le thème : c'est
 * une préférence d'appareil. Le téléphone qui fait les courses avec un forfait
 * compté a le droit de couper les appels sortants sans les couper à l'autre.
 */
const STORAGE_KEY = 'sl.imageBank.auto';

/**
 * La recherche automatique est-elle autorisée ?
 *
 * Activée par défaut : c'est le comportement demandé, et un article sans emoji
 * reconnu mérite mieux qu'un caddie générique. Mais elle est la seule chose de
 * l'application qui parle à un tiers sans qu'on le lui ait demandé — d'où
 * l'interrupteur, et non une constante.
 *
 * Le réglage ne gouverne que l'automatisme. Ouvrir la banque depuis la page
 * d'édition reste possible même éteint : c'est un geste explicite, il n'a pas à
 * demander la permission d'un réglage.
 */
@Injectable({ providedIn: 'root' })
export class ImageBankSettings {
  private readonly document = inject(DOCUMENT);

  readonly auto = signal<boolean>(this.restore());

  constructor() {
    effect(() => this.persist(this.auto()));
  }

  set(auto: boolean): void {
    this.auto.set(auto);
  }

  toggle(): void {
    this.auto.update((auto) => !auto);
  }

  private restore(): boolean {
    // Un navigateur en navigation privée peut refuser le stockage. Le défaut
    // reste le bon repli : l'automatisme est ce qu'on attend.
    try {
      return (
        'false' !== this.document.defaultView?.localStorage.getItem(STORAGE_KEY)
      );
    } catch {
      return true;
    }
  }

  private persist(auto: boolean): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, `${auto}`);
    } catch {
      // Le choix vaudra pour cette session, et c'est déjà l'essentiel.
    }
  }
}
