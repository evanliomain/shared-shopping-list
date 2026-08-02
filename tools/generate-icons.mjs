/**
 * Génère les icônes PWA sans aucune dépendance externe.
 *
 * On rastérise nous-mêmes un caddie dans un buffer RGBA puis on encode un PNG
 * à la main (zlib est dans la stdlib). C'est volontairement modeste : le but est
 * d'avoir des icônes correctes et reproductibles dès le lot 0, pas un logo.
 * Remplacer les fichiers produits par un vrai design ne casse rien.
 *
 *   node tools/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'shopping-list',
  'public',
  'icons',
);

/** Vert de la marque, et blanc pour le glyphe. */
const GREEN = [22, 163, 74, 255];
const WHITE = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

/** Facteur de suréchantillonnage : on dessine en grand puis on réduit (anti-aliasing). */
const SS = 4;

// ─────────────────────────────────────────────────────────── encodage PNG

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** @param {Uint8Array} rgba buffer RGBA de taille width*height*4 */
function encodePng(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur 8 bits
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filtre adaptatif
  ihdr[12] = 0; // non entrelacé

  // Chaque scanline est préfixée de son octet de filtre (0 = aucun).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─────────────────────────────────────────────────────────── rastérisation

class Canvas {
  constructor(size) {
    this.size = size;
    this.px = new Uint8Array(size * size * 4);
  }

  set(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
    this.px[i + 3] = a;
  }

  /** Remplit selon un prédicat exprimé en coordonnées unitaires (0..1). */
  fill(color, inside) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const u = (x + 0.5) / this.size;
        const v = (y + 0.5) / this.size;
        if (inside(u, v)) this.set(x, y, color);
      }
    }
  }

  /** Réduit par moyenne de blocs SS×SS — c'est ce qui donne l'anti-aliasing. */
  downsample(factor) {
    const out = new Canvas(this.size / factor);
    for (let y = 0; y < out.size; y++) {
      for (let x = 0; x < out.size; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const i = ((y * factor + dy) * this.size + (x * factor + dx)) * 4;
            const alpha = this.px[i + 3];
            // Prémultiplication : sinon les bords bavent vers le noir.
            r += this.px[i] * alpha;
            g += this.px[i + 1] * alpha;
            b += this.px[i + 2] * alpha;
            a += alpha;
          }
        }
        out.set(
          x,
          y,
          a === 0
            ? TRANSPARENT
            : [
                Math.round(r / a),
                Math.round(g / a),
                Math.round(b / a),
                Math.round(a / (factor * factor)),
              ],
        );
      }
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────── géométrie

const roundedRect = (x0, y0, x1, y1, radius) => (u, v) => {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = Math.min(Math.max(u, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(v, y0 + radius), y1 - radius);
  return (u - cx) ** 2 + (v - cy) ** 2 <= radius ** 2;
};

const disc = (cx, cy, r) => (u, v) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;

/** Segment épais, extrémités arrondies. */
const segment = (x0, y0, x1, y1, thickness) => (u, v) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(Math.max(((u - x0) * dx + (v - y0) * dy) / lengthSq, 0), 1);
  return Math.hypot(u - (x0 + t * dx), v - (y0 + t * dy)) <= thickness / 2;
};

/** Trapèze du panier, défini par ses deux bases horizontales. */
const trapezoid =
  (topY, topX0, topX1, bottomY, bottomX0, bottomX1) => (u, v) => {
    if (v < topY || v > bottomY) return false;
    const t = (v - topY) / (bottomY - topY);
    return (
      u >= topX0 + t * (bottomX0 - topX0) && u <= topX1 + t * (bottomX1 - topX1)
    );
  };

const any =
  (...shapes) =>
  (u, v) =>
    shapes.some((s) => s(u, v));

// ─────────────────────────────────────────────────────────── le caddie

/**
 * @param scale taille du glyphe (1 = pleine largeur). Réduit pour les icônes
 *              maskable, dont la zone de sécurité est un disque de 80 %.
 */
function drawCart(canvas, scale) {
  const c = 0.5;
  const at = (x, y) => [c + (x - c) * scale, c + (y - c) * scale];

  const [hx0, hy0] = at(0.13, 0.27);
  const [hx1, hy1] = at(0.26, 0.27);
  const [hx2, hy2] = at(0.34, 0.62);
  const [bt0, bty] = at(0.26, 0.38);
  const [bt1] = at(0.85, 0.38);
  const [bb0, bby] = at(0.36, 0.64);
  const [bb1] = at(0.75, 0.64);
  const [w1x, w1y] = at(0.42, 0.78);
  const [w2x, w2y] = at(0.68, 0.78);
  const [rx, ry] = at(0.75, 0.64);

  canvas.fill(
    WHITE,
    any(
      // Anse : la poignée puis la montée vers le panier.
      segment(hx0, hy0, hx1, hy1, 0.055 * scale),
      segment(hx1, hy1, hx2, hy2, 0.055 * scale),
      // Panier.
      trapezoid(bty, bt0, bt1, bby, bb0, bb1),
      // Barre reliant le panier aux roues.
      segment(hx2, hy2, rx, ry, 0.05 * scale),
      // Roues.
      disc(w1x, w1y, 0.062 * scale),
      disc(w2x, w2y, 0.062 * scale),
    ),
  );
}

// ─────────────────────────────────────────────────────────── production

/**
 * @param maskable true → fond plein bord à bord et glyphe réduit (zone de
 *                 sécurité Android). false → carré arrondi sur fond transparent.
 */
function render(size, { maskable }) {
  const canvas = new Canvas(size * SS);
  canvas.fill(GREEN, maskable ? () => true : roundedRect(0, 0, 1, 1, 0.22));
  drawCart(canvas, maskable ? 0.72 : 1);
  return canvas.downsample(SS);
}

mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  // iOS applique lui-même le masque : fond plein bord à bord, pas de transparence.
  ['apple-touch-icon.png', 180, { maskable: true }],
  ['favicon-32.png', 32, { maskable: false }],
];

for (const [name, size, options] of TARGETS) {
  const canvas = render(size, options);
  writeFileSync(
    join(OUT_DIR, name),
    encodePng(canvas.px, canvas.size, canvas.size),
  );
  console.log(`✔ ${name} (${size}×${size})`);
}
