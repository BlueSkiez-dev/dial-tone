// Copies the Latin-subset woff2 files and OFL licenses from @fontsource into src/ui/fonts/.
// Run once with: node scripts/copy-fonts.mjs. Output is committed.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'ui', 'fonts');

const families = [
  { pkg: 'barlow-condensed', weights: [600, 700] },
  { pkg: 'ibm-plex-sans', weights: [400, 500, 600] },
  { pkg: 'ibm-plex-mono', weights: [400, 500, 600, 700] },
];

mkdirSync(outDir, { recursive: true });

for (const { pkg, weights } of families) {
  const base = join(root, 'node_modules', '@fontsource', pkg);
  for (const w of weights) {
    const name = `${pkg}-latin-${w}-normal.woff2`;
    const from = join(base, 'files', name);
    if (!existsSync(from)) throw new Error(`Missing ${from}`);
    copyFileSync(from, join(outDir, name));
  }
  const license = join(base, 'LICENSE');
  if (!existsSync(license)) throw new Error(`Missing ${license}`);
  copyFileSync(license, join(outDir, `${pkg}-OFL.txt`));
}

console.log(`Copied fonts to ${outDir}`);
