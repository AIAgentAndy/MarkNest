import { expect, test } from '@playwright/test';

test('示例模式展示目录树和 Markdown 阅读区', async ({ page }) => {
  await page.goto('/?sample=1');

  await expect(page.getByRole('button', { name: /architecture\.md/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MarkNest 示例' })).toBeVisible();
  await expect(page.locator('.document-header')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '当前位置' })).toHaveCount(0);

  await page.getByRole('button', { name: /architecture\.md/ }).click();
  await expect(page.getByRole('heading', { name: '架构说明' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '架构说明' })).toBeVisible();
});

test('示例模式支持 Mermaid、大纲切换和顶部折叠', async ({ page }) => {
  await page.goto('/?sample=1');

  await expect(page.locator('.mermaid-block svg')).toBeVisible();

  await page.getByRole('tab', { name: '显示文档大纲' }).click();
  await expect(page.getByRole('button', { name: 'MarkNest 示例', exact: true })).toBeVisible();
  await expect(page.locator('.mermaid-block svg')).toBeVisible();

  await page.getByRole('button', { name: '折叠 MarkNest 示例' }).click();
  await expect(page.getByRole('button', { name: '核心流程' })).toBeHidden();
  await page.getByRole('button', { name: '展开 MarkNest 示例' }).click();
  await expect(page.getByRole('button', { name: '核心流程' })).toBeVisible();

  await page.getByRole('button', { name: '折叠顶部操作区域' }).click();
  await expect(page.getByRole('button', { name: '打开目录' })).toBeHidden();

  await page.getByRole('button', { name: '展开顶部操作区域' }).click();
  await expect(page.getByRole('button', { name: '打开目录' })).toBeVisible();

  const widthBeforeCollapse = await page.locator('.content-pane').boundingBox();
  await page.getByRole('button', { name: '隐藏左侧目录或大纲' }).click();
  await expect(page.getByRole('button', { name: '显示左侧目录或大纲' })).toBeVisible();
  const widthAfterCollapse = await page.locator('.content-pane').boundingBox();
  expect((widthAfterCollapse?.width ?? 0) > (widthBeforeCollapse?.width ?? 0)).toBeTruthy();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'MarkNest 示例' })).toBeVisible();
  await expect(page.getByRole('button', { name: '显示左侧目录或大纲' })).toBeVisible();
});

