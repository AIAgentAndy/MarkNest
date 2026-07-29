import { expect, test } from '@playwright/test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { rm, mkdir } from 'node:fs/promises';

type OnlineServer = {
  baseUrl: string;
  close: () => Promise<void>;
  requestedPaths: () => string[];
};

// 启动本地 HTTP 服务器，分别返回原始 Markdown（text/markdown）与 HTML 网页（text/html），
// 用于验证扩展对“在线 Markdown”的接管策略：原始文本正常渲染，HTML 网页不接管以免卡死浏览器。
async function startOnlineMarkdownServer(): Promise<OnlineServer> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const urlPath = req.url ?? '/';
    requests.push(urlPath);
    if (urlPath === '/raw.md') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end('# Raw Online\n\n在线原始 Markdown 正文。');
      return;
    }
    if (urlPath === '/page.md') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
          '<h1>HTML Page</h1><p>这是一个已渲染的 HTML 网页，并非原始 Markdown。</p>' +
          '</body></html>'
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    requestedPaths: () => [...requests]
  };
}

test('在线原始 Markdown 地址在扩展内渲染正文', async ({ browserName, playwright }) => {
  test.skip(browserName !== 'chromium', 'Chrome extension smoke tests require Chromium.');

  const server = await startOnlineMarkdownServer();
  const userDataDir = await mkdir(
    path.join(os.tmpdir(), `marknest-online-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    { recursive: true }
  );
  if (!userDataDir) {
    throw new Error('创建 e2e profile 目录失败。');
  }
  const extensionPath = path.join(process.cwd(), 'dist', 'extension');
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  try {
    await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => undefined);
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/raw.md`);

    await expect(page.locator('#marknest-file-url-root')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Raw Online' })).toBeVisible({ timeout: 15_000 });
    // 在线 Markdown 不扫描远程目录，地址栏保持原始地址。
    await expect(page).toHaveURL(/\/raw\.md$/);
  } finally {
    await context.close();
    await server.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('在线 HTML 网页（如 GitHub blob）不被接管渲染，避免卡死浏览器', async ({ browserName, playwright }) => {
  test.skip(browserName !== 'chromium', 'Chrome extension smoke tests require Chromium.');

  const server = await startOnlineMarkdownServer();
  const userDataDir = await mkdir(
    path.join(os.tmpdir(), `marknest-html-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    { recursive: true }
  );
  if (!userDataDir) {
    throw new Error('创建 e2e profile 目录失败。');
  }
  const extensionPath = path.join(process.cwd(), 'dist', 'extension');
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  try {
    await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => undefined);
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/page.md`);

    // 等待扩展后台拉取该地址（用于判定内容类型），确保接管判定已发生。
    await expect
      .poll(() => server.requestedPaths().filter((p) => p === '/page.md').length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // 该地址返回 HTML 网页，扩展不接管渲染：阅读器不挂载，原始网页内容保持可见。
    await expect(page.locator('#marknest-file-url-root')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'HTML Page' })).toBeVisible();
    // 全局样式未应用到原始页面（body 仍可滚动，未被 overflow:hidden 锁死）。
    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflowY);
    expect(bodyOverflow).not.toBe('hidden');
  } finally {
    await context.close();
    await server.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
