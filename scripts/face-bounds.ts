import { inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Find each trainer's face inside their sprite.
 *
 * Showdown trainer sprites are 80x80 full-body figures: a person standing, often
 * with a bike or an outstretched arm, occupying wildly different parts of the
 * canvas. Rendered into a 44px slot on a gym card that leaves a face about eight
 * pixels tall — not a portrait, a person seen from across the road.
 *
 * So the head is located once, here, and the UI crops to it. Three passes:
 *
 *   1. The figure's vertical extent, by alpha.
 *   2. The head band — the top quarter of the figure — which sets the crop size.
 *   3. The *crown*, the top eighth, which sets the horizontal centre. Arms,
 *      bikes and fishing rods reach into the head band and drag a width-based
 *      centre sideways; nothing but head is ever as high as the crown.
 *
 * Unlike the box icons, these are **palette** PNGs whose transparency lives in a
 * `tRNS` chunk, so the decoder in `icon-bounds.ts` cannot read them — it skips
 * anything that is not true-colour-with-alpha, which is all 108 of these.
 *
 * Committed output, like the dex. This should never run in the app.
 *
 *   npx tsx scripts/face-bounds.ts
 */

interface Box {
  x: number;
  y: number;
  size: number;
}

/** How far down the figure the head is taken to reach. */
const HEAD_BAND = 0.26;
/**
 * The crown: the very top of the figure, used only to find the horizontal
 * centre. Arms, bikes and fishing rods reach into the head band and drag a
 * width-based centre sideways; nothing but head is ever this high up.
 */
const CROWN_BAND = 0.12;
/**
 * How wide a row must be, against the figure's widest, to count as the head
 * rather than as something held above it.
 */
const HEAD_MIN_WIDTH = 0.34;
/** Breathing room around the head, as a share of the head's own size. */
const PADDING = 0.34;
/** Anti-aliased edges are part of the figure. */
const ALPHA_FLOOR = 8;

/** A decoded image, as the only thing the measurement needs: is this opaque? */
interface Mask {
  width: number;
  height: number;
  opaque: (x: number, y: number) => boolean;
}

function decode(path: string): Mask | null {
  const data = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = 0;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];

  while (pos < data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.toString("ascii", pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body.readUInt8(8);
      colourType = body.readUInt8(9);
    } else if (type === "tRNS") {
      trns = Buffer.from(body);
    } else if (type === "IDAT") {
      idat.push(body);
    }
    pos += 12 + length;
  }

  // Palette-8 and true-colour-with-alpha are the two that appear across this
  // project's assets. Anything else is skipped rather than guessed at, so a bad
  // measurement can never reach the UI.
  const bpp = colourType === 6 ? 4 : colourType === 3 && depth === 8 ? 1 : 0;
  if (bpp === 0) return null;

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let i = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const line = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      const v = line[x]!;
      if (filter === 1) line[x] = (v + a) & 255;
      else if (filter === 2) line[x] = (v + b) & 255;
      else if (filter === 3) line[x] = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[x] = (v + pr) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }

  if (bpp === 4) {
    return {
      width,
      height,
      opaque: (x, y) => out[(y * width + x) * 4 + 3]! > ALPHA_FLOOR,
    };
  }
  // Palette: transparency is per palette index, and any index past the end of
  // the tRNS chunk is fully opaque.
  return {
    width,
    height,
    opaque: (x, y) => {
      const index = out[y * width + x]!;
      const alpha = trns && index < trns.length ? trns[index]! : 255;
      return alpha > ALPHA_FLOOR;
    },
  };
}

function face(path: string): Box | null {
  const img = decode(path);
  if (!img) return null;
  const { width, height, opaque } = img;

  // Opaque width per row, which is what separates a head from a net handle.
  const rowWidth: number[] = [];
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    let lo = width;
    let hi = -1;
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      if (x < lo) lo = x;
      hi = x;
    }
    rowWidth[y] = hi < 0 ? 0 : hi - lo + 1;
    if (hi < 0) continue;
    if (top < 0) top = y;
    bottom = y;
  }
  if (top < 0) return null;

  // Skip anything the figure is holding above their head. A net, a pitchfork
  // and a racket all reach higher than the face and are only a few pixels wide,
  // so the crown of the *sprite* is not the crown of the *person*. The head
  // starts at the first row wide enough to be one.
  const widest = Math.max(...rowWidth.slice(top, bottom + 1));
  const headStart = rowWidth.findIndex(
    (w, y) => y >= top && w >= widest * HEAD_MIN_WIDTH,
  );
  if (headStart >= 0) top = headStart;

  const figureH = bottom - top + 1;
  const bandEnd = Math.min(bottom, top + Math.max(1, Math.round(figureH * HEAD_BAND)) - 1);
  const crownEnd = Math.min(bandEnd, top + Math.max(0, Math.round(figureH * CROWN_BAND)));

  let minX = width;
  let maxX = -1;
  for (let y = top; y <= crownEnd; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (maxX < 0) return null;

  const headH = bandEnd - top + 1;
  // Sized from the head's *height*: width is unreliable because anything the
  // figure is holding shares the band. Square, because the slot is square.
  const size = Math.min(
    Math.min(width, height),
    Math.round(headH * (1 + PADDING)),
  );
  const cx = (minX + maxX) / 2;
  const cy = top + headH / 2;

  // Clamped inside the canvas, so the crop never samples off the edge.
  const x = Math.round(Math.min(Math.max(0, cx - size / 2), width - size));
  const y = Math.round(Math.min(Math.max(0, cy - size / 2), height - size));
  return { x, y, size };
}

const dir = join(process.cwd(), "public", "trainers");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".png"))
  .sort();

const rows: string[] = [];
let canvas = 80;
let missed = 0;

for (const file of files) {
  const box = face(join(dir, file));
  if (!box) {
    missed += 1;
    console.warn(`  could not measure ${file}`);
    continue;
  }
  const img = decode(join(dir, file));
  if (img) canvas = img.width;
  rows.push(`  "${file.slice(0, -4)}": [${box.x}, ${box.y}, ${box.size}],`);
}

const output = `// Generated by scripts/face-bounds.ts. Do not edit by hand.
//
// Where each trainer's head sits inside their sprite, as [x, y, size]. The UI
// crops to this so a portrait is a face rather than a whole person standing in
// a field.

export const FACE_CANVAS = ${canvas};

export const FACE_BOUNDS: Record<string, readonly [number, number, number]> = {
${rows.join("\n")}
};
`;

writeFileSync(join(process.cwd(), "src", "data", "faceBounds.ts"), output);
console.log(`measured ${rows.length} faces, skipped ${missed}`);
