#!/usr/bin/env node
/**
 * Vérifie que les jetons de couleur passent les 4,5:1 du RGAA et du WCAG AA.
 *
 * Les couleurs sont lues dans `styles.scss` plutôt que recopiées ici : un
 * tableau de référence tenu à part finirait par mentir, et c'est précisément
 * le jour où l'on change une teinte qu'on veut être repris.
 *
 * Ce sont les *paires* qui sont déclarées : une couleur seule ne se juge pas,
 * et c'est en oubliant sur quoi une encre allait se poser qu'on a écrit du
 * blanc sur du blanc.
 *
 *   node tools/contraste.mjs
 */
import { readFileSync } from 'node:fs';

const SOURCE = 'apps/shopping-list/src/styles.scss';

/** Le minimum du RGAA 3.2 et du WCAG 1.4.3 pour du texte de taille normale. */
const AA = 4.5;

/**
 * Les paires à tenir, encre sur fond.
 *
 * Le fond `bg` autant que `surface` : la même encre traverse le papier chaud
 * du fond et le blanc des cartes, et c'est le pire des deux qui compte.
 */
const PAIRS = [
  ['texte sur carte', 'text', 'surface'],
  ['texte sur fond', 'text', 'bg'],
  ['texte atténué sur carte', 'text-muted', 'surface'],
  ['texte atténué sur fond', 'text-muted', 'bg'],
  ['encre sur bouton de marque', 'text-on-brand', 'brand'],
  ['encre sur bouton de danger', 'text-on-danger', 'danger'],
  ['marque en texte sur carte', 'brand', 'surface'],
  ['marque en texte sur fond', 'brand', 'bg'],
  ['danger en texte sur carte', 'danger', 'surface'],
  ['alerte en texte sur carte', 'warning', 'surface'],
  ['encre de marque sur son fond doux', 'brand-ink', 'brand-soft'],
  ['encre de danger sur son fond doux', 'danger-ink', 'danger-soft'],
  ['encre d’alerte sur son fond doux', 'warning-ink', 'warning-soft'],
  ['fond sur texte (bandeau d’annulation)', 'bg', 'text'],
];

function luminance(hex) {
  const channels = [1, 3, 5].map(
    (at) => parseInt(hex.slice(at, at + 2), 16) / 255,
  );
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(ink, background) {
  const [light, dark] = [luminance(ink), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Les jetons des deux thèmes.
 *
 * Le clair est ce que déclare `:root` ; le sombre est le clair recouvert par
 * le mixin `dark`, qui ne redéfinit que ce qui change.
 */
function themes(source) {
  const declarations = (block) =>
    Object.fromEntries(
      [...block.matchAll(/--sl-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );

  const root = source.slice(
    source.indexOf(':root {'),
    source.indexOf('@mixin dark'),
  );
  const dark = source.slice(source.indexOf('@mixin dark'));

  const light = declarations(root);
  return { clair: light, sombre: { ...light, ...declarations(dark) } };
}

const source = readFileSync(SOURCE, 'utf8');
let failed = 0;

for (const [name, tokens] of Object.entries(themes(source))) {
  console.log(`\n${name}`);

  for (const [label, ink, background] of PAIRS) {
    const [inkHex, backgroundHex] = [tokens[ink], tokens[background]];
    if (undefined === inkHex || undefined === backgroundHex) {
      console.log(`  ?     jeton absent : --sl-${ink} ou --sl-${background}`);
      failed += 1;
      continue;
    }

    const measured = ratio(inkHex, backgroundHex);
    const passes = measured >= AA;
    failed += passes ? 0 : 1;
    console.log(
      `  ${passes ? '✓' : '✗'} ${measured.toFixed(2).padStart(5)}  ${label}`,
    );
  }
}

if (0 < failed) {
  console.error(`\n${failed} paire(s) sous ${AA}:1.`);
  process.exit(1);
}

console.log('\nToutes les paires passent le AA.');
