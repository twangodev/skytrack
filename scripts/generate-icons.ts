// One-off rasterization of the favicon mark into PNG/ICO assets.
// Rasterizers ignore the media query in static/favicon.svg, so inline a
// dark-background variant here. Keep the glyph in sync with
// src/lib/components/Logo.svelte and static/favicon.svg.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile } from 'node:fs/promises';

const glyph = `
    <path d="M4 28 V23 H10 V17 H16 V11 H22 V28 Z" fill="#e8e5df"/>
    <rect x="24" y="4" width="5" height="5" fill="#e8e5df"/>`;

const mark = (scale: number, rx = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rx}" fill="#1a1916"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${glyph}
  </g>
</svg>`;

const render = (svg: string, size: number) =>
	sharp(Buffer.from(svg), { density: (72 * size) / 32 })
		.resize(size, size)
		.png()
		.toBuffer();

await writeFile('static/apple-touch-icon.png', await render(mark(0.82), 180));
await writeFile('static/icon-192.png', await render(mark(0.82, 6), 192));
await writeFile('static/icon-512.png', await render(mark(0.82, 6), 512));
// maskable: mark shrunk into the safe zone on a full-bleed background
await writeFile('static/icon-maskable.png', await render(mark(0.62), 512));
await writeFile('static/favicon.ico', await pngToIco(await render(mark(0.82, 6), 32)));

console.log('icons written to static/');