test('Mermaid 图表全屏预览保留原始尺寸并按需滚动', async ({ page }) => {
  const wideMermaid = [
    '# Wide Mermaid',
    '',
    '```mermaid',
    'flowchart LR',
    ...Array.from({ length: 48 }, (_, index) => {
      const current = `N${index}`;
      const next = `N${index + 1}`;
      return `  ${current}[节点 ${index}] --> ${next}[节点 ${index + 1}]`;
    }),
    '```'
  ].join('\n');

  await page.addInitScript((content) => {
    const fileHandle = {
      kind: 'file',
      name: 'wide-mermaid.md',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () =>
        new File([content], 'wide-mermaid.md', {
          type: 'text/markdown',
          lastModified: 1777651200000
        })
    };

    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [fileHandle]
    });
  }, wideMermaid);

  await page.goto('/');
  await page.getByRole('button', { name: '打开文件' }).click();
  await expect(page.getByRole('heading', { name: 'Wide Mermaid' })).toBeVisible();
  await expect(page.locator('.mermaid-block[data-rendered="true"] svg')).toBeVisible({
    timeout: 15_000
  });

  const fullscreenButton = page.getByRole('button', { name: '全屏查看 Mermaid 图表' }).first();
  await expect(fullscreenButton).toBeVisible({ timeout: 15_000 });
  await fullscreenButton.click();

  const dialog = page.getByRole('dialog', { name: 'Mermaid 图表全屏预览' });
  await expect(dialog).toBeVisible();
  const fullscreenSvg = dialog.locator('svg').first();
  await expect(fullscreenSvg).toBeVisible();

  const fullscreenMetrics = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.mermaid-fullscreen-stage');
    const svg = document.querySelector<SVGSVGElement>('.mermaid-fullscreen-content svg');
    if (!stage || !svg) {
      return null;
    }

    const svgBox = svg.getBoundingClientRect();
    const viewBoxWidth = svg.viewBox.baseVal.width;
    return {
      canScrollIfDiagramOverflows: getComputedStyle(stage).overflowX === 'auto',
      keepsOriginalViewBoxWidth: Math.abs(svgBox.width - viewBoxWidth) < 1,
      verticalScrollEnabled: getComputedStyle(stage).overflowY === 'auto'
    };
  });

  expect(fullscreenMetrics).toEqual({
    canScrollIfDiagramOverflows: true,
    keepsOriginalViewBoxWidth: true,
    verticalScrollEnabled: true
  });

  const scaleSlider = page.getByRole('slider', { name: '缩小 Mermaid 图表' });
  await expect(scaleSlider).toBeVisible();
  await expect(scaleSlider).toHaveAttribute('aria-orientation', 'vertical');
  await expect(dialog.locator('.mermaid-fullscreen-zoom-track')).toBeVisible();
  await scaleSlider.press('End');
  await expect(scaleSlider).toHaveAttribute('aria-valuenow', '15');

  await expect
    .poll(() =>
      page.evaluate(() => {
        const content = document.querySelector<HTMLElement>('.mermaid-fullscreen-content');
        const svg = document.querySelector<SVGSVGElement>('.mermaid-fullscreen-content svg');
        if (!content || !svg) {
          return null;
        }

        const viewBoxWidth = svg.viewBox.baseVal.width;
        return {
          contentWidth: content.getBoundingClientRect().width,
          expectedScaledWidth: viewBoxWidth * 0.15,
          svgWidth: svg.getBoundingClientRect().width
        };
      })
    )
    .toEqual(
      expect.objectContaining({
        contentWidth: expect.any(Number),
        expectedScaledWidth: expect.any(Number),
        svgWidth: expect.any(Number)
      })
    );

  const scaledMetrics = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.mermaid-fullscreen-content');
    const svg = document.querySelector<SVGSVGElement>('.mermaid-fullscreen-content svg');
    if (!content || !svg) {
      return null;
    }

    return {
      contentWidth: Math.round(content.getBoundingClientRect().width),
      expectedScaledWidth: Math.round(svg.viewBox.baseVal.width * 0.15),
      svgWidth: Math.round(svg.getBoundingClientRect().width)
    };
  });
  expect(scaledMetrics?.contentWidth).toBe(scaledMetrics?.expectedScaledWidth);
  expect(scaledMetrics?.svgWidth).toBe(scaledMetrics?.expectedScaledWidth);

  await page.getByRole('button', { name: '退出全屏 Mermaid 图表' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.mermaid-block svg').first()).toBeVisible();
});

test('右侧正文独立滚动时左侧大纲固定并高亮当前标题', async ({ page }) => {
  const markdown = createOutlineMarkdownFixture();

  await page.addInitScript((content) => {
    const fileHandle = {
      kind: 'file',
      name: '项目架构设计文档.md',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () =>
        new File([content], '项目架构设计文档.md', {
          type: 'text/markdown',
          lastModified: 1777651200000
        })
    };

    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [fileHandle]
    });
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => null
    });
  }, markdown);

  await page.goto('/');
  await page.getByRole('button', { name: '打开文件' }).click();
  await expect(page.getByRole('heading', { name: 'Code And Design 项目架构设计文档' })).toBeVisible();
  await page.getByRole('tab', { name: '显示文档大纲' }).click();

  const sidebarBoxBeforeScroll = await page.locator('.sidebar').boundingBox();
  await page.locator('[id="7-高精度分析-v3-流程"]').evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
  });
  await expect(page.locator('.outline-row[aria-current="location"]')).toHaveText('7. 高精度分析 V3 流程');
  const sidebarBoxAfterScroll = await page.locator('.sidebar').boundingBox();
  expect(Math.round(sidebarBoxAfterScroll?.y ?? 0)).toBe(Math.round(sidebarBoxBeforeScroll?.y ?? 0));

  await page.locator('[id="71-文件级流程图"]').evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.locator('.content-pane').evaluate((element) => {
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.outline-row[aria-current="location"]')).toHaveText('7.1 文件级流程图');

  await page.getByRole('button', { name: '7.3 语言事实抽取' }).click();
  await expect(page.locator('[id="73-语言事实抽取"]')).toBeInViewport();
});

