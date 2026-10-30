import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 512;
const BOLT = [
  [0.58, 0.08],
  [0.24, 0.56],
  [0.46, 0.56],
  [0.38, 0.92],
  [0.76, 0.4],
  [0.54, 0.4],
];

function insidePolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function sampleBolt(x, y) {
  return insidePolygon(x, y, BOLT) ? 1 : 0;
}

function roundedRectInside(x, y, inset, radius) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const half = SIZE / 2 - inset;
  const dx = Math.abs(x - cx) - (half - radius);
  const dy = Math.abs(y - cy) - (half - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius <= 0;
}

function pixel(x, y) {
  if (!roundedRectInside(x, y, 10, 112)) return [0, 0, 0, 0];
  const t = Math.min(1, Math.max(0, (x / SIZE) * 0.45 + (y / SIZE) * 0.55));
  let r = mix(104, 168, t);
  let g = mix(126, 108, t);
  let b = mix(255, 255, t);
  const glow = Math.max(0, 1 - Math.hypot(x - SIZE * 0.28, y - SIZE * 0.2) / (SIZE * 0.75));
  r += glow * 26;
  g += glow * 22;
  b += glow * 18;

  const nx = x / SIZE;
  const ny = y / SIZE;
  const shadow = sampleBolt(nx - 0.012, ny - 0.014);
  const bolt = sampleBolt(nx, ny);
  if (shadow && !bolt) {
    r *= 0.72;
    g *= 0.68;
    b *= 0.8;
  }
  if (bolt) {
    r = mix(r, 255, 0.97);
    g = mix(g, 255, 0.97);
    b = mix(b, 255, 0.97);
  }
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return [clamp(r), clamp(g), clamp(b), 255];
}

function render() {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  const samples = 3;
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0;
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const [pr, pg, pb, pa] = pixel(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples);
          r += pr * pa;
          g += pg * pa;
          b += pb * pa;
          a += pa;
        }
      }
      const count = samples * samples;
      const alpha = a / count;
      const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
      if (a > 0) {
        raw[offset] = Math.round(r / a);
        raw[offset + 1] = Math.round(g / a);
        raw[offset + 2] = Math.round(b / a);
      }
      raw[offset + 3] = Math.round(alpha);
    }
  }
  return raw;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function buildPng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(render(), { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = buildPng();
const assetsDir = path.join(process.cwd(), 'assets');
const buildDir = path.join(process.cwd(), 'build');
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), png);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; // 256 px
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([header, entry, png]));

console.log(`Wrote assets/icon.png and build/icon.ico (${png.length} bytes)`);
