// Package the Chrome Companion extension for distribution:
//   npm run pack:companion   ->  dist/UCAS_Moodle_Companion_<version>.zip
// The ZIP holds exactly the files in companion-extension/ (no personal data). Students unzip it
// into a permanent folder and use "Load unpacked" in chrome://extensions.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipBlobs } from '../js/lib/zip.js';

const dir = 'companion-extension';
const { version } = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const entries = readdirSync(dir, { withFileTypes: true })
  .filter(e => e.isFile())
  .map(e => e.name)
  .sort()
  .map(name => ({ name, blob: new Blob([readFileSync(join(dir, name))]) }));
const zip = await zipBlobs(entries);
mkdirSync('dist', { recursive: true });
const out = join('dist', `UCAS_Moodle_Companion_${version}.zip`);
writeFileSync(out, Buffer.from(await zip.arrayBuffer()));
console.log(`packed ${entries.length} files into ${out}`);
