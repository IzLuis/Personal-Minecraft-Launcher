// Generates the IzLauncher icon: an original 16x16 pixel-art "enchanted golden
// apple" (drawn from scratch — not Mojang's texture), scaled to 512x512 and
// written as build/icon.png + src/renderer/icon.png. Zero dependencies.
//   node scripts/make-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Palette
const C = {
  '.': null,                 // transparent
  O: [0x3e, 0x2b, 0x0e],     // dark outline
  S: [0x6b, 0x46, 0x1c],     // stem
  g: [0xff, 0xe2, 0x8a],     // light gold
  G: [0xf2, 0xa7, 0x1b],     // gold
  d: [0xb8, 0x6e, 0x0f],     // dark gold
  W: [0xff, 0xf6, 0xd0],     // shine
  P: [0xd8, 0x7c, 0xff],     // enchant glint
  p: [0xf0, 0xbd, 0xff],     // enchant glint light
};

// 16x16 sprite (each row exactly 16 chars)
const SPRITE = [
  '................',
  '.........SS.....',
  '........SS......',
  '.p......S.......',
  '...OOOO.S.OOOO..',
  '..OggggOOOggGGO.',
  '.OggWWgggggGGGO.',
  '.OgWggggPggGGGO.',
  '.OggggggggGGGdO.',
  '.OgGGgPgggGGpdO.',
  '.OGGGGgggGGGddO.',
  '.OGGGgggPGGGddO.',
  '..OGGGGGGGGddO..',
  '..OdGGGGGGGddO.p',
  '...OOdddddddO...',
  '.....OOOOOOO....',
];

for (const [i, row] of SPRITE.entries()) {
  if (row.length !== 16) throw new Error(`Row ${i} has length ${row.length}, expected 16`);
  for (const ch of row) if (!(ch in C)) throw new Error(`Unknown pixel '${ch}' in row ${i}`);
}

function crc32(buf) {
  return zlib.crc32(buf) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size) {
  const scale = size / 16;
  const raw = Buffer.alloc(size * (1 + size * 4));
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0; // filter: none
    const row = SPRITE[Math.floor(y / scale)];
    for (let x = 0; x < size; x++) {
      const color = C[row[Math.floor(x / scale)]];
      if (color) {
        raw[off++] = color[0];
        raw[off++] = color[1];
        raw[off++] = color[2];
        raw[off++] = 0xff;
      } else {
        off += 4; // transparent (already zeroed)
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png512 = encodePng(512);
for (const dest of ['build/icon.png', 'src/renderer/icon.png']) {
  const file = path.join(root, dest);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png512);
  console.log(`wrote ${dest} (${png512.length} bytes)`);
}
