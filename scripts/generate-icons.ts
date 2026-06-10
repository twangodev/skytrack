// One-off rasterization of the favicon mark into PNG/ICO assets.
// Rasterizers ignore the media query in static/favicon.svg, so inline a
// dark-background variant here.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile } from 'node:fs/promises';

const mark = (inset: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#1a1916"/>
  <g transform="translate(16 16) scale(${1 - inset}) translate(-16 -16)">
    <path d="M7 23 L13 16.5 L17 20 L24.5 11" fill="none" stroke="#e8e5df" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19.5 10 H25 V15.5" fill="none" stroke="#e8e5df" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const rounded = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1a1916"/>
  <path d="M7 23 L13 16.5 L17 20 L24.5 11" fill="none" stroke="#e8e5df" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19.5 10 H25 V15.5" fill="none" stroke="#e8e5df" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const render = (svg: string, size: number) =>
	sharp(Buffer.from(svg), { density: (72 * size) / 32 })
		.resize(size, size)
		.png()
		.toBuffer();

await writeFile('static/apple-touch-icon.png', await render(mark(0), 180));
await writeFile('static/icon-192.png', await render(rounded, 192));
await writeFile('static/icon-512.png', await render(rounded, 512));
// maskable: mark shrunk into the safe zone on a full-bleed background
await writeFile('static/icon-maskable.png', await render(mark(0.35), 512));
await writeFile('static/favicon.ico', await pngToIco(await render(rounded, 32)));

console.log('icons written to static/');
