export const VERSION = 1;

// Aurora avatar — deterministic reference implementation (no dependencies).
// renderAurora(seed, size) -> Uint8ClampedArray RGBA pixels (size*size*4).

// ---- 1. Hash: cyrb128 (string -> four uint32) ----
export function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// ---- 2. PRNG: sfc32, returns floats in [0, 1) ----
export function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

// Seeded generator; the first 12 outputs are discarded to mix the state.
export function rngFor(s) {
  const r = sfc32(...cyrb128(s));
  for (let i = 0; i < 12; i++) r();
  return r;
}

// ---- 3. Colour: HSL (h in degrees, s/l in percent) -> [r, g, b] 0–255 ----
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// ---- 4. Palette: depends on the seed only (shared by every style) ----
const SCHEMES = [
  [0, 30, -30, 15, -15],   // analogous
  [0, 180, 20, 200, -20],  // complementary
  [0, 120, 240, 60, 180],  // triadic
  [0, 150, 210, 30, 330],  // split-complementary
];
export function palette(seed) {
  const r = rngFor("palette:" + seed);
  const base = r() * 360;
  const offs = SCHEMES[Math.floor(r() * SCHEMES.length)];
  // Order matters: saturation draw, then lightness draw, per colour.
  const colors = offs.map((o, i) => {
    const s = 55 + r() * 30;
    const l = i % 2 ? 42 + r() * 14 : 58 + r() * 14;
    return hslToRgb(base + o, s, l);
  });
  const darkS = 30 + r() * 20;
  const darkL = 12 + r() * 6;
  const dark = hslToRgb(base + 200, darkS, darkL);
  return { base, colors, dark };
}

// ---- 5. Aurora ----
export function auroraParams(seed) {
  const r = rngFor(seed + ":aurora");
  const range = (a, b) => a + r() * (b - a);
  const ribbons = [];
  for (let i = 0; i < 3; i++) {
    // Draw order is part of the contract: y, a, f, ph, a2, f2, w.
    const y  = range(0.30, 0.72); // vertical centre (fraction of height)
    const a  = range(0.05, 0.14); // main wave amplitude
    const f  = range(4, 10);      // main wave frequency (radians per image width)
    const ph = r() * 7;           // main wave phase
    const a2 = range(0.02, 0.05); // ripple amplitude
    const f2 = range(10, 20);     // ripple frequency
    const w  = range(0.04, 0.08); // glow half-width below the ribbon
    ribbons.push({ y, a, f, ph, a2, f2, w, colorIndex: (i * 2) % 5 }); // colours 0, 2, 4
  }
  return ribbons;
}

export function renderAurora(seed, size = 256) {
  if (!Number.isInteger(size) || size < 1 || size > 512) throw new RangeError("size must be an integer from 1 to 512");
  const pal = palette(seed);
  const ribbons = auroraParams(seed).map(b => ({ ...b, col: pal.colors[b.colorIndex] }));
  const out = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size, v = py / size;
      // Background: palette dark, fading halfway to black at the bottom.
      const t = v * 0.5;
      let R = pal.dark[0] * (1 - t), G = pal.dark[1] * (1 - t), B = pal.dark[2] * (1 - t);
      for (const b of ribbons) {
        const d = v - (b.y + b.a * Math.sin(u * b.f + b.ph) + b.a2 * Math.sin(u * b.f2));
        const w = d < 0 ? b.w * 3.2 : b.w; // long fade upward, sharp edge below
        const k = Math.exp(-(d * d) / (w * w)) * 0.85;
        R += b.col[0] * k; G += b.col[1] * k; B += b.col[2] * k; // additive light
      }
      const o = (py * size + px) * 4;
      out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = 255; // clamps + rounds
    }
  }
  return out;
}
