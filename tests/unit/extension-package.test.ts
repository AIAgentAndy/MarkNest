import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionDir = path.join(process.cwd(), 'dist', 'extension');
const sourceManifestPath = path.join(process.cwd(), 'extension', 'manifest.json');
const packagePath = path.join(process.cwd(), 'package.json');
const layoutPath = path.join(process.cwd(), 'src', 'app', 'layout.tsx');
const readerAppPath = path.join(process.cwd(), 'src', 'features', 'workspace', 'components', 'reader-app.tsx');
const sampleWorkspacePath = path.join(process.cwd(), 'src', 'features', 'workspace', 'lib', 'sample-workspace.ts');

describe('Chrome 扩展打包产物', () => {
  it('项目、页面和阅读器外壳统一使用 MarkNest 品牌', async () => {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { name: string };
    const layout = await readFile(layoutPath, 'utf8');
    const readerApp = await readFile(readerAppPath, 'utf8');

    expect(packageJson.name).toBe('marknest');
    expect(layout).toContain("title: 'MarkNest'");
    expect(readerApp).toContain('<strong>MarkNest</strong>');
    expect(readerApp).toContain('className="brand-logo"');
    expect(readerApp).toContain('viewBox="0 0 128 128"');
    expect(readerApp).toContain('M12 96V32L39 80L66 32V96');
    expect(readerApp).toContain('M74 96V32L116 96V32');
  });

  it('源 Manifest 使用 MarkNest 品牌和适合上架的本地优先描述', async () => {
    const manifest = JSON.parse(await readFile(sourceManifestPath, 'utf8')) as {
      name: string;
      description: string;
      action?: { default_title?: string };
      permissions?: string[];
      host_permissions?: string[];
      content_scripts?: Array<{ matches?: string[]; js?: string[]; css?: string[]; run_at?: string }>;
      web_accessible_resources?: Array<{ resources?: string[]; matches?: string[] }>;
    };

    expect(manifest.name).toBe('MarkNest');
    expect((manifest as { short_name?: string }).short_name).toBe('MarkNest');
    expect(manifest.description).toContain('本地');
    expect(manifest.description).toContain('Markdown');
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(manifest.action?.default_title).toBe('打开 MarkNest');
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toEqual(['file:///*', 'http://*/*', 'https://*/*']);
    expect(manifest.content_scripts).toEqual([
      {
        matches: [
          'file:///*.md',
          'file:///*.markdown',
          'file:///*.mdown',
          'file:///*.mkd',
          'http://*/*.md*',
          'http://*/*.markdown*',
          'http://*/*.mdown*',
          'http://*/*.mkd*',
          'https://*/*.md*',
          'https://*/*.markdown*',
          'https://*/*.mdown*',
          'https://*/*.mkd*',
          'file://*/*/',
          'file:///'
        ],
        js: ['file-url-inline-boot.js'],
        run_at: 'document_idle'
      }
    ]);
    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ['icons/*', 'about/*', 'file-url-inline-entry.css', 'file-url-inline-entry.js', 'file-url-inline-assets/*'],
        matches: ['file:///*', 'http://*/*', 'https://*/*']
      }
    ]);
  });

  it('项目包和扩展 Manifest 版本号统一为 1.0.0', async () => {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { version: string };
    const packageLock = JSON.parse(await readFile(path.join(process.cwd(), 'package-lock.json'), 'utf8')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const manifest = JSON.parse(await readFile(sourceManifestPath, 'utf8')) as { version: string };

    expect(packageJson.version).toBe('1.0.0');
    expect(packageLock.version).toBe('1.0.0');
    expect(packageLock.packages[''].version).toBe('1.0.0');
    expect(manifest.version).toBe('1.0.0');
  });

  it('工具栏入口指向的支持说明被打入扩展产物', async () => {
    expect(existsSync(path.join(extensionDir, 'SUPPORT.md'))).toBe(true);
    expect(existsSync(path.join(extensionDir, 'support.html'))).toBe(true);
    expect(existsSync(path.join(extensionDir, 'reader.html'))).toBe(true);
    expect(existsSync(path.join(extensionDir, 'index.html'))).toBe(false);
    expect(existsSync(path.join(extensionDir, '404.html'))).toBe(false);
    expect(existsSync(path.join(extensionDir, 'next-assets'))).toBe(false);

    const supportMarkdown = await readFile(path.join(extensionDir, 'SUPPORT.md'), 'utf8');
    expect(supportMarkdown.startsWith('\uFEFF')).toBe(true);
    expect(supportMarkdown).toContain('MarkNest 支持');

    const supportHtml = await readFile(path.join(extensionDir, 'support.html'), 'utf8');
    expect(supportHtml).toContain('<meta charset="utf-8">');
    expect(supportHtml).toContain('<link rel="icon" type="image/png" href="icons/icon-32.png">');
    expect(supportHtml).toContain('MarkNest 使用引导');
    expect(supportHtml).toContain('直接用 Chrome 打开本地或在线 Markdown 文件');
    expect(supportHtml).toContain('允许访问文件网址');
    expect(supportHtml).toContain('chrome://extensions/?id=');
    expect(supportHtml).toContain('data-extension-details-button');
    expect(supportHtml).toContain('data-sample-button');
    expect(supportHtml).toContain('data-about-panel');
    expect(supportHtml).toContain('about-strip');
    expect(supportHtml).toContain('title="GitHub"');
    expect(supportHtml).toContain('title="点击复制作者邮箱地址（AIAgentAndy001@gmail.com）"');
    expect(supportHtml).toContain('title="扫码加我微信（备注：MarkNest）"');
    expect(supportHtml).toContain('title="扫码请作者喝杯饮料，感谢~"');
    expect(supportHtml).toContain('data-copy-email-button');
    expect(supportHtml).toContain('wx.png');
    expect(supportHtml).toContain('coffee.png');
    expect(supportHtml).toContain('所有读取都发生在浏览器本地');
    expect(supportHtml).not.toContain('data-open-file-button');
    expect(supportHtml).not.toContain('打开文件');
    expect(supportHtml).not.toContain('打开目录');

    const supportScript = await readFile(path.join(extensionDir, 'support.js'), 'utf8');
    expect(supportScript).toContain('navigator.clipboard.writeText(detailsUrl)');
    expect(supportScript).toContain('已复制扩展详情页地址');
    expect(supportScript).toContain('chrome.tabs.create');
    expect(supportScript).toContain('reader.html?launch=sample');
    expect(supportScript).toContain('navigator.clipboard.writeText');
    expect(supportScript).toContain('AIAgentAndy001@gmail.com');
    expect(supportScript).toContain('已复制作者邮箱地址');
    expect(supportScript).not.toContain('window.location.href = chrome.runtime.getURL("reader.html?launch=sample")');
    expect(supportScript).not.toContain('MARKNEST_OPEN_EXTENSION_DETAILS');
    expect(supportScript).not.toContain('chrome.runtime.sendMessage({ type: "MARKNEST_OPEN_EXTENSION_DETAILS" });');
    expect(supportScript).not.toContain('showOpenFilePicker');
    expect(supportScript).not.toContain('chrome.storage.session.set');

    const readerHtml = await readFile(path.join(extensionDir, 'reader.html'), 'utf8');
    expect(readerHtml).toContain('<meta charset="utf-8">');
    expect(readerHtml).toContain('<link rel="icon" type="image/png" href="icons/icon-32.png">');
    expect(readerHtml).toContain('file-url-inline-entry.css');
    expect(readerHtml).toContain('file-url-inline-entry.js');
  });

  it('内置示例覆盖表格、代码、数学公式和 Mermaid 图表', async () => {
    const sampleWorkspace = await readFile(sampleWorkspacePath, 'utf8');

    expect(sampleWorkspace).toContain('| 能力 | 示例 | 状态 |');
    expect(sampleWorkspace).toContain('```ts');
    expect(sampleWorkspace).toContain('$$');
    expect(sampleWorkspace).toContain('E = mc^2');
    expect(sampleWorkspace).toContain('```mermaid');
    expect(sampleWorkspace).toContain('sequenceDiagram');
  });

  it('不包含以下划线开头的文件或目录名', async () => {
    expect(existsSync(extensionDir)).toBe(true);

    const unsafePaths = await collectUnsafePaths(extensionDir);

    expect(unsafePaths).toEqual([]);
  });

  it('静态页面资源引用不再指向 Next.js 默认 _next 目录', async () => {
    expect(existsSync(extensionDir)).toBe(true);

    const textFiles = await collectTextFiles(extensionDir);
    const filesWithUnsafeReference: string[] = [];

    for (const filePath of textFiles) {
      const content = await readFile(filePath, 'utf8');
      if (
        content.includes('/_next/') ||
        content.includes('_next/') ||
        content.includes('/_not-found') ||
        content.includes('"_not-found"')
      ) {
        filesWithUnsafeReference.push(path.relative(extensionDir, filePath));
      }
    }

    expect(filesWithUnsafeReference).toEqual([]);
  });

  it('HTML 不包含会被 Manifest V3 CSP 拦截的可执行内联脚本', async () => {
    const htmlFiles = (await collectTextFiles(extensionDir)).filter(
      (filePath) => path.extname(filePath) === '.html'
    );
    const filesWithInlineScripts: string[] = [];

    for (const filePath of htmlFiles) {
      const content = await readFile(filePath, 'utf8');
      if (/<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/json["'])[^>]*>[\s\S]*?<\/script>/i.test(content)) {
        filesWithInlineScripts.push(path.relative(extensionDir, filePath));
      }
    }

    expect(filesWithInlineScripts).toEqual([]);
  });

  it('打包产物不包含容易触发 Manifest V3 审查误报的 eval fallback', async () => {
    const textFiles = await collectTextFiles(extensionDir);
    const unsafeRuntimeFallbacks: string[] = [];

    for (const filePath of textFiles) {
      const content = await readFile(filePath, 'utf8');
      if (content.includes('Function("return this")') || content.includes("Function('return this')")) {
        unsafeRuntimeFallbacks.push(path.relative(extensionDir, filePath));
      }
    }

    expect(unsafeRuntimeFallbacks).toEqual([]);
  });

  it('file:// 直渲染入口不预加载会被页面根路径解析的动态分包资源', async () => {
    const entry = await readFile(path.join(extensionDir, 'file-url-inline-entry.js'), 'utf8');
    const unsafePreloadDependencies = [
      ...entry.matchAll(/TN\([^)]*,\s*\[[^\]]*file-url-inline-assets\//g)
    ].map((match) => match[0]);

    expect(unsafePreloadDependencies).toEqual([]);
  });

  it('静态内容脚本产物不包含顶层 ESM export', async () => {
    const boot = await readFile(path.join(extensionDir, 'file-url-inline-boot.js'), 'utf8');

    expect(boot).not.toMatch(/^export\s+/m);
  });
});

async function collectUnsafePaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const unsafePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith('_')) {
      unsafePaths.push(path.relative(extensionDir, entryPath));
    }

    if (entry.isDirectory()) {
      unsafePaths.push(...(await collectUnsafePaths(entryPath)));
    }
  }

  return unsafePaths.sort();
}

async function collectTextFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  const textExtensions = new Set(['.html', '.txt', '.js', '.css', '.json', '.svg']);

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(entryPath)));
      continue;
    }

    if (textExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}
