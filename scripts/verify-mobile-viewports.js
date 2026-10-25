/**
 * Automated Mobile Viewport Invariant & Overflow Verification Engine
 *
 * Uses real Headless Chrome to inspect:
 * - 320x568 (iPhone SE 1)
 * - 360x640 (Android Small)
 * - 375x667 (iPhone SE 2/3)
 * - 390x844 (iPhone 12/13/14)
 * - 393x852 (iPhone 15/16)
 * - 412x915 (Pixel 7/8 / Galaxy)
 * - 430x932 (iPhone Pro Max)
 * - 844x390 (Mobile Landscape)
 *
 * Across all primary routes: Dashboard, Transactions, Accounts, Reports, QuickAdd
 * Verifies document.documentElement.scrollWidth <= document.documentElement.clientWidth
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PREVIEW_PORT = 4173;
const CDP_PORT = 9222;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const targetViewports = [
  { name: 'iPhone SE (1st gen)', width: 320, height: 568 },
  { name: 'Android Small', width: 360, height: 640 },
  { name: 'iPhone SE (2nd/3rd)', width: 375, height: 667 },
  { name: 'iPhone 12/13/14', width: 390, height: 844 },
  { name: 'iPhone 15/16', width: 393, height: 852 },
  { name: 'Pixel 7/8 / Galaxy', width: 412, height: 915 },
  { name: 'iPhone Pro Max / Plus', width: 430, height: 932 },
  { name: 'Mobile Landscape', width: 844, height: 390 }
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 404) return true;
    } catch (err) {
      void err;
    }
    await sleep(200);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && this.pending.has(data.id)) {
          const { resolve, reject } = this.pending.get(data.id);
          this.pending.delete(data.id);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    const message = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(message);
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result ? res.result.value : null;
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        void err;
      }
    }
  }
}

async function run() {
  console.log('=== Starting Mobile Viewport Invariant & Overflow Verification ===\n');

  // 1. Start built-in static HTTP server
  console.log(`[1/4] Starting built-in static server for dist/ on port ${PREVIEW_PORT}...`);
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let filePath = path.join(process.cwd(), 'dist', parsedUrl.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(process.cwd(), 'dist', 'index.html');
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve) => server.listen(PREVIEW_PORT, '127.0.0.1', resolve));
  console.log(`      Static server listening at http://127.0.0.1:${PREVIEW_PORT}`);

  // 2. Launch Headless Chrome
  console.log(`[2/4] Starting Headless Chrome on CDP port ${CDP_PORT}...`);
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    'about:blank'
  ], {
    stdio: 'ignore'
  });

  const cleanup = () => {
    try {
      chromeProcess.kill();
    } catch (err) {
      void err;
    }
    try {
      server.close();
    } catch (err) {
      void err;
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    await waitForHttp(`http://127.0.0.1:${PREVIEW_PORT}`);
    await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);

    const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const versionData = await versionRes.json();
    console.log(`[3/4] Chrome connected: ${versionData.Browser}`);

    // Create a new tab
    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    const cdp = new CdpClient(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    console.log(`[4/4] Navigating to http://127.0.0.1:${PREVIEW_PORT}/ and testing viewports...\n`);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PREVIEW_PORT}/` });
    await sleep(1500);

    let allPassed = true;
    const summary = [];

    const routes = [
      { name: 'Dashboard (الرئيسية)', selector: 'button[aria-label="الرئيسية"]' },
      { name: 'Transactions (المعاملات)', selector: 'button[aria-label="المعاملات"]' },
      { name: 'Accounts (المحافظ)', selector: 'button[aria-label="المحافظ والحسابات"]' },
      { name: 'Reports (التقارير)', selector: 'button[aria-label="التقارير والتحليلات"]' }
    ];

    for (const vp of targetViewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: true
      });
      await sleep(150);

      for (const route of routes) {
        // Click navigation tab
        await cdp.eval(`
          (() => {
            const btn = document.querySelector('${route.selector}');
            if (btn) btn.click();
          })()
        `);
        await sleep(250);

        // Check horizontal overflow
        const metrics = await cdp.eval(`
          (() => {
            // Find any overflowing elements (checking bounding client rect and offsetWidth)
            const doc = document.documentElement;
            const body = document.body;
            const scrollWidth = doc.scrollWidth;
            const clientWidth = doc.clientWidth;
            const bodyScrollWidth = body.scrollWidth;
            const bodyClientWidth = body.clientWidth;

            const overflowing = [];
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
              const rect = el.getBoundingClientRect();
              if (rect.right > clientWidth + 0.5 || el.scrollWidth > clientWidth) {
                const id = el.id ? '#' + el.id : '';
                const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '';
                overflowing.push(el.tagName.toLowerCase() + id + cls + ' (r:' + Math.round(rect.right * 10) / 10 + ', sw:' + el.scrollWidth + ' vs cw:' + clientWidth + ')');
              }
            }

            const isOverflowing = scrollWidth > clientWidth || bodyScrollWidth > clientWidth;
            return {
              scrollWidth,
              clientWidth,
              bodyScrollWidth,
              bodyClientWidth,
              isOverflowing,
              overflowingSample: overflowing.slice(0, 10)
            };
          })()
        `);

        const isOk = !metrics.isOverflowing;
        if (!isOk) allPassed = false;

        const statusStr = isOk ? 'PASS' : 'FAIL';
        console.log(`[${statusStr}] ${vp.name.padEnd(24)} (${vp.width}x${vp.height}) - ${route.name}: scrollWidth=${metrics.scrollWidth}px, clientWidth=${metrics.clientWidth}px`);
        if (!isOk) {
          console.error(`       Overflow elements sample:`, metrics.overflowingSample);
        }

        summary.push({
          viewport: vp.name,
          dimensions: `${vp.width}x${vp.height}`,
          route: route.name,
          scrollWidth: metrics.scrollWidth,
          clientWidth: metrics.clientWidth,
          passed: isOk
        });
      }

      // Smoke test Quick Add overlay on this viewport
      await cdp.eval(`
        (() => {
          const fab = document.querySelector('.mobile-center-fab');
          if (fab) fab.click();
        })()
      `);
      await sleep(250);

      const qaMetrics = await cdp.eval(`
        (() => {
          const doc = document.documentElement;
          const isOverflowing = doc.scrollWidth > doc.clientWidth;
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            isOverflowing
          };
        })()
      `);

      const qaOk = !qaMetrics.isOverflowing;
      if (!qaOk) allPassed = false;
      console.log(`[${qaOk ? 'PASS' : 'FAIL'}] ${vp.name.padEnd(24)} (${vp.width}x${vp.height}) - Quick Add Open: scrollWidth=${qaMetrics.scrollWidth}px, clientWidth=${qaMetrics.clientWidth}px`);

      // Close Quick Add
      await cdp.eval(`
        (() => {
          const closeBtn = document.querySelector('.quick-add-close-btn');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await sleep(150);
    }

    cdp.close();

    console.log('\n====================================================');
    if (allPassed) {
      console.log('✅ ALL MOBILE VIEWPORTS & ROUTES SATISFY scrollWidth <= clientWidth');
      console.log('   Zero horizontal overflow detected across 320px to 430px+!');
      console.log('====================================================\n');
      process.exit(0);
    } else {
      console.error('❌ HORIZONTAL OVERFLOW DETECTED ON ONE OR MORE ROUTES/VIEWPORTS');
      console.log('====================================================\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  } finally {
    cleanup();
  }
}

run();
