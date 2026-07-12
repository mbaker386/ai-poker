// Generates the AI Poker icon set: a gold-on-near-black poker chip with a center motif
// Run: node scripts/make-icons.mjs   (regenerates public/ icons; commit the results)

import sharp from "sharp";
import { writeFileSync } from "fs";

/** Build the chip SVG. size = viewBox, chipR = chip radius (padding controls maskable safe zone). */
function chipSvg({ size = 512, chipR = 226, background = "#070908", transparent = false } = {}) {
  const c = size / 2;

  // Edge spots: 8 gold rounded rectangles around the rim, classic casino chip style.
  const spots = Array.from({ length: 8 }, (_, k) => {
    const angle = k * 45;
    const w = 26, h = 42;
    const y = c - chipR + 5; // sits across the rim band
    return `<rect x="${c - w / 2}" y="${y}" width="${w}" height="${h}" rx="8"
      fill="url(#gold)" transform="rotate(${angle} ${c} ${c})"/>`;
  }).join("\n    ");

// Center motif: "spade" (suit pip) or "ai" (monogram). Both kept available.
const MOTIF = "spade";

// "AI" monogram, hand-drawn strokes (no font dependency).
// IMPORTANT: solid gold, not the gradient — SVG gradients in the default
// objectBoundingBox mode fail on axis-aligned strokes (zero-area bbox),
// which would erase the crossbar, serifs, and the whole letter I.
function aiMonogram(c, chipR) {
  const s = chipR / 226; // scale with chip size so it clears the inner rings
  const ink = "#ddbf74";
  const g = 17;                     // stroke width, main
  const gs = 9;                     // stroke width, serifs & crossbar
  // Cap height 132: top y=190, baseline y=322. A spans x∈[140,288] with
  // serifs; I stem at x=330 with serifs x∈[308,352]. Group centered on chip.
  return `
    <g transform="translate(${c},${c}) scale(${s}) translate(${-256 + 10},${-256})"
       stroke="${ink}" fill="none" stroke-linecap="round">
      <!-- A -->
      <path d="M 152 322 L 214 190" stroke-width="${g}"/>
      <path d="M 214 190 L 276 322" stroke-width="${g}"/>
      <path d="M 176 278 L 252 278" stroke-width="${gs}"/>
      <path d="M 140 322 L 168 322" stroke-width="${gs}"/>
      <path d="M 260 322 L 288 322" stroke-width="${gs}"/>
      <!-- I -->
      <path d="M 330 196 L 330 316" stroke-width="${g}"/>
      <path d="M 308 190 L 352 190" stroke-width="${gs}"/>
      <path d="M 308 322 L 352 322" stroke-width="${gs}"/>
    </g>`;
}

// Classic spade pip: pointed crown, two round lobes, flared stem.
// Drawn around the origin (y extent -105..158, visual center y≈26.5),
// then centered on the chip and scaled to clear the inner rings.
function spadePip(c, chipR) {
  const s = 0.9 * (chipR / 226);
  const path = `M 0 -105
    C -36 -45 -106 5 -106 60
    a 55 55 0 0 0 96 36
    c -6 30 -20 48 -40 62
    h 100
    c -20 -14 -34 -32 -40 -62
    a 55 55 0 0 0 96 -36
    C 106 5 36 -45 0 -105 Z`;
  return `
    <g transform="translate(${c},${c - 26.5 * s}) scale(${s})">
      <path d="${path}" fill="url(#gold)"/>
    </g>`;
}

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="felt" cx="50%" cy="36%" r="78%">
      <stop offset="0%" stop-color="#13221a"/>
      <stop offset="55%" stop-color="#0b120d"/>
      <stop offset="100%" stop-color="#080b09"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ecd694"/>
      <stop offset="55%" stop-color="#d3b166"/>
      <stop offset="100%" stop-color="#b08f45"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0dc9e"/>
      <stop offset="100%" stop-color="#a4823c"/>
    </linearGradient>
  </defs>
  ${transparent ? "" : `<rect width="${size}" height="${size}" fill="${background}"/>`}
  <!-- chip body + rim -->
  <circle cx="${c}" cy="${c}" r="${chipR}" fill="url(#felt)" stroke="url(#rim)" stroke-width="11"/>
  <!-- rim band the edge spots sit across -->
  <circle cx="${c}" cy="${c}" r="${chipR - 26}" fill="none" stroke="rgba(201,167,90,.28)" stroke-width="2"/>
  ${spots}
  <!-- inner rings -->
  <circle cx="${c}" cy="${c}" r="${chipR - 62}" fill="none" stroke="rgba(201,167,90,.55)" stroke-width="3"/>
  <circle cx="${c}" cy="${c}" r="${chipR - 74}" fill="none" stroke="rgba(201,167,90,.25)" stroke-width="1.6" stroke-dasharray="2 9"/>
  ${MOTIF === "spade" ? spadePip(c, chipR) : aiMonogram(c, chipR)}
</svg>`;
}

const outDir = new URL("../public/", import.meta.url).pathname;

// favicon: chip only, transparent background (browser tabs)
writeFileSync(outDir + "favicon.svg", chipSvg({ transparent: true }));

const full = Buffer.from(chipSvg({ chipR: 226 }));          // full-bleed square, generous chip
const maskable = Buffer.from(chipSvg({ chipR: 188 }));      // chip inside the 80% safe zone

await sharp(full, { density: 288 }).resize(512, 512).png().toFile(outDir + "icon-512.png");
await sharp(full, { density: 288 }).resize(192, 192).png().toFile(outDir + "icon-192.png");
await sharp(maskable, { density: 288 }).resize(512, 512).png().toFile(outDir + "icon-512-maskable.png");
await sharp(full, { density: 288 }).resize(180, 180).png().toFile(outDir + "apple-touch-icon.png");

console.log("icons written to public/");
