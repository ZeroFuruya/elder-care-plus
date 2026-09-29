#!/usr/bin/env node
/**
 * Recomputes the contrast pairs recorded in docs/02-ui-ux-standard.md section 5 from the real
 * `theme.ts`, for **both** the light and dark token sets. Dependency-free (Node built-ins only).
 * Exits non-zero when a required pair drops below the WCAG AA threshold, so a token edit cannot
 * silently regress accessibility.
 *
 *   pnpm run check:contrast
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const themePath = resolve(here, '..', 'apps', 'mobile', 'src', 'constants', 'theme.ts');
const source = readFileSync(themePath, 'utf8');

/** AA threshold for normal text. */
const MIN_NORMAL = 4.5;

/** The four tones the status presentation contract allows. */
const REQUIRED_TONES = ['neutral', 'attention', 'danger', 'success'];

/** Text tokens that must pass on every surface of their theme. */
const TEXT_TOKENS = ['text', 'textTitle', 'textMuted', 'primary', 'danger', 'warning', 'success'];

/** Semantic colour roles every theme must define. */
const REQUIRED_COLOR_TOKENS = [
  'background',
  'surface',
  'surfaceMuted',
  'border',
  'borderStrong',
  'text',
  'textTitle',
  'textMuted',
  'textInverse',
  'primary',
  'primaryFill',
  'onPrimaryFill',
  'accent',
  'info',
  'focus',
  'danger',
  'warning',
  'success',
];

const SURFACES = ['background', 'surface'];

/** `fill` must carry its `label` at AA: the bright brand fills never take white (section 5.2). */
const FILL_PAIRS = [
  { fill: 'primaryFill', label: 'onPrimaryFill' },
  { fill: 'danger', label: 'textInverse' },
];

function block(name) {
  const at = source.indexOf(`export const ${name}`);
  if (at === -1) throw new Error(`could not find "export const ${name}" in ${themePath}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unterminated object literal for ${name}`);
}

/** `name: '#rrggbb'` or `name: namespace.token`. */
const ENTRY =
  /([A-Za-z_$][\w$]*)\s*:\s*(?:([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)|'(#[0-9A-Fa-f]{3,8})')/g;

function entries(name, namespaces) {
  const found = [];
  for (const match of block(name).matchAll(ENTRY)) {
    const literal = match[4];
    const referenced = match[2] ? namespaces[match[2]]?.[match[3]] : undefined;
    const value = literal ?? referenced;
    if (!value) throw new Error(`could not resolve "${match[1]}" in ${name}`);
    found.push([match[1], value]);
  }
  return found;
}

const namespaces = { brand: Object.fromEntries(entries('brand', {})) };
namespaces.lightColors = Object.fromEntries(entries('lightColors', namespaces));
namespaces.darkColors = Object.fromEntries(entries('darkColors', namespaces));

const THEMES = [
  {
    name: 'light',
    colors: namespaces.lightColors,
    status: Object.fromEntries(entries('lightStatusColors', namespaces)),
  },
  {
    name: 'dark',
    colors: namespaces.darkColors,
    status: Object.fromEntries(entries('darkStatusColors', namespaces)),
  },
];

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw;
  return (
    0.2126 * channel(parseInt(full.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(full.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(full.slice(4, 6), 16))
  );
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const problems = [];

function check(label, foreground, background, min = MIN_NORMAL) {
  const value = contrast(foreground, background);
  const verdict = value >= min ? 'pass' : 'FAIL';
  console.log(`${verdict}  ${label.padEnd(34)} ${value.toFixed(2)}:1  (need ${min})`);
  if (value < min) problems.push(`${label} is ${value.toFixed(2)}:1`);
}

for (const theme of THEMES) {
  console.log(`\n[${theme.name}]`);
  const missing = REQUIRED_COLOR_TOKENS.filter((token) => !(token in theme.colors));
  for (const token of missing) problems.push(`${theme.name}Colors is missing "${token}"`);
  for (const tone of REQUIRED_TONES) {
    if (!(tone in theme.status)) problems.push(`${theme.name}StatusColors is missing "${tone}"`);
  }
  if (missing.length > 0) continue;

  for (const surfaceName of SURFACES) {
    const surface = theme.colors[surfaceName];
    const required = [
      ...TEXT_TOKENS.map((token) => ({
        label: `${token} on ${surfaceName}`,
        colour: theme.colors[token],
      })),
      ...Object.entries(theme.status).map(([tone, colour]) => ({
        label: `${theme.name}StatusColors.${tone} on ${surfaceName}`,
        colour,
      })),
    ];
    for (const { label, colour } of required) {
      if (!colour) {
        problems.push(`missing colour for "${label}"`);
        continue;
      }
      check(label, colour, surface);
    }
  }

  for (const { fill, label } of FILL_PAIRS) {
    check(`${label} on ${fill}`, theme.colors[label], theme.colors[fill]);
  }

  // `info` is a graphics/large-text accent (Blue #4A8FD8 is 3.38:1 on white), so it is reported
  // but not enforced as body text.
  console.log(
    `info  info                               ${contrast(theme.colors.info, theme.colors.surface).toFixed(2)}:1  (graphics / large text only)`,
  );
  console.log(
    `info  border                             ${contrast(theme.colors.border, theme.colors.background).toFixed(2)}:1  (decorative only)`,
  );
}

// A stale fixture in the doc: primary used to fail on `background`. It is a text-safe token
// now, so if it regresses the per-surface check above already reports it.

if (problems.length > 0) {
  console.error('\nContrast check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nContrast check passed for light and dark.');
