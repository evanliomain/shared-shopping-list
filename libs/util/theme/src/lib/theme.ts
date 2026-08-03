import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

/**
 * Le thème demandé.
 *
 * `system` n'est pas « clair par défaut » : c'est l'absence de choix, celui
 * qui suit le téléphone quand il bascule au coucher du soleil. C'est pour ça
 * qu'il est une valeur à part entière et non un `null` — sans lui, revenir sur
 * un choix explicite serait impossible.
 */
export type Theme = 'light' | 'dark' | 'system';

export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

/**
 * Où le choix est gardé.
 *
 * Le `localStorage` et non le CRDT : le thème est une préférence d'appareil.
 * Deux téléphones ont le droit d'être réglés différemment, et un choix qui se
 * synchroniserait changerait l'écran de l'autre au milieu de ses courses.
 *
 * Clé lue par le script de `index.html` : les deux doivent bouger ensemble.
 */
const STORAGE_KEY = 'sl.theme';

/** L'attribut que lisent les jetons de `styles.scss`. */
const ATTRIBUTE = 'data-theme';

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

/**
 * Le thème de l'application, et son application au document.
 *
 * Rien à mémoïser, rien à dériver : un signal, sa persistance, et l'attribut
 * porté par `<html>`. C'est la feuille de styles qui fait le reste — le
 * service ne connaît aucune couleur.
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);

  readonly theme = signal<Theme>(this.restore());

  constructor() {
    effect(() => this.apply(this.theme()));
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }

  private restore(): Theme {
    // Un navigateur en navigation privée peut refuser le stockage : le thème
    // du système reste un repli parfaitement valable.
    try {
      const stored =
        this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      return isTheme(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(theme: Theme): void {
    const root = this.document.documentElement;

    if ('system' === theme) {
      root.removeAttribute(ATTRIBUTE);
    } else {
      root.setAttribute(ATTRIBUTE, theme);
    }

    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Le choix vaudra pour cette session, et c'est déjà l'essentiel.
    }
  }
}
