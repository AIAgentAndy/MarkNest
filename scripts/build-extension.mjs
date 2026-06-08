import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const extensionDir = path.join(root, 'extension');
const distDir = path.join(root, 'dist', 'extension');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(path.join(extensionDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
await copySupportMarkdownWithUtf8Bom();
await cp(path.join(extensionDir, 'icons'), path.join(distDir, 'icons'), {
  recursive: true
});
await cp(path.join(root, 'public', 'about'), path.join(distDir, 'about'), {
  recursive: true
});

const source = await readFile(path.join(extensionDir, 'background.ts'), 'utf8');
await writeFile(path.join(distDir, 'background.js'), transpileExtensionTypeScript(source), 'utf8');

const contentScriptSource = await readFile(path.join(extensionDir, 'file-launch-content-script.ts'), 'utf8');
await writeFile(
  path.join(distDir, 'file-launch-content-script.js'),
  removeModuleExports(transpileExtensionTypeScript(contentScriptSource)),
  'utf8'
);
const fileUrlInlineBootSource = await readFile(path.join(extensionDir, 'file-url-inline-boot.ts'), 'utf8');
await writeFile(
  path.join(distDir, 'file-url-inline-boot.js'),
  transpileExtensionTypeScript(fileUrlInlineBootSource),
  'utf8'
);
await bundleFileUrlInlineEntry();
await normalizeChromeReservedNames(distDir);
await removeEvalGlobalFallbacks(distDir);

console.log(`Chrome 扩展产物已生成：${distDir}`);

async function copySupportMarkdownWithUtf8Bom() {
  const supportMarkdown = await readFile(path.join(root, 'SUPPORT.md'), 'utf8');
  // Chrome 直接打开 chrome-extension://.../*.md 时没有 charset 头，BOM 用于稳定中文编码识别。
  const normalizedMarkdown = supportMarkdown.replace(/^\uFEFF/, '');
  await writeFile(path.join(distDir, 'SUPPORT.md'), `\uFEFF${normalizedMarkdown}`, 'utf8');
  await writeFile(path.join(distDir, 'support.html'), createSupportHtml(normalizedMarkdown), 'utf8');
  await writeFile(path.join(distDir, 'support.js'), createSupportScript(), 'utf8');
  await writeFile(path.join(distDir, 'reader.html'), createReaderHtml(), 'utf8');
}

function createSupportHtml(markdown) {
  const extensionDetailsUrl = 'chrome://extensions/?id=';
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <link rel="icon" type="image/png" href="icons/icon-32.png">',
    '  <title>MarkNest 使用引导</title>',
    '  <style>',
    '    :root { color-scheme: light; --bg: #f7fbf9; --surface: #fff; --muted: #64748b; --text: #1b2535; --border: #d7e0ea; --accent: #0f766e; --soft: #dff8ed; }',
    '    * { box-sizing: border-box; }',
    '    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.7; }',
    '    .topbar { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 18px; background: color-mix(in srgb, var(--surface) 94%, transparent); box-shadow: 0 1px 0 color-mix(in srgb, var(--border) 70%, transparent); }',
    '    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }',
    '    .brand-logo { width: 42px; height: 42px; flex: 0 0 42px; }',
    '    .brand-logo-primary { stroke: var(--accent); }',
    '    .brand-logo-bright { stroke: #10b981; }',
    '    .brand strong { display: block; font-size: 14px; line-height: 1.2; }',
    '    .brand small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; line-height: 1.35; }',
    '    .toolbar { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }',
    '    .button { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; }',
    '    .button-primary { border-color: var(--accent); background: var(--accent); color: #fff; }',
    '    .toolbar-feedback[hidden] { display: none; }',
    '    .toolbar-feedback { width: 100%; color: var(--accent); font-size: 12px; font-weight: 700; text-align: right; }',
    '    main { max-width: 920px; margin: 0 auto; padding: 40px 24px 64px; }',
    '    h1 { margin: 0 0 12px; font-size: clamp(28px, 5vw, 42px); line-height: 1.18; letter-spacing: 0; }',
    '    h2 { margin: 30px 0 10px; font-size: 20px; }',
    '    p { margin: 0 0 14px; }',
    '    ol, ul { padding-left: 22px; }',
    '    li { margin: 8px 0; }',
    '    .lead { color: var(--muted); font-size: 16px; }',
    '    .panel { margin-top: 22px; padding: 18px; border-radius: 8px; background: var(--surface); box-shadow: 0 1px 0 var(--border); }',
    '    .about-strip[hidden] { display: none; }',
    '    .about-strip { margin: 0; padding: 18px; background: var(--surface); box-shadow: 0 1px 0 color-mix(in srgb, var(--border) 70%, transparent); }',
    '    .about-grid { max-width: 760px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; align-items: center; justify-items: center; }',
    '    .about-item { width: 112px; min-height: 112px; display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: var(--accent); text-align: center; text-decoration: none; }',
    '    button.about-item { cursor: pointer; font: inherit; }',
    '    .about-item:hover { background: var(--soft); color: var(--accent); }',
    '    .about-item svg { width: 84px; height: 84px; stroke: currentColor; }',
    '    .about-item img { width: 100px; height: 100px; object-fit: contain; }',
    '    .about-item small { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.3; word-break: break-word; }',
    '    .about-email-action { position: relative; display: grid; place-items: center; }',
    '    .about-copy-feedback[hidden] { display: none; }',
    '    .about-copy-feedback { position: absolute; left: 50%; bottom: -26px; z-index: 2; width: max-content; max-width: 220px; padding: 6px 10px; border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border)); border-radius: 8px; background: var(--surface); color: var(--accent); font-size: 12px; font-weight: 750; line-height: 1.35; transform: translateX(-50%); }',
    '    .safe { background: var(--soft); color: #0f5f59; }',
    '    code { padding: 2px 5px; border-radius: 5px; background: #eef5f2; }',
    '    a { color: var(--accent); }',
    '    .support-note { margin-top: 28px; color: var(--muted); font-size: 13px; }',
    '    @media (max-width: 720px) { .topbar { align-items: flex-start; flex-direction: column; } .toolbar { justify-content: flex-start; } main { padding: 28px 18px 48px; } .about-grid { grid-template-columns: 1fr 1fr; gap: 18px; } }',
    '  </style>',
    '</head>',
    '<body>',
    '  <header class="topbar" aria-label="MarkNest 头部">',
    '    <div class="brand">',
    '      <svg class="brand-logo" viewBox="0 0 128 128" aria-hidden="true" focusable="false">',
    '        <path class="brand-logo-primary" d="M12 96V32L39 80L66 32V96" fill="none" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path>',
    '        <path class="brand-logo-bright" d="M74 96V32L116 96V32" fill="none" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path>',
    '      </svg>',
    '      <div><strong>MarkNest</strong><small>让 Markdown 文档优雅归巢</small></div>',
    '    </div>',
    '    <nav class="toolbar" aria-label="使用入口">',
    `      <button class="button button-primary" type="button" data-extension-details-button data-extension-details-link data-extension-details-url="${extensionDetailsUrl}">扩展详情页</button>`,
    '      <button class="button" type="button" data-sample-button>示例</button>',
    '      <a class="button" href="https://github.com/AIAgentAndy/MarkNest/issues" target="_blank" rel="noreferrer">反馈问题</a>',
    '      <button class="button" type="button" data-about-button aria-expanded="false">关于</button>',
    '      <span class="toolbar-feedback" role="status" hidden data-extension-details-feedback>已复制扩展详情页地址</span>',
    '    </nav>',
    '  </header>',
    '  <section class="about-strip" hidden data-about-panel aria-label="关于 MarkNest">',
    '    <div class="about-grid">',
    '      <a class="about-item" href="https://github.com/AIAgentAndy/MarkNest" target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub"><span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.35-2.48-1.2-3.4.28-1.1.28-2.3 0-3.4 0 0-1 0-3 1.2a10.4 10.4 0 0 0-5.5 0C8.5 2.2 7.5 2.2 7.5 2.2c-.3 1.1-.3 2.3 0 3.4A5.1 5.1 0 0 0 6.3 9c0 3.5 3 5.5 6 5.5-.4.4-.7.9-.8 1.5-.7.3-2.5.9-3.6-1.1 0 0-.7-1.2-2-1.3 0 0-1.3 0-.1.8 0 0 .9.4 1.5 2 0 0 .8 2.5 4.5 1.7V22"></path></svg><small>GitHub</small></span></a>',
    '      <span class="about-email-action"><button class="about-item" type="button" aria-label="Email" title="点击复制作者邮箱地址（AIAgentAndy001@gmail.com）" data-copy-email-button><span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2Z"></path><path d="m22 6-10 7L2 6"></path></svg><small>Email</small></span></button><span class="about-copy-feedback" role="status" hidden data-copy-email-feedback>已复制作者邮箱地址</span></span>',
    '      <span class="about-item"><img src="about/wx.png" alt="微信二维码" title="扫码加我微信（备注：MarkNest）"><small>微信二维码</small></span>',
    '      <span class="about-item"><img src="about/coffee.png" alt="微信赞赏二维码" title="扫码请作者喝杯饮料，感谢~"><small>赞赏二维码</small></span>',
    '    </div>',
    '  </section>',
    '  <main>',
    '    <h1>MarkNest 使用引导</h1>',
    '    <p class="lead">直接用 Chrome 打开本地或在线 Markdown 文件，MarkNest 会自动渲染正文，让你保留原始地址，同时获得目录、大纲、Mermaid 和沉浸式阅读体验。</p>',
    '    <section class="panel">',
    '      <h2>打开方式</h2>',
    '      <ol>',
    '        <li><strong>本地 Markdown</strong>：在电脑文件中直接用 Chrome 打开 <code>.md</code>、<code>.markdown</code>、<code>.mdown</code> 或 <code>.mkd</code> 文件，例如右键选择 Chrome，或把文件拖到 Chrome。地址栏会保持 <code>file:///...</code>。</li>',
    '        <li><strong>在线 Markdown</strong>：用 Chrome 打开公网或内网页面的 Markdown 原始地址，例如 <code>https://example.com/docs/guide.md</code>。MarkNest 会渲染当前文件，不扫描远程目录。</li>',
    '        <li><strong>示例</strong>：点击顶部“示例”可以打开内置示例，快速查看目录、大纲、GFM 和 Mermaid 渲染效果。</li>',
    '      </ol>',
    '    </section>',
    '    <section class="panel">',
    '      <h2>一次性授权</h2>',
    '      <p>要让 MarkNest 自动读取同级和子目录，请在 Chrome 扩展详情页中打开 <strong>允许访问文件网址</strong>。</p>',
    `      <p><button class="button button-primary" type="button" data-extension-details-button data-extension-details-link data-extension-details-url="${extensionDetailsUrl}">复制 MarkNest 扩展详情页地址</button></p>`,
    '      <p>Chrome 不允许扩展直接跳转到 <code>chrome://</code> 内部页面。点击上方按钮复制地址后，粘贴到 Chrome 地址栏打开；也可以进入 <code>chrome://extensions/</code>，找到 MarkNest，进入详情页后开启 <strong>允许访问文件网址</strong>。当前扩展详情页地址：<code data-extension-details-text>chrome://extensions/?id=</code></p>',
    '    </section>',
    '    <section class="panel safe">',
    '      <h2>安全说明</h2>',
    '      <p>所有读取都发生在浏览器本地：MarkNest 只在 Chrome 扩展内读取你打开的本地 Markdown 及其相关目录，不会把文件内容上传到服务器。</p>',
    '    </section>',
    '    <p class="support-note">支持信息原文：</p>',
    `    <pre class="support-note">${escapeHtml(markdown)}</pre>`,
    '  </main>',
    '  <script src="support.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function createSupportScript() {
  return [
    'const authorEmail = "AIAgentAndy001@gmail.com";',
    'const detailsUrl = `chrome://extensions/?id=${chrome.runtime.id}`;',
    'document.querySelectorAll("[data-extension-details-link]").forEach((link) => {',
    '  link.dataset.extensionDetailsUrl = detailsUrl;',
    '});',
    'document.querySelectorAll("[data-extension-details-text]").forEach((element) => {',
    '  element.textContent = detailsUrl;',
    '});',
    'const extensionDetailsFeedback = document.querySelector("[data-extension-details-feedback]");',
    'let extensionDetailsFeedbackTimer = 0;',
    'document.querySelectorAll("[data-extension-details-button]").forEach((button) => {',
    '  button.addEventListener("click", async () => {',
    '    try {',
    '      await navigator.clipboard.writeText(detailsUrl);',
    '      if (extensionDetailsFeedback) {',
    '        extensionDetailsFeedback.hidden = false;',
    '        extensionDetailsFeedback.textContent = "已复制扩展详情页地址";',
    '        window.clearTimeout(extensionDetailsFeedbackTimer);',
    '        extensionDetailsFeedbackTimer = window.setTimeout(() => {',
    '          extensionDetailsFeedback.hidden = true;',
    '        }, 2200);',
    '      }',
    '    } catch {',
    '      if (extensionDetailsFeedback) {',
    '        extensionDetailsFeedback.hidden = false;',
    '        extensionDetailsFeedback.textContent = `复制失败，请手动复制：${detailsUrl}`;',
    '      }',
    '    }',
    '  });',
    '});',
    'document.querySelector("[data-sample-button]")?.addEventListener("click", () => {',
    '  chrome.tabs.create({ url: chrome.runtime.getURL("reader.html?launch=sample") });',
    '});',
    'const aboutButton = document.querySelector("[data-about-button]");',
    'const aboutPanel = document.querySelector("[data-about-panel]");',
    'aboutButton?.addEventListener("click", () => {',
    '  if (!aboutPanel) {',
    '    return;',
    '  }',
    '  const nextHidden = !aboutPanel.hidden;',
    '  aboutPanel.hidden = nextHidden;',
    '  aboutButton.setAttribute("aria-expanded", String(!nextHidden));',
    '});',
    'const copyEmailButton = document.querySelector("[data-copy-email-button]");',
    'const copyEmailFeedback = document.querySelector("[data-copy-email-feedback]");',
    'let copyEmailFeedbackTimer = 0;',
    'copyEmailButton?.addEventListener("click", async () => {',
    '  try {',
    '    await navigator.clipboard.writeText(authorEmail);',
    '    if (copyEmailFeedback) {',
    '      copyEmailFeedback.hidden = false;',
    '      copyEmailFeedback.textContent = "已复制作者邮箱地址";',
    '      window.clearTimeout(copyEmailFeedbackTimer);',
    '      copyEmailFeedbackTimer = window.setTimeout(() => {',
    '        copyEmailFeedback.hidden = true;',
    '      }, 1800);',
    '    }',
    '  } catch {',
    '    if (copyEmailFeedback) {',
    '      copyEmailFeedback.hidden = false;',
    '      copyEmailFeedback.textContent = `复制失败，请手动复制：${authorEmail}`;',
    '    }',
    '  }',
    '});',
    ''
  ].join('\n');
}

function createReaderHtml() {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <link rel="icon" type="image/png" href="icons/icon-32.png">',
    '  <title>MarkNest Reader</title>',
    '  <link rel="stylesheet" href="file-url-inline-entry.css">',
    '</head>',
    '<body>',
    '  <script type="module" src="file-url-inline-entry.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function bundleFileUrlInlineEntry() {
  await viteBuild({
    configFile: false,
    root,
    publicDir: false,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.join(root, 'src')
      }
    },
    build: {
      outDir: distDir,
      emptyOutDir: false,
      cssCodeSplit: false,
      modulePreload: false,
      sourcemap: false,
      minify: true,
      rollupOptions: {
        input: path.join(root, 'src', 'extension', 'file-url-inline-entry.tsx'),
        output: {
          entryFileNames: 'file-url-inline-entry.js',
          chunkFileNames: (chunkInfo) => {
            return `file-url-inline-assets/${toSafeChromeAssetName(chunkInfo.name)}-[hash].js`;
          },
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'file-url-inline-entry.css';
            }
            return `file-url-inline-assets/${toSafeChromeAssetName(assetInfo.names?.[0] ?? '[name]')}-[hash][extname]`;
          },
          format: 'es'
        }
      },
      target: 'es2022'
    }
  });
}

function toSafeChromeAssetName(name) {
  const extension = path.extname(name);
  const baseName = extension ? name.slice(0, -extension.length) : name;
  const safeBaseName = baseName.startsWith('_') ? `x-${baseName.slice(1)}` : baseName;
  return safeBaseName.replace(/[^a-zA-Z0-9.-]/g, '-');
}

async function normalizeChromeReservedNames(directory) {
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
