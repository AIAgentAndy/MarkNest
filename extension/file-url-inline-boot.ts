/// <reference types="chrome" />

const markdownFilePattern = /\.(md|markdown|mdown|mkd)$/i;

if (typeof window !== 'undefined' && typeof chrome !== 'undefined') {
  loadFileUrlInlineReaderIfNeeded(window.location.href);
}

export function shouldLoadFileUrlInlineReader(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isMarkdownFile =
      (parsed.protocol === 'file:' || parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      markdownFilePattern.test(decodeURIComponent(parsed.pathname));
    const isLocalDirectory =
      parsed.protocol === 'file:' &&
      parsed.pathname.endsWith('/') &&
      !markdownFilePattern.test(decodeURIComponent(parsed.pathname));

    return isMarkdownFile || isLocalDirectory;
  } catch {
    return false;
  }
}

export function loadFileUrlInlineReaderIfNeeded(url: string): void {
  if (!shouldLoadFileUrlInlineReader(url)) {
    return;
  }

  installFileUrlInlineReaderStyles(document, chrome.runtime.getURL('file-url-inline-entry.css'));
  const inlineEntryUrl = chrome.runtime.getURL('file-url-inline-entry.js');
  void import(inlineEntryUrl).catch((error: unknown) => {
    console.error('MarkNest file URL inline renderer failed to load.', error);
    // 入口加载失败时不再接管页面，移除预载样式以免影响原始页面。
    removeFileUrlInlineReaderStyles(document);
  });
}

export function installFileUrlInlineReaderStyles(documentRef: Document, stylesheetUrl: string): void {
  if (documentRef.head.querySelector('link[data-marknest-inline-reader-style="true"]')) {
    return;
  }

  const stylesheet = documentRef.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = stylesheetUrl;
  stylesheet.dataset.marknestInlineReaderStyle = 'true';
  // 先以禁用状态预载样式表，等阅读器确认接管页面后再启用，避免在判定是否渲染前
  // 就把全局样式（如 html/body overflow:hidden）应用到原始页面（例如在线 HTML 网页）。
  stylesheet.disabled = true;
  documentRef.head.append(stylesheet);
}

export function removeFileUrlInlineReaderStyles(documentRef: Document): void {
  documentRef.head.querySelector('link[data-marknest-inline-reader-style="true"]')?.remove();
}