test('大文件阅读时支持取消选择、返回顶部和快速打开关于', async ({ page }) => {
  const markdown = await readLargeMarkdownFixture();

  await page.addInitScript((content) => {
    const fileHandle = {
      kind: 'file',
      name: 'KnowledgeBaseService.md',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () =>
        new File([content], 'KnowledgeBaseService.md', {
          type: 'text/markdown',
          lastModified: 1777651200000
        })
    };

    let shouldCancel = false;
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        if (shouldCancel) {
          throw new DOMException('The user aborted a request.', 'AbortError');
        }

        shouldCancel = true;
        return [fileHandle];
      }
    });
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
    });
  }, markdown);

  await page.goto('/');
  await page.getByRole('button', { name: '打开文件' }).click();
  await expect(page.getByRole('heading', { name: 'KnowledgeBaseService 设计文档' })).toBeVisible({
    timeout: 10_000
  });
  await expect(page.locator('.document-header')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '当前位置' })).toHaveCount(0);

  await page.getByRole('button', { name: '打开文件' }).click();
  await expect(page.getByText('Failed to execute')).toBeHidden();
  await expect(page.locator('.notice-error')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'KnowledgeBaseService 设计文档' })).toBeVisible();

  await page.getByRole('button', { name: '打开目录' }).click();
  await expect(page.getByText('Failed to execute')).toBeHidden();
  await expect(page.locator('.notice-error')).toBeHidden();

  await page.locator('.content-pane').evaluate((element) => {
    element.scrollTop = element.clientHeight + 120;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(page.getByRole('button', { name: '返回顶部' })).toBeVisible();

  await page.getByRole('button', { name: '返回顶部' }).click();
  await expect
    .poll(() => page.locator('.content-pane').evaluate((element) => element.scrollTop))
    .toBeLessThan(4);
  await expect(page.getByRole('button', { name: '返回顶部' })).toBeHidden();

  await page.locator('.content-pane').evaluate((element) => {
    element.scrollTop = element.clientHeight + 240;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(page.getByRole('button', { name: '返回顶部' })).toBeVisible();
  await page.getByRole('button', { name: '关于' }).click();
  await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible();
  await expect(page.locator('.about-panel')).toHaveCSS('padding-bottom', '16px');
});

test('大文件大纲跳转不会泄漏 Mermaid 错误图或滚走顶部操作区', async ({ page }) => {
  const markdown = await readLargeMarkdownFixture();

  await page.addInitScript((content) => {
    const fileHandle = {
      kind: 'file',
      name: 'KnowledgeBaseService.md',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () =>
        new File([content], 'KnowledgeBaseService.md', {
          type: 'text/markdown',
          lastModified: 1777651200000
        })
    };

    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [fileHandle]
    });
  }, markdown);

  await page.goto('/');
  await page.getByRole('button', { name: '打开文件' }).click();
  await expect(page.getByRole('heading', { name: 'KnowledgeBaseService 设计文档' })).toBeVisible({
    timeout: 10_000
  });

  await page.getByRole('tab', { name: '显示文档大纲' }).click();
  await page.getByRole('button', { name: '方法级详细设计', exact: true }).click();
  await page.getByRole('button', { name: 'Mermaid 流程图', exact: true }).first().click();

  await expect(page.getByRole('button', { name: '打开目录' })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开文件' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关于' })).toBeVisible();
  await expect(page.getByText('Syntax error in text')).toBeHidden();

  await page.locator('.content-pane').evaluate((element) => {
    element.scrollTop = element.clientHeight + 80;
    element.dispatchEvent(new Event('scroll'));
  });
  await page.getByRole('button', { name: '返回顶部' }).click();
  await expect(page.getByRole('button', { name: '打开目录' })).toBeVisible();
  await expect(page.getByText('Syntax error in text')).toBeHidden();
});

