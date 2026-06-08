import { expect, test } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('打包后的 Chrome 扩展在 file:// Markdown 页面内直渲染并识别目录树', async ({
  browserName,
  playwright
}) => {
  test.skip(browserName !== 'chromium', 'Chrome extension smoke tests require Chromium.');

  const fixtureDir = await createMarkdownFixture();
  const userDataDir = await mkdir(path.join(os.tmpdir(), `marknest-profile-${Date.now()}-${randomSuffix()}`), {
    recursive: true
  });
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
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    }
    expect(worker.url()).toContain('background.js');

    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(fixtureDir, 'current.md')).href);

    await expect(page).toHaveURL(/^file:\/\/\/.*current\.md$/);
    await expect(page).toHaveTitle('current.md');
    await expect(page.locator('#marknest-file-url-root')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('link[rel="icon"][href^="chrome-extension://"][href$="/icons/icon-32.png"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Current Fixture' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.mermaid-block[data-rendered="true"] svg')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.file-url-app-shell')).toHaveAttribute('data-sidebar-collapsed', 'true');
    await page.getByRole('button', { name: '显示左侧目录或大纲' }).click();
    await expect(page.locator('.file-url-app-shell')).toHaveAttribute('data-sidebar-collapsed', 'false');
    await expect(page.getByRole('tab', { name: '显示文档大纲' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Current Fixture' })).toBeVisible();
    await page.getByRole('tab', { name: '显示文件目录' }).click();
    await expect(page.getByText('3 个 Markdown')).toBeVisible();
    await expect(page.getByRole('button', { name: /README\.md/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /sub/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /guide\.markdown/ })).toHaveCount(0);

    await page.getByRole('button', { name: /sub/ }).click();
    await page.getByRole('button', { name: /guide\.markdown/ }).click();
    await expect(page.getByRole('heading', { name: 'Guide Fixture' })).toBeVisible();

    const resizer = page.getByRole('separator', { name: '调整目录和正文宽度' });
    const resizerBox = await resizer.boundingBox();
    if (!resizerBox) {
      throw new Error('目录和正文之间的分隔线需要可见。');
    }
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 12);
    await page.mouse.down();
    await page.mouse.move(420, resizerBox.y + 12);
    await page.mouse.up();
    await expect
      .poll(async () => page.locator('.file-url-app-shell').evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--sidebar-width').trim()
      ))
      .toBe('420px');

    await expect(page.getByRole('button', { name: '打开目录' })).toHaveCount(0);
    await page.getByRole('button', { name: '显示阅读菜单' }).click();
    await expect(page.locator('.file-url-app-shell')).toHaveAttribute('data-controls-visible', 'true');
    await expect(page.getByRole('menu', { name: '阅读菜单' })).toBeVisible();
    await expect(page.getByRole('button', { name: '切换原始内容' })).toBeVisible();
    await expect(page.getByRole('button', { name: '打开目录' })).toHaveCount(0);
    await page.getByRole('button', { name: '隐藏阅读菜单' }).click();
    await expect(page.getByRole('button', { name: '打开目录' })).toHaveCount(0);
  } finally {
    await context.close();
    await rm(fixtureDir, { recursive: true, force: true });
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('打包后的 Chrome 扩展引导页可打开示例并进入新版阅读器', async ({
  browserName,
  playwright
}) => {
  test.skip(browserName !== 'chromium', 'Chrome extension smoke tests require Chromium.');

  const userDataDir = await mkdir(path.join(os.tmpdir(), `marknest-profile-${Date.now()}-${randomSuffix()}`), {
    recursive: true
  });
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
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    }
    const extensionId = worker.url().split('/')[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/support.html`);
    await expect(page.getByRole('heading', { name: 'MarkNest 使用引导' })).toBeVisible();
    await expect(page.getByText('直接用 Chrome 打开本地或在线 Markdown 文件')).toBeVisible();
    await expect(page.getByRole('button', { name: '打开文件' })).toHaveCount(0);
    await expect(page.locator('link[rel="icon"][href="icons/icon-32.png"]')).toHaveCount(1);

    const pagesBeforeDetailsClick = context.pages().length;
    await page.getByRole('button', { name: '扩展详情页', exact: true }).click();
    await expect(page.getByText('已复制扩展详情页地址')).toBeVisible();
    expect(context.pages()).toHaveLength(pagesBeforeDetailsClick);

    await page.getByRole('button', { name: '关于' }).click();
    const aboutPanel = page.locator('[data-about-panel]');
    await expect(aboutPanel).toBeVisible();
    await expect(aboutPanel).toHaveClass(/about-strip/);
    await expect(page.getByRole('link', { name: /GitHub/ })).toBeVisible();
    const topbarBox = await page.locator('.topbar').boundingBox();
    const aboutBox = await aboutPanel.boundingBox();
    expect(Math.round(aboutBox?.y ?? 0)).toBe(Math.round((topbarBox?.y ?? 0) + (topbarBox?.height ?? 0)));
    await page.getByRole('button', { name: '关于' }).click();
    await expect(aboutPanel).toBeHidden();

    const [samplePage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: '示例' }).click()
    ]);
    await samplePage.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(`chrome-extension://${extensionId}/support.html`);
    await expect(samplePage).toHaveURL(`chrome-extension://${extensionId}/reader.html?launch=sample`);
    await expect(samplePage.locator('#marknest-file-url-root')).toBeVisible({ timeout: 15_000 });
    await expect(samplePage.getByRole('heading', { name: 'MarkNest 示例' })).toBeVisible({ timeout: 15_000 });
    await expect(samplePage.locator('code').filter({ hasText: 'E = mc^2' }).first()).toBeVisible();
    await expect(samplePage.getByRole('table')).toBeVisible();
    await expect(samplePage.locator('code').filter({ hasText: 'createWorkspace' })).toBeVisible();
    await expect(samplePage.locator('.katex').first()).toBeVisible({ timeout: 15_000 });
    await expect(samplePage.locator('.mermaid-block[data-rendered="true"] svg')).toBeVisible({ timeout: 15_000 });
    await expect(samplePage.locator('.file-url-app-shell')).toHaveAttribute('data-sidebar-collapsed', 'true');
    await expect(samplePage.getByRole('button', { name: '打开目录' })).toHaveCount(0);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

async function createMarkdownFixture(): Promise<string> {
  const fixtureDir = await mkdir(path.join(os.tmpdir(), `marknest-e2e-${Date.now()}-${randomSuffix()}`), {
    recursive: true
  });
  if (!fixtureDir) {
    throw new Error('创建 e2e fixture 目录失败。');
  }

  await mkdir(path.join(fixtureDir, 'sub'), { recursive: true });
  await writeFile(
    path.join(fixtureDir, 'current.md'),
    [
      '# Current Fixture',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[Start] --> B[Done]',
      '```'
    ].join('\n'),
    'utf8'
  );
  await writeFile(path.join(fixtureDir, 'README.md'), '# README Fixture\n\n首页', 'utf8');
  await writeFile(path.join(fixtureDir, 'sub', 'guide.markdown'), '# Guide Fixture\n\n说明', 'utf8');
  return fixtureDir;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2);
}
