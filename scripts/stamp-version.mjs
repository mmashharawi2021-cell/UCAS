// Stamp the release version into every relative module import, e.g.
//   import { put } from './store.js'  →  './store.js?v=1.0.1'
// so each release has unique module URLs and no browser/service-worker cache can mix
// files from two releases. Run after changing "version" in package.json:
//   npm run stamp
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const SPEC = /((?:from\s+|import\s*\(\s*|import\s+)(['"]))(\.{1,2}\/[^'"?]+\.js)(?:\?v=[^'"]*)?\2/g;

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );

let changed = 0;
for (const file of walk('js')) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(SPEC, (_, head, quote, path) => `${head}${path}?v=${version}${quote}`);
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
for (const file of ['index.html', 'moodle-connect.html', 'sw.js']) {
  const src = readFileSync(file, 'utf8');
  const out =
    file === 'sw.js'
      ? src.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
      : src.replace(/(\.(?:js|css))\?v=[0-9.]+/g, `$1?v=${version}`);
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
const app = readFileSync('js/app.js', 'utf8').replace(
  /const APP_VERSION = '[^']*';/,
  `const APP_VERSION = '${version}';`,
);
writeFileSync('js/app.js', app);
console.log(`stamped v${version} into ${changed} file(s)`);
