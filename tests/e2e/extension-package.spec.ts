import { expect, test } from '@playwright/test';
import path from 'node:path';

test('打包后的 Chrome 扩展示例模式渲染 Mermaid 图表', async ({ browserName, playwright }) => {
  test.skip(browserName !== 'chromium', 'Chrome extension smoke tests require Chromium.');

  const extensionPath = path.join(process.cwd(), 'dist', 'extension');
  const context = await playwright.chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }

    const extensionId = worker.url().split('/')[2];
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/index.html?sample=1`);

    const mermaidBlock = page.locator('.mermaid-block').first();
    await expect(mermaidBlock.locator('svg')).toBeVisible();
    await expect(mermaidBlock).toHaveAttribute('data-rendered', 'true');
    await expect(mermaidBlock).not.toHaveAttribute('data-error', /.+/);
    await expect(page.getByText('flowchart LR')).toBeHidden();
  } finally {
    await context.close();
  }
});
