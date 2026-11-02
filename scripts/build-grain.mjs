// Generates public/grain.webp, the film grain the Photos page lays over every
// photo. Run it again (`npm run grain`) only if you change the settings below;
// the result is committed.
//
// The tile is seamless and centered on 50% gray, so with `mix-blend-mode:
// overlay` it leaves the average brightness alone and shows most in the
// midtones, fading toward pure white and black, like real film grain. The
// texture is mostly crisp single-pixel grain, like a sharp scan from a fine
// film stock, with a little tight clumping so it doesn't read as digital noise.
// The page draws it at exactly one grain pixel per screen pixel, so keep it
// sharp here: any softness shows at large sizes.

import sharp from 'sharp';

const SIZE = 512;
const SEED = 400;
const FINE = 0.82;      // weight of the single-pixel grain
const CLUMP = 0.18;     // weight of the clumped grain
const CLUMP_BLUR = 0.7; // clump size, as a Gaussian sigma in pixels
const CHROMA = 0.06;    // color noise mixed into each channel, like a color negative scan
const STRENGTH = 30;    // standard deviation around 128, out of 255
const SOFT_CLIP = 96;   // rolls off extreme values instead of clipping them

const random = mulberry32(SEED);
const gaussian = () => {
  // Box–Muller
  const u = 1 - random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};
const field = () => Float32Array.from({ length: SIZE * SIZE }, gaussian);

const luma = mix([normalize(field()), FINE], [normalize(blurWrapped(field(), CLUMP_BLUR)), CLUMP]);
const chroma = [0, 1, 2].map(() => normalize(blurWrapped(field(), 0.5)));

const pixels = Buffer.alloc(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i++) {
  for (let c = 0; c < 3; c++) {
    const v = (luma[i] * (1 - CHROMA) + chroma[c][i] * CHROMA) * STRENGTH;
    pixels[i * 3 + c] = Math.round(128 + SOFT_CLIP * Math.tanh(v / SOFT_CLIP));
  }
}

const out = new URL('../public/grain.webp', import.meta.url).pathname;
const info = await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .webp({ quality: 96 }) // compression error is under 1/255 once blended: invisible
  .toFile(out);
console.log(`Wrote public/grain.webp (${Math.round(info.size / 1024)} KB)`);

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Separable Gaussian blur that wraps at the edges, so the tile stays seamless.
function blurWrapped(src, sigma) {
  const radius = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)));
  const total = kernel.reduce((a, b) => a + b);
  const wrap = (n) => (n + SIZE) % SIZE;
  const pass = (input, horizontal) => {
    const output = new Float32Array(input.length);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const i = horizontal ? y * SIZE + wrap(x + k) : wrap(y + k) * SIZE + x;
          sum += input[i] * kernel[k + radius];
        }
        output[y * SIZE + x] = sum / total;
      }
    }
    return output;
  };
  return pass(pass(src, true), false);
}

// Rescales a field to a mean of 0 and a standard deviation of 1.
function normalize(values) {
  const mean = values.reduce((a, b) => a + b) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return values.map((v) => (v - mean) / sd);
}

function mix(...layers) {
  const sum = new Float32Array(SIZE * SIZE);
  for (const [values, weight] of layers) values.forEach((v, i) => (sum[i] += v * weight));
  return normalize(sum);
}