test('刷新目录后同步新增和删除的 Markdown 文件', async ({ page }) => {
  await page.addInitScript(() => {
    const createFileHandle = (name: string, content: string) => ({
      kind: 'file',
      name,
      getFile: async () =>
        new File([content], name, {
          type: 'text/markdown',
          lastModified: 1777651200000
        })
    });

    const readmeFile = createFileHandle('README.md', '# README');
    const addedFile = createFileHandle('added.md', '# Added');
    let scanCount = 0;
    const rootHandle = {
      kind: 'directory',
      name: 'docs',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      async *values() {
        scanCount += 1;
        if (scanCount === 1) {
          yield readmeFile;
          return;
        }

        yield addedFile;
      }
    };

    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => rootHandle
    });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => []
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '打开目录' }).click();
  await expect(page.getByRole('button', { name: /README\.md/ })).toBeVisible();

  await page.getByRole('button', { name: '刷新目录' }).click();
  await expect(page.getByRole('button', { name: /added\.md/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /README\.md/ })).toBeHidden();
  await expect(page.getByText('目录已刷新，原选中文件已不存在。')).toBeVisible();
});

function readLargeMarkdownFixture() {
  return createLargeMarkdownFixture();
}

function createOutlineMarkdownFixture() {
  return [
    '# Code And Design 项目架构设计文档',
    '',
    '## 1. 项目定位',
    '',
    'Code And Design 是一个用于验证大纲滚动的本地测试文档。',
    '',
    ...Array.from({ length: 20 }, (_, index) =>
      [`## ${index + 2}. 章节 ${index + 1}`, '', `这是第 ${index + 1} 个章节的正文内容。`].join('\n')
    ),
    '',
    '## 7. 高精度分析 V3 流程',
    '',
    '这段内容用于验证左侧大纲固定并高亮当前标题。',
    '',
    '### 7.1 文件级流程图',
    '',
    ...Array.from({ length: 16 }, (_, index) => `文件级流程图说明段落 ${index + 1}，用于撑开子标题阅读区。`),
    '',
    '```mermaid',
    'flowchart LR',
    '  A[扫描文件] --> B[构建大纲]',
    '  B --> C[阅读定位]',
    '```',
    '',
    '### 7.2 结构化事件',
    '',
    '用于制造层级大纲。',
    '',
    '### 7.3 语言事实抽取',
    '',
    '大纲点击后应滚动到这里。'
  ].join('\n');
}

function createLargeMarkdownFixture() {
  const repeatedSections = Array.from({ length: 160 }, (_, index) => {
    const sequence = index + 1;
    return [
      `### documentIndex 场景 ${sequence}`,
      '',
      '| 字段名 | 类型 | 主要使用场景 |',
      '| --- | --- | --- |',
      `| documentRepository${sequence} | DocumentRepository | 文档索引读写 |`,
      `| outlineCache${sequence} | OutlineCache | 大纲缓存刷新 |`,
      '',
      `这是第 ${sequence} 段用于撑起大文件滚动和分片渲染的正文。`
    ].join('\n');
  }).join('\n\n');

  return [
    '# KnowledgeBaseService 设计文档',
    '',
    '## 背景介绍',
    '',
    'KnowledgeBaseService 是一个示例文档工作区中的知识库索引服务，用于验证长文档阅读体验。',
    '',
    repeatedSections,
    '',
    '## 方法级详细设计',
    '',
    '### 方法签名与业务职责',
    '',
    '文档索引维护、大纲缓存刷新、阅读状态恢复与本地通知更新。',
    '',
    '### Mermaid 流程图',
    '',
    '```mermaid',
    'flowchart TD',
    '  A[开始] --> B{校验文档路径}',
    '  B -->|通过| C[保存索引记录]',
    '  C --> D[结束]',
    '```',
    '',
    '### Mermaid 流程图',
    '',
    '```mermaid',
    'flowchart TD',
    '  A[开始] --> B{这段故意保留较复杂的中文节点}',
    '  B --> C[继续]',
    '```',
    '',
    '## 证据索引',
    '',
    '用于验证大纲跳转和顶部操作区保持可见。'
  ].join('\n');
}
