// Run the upgrade test with one command:
//   npm run test:upgrade                      (old release = main)
//   UPGRADE_FROM=<git ref> npm run test:upgrade
// Serves the old release straight from git on 127.0.0.1:8098, then switches the same address to the
// working tree when tests/upgrade-browser.mjs asks, so the browser upgrades in place.
// Needs CHROME_PATH on Windows/macOS, like the other browser tests.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const FROM = process.env.UPGRADE_FROM || 'main';
const PORT = 8098;
const ROOT = resolve('.');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
let serveNew = false;

function oldFile(path) {
  try {
    return execFileSync('git', ['cat-file', 'blob', `${FROM}:${path}`], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}
function newFile(path) {
  const file = join(ROOT, path);
  return file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile()
    ? readFileSync(file)
    : null;
}

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/__switch') {
    serveNew = true;
    res.end('switched');
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  path = path.replace(/^\/+/, '');
  const body = path.split('/').includes('..') ? null : serveNew ? newFile(path) : oldFile(path);
  if (!body) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(path)] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  res.end(body);
});

execFileSync('git', ['rev-parse', '--verify', `${FROM}^{commit}`], { stdio: 'ignore' });
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok));
console.log(`upgrade: ${FROM} -> working tree on http://127.0.0.1:${PORT}/`);
const code = await new Promise(ok => {
  const child = spawn(process.execPath, ['tests/upgrade-browser.mjs'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      UPGRADE_URL: `http://127.0.0.1:${PORT}/`,
      UPGRADE_SWITCH: `"${process.execPath}" -e "fetch('http://127.0.0.1:${PORT}/__switch')"`,
    },
  });
  child.on('exit', ok);
});
server.close();
process.exit(code ?? 1);
