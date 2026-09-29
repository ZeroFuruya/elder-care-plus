#!/usr/bin/env node
/**
 * Read-only Figma extraction utility.
 *
 * Purpose: pull the owner's Figma technique reference (structure, published styles and rendered
 * PNGs of individual frames) so the assistant can derive spacing, radius, elevation and type
 * values from the file instead of guessing them.
 *
 * SECURITY
 * - The token is read from a git-ignored `.env.figma` at the repo root, or from the
 *   `FIGMA_TOKEN` environment variable. It is never printed, logged or written anywhere.
 * - Read-only endpoints only. This script cannot modify the Figma file.
 *
 * USAGE
 *   node scripts/figma-extract.mjs --list
 *   node scripts/figma-extract.mjs --styles
 *   node scripts/figma-extract.mjs --dump
 *   node scripts/figma-extract.mjs --node <id[,id...]>
 *   node scripts/figma-extract.mjs --render <id[,id...]> [--scale 2] [--out <dir>]
 *
 * `.env.figma` (git-ignored, create it yourself - never paste the token into a chat):
 *   FIGMA_TOKEN=figd_...
 *   FIGMA_FILE_KEY=...
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(REPO_ROOT, '.env.figma');
const API = 'https://api.figma.com/v1';
const DEFAULT_OUT = path.join(tmpdir(), 'opencode', 'figma');

function fail(message) {
  process.stderr.write(`\nfigma-extract: ${message}\n\n`);
  process.exit(1);
}

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

async function loadConfig() {
  let fromFile = {};
  if (existsSync(ENV_FILE)) {
    fromFile = parseEnv(await readFile(ENV_FILE, 'utf8'));
  }

  const token = process.env.FIGMA_TOKEN || fromFile.FIGMA_TOKEN;
  const fileKey = process.env.FIGMA_FILE_KEY || fromFile.FIGMA_FILE_KEY;

  if (!token) {
    fail(
      `no FIGMA_TOKEN found.\n` +
        `Create ${ENV_FILE} (it is git-ignored) containing:\n\n` +
        `  FIGMA_TOKEN=figd_your_token_here\n` +
        `  FIGMA_FILE_KEY=your_file_key\n\n` +
        `Get a free read-only token from Figma: Settings -> Security -> Personal access\n` +
        `tokens -> Generate new token, scope "File content: Read-only".\n` +
        `Do not paste the token into the chat; write it into that file instead.`,
    );
  }
  if (!fileKey) {
    fail(`FIGMA_TOKEN is set but FIGMA_FILE_KEY is missing. Add it to ${ENV_FILE}.`);
  }
  return { token, fileKey };
}

async function figma(pathname, token) {
  const response = await fetch(`${API}${pathname}`, {
    headers: { 'X-Figma-Token': token },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = body ? `\n  ${body.slice(0, 400)}` : '';
    if (response.status === 403) {
      fail(
        `Figma returned 403 for ${pathname}.${detail}\n\n` +
          `That usually means the token is wrong or lacks "File content: Read-only", or the file\n` +
          `is a Community file your account cannot read directly. If it is a Community file,\n` +
          `open it in Figma and use "Duplicate to your drafts", then point FIGMA_FILE_KEY at the\n` +
          `duplicated copy.`,
      );
    }
    fail(`Figma returned ${response.status} ${response.statusText} for ${pathname}.${detail}`);
  }
  return response.json();
}

function sizeOf(node) {
  const box = node.absoluteBoundingBox;
  if (!box) return '';
  return `${Math.round(box.width)}x${Math.round(box.height)}`;
}

function describe(node, depth) {
  const pad = '  '.repeat(depth);
  const size = sizeOf(node);
  return `${pad}- ${node.name}  [${node.type}]  id=${node.id}${size ? `  ${size}` : ''}`;
}

async function commandList(config) {
  const file = await figma(`/files/${config.fileKey}?depth=2`, config.token);
  process.stdout.write(`\nFigma file: ${file.name}\n`);
  process.stdout.write(`last modified: ${file.lastModified}\n\n`);
  for (const page of file.document.children ?? []) {
    process.stdout.write(`PAGE ${page.name}  id=${page.id}\n`);
    for (const child of page.children ?? []) {
      process.stdout.write(`${describe(child, 1)}\n`);
    }
    process.stdout.write('\n');
  }
}

async function commandStyles(config) {
  const styles = await figma(`/files/${config.fileKey}/styles`, config.token);
  const list = styles.meta?.styles ?? [];
  if (list.length === 0) {
    process.stdout.write('\nNo published styles in this file.\n');
    return;
  }
  const byType = new Map();
  for (const style of list) {
    const bucket = byType.get(style.style_type) ?? [];
    bucket.push(style);
    byType.set(style.style_type, bucket);
  }
  process.stdout.write(`\n${list.length} published style(s):\n`);
  for (const [type, items] of byType) {
    process.stdout.write(`\n${type}\n`);
    for (const item of items) {
      const description = item.description ? `  - ${item.description}` : '';
      process.stdout.write(`  ${item.name}  node_id=${item.node_id}${description}\n`);
    }
  }
}

async function commandDump(config, outDir) {
  const file = await figma(`/files/${config.fileKey}`, config.token);
  await mkdir(outDir, { recursive: true });
  const target = path.join(outDir, 'file.json');
  await writeFile(target, JSON.stringify(file), 'utf8');
  const bytes = JSON.stringify(file).length;
  process.stdout.write(`\nWrote ${target} (${Math.round(bytes / 1024)} KB)\n`);
  process.stdout.write(`name: ${file.name}\n`);
}

async function commandNode(config, ids, outDir) {
  if (ids.length === 0) fail('--node needs at least one node id.');
  const nodes = await figma(`/files/${config.fileKey}/nodes?ids=${ids.join(',')}`, config.token);
  await mkdir(outDir, { recursive: true });
  for (const id of ids) {
    const entry = nodes.nodes?.[id];
    if (!entry) {
      process.stdout.write(`\nnode ${id}: not found\n`);
      continue;
    }
    const target = path.join(outDir, `node-${id.replace(/[^A-Za-z0-9-]/g, '_')}.json`);
    await writeFile(target, JSON.stringify(entry), 'utf8');
    process.stdout.write(
      `\nnode ${id}: ${entry.document?.name} [${entry.document?.type}] ` +
        `${sizeOf(entry.document ?? {})} -> ${target}\n`,
    );
  }
}

async function commandRender(config, ids, outDir, scale) {
  if (ids.length === 0) fail('--render needs at least one node id.');
  const result = await figma(
    `/images/${config.fileKey}?ids=${ids.join(',')}&format=png&scale=${scale}`,
    config.token,
  );
  if (result.err) {
    fail(`Figma could not render: ${result.err}`);
  }
  await mkdir(outDir, { recursive: true });
  for (const [id, url] of Object.entries(result.images ?? {})) {
    if (!url) {
      process.stdout.write(`\n${id}: no image returned\n`);
      continue;
    }
    const response = await fetch(url);
    if (!response.ok) {
      process.stdout.write(`\n${id}: download failed (${response.status})\n`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const target = path.join(outDir, `${id.replace(/[^A-Za-z0-9-]/g, '_')}@${scale}x.png`);
    await writeFile(target, buffer);
    process.stdout.write(`\n${id} -> ${target} (${Math.round(buffer.length / 1024)} KB)\n`);
  }
}

function parseArgs(argv) {
  const options = { command: null, ids: [], out: null, scale: 2 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--list') options.command = 'list';
    else if (arg === '--styles') options.command = 'styles';
    else if (arg === '--dump') options.command = 'dump';
    else if (arg === '--node') options.command = 'node';
    else if (arg === '--render') options.command = 'render';
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--scale') options.scale = Number(argv[++index]) || 2;
    else if (arg === '--help' || arg === '-h') options.command = 'help';
    else if (arg.startsWith('--')) fail(`unknown flag ${arg}`);
    else options.ids.push(arg);
  }
  return options;
}

const HELP = `Read-only Figma extraction.

  --list                 pages and their top-level frames
  --styles               published color / text / effect styles
  --dump                 full file JSON, written to disk (never printed)
  --node <id[,id...]>    specific node JSON, written to disk
  --render <id[,id...]>  PNGs of specific nodes, written to disk
  --scale <n>            render scale (default 2)
  --out <dir>            output directory (default a temp dir)

Token: git-ignored .env.figma at the repo root, or FIGMA_TOKEN in the environment.
`;

const options = parseArgs(process.argv.slice(2));
if (!options.command || options.command === 'help') {
  process.stdout.write(HELP);
  process.exit(0);
}

const config = await loadConfig();
const outDir = options.out ? path.resolve(options.out) : DEFAULT_OUT;

switch (options.command) {
  case 'list':
    await commandList(config);
    break;
  case 'styles':
    await commandStyles(config);
    break;
  case 'dump':
    await commandDump(config, outDir);
    break;
  case 'node':
    await commandNode(config, options.ids, outDir);
    break;
  case 'render':
    await commandRender(config, options.ids, outDir, options.scale);
    break;
  default:
    fail(`unknown command ${options.command}`);
}
