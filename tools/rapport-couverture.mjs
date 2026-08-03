#!/usr/bin/env node
/**
 * Assemble les rapports de couverture épars en un seul tableau Markdown, pour
 * le résumé du job GitHub Actions et le commentaire de la pull request.
 *
 * Chaque projet Nx écrit son propre `coverage-summary.json` — Vitest côté
 * unitaire, Monocart côté end-to-end. Personne n'ouvrira dix-sept fichiers pour
 * savoir si la branche fait baisser la couverture : ce script répond en une
 * ligne, et détaille juste en dessous.
 *
 *   node tools/rapport-couverture.mjs > rapport.md
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const COVERAGE_ROOT = 'coverage';
// Les parcours Playwright déposent leur rapport ici. Il ne raconte pas la même
// histoire que les rapports unitaires, donc il a sa propre section.
const E2E_DIR = join(COVERAGE_ROOT, 'e2e');

const METRICS = ['lines', 'branches', 'functions', 'statements'];

/** Retrouve tous les `coverage-summary.json` sous `coverage/`. */
function findReports(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findReports(path);
    return 'coverage-summary.json' === entry.name ? [path] : [];
  });
}

/**
 * Déduit le nom du projet depuis l'emplacement de son rapport.
 * `coverage/libs/core/crdt/…` → `libs/core/crdt`. Les applications, elles,
 * écrivent sous `coverage/<nom>` : un seul segment signifie donc une app.
 */
function projectName(reportPath) {
  const segments = relative(COVERAGE_ROOT, reportPath).split(sep).slice(0, -1);
  return 1 === segments.length ? `apps/${segments[0]}` : segments.join('/');
}

/** Somme les compteurs de plusieurs totaux istanbul en un seul. */
function sum(totals) {
  const merged = Object.fromEntries(
    METRICS.map((m) => [m, { total: 0, covered: 0 }]),
  );

  for (const total of totals) {
    for (const metric of METRICS) {
      merged[metric].total += total[metric]?.total ?? 0;
      merged[metric].covered += total[metric]?.covered ?? 0;
    }
  }

  return merged;
}

/** Un projet sans une seule ligne instrumentée n'est pas à 0 %, il est hors sujet. */
function ratio({ total, covered }) {
  return 0 === total ? null : (100 * covered) / total;
}

function light(pct) {
  if (null === pct) return '⚪';
  if (80 <= pct) return '🟢';
  if (50 <= pct) return '🟡';
  return '🔴';
}

function cell(metric, { withCounts = false } = {}) {
  const pct = ratio(metric);
  if (null === pct) return '—';

  const value = `${light(pct)} ${pct.toFixed(1).replace('.', ',')} %`;
  return withCounts ? `${value} (${metric.covered}/${metric.total})` : value;
}

function table(firstColumn, rows, total) {
  const render = (name, counts, bold) => {
    const wrap = (text) => (bold ? `**${text}**` : text);
    return [
      wrap(name),
      wrap(cell(counts.lines, { withCounts: true })),
      wrap(cell(counts.branches)),
      wrap(cell(counts.functions)),
    ].join(' | ');
  };

  return [
    `| ${firstColumn} | Lignes | Branches | Fonctions |`,
    '| --- | ---: | ---: | ---: |',
    `| ${render('Ensemble', total, true)} |`,
    ...rows.map(({ name, counts }) => `| ${render(name, counts, false)} |`),
  ].join('\n');
}

/**
 * Regroupe les fichiers d'un rapport par projet — `libs/feature/list`,
 * `libs/ui`, `apps/shopping-list`. Le rapport end-to-end est à plat : sans
 * regroupement, c'est une centaine de lignes de tableau.
 *
 * La racine d'un projet est ce qui précède son `src/` : les bibliothèques ne
 * sont pas toutes à la même profondeur (`libs/ui` contre `libs/core/qr`).
 */
function groupByProject(summary) {
  const groups = new Map();

  for (const [path, metrics] of Object.entries(summary)) {
    if ('total' === path) continue;

    const segments = relative(process.cwd(), path).split(sep);
    const src = segments.indexOf('src');
    if (0 >= src || ('libs' !== segments[0] && 'apps' !== segments[0]))
      continue;

    const name = segments.slice(0, src).join('/');
    groups.set(name, [...(groups.get(name) ?? []), metrics]);
  }

  return [...groups].map(([name, metrics]) => ({ name, counts: sum(metrics) }));
}

function read(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Le moins couvert d'abord : c'est là que la revue a quelque chose à dire. */
function worstFirst(a, b) {
  return (ratio(a.counts.lines) ?? 101) - (ratio(b.counts.lines) ?? 101);
}

function unitSection(reports) {
  const projects = reports
    .map((path) => ({
      name: projectName(path),
      counts: sum([read(path).total]),
    }))
    .sort(worstFirst);

  const total = sum(projects.map(({ counts }) => counts));

  return [
    `### Tests unitaires (Vitest) — ${cell(total.lines)} des lignes`,
    '',
    table('Projet', projects, total),
  ].join('\n');
}

function e2eSection(path) {
  if (undefined === path) {
    return [
      '### Tests end-to-end (Playwright)',
      '',
      "_Pas de rapport. La couverture end-to-end n'est relevée que sur les projets_",
      '_Chromium, et seulement quand `E2E_COVERAGE=true`._',
    ].join('\n');
  }

  const summary = read(path);

  return [
    `### Tests end-to-end (Playwright) — ${cell(sum([summary.total]).lines)} des lignes`,
    '',
    'Relevée sur le code que le navigateur a réellement exécuté pendant les',
    'parcours, puis ramenée aux sources par les *source maps*.',
    '',
    table(
      'Projet',
      groupByProject(summary).sort(worstFirst),
      sum([summary.total]),
    ),
  ].join('\n');
}

const reports = findReports(COVERAGE_ROOT);
const unitReports = reports.filter((path) => !path.startsWith(E2E_DIR));
const e2eReport = reports.find((path) => path.startsWith(E2E_DIR));

if (0 === unitReports.length) {
  console.error(
    `Aucun coverage-summary.json sous ${COVERAGE_ROOT}/. ` +
      'Les tests ont-ils tourné avec --coverage ?',
  );
  process.exit(1);
}

console.log(
  [
    '## 🧪 Couverture des tests',
    '',
    unitSection(unitReports),
    '',
    e2eSection(e2eReport),
    '',
    '<sub>🟢 ≥ 80 % · 🟡 ≥ 50 % · 🔴 < 50 % — trié du moins couvert au mieux couvert.</sub>',
  ].join('\n'),
);
