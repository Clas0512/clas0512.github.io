'use strict';
/*
 * Shared setup for the browser checks: a tiny static file server for the repository root
 * (no dependencies) and one headless Chromium per test file.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Start the server and browser; returns { open(path, opts), close() }. */
async function setup() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const pages = [];
  return {
    /** Open a page; `fakeClock` installs Playwright's clock so time only moves when the test says so. */
    async open(url, { fakeClock = false } = {}) {
      const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (fakeClock) await page.clock.install();
      await page.goto(base + url);
      page.errors = errors;
      pages.push(page);
      return page;
    },
    async close() {
      await browser.close();
      await new Promise((r) => server.close(r));
    },
  };
}

module.exports = { setup, ROOT };
