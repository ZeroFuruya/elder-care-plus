#!/usr/bin/env node
/**
 * Seed a synthetic prescription photo onto a hosted demo circle.
 *
 * Purpose: a fallback for the checking demo if on-device capture misbehaves on stage, and a way to
 * prove the real client path (Storage upload + `register_medication_image`) end to end against the
 * hosted project.
 *
 * It talks to the hosted project with the public anon key exactly like the app does, so nothing
 * privileged is needed. It never prints a password.
 *
 * Usage:
 *   node scripts/seed-demo-prescription-photo.mjs [options]
 *
 * Options:
 *   --email <email>            caregiver login (default: DEMO_CAREGIVER_EMAIL / .env.demo-accounts)
 *   --password <password>      caregiver password (default: DEMO_CAREGIVER_PASSWORD / .env.demo-accounts)
 *   --medication-id <uuid>     attach to this medicine (default: the circle's newest medicine)
 *   --file <path>              image to upload (default: a generated synthetic PNG)
 *   --create-medication        create a demo medicine first if the circle has none
 *   --list                     only list the circle's medicines, then exit
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'prescription-images';

// --- tiny env reader ---------------------------------------------------------

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const i = line.indexOf('=');
        return [
          line.slice(0, i).trim(),
          line
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ''),
        ];
      }),
  );
}

const appEnv = readEnvFile(resolve(ROOT, 'apps/mobile/.env'));
const demoEnv = readEnvFile(resolve(ROOT, 'apps/mobile/.env.demo-accounts'));

// --- args --------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = value('url') ?? appEnv.EXPO_PUBLIC_SUPABASE_URL;
const anon = value('anon') ?? appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const email = value('email') ?? process.env.DEMO_CAREGIVER_EMAIL ?? demoEnv.DEMO_CAREGIVER_EMAIL;
const password =
  value('password') ?? process.env.DEMO_CAREGIVER_PASSWORD ?? demoEnv.DEMO_CAREGIVER_PASSWORD;
let medicationId = value('medication-id');
const filePath = value('file');
const createMedication = flag('create-medication');

if (!url || !anon) throw new Error('missing hosted URL/anon key (apps/mobile/.env)');
if (!email || !password) throw new Error('missing caregiver credentials (--email/--password)');

// --- synthetic PNG -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** A clearly synthetic "prescription label": teal header bar, grey text lines on a white page. */
function syntheticPrescriptionPng(width = 600, height = 800) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  const set = (x, y, [r, g, b]) => {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    rows[offset] = r;
    rows[offset + 1] = g;
    rows[offset + 2] = b;
  };
  const fill = (x0, y0, x1, y1, colour) => {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) set(x, y, colour);
  };

  const white = [248, 250, 252];
  const teal = [73, 195, 178];
  const grey = [120, 136, 154];
  const navy = [36, 67, 109];

  fill(0, 0, width, height, white);
  fill(0, 0, width, 90, teal);
  fill(40, 34, 360, 56, navy); // header block
  let y = 140; // body lines
  for (let i = 0; i < 14; i += 1) {
    const lineWidth = i % 4 === 3 ? 240 : width - 120;
    fill(60, y, 60 + lineWidth, y + 10, grey);
    y += 38;
  }
  fill(60, height - 150, width - 60, height - 140, grey);
  fill(60, height - 96, 300, height - 86, grey);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- hosted calls ------------------------------------------------------------

async function api(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
  return text.length ? JSON.parse(text) : null;
}

async function signIn() {
  return api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

async function listMedications(token) {
  return api(
    '/rest/v1/medications?select=id,name,is_active,created_at&order=created_at.desc&limit=10',
    { token },
  );
}

async function createDemoMedication(token, elderId) {
  const id = await api('/rest/v1/rpc/create_medication', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_elder_id: elderId,
      p_name: 'Demo Photo Medicine',
      p_strength: '5 mg',
      p_form: 'tablet',
      p_dose_quantity: 1,
      p_dose_unit: 'tablet',
      p_instructions: 'Synthetic demo medicine for the prescription-photo fallback',
      p_start_date: new Date().toISOString().slice(0, 10),
      p_end_date: null,
    }),
  });
  await api('/rest/v1/rpc/create_schedule', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_medication_id: id,
      p_days_of_week: [0, 1, 2, 3, 4, 5, 6],
      p_time_of_day: '08:00',
      p_timezone: 'Asia/Singapore',
      p_grace_minutes: 30,
    }),
  });
  await api('/rest/v1/rpc/set_medication_active', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id, p_active: true }),
  });
  return id;
}

// --- main --------------------------------------------------------------------

const session = await signIn();
const token = session.access_token;
console.log(`signed in as ${email}`);

let medications = await listMedications(token);
console.log(`circle has ${medications.length} medicine(s)`);

if (flag('list')) {
  for (const m of medications) console.log(` - ${m.id}  ${m.name}  active=${m.is_active}`);
  process.exit(0);
}

if (medications.length === 0 && createMedication) {
  const profiles = await api('/rest/v1/profiles?select=id,role&limit=5', { token });
  const elder = profiles.find((p) => p.role === 'elder');
  if (!elder) throw new Error('no elder profile visible to this caregiver');
  medicationId = await createDemoMedication(token, elder.id);
  console.log(`created demo medicine ${medicationId}`);
  medications = await listMedications(token);
}

if (!medicationId) {
  if (medications.length === 0) {
    throw new Error(
      'the circle has no medicine; create one in the app or pass --create-medication',
    );
  }
  medicationId = medications[0].id;
}

const png = filePath ? readFileSync(filePath) : syntheticPrescriptionPng();
const mime = filePath?.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png';
const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
const objectPath = `${medicationId}/seed-${randomUUID()}.${ext}`;

const uploaded = await fetch(`${url}/storage/v1/object/${BUCKET}/${objectPath}`, {
  method: 'POST',
  headers: {
    apikey: anon,
    Authorization: `Bearer ${token}`,
    'Content-Type': mime,
    'x-upsert': 'false',
  },
  body: png,
});
if (!uploaded.ok) {
  throw new Error(`storage upload → ${uploaded.status} ${(await uploaded.text()).slice(0, 200)}`);
}
console.log(`uploaded ${png.length} bytes to ${BUCKET}/${objectPath}`);

const imageId = await api('/rest/v1/rpc/register_medication_image', {
  token,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_medication_id: medicationId,
    p_storage_path: objectPath,
    p_mime_type: mime,
    p_size_bytes: png.length,
  }),
});
console.log(`registered medication_image ${imageId} on medicine ${medicationId}`);
console.log('done — open that medicine in the app to see the photo.');
