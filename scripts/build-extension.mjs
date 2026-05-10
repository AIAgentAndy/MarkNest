import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const outDir = path.join(root, 'out');
const extensionDir = path.join(root, 'extension');
const distDir = path.join(root, 'dist', 'extension');
const safeAssetDir = 'next-assets';

if (!existsSync(outDir)) {
  throw new Error('缺少 out/ 目录，请先运行 npm run build。');
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(outDir, distDir, { recursive: true });
await cp(path.join(extensionDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
await cp(path.join(extensionDir, 'icons'), path.join(distDir, 'icons'), {
  recursive: true
});

await normalizeChromeReservedNames(distDir);
await rewriteTextAssetReferences(distDir);
await removeEvalGlobalFallbacks(distDir);
await extractInlineScripts(distDir);

const source = await readFile(path.join(extensionDir, 'background.ts'), 'utf8');
await writeFile(path.join(distDir, 'background.js'), transpileExtensionTypeScript(source), 'utf8');

const contentScriptSource = await readFile(path.join(extensionDir, 'file-launch-content-script.ts'), 'utf8');
await writeFile(
  path.join(distDir, 'file-launch-content-script.js'),
  removeModuleExports(transpileExtensionTypeScript(contentScriptSource)),
  'utf8'
);

console.log(`Chrome 扩展产物已生成：${distDir}`);

async function normalizeChromeReservedNames(directory) {
  const nextDir = path.join(directory, '_next');
  if (existsSync(nextDir)) {
    await rename(nextDir, path.join(directory, safeAssetDir));
  }

  await renameReservedEntries(directory);
}

async function renameReservedEntries(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const currentPath = path.join(directory, entry.name);
    const safeName = entry.name.startsWith('_') ? `x-${entry.name.slice(1)}` : entry.name;
    const safePath = path.join(directory, safeName);

    if (safeName !== entry.name) {
      await rename(currentPath, safePath);
    }

    if (entry.isDirectory()) {
      await renameReservedEntries(safePath);
    }
  }
}

async function rewriteTextAssetReferences(directory) {
  const files = await collectTextFiles(directory);

  await Promise.all(
    files.map(async (filePath) => {
      const original = await readFile(filePath, 'utf8');
      const rewritten = rewriteAssetReferences(original);
      if (rewritten !== original) {
        await writeFile(filePath, rewritten, 'utf8');
      }
    })
  );
}

async function extractInlineScripts(directory) {
  const htmlFiles = (await collectTextFiles(directory)).filter(
    (filePath) => path.extname(filePath) === '.html'
  );
  const inlineScriptDir = path.join(directory, safeAssetDir, 'inline-scripts');

  for (const filePath of htmlFiles) {
    const original = await readFile(filePath, 'utf8');
    const scripts = [];
    const rewritten = original.replace(
      /<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi,
      (match, attributes, scriptContent) => {
        if (!isExecutableInlineScript(attributes)) {
          return match;
        }

        const scriptFileName = createInlineScriptFileName(filePath, directory, scripts.length, scriptContent);
        scripts.push({ fileName: scriptFileName, content: scriptContent });

        return `<script${attributes} src="/${safeAssetDir}/inline-scripts/${scriptFileName}"></script>`;
      }
    );

    if (scripts.length === 0) {
      continue;
    }

    await mkdir(inlineScriptDir, { recursive: true });
    await Promise.all(
      scripts.map((script) => writeFile(path.join(inlineScriptDir, script.fileName), script.content, 'utf8'))
    );
    await writeFile(filePath, rewritten, 'utf8');
  }
}

async function removeEvalGlobalFallbacks(directory) {
  const files = await collectTextFiles(directory);

  await Promise.all(
    files.map(async (filePath) => {
      const original = await readFile(filePath, 'utf8');
      const rewritten = rewriteEvalGlobalFallbacks(original);
      if (rewritten !== original) {
        await writeFile(filePath, rewritten, 'utf8');
      }
    })
  );
}

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
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

function isExecutableInlineScript(attributes) {
  const typeMatch = attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
  if (!typeMatch) {
    return true;
  }

  return !new Set(['application/json', 'application/ld+json', 'importmap']).has(typeMatch[1].toLowerCase());
}

function createInlineScriptFileName(htmlFilePath, baseDirectory, index, scriptContent) {
  const relativeHtmlPath = path.relative(baseDirectory, htmlFilePath);
  const safePageName =
    relativeHtmlPath
      .replaceAll(path.sep, '-')
      .replace(/[^a-zA-Z0-9.-]/g, '-')
      .replace(/^-+|-+$/g, '') || 'page';
  const hash = createHash('sha256')
    .update(relativeHtmlPath)
    .update(String(index))
    .update(scriptContent)
    .digest('hex')
    .slice(0, 16);

  return `${safePageName}-${index}-${hash}.js`;
}

function rewriteAssetReferences(content) {
  return content
    .replaceAll('/_next/', `/${safeAssetDir}/`)
    .replaceAll('"_not-found"', '"x-not-found"')
    .replaceAll('"/_not-found"', '"/x-not-found"')
    .replaceAll('/_not-found', '/x-not-found')
    .replaceAll('"_not-found"', '"x-not-found"')
    .replaceAll('"/_app"', '"/x-app"')
    .replaceAll('"/_error"', '"/x-error"')
    .replaceAll('"static/chunks/pages/_app-', '"static/chunks/pages/x-app-')
    .replaceAll('"static/chunks/pages/_error-', '"static/chunks/pages/x-error-')
    .replaceAll('static/chunks/app/_not-found/', 'static/chunks/app/x-not-found/')
    .replaceAll('_N_E:', 'N_E:')
    .replaceAll('_next/', `${safeAssetDir}/`)
    .replaceAll('/_next', `/${safeAssetDir}`);
}

function rewriteEvalGlobalFallbacks(content) {
  return content
    .replaceAll('return this||Function("return this")()', 'return this||window')
    .replaceAll('||Function("return this")()', '||globalThis')
    .replaceAll('||Function(\'return this\')()', '||globalThis')
    .replaceAll('=Function("return this")()', '=globalThis')
    .replaceAll('=Function(\'return this\')()', '=globalThis');
}

function transpileExtensionTypeScript(content) {
  return ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false
    }
  }).outputText;
}

function removeModuleExports(content) {
  return content.replace(/^export\s+/gm, '');
}
