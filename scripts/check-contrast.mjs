#!/usr/bin/env node
/**
 * Recomputes the contrast pairs recorded in docs/02-ui-ux-standard.md section 5 from the real
 * `theme.ts`. Dependency-free (Node built-ins only). Exits non-zero when a required pair drops
 * below the WCAG AA threshold, so a token edit cannot silently regress accessibility.
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

/** Body-text tokens that must pass on every surface. */
const TEXT_TOKENS = ['text', 'textMuted', 'danger', 'warning', 'success'];

const SURFACES = ['background', 'surface'];

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

/** `name: '#rrggbb'` or `name: colors.other`. */
const ENTRY = /([A-Za-z_$][\w$]*)\s*:\s*(?:colors\.([A-Za-z_$][\w$]*)|'(#[0-9A-Fa-f]{3,8})')/g;

function entries(name, resolveRef) {
  const found = [];
  for (const match of block(name).matchAll(ENTRY)) {
    const literal = match[3];
    const referenced = match[2] ? resolveRef?.[match[2]] : undefined;
    const value = literal ?? referenced;
    if (!value) throw new Error(`could not resolve "${match[1]}" in ${name}`);
    found.push([match[1], value]);
  }
  return found;
}

const colors = Object.fromEntries(entries('colors'));
const statusColors = Object.fromEntries(entries('statusColors', colors));

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
const notices = [];

const REQUIRED_COLOUR_TOKENS = [
  'background',
  'surface',
  'text',
  'textMuted',
  'primary',
  'border',
  'danger',
  'warning',
  'success',
];

for (const token of REQUIRED_COLOUR_TOKENS) {
  if (!(token in colors)) problems.push(`theme.ts is missing the colour token "${token}"`);
}
for (const tone of REQUIRED_TONES) {
  if (!(tone in statusColors)) problems.push(`statusColors is missing tone "${tone}"`);
}

for (const surfaceName of SURFACES) {
  const surface = colors[surfaceName];
  if (!surface) continue;

  const required = [
    ...TEXT_TOKENS.map((token) => ({ label: token, colour: colors[token] })),
    ...Object.entries(statusColors).map(([tone, colour]) => ({
      label: `statusColors.${tone}`,
      colour,
    })),
    // `primary` text is allowed on `surface` only (decision D2).
    ...(surfaceName === 'surface' ? [{ label: 'primary', colour: colors.primary }] : []),
  ];

  for (const { label, colour } of required) {
    if (!colour) {
      problems.push(`missing colour for "${label}" on ${surfaceName}`);
      continue;
    }
    const value = contrast(colour, surface);
    const verdict = value >= MIN_NORMAL ? 'pass' : 'FAIL';
    console.log(
      `${verdict}  ${label.padEnd(22)} on ${surfaceName.padEnd(10)} ${value.toFixed(2)}:1  (need ${MIN_NORMAL})`,
    );
    if (value < MIN_NORMAL) problems.push(`${label} on ${surfaceName} is ${value.toFixed(2)}:1`);
  }
}

// Documented, accepted failure: `primary` text on `background` (4.48:1 — section 5, decision D2).
if (colors.primary && colors.background) {
  const value = contrast(colors.primary, colors.background);
  if (value >= MIN_NORMAL) {
    notices.push(
      `primary on background now passes (${value.toFixed(2)}:1) — docs/02-ui-ux-standard.md section 5 and decision D2 are stale`,
    );
  } else {
    console.log(
      `known  primary              on background ${value.toFixed(2)}:1  (documented; must not be used)`,
    );
  }
}

if (colors.border && colors.background) {
  console.log(
    `info   border               on background ${contrast(colors.border, colors.background).toFixed(2)}:1  (decorative only)`,
  );
}

for (const notice of notices) console.warn(`notice: ${notice}`);
if (problems.length > 0) {
  console.error('\nContrast check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nContrast check passed.');
