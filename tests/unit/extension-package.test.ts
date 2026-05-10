import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionDir = path.join(process.cwd(), 'dist', 'extension');
const sourceManifestPath = path.join(process.cwd(), 'extension', 'manifest.json');
const packagePath = path.join(process.cwd(), 'package.json');
const layoutPath = path.join(process.cwd(), 'src', 'app', 'layout.tsx');
const readerAppPath = path.join(process.cwd(), 'src', 'features', 'workspace', 'components', 'reader-app.tsx');

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
      content_scripts?: Array<{ matches?: string[]; js?: string[]; run_at?: string }>;
    };

    expect(manifest.name).toBe('MarkNest');
    expect((manifest as { short_name?: string }).short_name).toBe('MarkNest');
    expect(manifest.description).toContain('本地');
    expect(manifest.description).toContain('Markdown');
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(manifest.action?.default_title).toBe('打开 MarkNest');
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toEqual(['file:///*']);
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['file:///*.md', 'file:///*.markdown', 'file:///*.mdown', 'file:///*.mkd'],
        js: ['file-launch-content-script.js'],
        run_at: 'document_idle'
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
