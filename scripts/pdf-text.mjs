/**
 * Dependency-free PDF text extractor (Node built-ins only).
 *
 * The two approved design PDFs
 * (`docs/ElderCare_Plus_System_Documentation_and_User_Manual_v1.0.pdf` and
 * `docs/ElderCare_Plus_Complete_Wireframes_Connected_Family_v1.2.pdf`) are the authority for the
 * screen inventory and visual identity, but an agent cannot read a PDF directly. This turns them
 * into text so `docs/02-ui-ux-standard.md` can be kept honest.
 *
 * Handles FlateDecode content streams, literal `(...)Tj` strings and hex `<...>` strings from
 * subset fonts, resolving them through each font's `/ToUnicode` CMap (including fonts referenced
 * indirectly, and font dicts living inside object streams).
 *
 *   node scripts/pdf-text.mjs <file.pdf> [--out <path>] [--stats]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const file = args[0];
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
const raw = readFileSync(file).toString('latin1');

// ---------- object table ----------
const objs = new Map(); // num -> { start, end, text }
{
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const num = Number(m[1]);
    const start = m.index;
    const end = raw.indexOf('endobj', start);
    objs.set(num, {
      start,
      end: end === -1 ? raw.length : end,
      text: raw.slice(start, end === -1 ? start + 4000 : end),
    });
  }
}

function streamBody(objNum) {
  const o = objs.get(objNum);
  if (!o) return null;
  const si = o.text.indexOf('stream');
  if (si === -1) return null;
  const dict = o.text.slice(0, si);
  const fm = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dict);
  const filters = fm ? [...fm[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((x) => x[1]) : [];
  let body = raw.slice(o.start + si + 'stream'.length, o.end);
  body = body.replace(/^\r\n|^\n|^\r/, '');
  let buf = Buffer.from(body, 'latin1');
  try {
    for (const f of filters) {
      if (f === 'FlateDecode' || f === 'Fl') buf = zlib.inflateSync(buf);
      else if (f === 'ASCII85Decode') {
        const c = body.replace(/<~|~>/g, '').replace(/\s/g, '');
        const out = [];
        for (let i = 0; i < c.length; i += 5) {
          let v = 0;
          for (const ch of c.slice(i, i + 5).padEnd(5, 'u')) v = v * 85 + (ch.charCodeAt(0) - 33);
          for (let b = 3; b >= 0; b--) out.push((v >>> (b * 8)) & 0xff);
        }
        buf = Buffer.from(out);
      } else if (f === 'DCTDecode' || f === 'JPXDecode' || f === 'CCITTFaxDecode') return null;
      else return null;
    }
  } catch {
    return null;
  }
  return buf.toString('latin1');
}

// ---------- object streams (/Type /ObjStm): font + resource dicts live here ----------
{
  const objStmAdds = new Map();
  for (const [num, o] of objs) {
    if (!/\/Type\s*\/ObjStm/.test(o.text.slice(0, o.text.indexOf('stream')))) continue;
    const body = streamBody(num);
    if (!body) continue;
    const nMatch = /\/N\s+(\d+)/.exec(o.text);
    const fMatch = /\/First\s+(\d+)/.exec(o.text);
    if (!nMatch || !fMatch) continue;
    const n = Number(nMatch[1]);
    const first = Number(fMatch[1]);
    const header = body.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const objNum = header[i * 2];
      const off = header[i * 2 + 1];
      const nextOff = i + 1 < n ? header[(i + 1) * 2 + 1] : body.length - first;
      if (!Number.isFinite(objNum) || !Number.isFinite(off)) continue;
      objStmAdds.set(objNum, body.slice(first + off, first + nextOff));
    }
  }
  for (const [num, text] of objStmAdds)
    if (!objs.has(num)) objs.set(num, { start: -1, end: -1, text });
  globalThis.__objStmCount = objStmAdds.size;
}

// ---------- ToUnicode CMaps ----------
function parseCMap(text) {
  const map = new Map();
  let codeBytes = 0;
  const bfchar = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = bfchar.exec(text)) !== null) {
    for (const pm of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const src = pm[1];
      codeBytes = codeBytes || src.length / 2;
      let dst = '';
      for (let i = 0; i < pm[2].length; i += 4)
        dst += String.fromCharCode(parseInt(pm[2].slice(i, i + 4), 16));
      map.set(parseInt(src, 16), dst);
    }
  }
  const bfrange = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfrange.exec(text)) !== null) {
    for (const pm of m[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g,
    )) {
      const lo = parseInt(pm[1], 16),
        hi = parseInt(pm[2], 16);
      codeBytes = codeBytes || pm[1].length / 2;
      if (pm[3].startsWith('[')) {
        const items = [...pm[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
        items.forEach((it, i) => {
          let d = '';
          for (let j = 0; j < it[1].length; j += 4)
            d += String.fromCharCode(parseInt(it[1].slice(j, j + 4), 16));
          map.set(lo + i, d);
        });
      } else {
        const base = pm[3].slice(1, -1);
        const baseNum = parseInt(base, 16);
        for (let c = lo; c <= hi; c++) {
          const t = (baseNum + (c - lo)).toString(16).padStart(base.length, '0');
          let d = '';
          for (let j = 0; j < t.length; j += 4)
            d += String.fromCharCode(parseInt(t.slice(j, j + 4), 16));
          map.set(c, d);
        }
      }
    }
  }
  return { map, codeBytes: codeBytes || 1 };
}

// font resource name -> cmap  (resolve both inline /Font<< >> and indirect /Font N 0 R)
const nameToCmap = new Map();
const fontSources = [raw, ...[...objs.values()].map((o) => o.text)];
const inlineFontDict = /\/Font\s*<</g;
for (const src of fontSources) {
  inlineFontDict.lastIndex = 0;
  let fm;
  while ((fm = inlineFontDict.exec(src)) !== null) {
    const close = src.indexOf('>>', fm.index);
    const chunk = src.slice(fm.index, close === -1 ? fm.index + 4000 : close);
    for (const pm of chunk.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g))
      nameToCmap.set(pm[1], Number(pm[2]));
  }
  // indirect: /Font 2022 0 R  ->  object 2022 holds /F1 2006 0 R ...
  for (const pm of src.matchAll(/\/Font\s+(\d+)\s+0\s+R/g)) {
    const target = objs.get(Number(pm[1]));
    if (!target) continue;
    for (const q of target.text.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g))
      nameToCmap.set(q[1], Number(q[2]));
  }
}
const cmapCache = new Map();
function cmapFor(fontObjNum) {
  if (cmapCache.has(fontObjNum)) return cmapCache.get(fontObjNum);
  let result = null;
  const o = objs.get(fontObjNum);
  if (o) {
    const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(o.text);
    if (tu) {
      const t = streamBody(Number(tu[1]));
      if (t) result = parseCMap(t);
    }
  }
  cmapCache.set(fontObjNum, result);
  return result;
}
// name -> cmap object
const nameCmap = new Map();
for (const [name, num] of nameToCmap) nameCmap.set(name, cmapFor(num));

// ---------- content streams ----------
function decodeHex(h, cmap) {
  const clean = h.replace(/[^0-9A-Fa-f]/g, '');
  const cb = cmap ? cmap.codeBytes : 1;
  let out = '';
  for (let i = 0; i + cb * 2 <= clean.length; i += cb * 2) {
    const code = parseInt(clean.slice(i, i + cb * 2), 16);
    const ch = cmap?.map.get(code);
    out += ch ?? (code >= 32 && code < 127 ? String.fromCharCode(code) : '');
  }
  return out;
}

const pages = [];
const stats = { streams: 0, decoded: 0, withText: 0, hexRuns: 0, missingCmap: new Set() };

for (const [num, o] of [...objs.entries()].sort((a, b) => a[1].start - b[1].start)) {
  const si = o.text.indexOf('stream');
  if (si === -1) continue;
  stats.streams++;
  const content = streamBody(num);
  if (content === null) continue;
  if (!/\bBT\b/.test(content)) continue;
  stats.decoded++;

  const tokenRe =
    /(\/F\d+)\s+([\d.]+)\s+Tf|(<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\()])*\))\s*Tj|\[([^\]]*)\]\s*TJ|\bT\*|(?:[-0-9.]+\s+){2}(?:Td|TD)|\bET\b/g;
  let cur = null;
  let out = '';
  let t;
  while ((t = tokenRe.exec(content)) !== null) {
    const tok = t[0];
    if (t[1]) {
      cur = nameCmap.get(t[1].replace('/', '')) ?? null;
      continue;
    }
    if (/\b(ET|T\*)\b/.test(tok) || /(Td|TD)$/.test(tok.trim())) {
      out += '\n';
      continue;
    }
    if (t[4] !== undefined) {
      // TJ array
      let piece = '';
      for (const it of t[4].matchAll(/<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\()])*\)|(-?[\d.]+)/g)) {
        const v = it[0];
        if (v.startsWith('<')) {
          if (!cur) stats.missingCmap.add(t[1] ?? '?');
          piece += decodeHex(v, cur);
          stats.hexRuns++;
        } else if (v.startsWith('(')) {
          piece += v.slice(1, -1).replace(/\\([\\()])/g, '$1');
        } else if (Number(v) < -100) piece += ' ';
      }
      out += piece;
      continue;
    }
    if (t[3] !== undefined) {
      // Tj
      const v = t[3];
      if (v.startsWith('<')) {
        if (!cur) stats.missingCmap.add(t[1] ?? '?');
        out += decodeHex(v, cur);
        stats.hexRuns++;
      } else out += v.slice(1, -1);
    }
  }
  const cleaned = out
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (cleaned) {
    pages.push(cleaned);
    stats.withText++;
  }
}

const text = pages.join('\n\n===== PAGE =====\n\n');
if (args.includes('--stats')) {
  console.log('objects:', objs.size, 'fontNames:', nameToCmap.size);
  console.log(
    'streams:',
    stats.streams,
    'decoded:',
    stats.decoded,
    'withText:',
    stats.withText,
    'hexRuns:',
    stats.hexRuns,
  );
  console.log('fonts without ToUnicode:', [...stats.missingCmap]);
  console.log('chars:', text.length);
}
if (outPath) {
  writeFileSync(outPath, text, 'utf8');
  console.log('wrote', outPath, text.length, 'chars');
} else console.log(text);
